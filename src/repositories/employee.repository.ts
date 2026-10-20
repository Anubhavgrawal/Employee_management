import { AppDataSource } from "../config/database";
import { Employee } from "../entities/Employee";
import type { SelectQueryBuilder } from "typeorm";
export class EmployeeRepository {
  private repo = AppDataSource.getRepository(Employee);
  async list(
    q: {
      page: number;
      limit: number;
      departmentId?: string;
      employmentStatus?: string;
      search?: string;
      sortBy: string;
      sortOrder: "ASC" | "DESC";
    },
    scope?: { managerId?: string; employeeId?: string },
  ) {
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
    return {
      items,
      total,
      page: q.page,
      limit: q.limit,
      totalPages: Math.ceil(total / q.limit),
    };
  }
  findById(id: string) {
    return this.repo.findOne({
      where: { id },
      relations: { department: true, manager: true },
    });
  }
  findByIdWithSalary(id: string) {
    return this.repo
      .createQueryBuilder("e")
      .addSelect("e.salary")
      .leftJoinAndSelect("e.department", "department")
      .where("e.id=:id", { id })
      .getOne();
  }
  save(employee: Employee) {
    return this.repo.save(employee);
  }
  async deactivate(id: string) {
    await this.repo.update(id, { employmentStatus: "inactive" });
    return this.findById(id);
  }
}
