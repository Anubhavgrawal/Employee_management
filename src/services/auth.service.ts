import { randomBytes, createHash, randomUUID } from "node:crypto";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../config/database";
import { env } from "../config/env";
import { Employee } from "../entities/Employee";
import { RefreshToken } from "../entities/RefreshToken";
import { UserRepository } from "../repositories/user.repository";
import { RefreshTokenRepository } from "../repositories/refresh-token.repository";
import { AppError } from "../errors/app-error";
import { AuditService } from "./audit.service";
const hashToken = (v: string) => createHash("sha256").update(v).digest("hex");
export class AuthService {
  private users = new UserRepository();
  private tokens = new RefreshTokenRepository();
  private audit = new AuditService();
  private accessToken(user: Employee) {
    return jwt.sign(
      {
        type: "access",
        role: user.role.name,
        employeeId: user.id,
        permissions: user.role.permissions?.map((p) => p.name) || [],
      },
      env.JWT_ACCESS_SECRET,
      {
        subject: user.id,
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
        algorithm: "HS256",
      },
    );
  }
  private async createRefresh(
    user: Employee,
    familyId = randomUUID(),
    meta: { ip?: string; agent?: string } = {},
  ) {
    const token = randomBytes(48).toString("base64url");
    const entity = AppDataSource.getRepository(RefreshToken).create({
          employeeId: user.id,
      tokenHash: hashToken(token),
      familyId,
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000),
      revokedAt: null,
      replacedById: null,
      ipAddress: meta.ip || null,
      userAgent: meta.agent || null,
    });
    await this.tokens.save(entity);
    return { refreshToken: token, sessionId: entity.id };
  }
  async login(
    email: string,
    password: string,
    meta: { ip?: string; agent?: string; requestId?: string },
  ) {
    const user = await this.users.findByEmail(email); // Same response for unknown user and wrong password.
    const valid = user
      ? user.passwordHash !== null && await argon2.verify(user.passwordHash, password).catch(() => false)
      : false;
    if (!user || !valid || !user.isActive)
      throw AppError.unauthorized("Invalid email or password");
    const refresh = await this.createRefresh(user, randomUUID(), meta);
    await this.audit.record({
      actorEmployeeId: user.id,
      action: "auth.login",
      resourceType: "session",
      resourceId: refresh.sessionId,
      requestId: meta.requestId,
    });
    return {
      accessToken: this.accessToken(user),
      ...refresh,
      tokenType: "Bearer",
      expiresIn: env.JWT_ACCESS_TTL,
    };
  }
  async refresh(
    raw: string,
    meta: { ip?: string; agent?: string; requestId?: string },
  ) {
    const old = await this.tokens.findByHash(hashToken(raw));
    if (!old) throw AppError.unauthorized("Invalid refresh token");
    if (old.revokedAt || old.expiresAt <= new Date()) {
      // Reuse of a rotated token revokes the whole token family.
      if (old.revokedAt)
        await AppDataSource.getRepository(RefreshToken)
          .createQueryBuilder()
          .update()
          .set({ revokedAt: new Date() })
          .where("family_id=:family AND revoked_at IS NULL", {
            family: old.familyId,
          })
          .execute();
      throw AppError.unauthorized(
        "Refresh token is invalid or has already been used",
      );
    }
    if (!old.employee.isActive) {
      await this.tokens.revokeAll(old.employeeId);
      throw AppError.unauthorized("Account is inactive");
    }
    return AppDataSource.transaction(async (manager) => {
      old.revokedAt = new Date();
      await manager.save(old);
      const rawNext = randomBytes(48).toString("base64url");
      const next = manager.create(RefreshToken, {
          employeeId: old.employeeId,
        tokenHash: hashToken(rawNext),
        familyId: old.familyId,
        expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000),
        revokedAt: null,
        replacedById: null,
        ipAddress: meta.ip || null,
        userAgent: meta.agent || null,
      });
      await manager.save(next);
      old.replacedById = next.id;
      await manager.save(old);
      await this.audit.record({
          actorEmployeeId: old.employeeId,
        action: "auth.refresh",
        resourceType: "session",
        resourceId: next.id,
        requestId: meta.requestId,
      });
      return {
          accessToken: this.accessToken(old.employee),
        refreshToken: rawNext,
        sessionId: next.id,
        tokenType: "Bearer",
        expiresIn: env.JWT_ACCESS_TTL,
      };
    });
  }
  async logout(raw: string) {
    const token = await this.tokens.findByHash(hashToken(raw));
    if (token && !token.revokedAt) {
      token.revokedAt = new Date();
      await this.tokens.save(token);
    }
    return { loggedOut: true };
  }
  async logoutAll(userId: string) {
    await this.tokens.revokeAll(userId);
    await this.audit.record({
      actorEmployeeId: userId,
      action: "auth.logout_all",
      resourceType: "session",
    });
    return { loggedOut: true };
  }
  async sessions(userId: string) {
    return (await this.tokens.activeForUser(userId))
      .filter((t) => t.expiresAt > new Date())
      .map((t) => ({
        id: t.id,
        createdAt: t.createdAt,
        expiresAt: t.expiresAt,
        userAgent: t.userAgent,
        ipAddress: t.ipAddress,
      }));
  }
  async revokeSession(userId: string, id: string) {
    await this.tokens.revokeSession(id, userId);
    return { revoked: true };
  }
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await AppDataSource.getRepository(Employee)
      .createQueryBuilder("u")
      .addSelect("u.passwordHash")
      .where("u.id=:id", { id: userId })
      .getOne();
    if (
      !user ||
      user.passwordHash === null ||
      !(await argon2
        .verify(user.passwordHash, currentPassword)
        .catch(() => false))
    )
      throw AppError.badRequest("Current password is incorrect");
    user.passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });
    await this.users.save(user);
    await this.tokens.revokeAll(userId);
    await this.audit.record({
          actorEmployeeId: userId,
      action: "auth.password_changed",
      resourceType: "employee",
      resourceId: userId,
    });
    return { passwordChanged: true, sessionsRevoked: true };
  }
}
