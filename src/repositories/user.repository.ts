import { AppDataSource } from "../config/database";
import { Employee } from "../entities/Employee";
export class UserRepository {
  private repo = AppDataSource.getRepository(Employee);
  findByEmail(email: string) {
    return this.repo
      .createQueryBuilder("u")
      .addSelect("u.passwordHash")
      .leftJoinAndSelect("u.role", "role")
      .leftJoinAndSelect("role.permissions", "permission")
      .where("LOWER(u.workEmail)=LOWER(:email)", { email })
      .andWhere("u.passwordHash IS NOT NULL")
      .getOne();
  }
  findById(id: string) {
    return this.repo.findOne({
      where: { id },
      relations: { role: { permissions: true } },
    });
  }
  save(user: Employee) {
    return this.repo.save(user);
  }
}
