import { AppDataSource } from "../../../config/database";
import { RefreshToken } from "../entities/RefreshToken";
import { IsNull } from "typeorm";
import {
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
}
