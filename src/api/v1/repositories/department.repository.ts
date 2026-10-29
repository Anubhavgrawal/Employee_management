import { AppDataSource } from "../../../config/database";
import {
  getDepartmentFromRedis,
  getDepartmentsFromRedis,
  invalidateDepartmentCache,
  setDepartmentInRedis,
  setDepartmentsInRedis,
} from "../../../config/redis-employee";
import { Department } from "../entities/Department";
export class DepartmentRepository {
  private repo = AppDataSource.getRepository(Department);

  async list() {
    const cached = await getDepartmentsFromRedis();
    if (cached) return cached;

    const departments = await this.repo.find({ order: { name: "ASC" } });
    await setDepartmentsInRedis(departments);
    return departments;
  }

  async findById(id: string) {
    const cached = await getDepartmentFromRedis(id);
    if (cached) return cached;

    const department = await this.repo.findOne({ where: { id } });
    if (department) await setDepartmentInRedis(department);
    return department;
  }
  findByName(name: string) {
    return this.repo.findOne({ where: { name } });
  }
  async save(department: Department) {
    const saved = await this.repo.save(department);
    await invalidateDepartmentCache(saved.id);
    return saved;
  }

  async delete(id: string) {
    const result = await this.repo.delete(id);
    if (result.affected) await invalidateDepartmentCache(id);
    return result;
  }
}
