import { AppDataSource } from "../config/database";
import { RefreshToken } from "../entities/RefreshToken";
import { IsNull } from "typeorm";
export class RefreshTokenRepository {
  private repo = AppDataSource.getRepository(RefreshToken);
  findByHash(hash: string) {
    return this.repo.findOne({
      where: { tokenHash: hash },
      relations: { employee: { role: { permissions: true } } },
    });
  }
  save(t: RefreshToken) {
    return this.repo.save(t);
  }
  async revokeAll(employeeId: string) {
    await this.repo
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where("employee_id=:employeeId AND revoked_at IS NULL", { employeeId })
      .execute();
  }
  async activeForUser(employeeId: string) {
    return this.repo.find({
      where: { employeeId, revokedAt: IsNull() },
      order: { createdAt: "DESC" },
    });
  }
  async revokeSession(id: string, employeeId: string) {
    return this.repo
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where("id=:id AND employee_id=:employeeId AND revoked_at IS NULL", {
        id,
        employeeId,
      })
      .execute();
  }
}
