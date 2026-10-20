import { AppDataSource } from "../config/database";
import { Department } from "../entities/Department";
export class DepartmentRepository {
  private repo = AppDataSource.getRepository(Department);
  list() {
    return this.repo.find({ order: { name: "ASC" } });
  }
  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }
  findByName(name: string) {
    return this.repo.findOne({ where: { name } });
  }
  save(d: Department) {
    return this.repo.save(d);
  }
}
