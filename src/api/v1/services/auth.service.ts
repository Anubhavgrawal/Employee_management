import { randomBytes, createHash, randomUUID } from "node:crypto";
import argon2 from "argon2";
import { AppDataSource } from "../../../config/database";
import { env } from "../../../config/env";
import { Employee } from "../entities/Employee";
import { RefreshToken } from "../entities/RefreshToken";
import { UserRepository } from "../repositories/user.repository";
import { RefreshTokenRepository } from "../repositories/refresh-token.repository";
import { AppError } from "../../../errors/app-error";
import { AuditService } from "./audit.service";
import { signAccessToken } from "../../../providers/jwt.provider";
import { errorMessages } from "../../../constants";
import {
  clearFailedLoginAttempts,
  getFailedLoginAttempts,
  getRedisSession,
  isRedisSessionActive,
  listRedisSessions,
  recordFailedLoginAttempt,
  revokeRedisSession,
  saveRedisSession,
} from "../../../config/redis";

const hashToken = (v: string) => createHash("sha256").update(v).digest("hex");
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_RATE_LIMIT_MESSAGE = "Too many login attempts. Try again in 24 hours.";

class RefreshTokenAlreadyUsedError extends Error {}

export class AuthService {
  private users = new UserRepository();
  private tokens = new RefreshTokenRepository();
  private audit = new AuditService();
  private accessToken(user: Employee, sessionId: string) {
    return signAccessToken(
      {
        type: "access",
        sessionId,
        role: user.role.name,
        employeeId: user.id,
        permissions: user.role.permissions?.map((p) => p.name) || [],
      },
      user.id,
    );
  }
  private async createRefresh(
    user: Employee,
    familyId = randomUUID(),
    meta: { ip?: string; agent?: string } = {},
  ) {
    const token = randomBytes(48).toString("base64url");
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000);
    const entity = AppDataSource.getRepository(RefreshToken).create({
      employeeId: user.id,
      employee: user,
      tokenHash: hashToken(token),
      familyId,
      expiresAt,
      revokedAt: null,
      replacedById: null,
      ipAddress: meta.ip || null,
      userAgent: meta.agent || null,
    });
    await saveRedisSession({
      id: familyId,
      userId: user.id,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      revokedAt: null,
      ipAddress: meta.ip ?? null,
      userAgent: meta.agent ?? null,
    });
    try {
      await this.tokens.save(entity);
    } catch (error) {
      await revokeRedisSession(familyId, user.id).catch(() => false);
      throw error;
    }
    return { refreshToken: token, sessionId: familyId };
  }
  async login(
    email: string,
    password: string,
    meta: { ip?: string; agent?: string; requestId?: string },
  ) {
    const identifier = email.trim().toLowerCase();
    const failedAttempts = await getFailedLoginAttempts(identifier);
    if (failedAttempts !== null && failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS)
      throw new AppError(429, LOGIN_RATE_LIMIT_MESSAGE, "TOO_MANY_REQUESTS");

    const user = await this.users.findByEmail(identifier); // Keep unknown users and wrong passwords indistinguishable.
    const valid = user
      ? user.passwordHash !== null && await argon2.verify(user.passwordHash, password).catch(() => false)
      : false;
    if (!user || !valid || !user.isActive) {
      await recordFailedLoginAttempt(identifier);
      throw AppError.unauthorized(errorMessages.INVALID_EMAIL_OR_PASSWORD);
    }
    await clearFailedLoginAttempts(identifier);
    const refresh = await this.createRefresh(user, randomUUID(), meta);
    await this.audit.record({
      actorEmployeeId: user.id,
      action: "auth.login",
      resourceType: "session",
      resourceId: refresh.sessionId,
      requestId: meta.requestId,
    });
    return {
      accessToken: this.accessToken(user, refresh.sessionId),
      ...refresh,
      tokenType: "Bearer",
      expiresIn: env.JWT_ACCESS_TTL,
    };
  }
  async activateAccount(invitationToken: string, newPassword: string) {
    const employee = await AppDataSource.getRepository(Employee)
      .createQueryBuilder("employee")
      .addSelect("employee.invitationTokenHash")
      .where("employee.invitationTokenHash=:tokenHash", {
        tokenHash: hashToken(invitationToken),
      })
      .getOne();
    if (
      !employee ||
      !employee.invitationExpiresAt ||
      employee.invitationExpiresAt <= new Date() ||
      employee.passwordHash
    )
      throw AppError.badRequest(errorMessages.INVITATION_INVALID_OR_EXPIRED);
    employee.passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });
    employee.invitationTokenHash = null;
    employee.invitationExpiresAt = null;
    await this.users.save(employee);
    await this.audit.record({
      actorEmployeeId: employee.id,
      action: "account.activated",
      resourceType: "employee",
      resourceId: employee.id,
    });
    return { activated: true, loginId: employee.workEmail };
  }
  async refresh(
    raw: string,
    meta: { ip?: string; agent?: string; requestId?: string },
  ) {
    const old = await this.tokens.findByHash(hashToken(raw));
    if (!old) throw AppError.unauthorized(errorMessages.INVALID_REFRESH_TOKEN);
    if (old.expiresAt.getTime() <= Date.now()) {
      throw AppError.unauthorized(errorMessages.INVALID_REFRESH_TOKEN);
    }
    if (old.revokedAt) {
      // Reuse of a rotated token revokes the whole token family.
      await this.tokens.revokeFamily(old.familyId);
      throw AppError.unauthorized(
        errorMessages.REFRESH_TOKEN_REPLAY,
      );
    }
    const redisSession = await getRedisSession(old.familyId);
    if (
      !redisSession ||
      redisSession.userId !== old.employeeId ||
      !(await isRedisSessionActive(old.familyId, old.employeeId))
    )
      throw AppError.unauthorized("Session is invalid, revoked, or expired");
    if (!old.employee.isActive) {
      await this.tokens.revokeAll(old.employeeId);
      throw AppError.unauthorized(errorMessages.ACCOUNT_INACTIVE);
    }
    let result;
    try {
      result = await AppDataSource.transaction(async (manager) => {
        const rotationTime = new Date();
        const claimed = await manager
          .createQueryBuilder()
          .update(RefreshToken)
          .set({ revokedAt: rotationTime })
          .where("id=:id AND revoked_at IS NULL AND expires_at > :rotationTime", {
            id: old.id,
            rotationTime,
          })
          .execute();
        if (claimed.affected !== 1) throw new RefreshTokenAlreadyUsedError();

        old.revokedAt = rotationTime;
        const rawNext = randomBytes(48).toString("base64url");
        const next = manager.create(RefreshToken, {
          employeeId: old.employeeId,
          employee: old.employee,
          tokenHash: hashToken(rawNext),
          familyId: old.familyId,
          expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000),
          revokedAt: null,
          replacedById: null,
          ipAddress: meta.ip || null,
          userAgent: meta.agent || null,
        });
        const savedNext = await manager.save(next);
        old.replacedById = savedNext.id;
        await manager.update(RefreshToken, old.id, { replacedById: savedNext.id });
        await this.audit.record({
          actorEmployeeId: old.employeeId,
          action: "auth.refresh",
          resourceType: "session",
          resourceId: savedNext.id,
          requestId: meta.requestId,
        });
        return {
          response: {
            accessToken: this.accessToken(old.employee, old.familyId),
            refreshToken: rawNext,
            sessionId: old.familyId,
            tokenType: "Bearer",
            expiresIn: env.JWT_ACCESS_TTL,
          },
          oldToken: old,
          nextToken: savedNext,
        };
      });
    } catch (error) {
      if (!(error instanceof RefreshTokenAlreadyUsedError)) throw error;
      if (old.expiresAt <= new Date())
        throw AppError.unauthorized(errorMessages.INVALID_REFRESH_TOKEN);
      await this.tokens.revokeFamily(old.familyId);
      throw AppError.unauthorized(errorMessages.REFRESH_TOKEN_REPLAY);
    }
    await Promise.all([
      this.tokens.cacheSession(result.oldToken),
      this.tokens.cacheSession(result.nextToken),
    ]);
    await saveRedisSession({
      ...redisSession,
      expiresAt: result.nextToken.expiresAt.toISOString(),
      ipAddress: meta.ip ?? null,
      userAgent: meta.agent ?? null,
    });
    return result.response;
  }
  async logout(raw: string) {
    const token = await this.tokens.findByHash(hashToken(raw));
    if (token) {
      await this.tokens.revokeFamily(token.familyId);
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
    return (await listRedisSessions(userId)).map((session) => ({
      id: session.id,
      createdAt: new Date(session.createdAt),
      expiresAt: new Date(session.expiresAt),
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      revokedAt: session.revokedAt ? new Date(session.revokedAt) : null,
    }));
  }
  async revokeSession(userId: string, id: string) {
    if (!(await revokeRedisSession(id, userId)))
      throw AppError.notFound("Session not found");
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
      throw AppError.badRequest(errorMessages.CURRENT_PASSWORD_INCORRECT);
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
