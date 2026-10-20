import { AppDataSource } from "../config/database";
import { EmployeeDocument } from "../entities/EmployeeDocument";

export class EmployeeDocumentRepository {
  private repository = AppDataSource.getRepository(EmployeeDocument);
  list(employeeId: string) { return this.repository.find({ where: { employeeId }, order: { createdAt: "DESC" } }); }
  findById(id: string) { return this.repository.findOne({ where: { id } }); }
  save(document: Partial<EmployeeDocument>) { return this.repository.save(this.repository.create(document)); }
  remove(document: EmployeeDocument) { return this.repository.remove(document); }
}