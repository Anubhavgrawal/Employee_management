import { AppDataSource } from "../../../config/database";
import { RefreshToken } from "../entities/RefreshToken";
import { IsNull, LessThanOrEqual, MoreThan } from "typeorm";
import {
  cleanupRedisSessionMetadata,
  deleteSessionFromRedis,
  getSessionFromRedis,
  revokeAllRedisSessions,
  revokeRedisSession,
  setSessionInRedis,
} from "../../../config/redis";
export class RefreshTokenRepository {
  private repo = AppDataSource.getRepository(RefreshToken);

  async findByHash(hash: string) {
    const cached = await getSessionFromRedis(hash);
    if (cached) return this.repo.create(cached);

    const session = await this.repo.findOne({
      where: { tokenHash: hash },
      relations: { employee: { role: { permissions: true } } },
    });
    if (session) await setSessionInRedis(session);
    return session;
  }

  async save(token: RefreshToken) {
    const saved = await this.repo.save(token);
    await setSessionInRedis(saved);
    return saved;
  }

  cacheSession(session: RefreshToken) {
    return setSessionInRedis(session);
  }

  async revokeAll(employeeId: string) {
    await revokeAllRedisSessions(employeeId);
    const sessions = await this.repo.find({
      where: { employeeId, revokedAt: IsNull() },
      select: { tokenHash: true },
    });
    await this.repo
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where("employee_id=:employeeId AND revoked_at IS NULL", { employeeId })
      .execute();
    await Promise.all(
      sessions.map(({ tokenHash }) => deleteSessionFromRedis(tokenHash)),
    );
  }

  async revokeFamily(familyId: string) {
    const sessions = await this.repo.find({
      where: { familyId, revokedAt: IsNull() },
      select: { tokenHash: true, employeeId: true },
    });
    const employeeId = sessions[0]?.employeeId;
    if (employeeId) await revokeRedisSession(familyId, employeeId);
    await this.repo
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where("family_id=:familyId AND revoked_at IS NULL", { familyId })
      .execute();
    await Promise.all(
      sessions.map(({ tokenHash }) => deleteSessionFromRedis(tokenHash)),
    );
  }

  async activeForUser(employeeId: string) {
    return this.repo.find({
      where: { employeeId, revokedAt: IsNull() },
      order: { createdAt: "DESC" },
    });
  }

  async revokeSession(id: string, employeeId: string) {
    const sessions = await this.repo.find({
      where: { familyId: id, employeeId, revokedAt: IsNull() },
      select: { tokenHash: true },
    });
    if (!sessions.length) return { affected: 0 };

    await revokeRedisSession(id, employeeId);
    const result = await this.repo
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where("family_id=:id AND employee_id=:employeeId AND revoked_at IS NULL", {
        id,
        employeeId,
      })
      .execute();
    await Promise.all(sessions.map(({ tokenHash }) => deleteSessionFromRedis(tokenHash)));
    return result;
  }

  async expireRefreshTokenByHash(tokenHash: string, now = new Date()): Promise<"removed" | "missing" | "not-expired"> {
    const token = await this.repo.findOne({
      where: { tokenHash },
      select: { id: true, expiresAt: true },
    });
    if (!token) return "missing";
    if (token.expiresAt > now) return "not-expired";

    await this.repo.delete(token.id);
    await deleteSessionFromRedis(tokenHash);
    return "removed";
  }

  async findFamilyOwner(familyId: string): Promise<string | null> {
    const token = await this.repo.findOne({
      where: { familyId },
      select: { employeeId: true },
    });
    return token?.employeeId ?? null;
  }

  activeForFamily(familyId: string, now = new Date()): Promise<number> {
    return this.repo.count({
      where: { familyId, revokedAt: IsNull(), expiresAt: MoreThan(now) },
    });
  }

  async expiredFamilies(now = new Date()): Promise<Array<{ familyId: string; userId: string }>> {
    const tokens = await this.repo.find({
      where: { expiresAt: LessThanOrEqual(now) },
      select: { familyId: true, employeeId: true },
    });
    const activeFamilies = await this.repo.find({
      select: { familyId: true, employeeId: true },
      where: { revokedAt: IsNull(), expiresAt: MoreThan(now) },
    });
    const active = new Set(activeFamilies.map(({ familyId }) => familyId));
    const families = new Map<string, string>();
    for (const token of tokens) {
      if (!active.has(token.familyId)) families.set(token.familyId, token.employeeId);
    }
    return [...families].map(([familyId, userId]) => ({ familyId, userId }));
  }

  async expireSessionFamily(familyId: string, now = new Date()): Promise<number> {
    const tokens = await this.repo.find({
      where: { familyId },
      select: { id: true, tokenHash: true, employeeId: true },
    });
    if (!tokens.length) return 0;

    const result = await this.repo
      .createQueryBuilder()
      .update()
      .set({ revokedAt: now })
      .where("family_id=:familyId AND revoked_at IS NULL", { familyId })
      .execute();
    await Promise.all(tokens.map(({ tokenHash }) => deleteSessionFromRedis(tokenHash)));
    await cleanupRedisSessionMetadata(familyId, tokens[0].employeeId);
    return result.affected ?? 0;
  }

  async reconcileExpired(now = new Date()): Promise<number> {
    const expiredTokens = await this.repo.find({
      where: { expiresAt: LessThanOrEqual(now) },
      select: { id: true, tokenHash: true, familyId: true, employeeId: true },
    });
    if (!expiredTokens.length) return 0;

    await this.repo.delete(expiredTokens.map(({ id }) => id));
    await Promise.all(expiredTokens.map(({ tokenHash }) => deleteSessionFromRedis(tokenHash)));

    const affectedFamilies = new Map<string, string>();
    for (const token of expiredTokens) affectedFamilies.set(token.familyId, token.employeeId);
    for (const [familyId, employeeId] of affectedFamilies) {
      const activeToken = await this.repo.findOne({
        where: {
          familyId,
          employeeId,
          revokedAt: IsNull(),
          expiresAt: MoreThan(now),
        },
        select: { id: true },
      });
      if (!activeToken) await cleanupRedisSessionMetadata(familyId, employeeId);
    }
    return expiredTokens.length;
  }
}
