import { DepartmentRepository } from "../repositories/department.repository";
import { Department } from "../entities/Department";
import { AppError } from "../errors/app-error";
import { AuditService } from "./audit.service";
export class DepartmentService {
  private repo = new DepartmentRepository();
  private audit = new AuditService();
  list() {
    return this.repo.list();
  }
  async create(input: any, actorId: string, requestId?: string) {
    if (await this.repo.findByName(input.name))
      throw AppError.conflict("Department name already exists");
    const d = await this.repo.save(Object.assign(new Department(), input));
    await this.audit.record({
      actorEmployeeId: actorId,
      action: "department.created",
      resourceType: "department",
      resourceId: d.id,
      requestId,
    });
    return d;
  }
  async update(id: string, input: any, actorId: string, requestId?: string) {
    const d = await this.repo.findById(id);
    if (!d) throw AppError.notFound("Department not found");
    Object.assign(d, input);
    const saved = await this.repo.save(d);
    await this.audit.record({
      actorEmployeeId: actorId,
      action: "department.updated",
      resourceType: "department",
      resourceId: id,
      requestId,
    });
    return saved;
  }
}
