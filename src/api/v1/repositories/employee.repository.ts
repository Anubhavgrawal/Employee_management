import { AppDataSource } from "../../../config/database";
import {
  getEmployeeFromRedis,
  getEmployeeListFromRedis,
  invalidateEmployeeCache,
  setEmployeeListInRedis,
  setEmployeeInRedis,
} from "../../../config/redis-employee";
import { Employee } from "../entities/Employee";
import type { EmployeeListQuery } from "../validators/employee.validator";
export class EmployeeRepository {
  private repo = AppDataSource.getRepository(Employee);
  async list(
    q: EmployeeListQuery,
    scope?: { managerId?: string; employeeId?: string },
  ) {
    const cached = await getEmployeeListFromRedis(q, scope);
    if (cached) return cached;

    const qb = this.repo
      .createQueryBuilder("e")
      .leftJoinAndSelect("e.department", "department");
    if (q.departmentId)
      qb.andWhere("e.departmentId=:departmentId", {
        departmentId: q.departmentId,
      });
    if (q.employmentStatus)
      qb.andWhere("e.employmentStatus=:status", { status: q.employmentStatus });
    if (q.search)
      qb.andWhere(
        "(e.firstName ILIKE :search OR e.lastName ILIKE :search OR e.workEmail ILIKE :search OR e.jobTitle ILIKE :search)",
        { search: `%${q.search.replace(/[\%_]/g, "\$&")}%` },
      );
    if (scope?.managerId)
      qb.andWhere("e.managerId=:managerId", { managerId: scope.managerId });
    if (scope?.employeeId)
      qb.andWhere("e.id=:employeeId", { employeeId: scope.employeeId });
    const columns: Record<string, string> = {
      firstName: "e.firstName",
      lastName: "e.lastName",
      workEmail: "e.workEmail",
      joiningDate: "e.joiningDate",
      createdAt: "e.createdAt",
    };
    qb.orderBy(columns[q.sortBy] || "e.createdAt", q.sortOrder)
      .skip((q.page - 1) * q.limit)
      .take(q.limit);
    const [items, total] = await qb.getManyAndCount();
    const result = {
      items,
      total,
      page: q.page,
      limit: q.limit,
      totalPages: Math.ceil(total / q.limit),
    };
    await setEmployeeListInRedis(q, result, scope);
    return result;
  }
  async findById(id: string) {
    const cached = await getEmployeeFromRedis(id);
    if (cached) return cached;

    const employee = await this.repo.findOne({
      where: { id },
      relations: { department: true, manager: true },
    });
    if (employee) await setEmployeeInRedis(employee);
    return employee;
  }
  findByWorkEmail(workEmail: string) {
    return this.repo
      .createQueryBuilder("e")
      .where("LOWER(e.workEmail)=LOWER(:workEmail)", { workEmail })
      .getOne();
  }
  findByIdWithSalary(id: string) {
    return this.repo
      .createQueryBuilder("e")
      .addSelect("e.salary")
      .leftJoinAndSelect("e.department", "department")
      .where("e.id=:id", { id })
      .getOne();
  }
  async save(employee: Employee) {
    const saved = await this.repo.save(employee);
    await invalidateEmployeeCache(saved.id);
    return saved;
  }
  async delete(id: string) {
    const result = await this.repo.delete(id);
    if (result.affected) await invalidateEmployeeCache(id);
    return result;
  }
  async deactivate(id: string) {
    await this.repo.update(id, { employmentStatus: "inactive" });
    await invalidateEmployeeCache(id);
    return this.findById(id);
  }
}
