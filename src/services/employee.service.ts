import { AppDataSource } from "../config/database";
import { Employee } from "../entities/Employee";
import { EmployeeRepository } from "../repositories/employee.repository";
import { DepartmentRepository } from "../repositories/department.repository";
import { RefreshTokenRepository } from "../repositories/refresh-token.repository";
import { AppError } from "../errors/app-error";
import { AuditService } from "./audit.service";
import { Role } from "../entities/Role";
import { createHash, randomBytes } from "node:crypto";

const hashInvitationToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

type EmployeeActor = {
  id: string;
  role: string;
  employeeId: string | null;
  permissions: string[];
};

export class EmployeeService {
  private employees = new EmployeeRepository();
  private departments = new DepartmentRepository();
  private tokens = new RefreshTokenRepository();
  private audit = new AuditService();
  async list(
    q: any,
    actor: { id: string; role: string; employeeId: string | null },
  ) {
    if (actor.role === "employee") {
      if (!actor.employeeId) throw AppError.forbidden();
      return this.employees.list(q, { employeeId: actor.employeeId });
    }
    if (actor.role === "manager") {
      if (!actor.employeeId) throw AppError.forbidden();
      return this.employees.list(q, { managerId: actor.employeeId });
    }
    return this.employees.list(q);
  }
  async get(
    id: string,
    actor: { id: string; role: string; employeeId: string | null },
  ) {
    const e = await this.employees.findById(id);
    if (!e || (e.employmentStatus === "inactive" && actor.role === "employee"))
      throw AppError.notFound("Employee not found");
    await this.assertCanView(e, actor);
    return this.safeEmployee(e, actor.role);
  }
  private async assertCanView(
    e: Employee,
    actor: { role: string; employeeId: string | null },
  ) {
    if (actor.role === "admin" || actor.role === "hr") return;
    if (actor.role === "employee" && actor.employeeId === e.id) return;
    if (actor.role === "manager" && actor.employeeId) {
      const inScope = await AppDataSource.getRepository(Employee).exists({
        where: { id: e.id, managerId: actor.employeeId },
      });
      if (inScope) return;
    }
    throw AppError.notFound("Employee not found");
  }
  private safeEmployee(e: Employee, role: string) {
    const out: any = {
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      workEmail: e.workEmail,
      phone: e.phone,
      department: { id: e.department.id, name: e.department.name },
      managerId: e.managerId,
      jobTitle: e.jobTitle,
      joiningDate: e.joiningDate,
      employmentStatus: e.employmentStatus,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
    if (role === "admin" || role === "hr") {
      /* Salary is only returned by explicit privileged lookup, never by default. */
    }
    return out;
  }
  async create(input: any, actor: EmployeeActor, requestId?: string) {
    const roleName = input.role || "employee";
    if (
      roleName !== "employee" &&
      actor.role !== "admin"
    )
      throw AppError.forbidden("Only an administrator can assign this role");
    const dept = await this.departments.findById(input.departmentId);
    if (!dept) throw AppError.badRequest("Department does not exist");
    if (input.managerId) {
      const manager = await this.employees.findById(input.managerId);
      if (!manager) throw AppError.badRequest("Manager does not exist");
    }
    const existing = await this.employees.findByWorkEmail(input.workEmail);
    if (existing) throw AppError.conflict("An employee with this email already exists");
    const role = await AppDataSource.getRepository(Role).findOneBy({
      name: roleName,
    });
    if (!role) throw AppError.badRequest("Role does not exist");
    const invitationToken = randomBytes(32).toString("base64url");
    const invitationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const { role: _role, salary, ...employeeInput } = input;
    const saved = await AppDataSource.transaction(async (manager) => {
      const e = manager.create(Employee, {
        ...employeeInput,
        phone: input.phone ?? null,
        managerId: input.managerId ?? null,
        roleId: role.id,
        passwordHash: null,
        invitationTokenHash: hashInvitationToken(invitationToken),
        invitationExpiresAt,
      });
      const result = await manager.save(e);
      if (salary !== undefined)
        await manager
          .createQueryBuilder()
          .update(Employee)
          .set({ salary: String(salary) })
          .where("id=:id", { id: result.id })
          .execute();
      return result;
    });
    await this.audit.record({
      actorEmployeeId: actor.id,
      action: "employee.created",
      resourceType: "employee",
      resourceId: saved.id,
      requestId,
    });
    await this.audit.record({
      actorEmployeeId: actor.id,
      action: "account.created",
      resourceType: "employee",
      resourceId: saved.id,
      requestId,
      metadata: { role: roleName },
    });
    if (roleName !== "employee")
      await this.audit.record({
        actorEmployeeId: actor.id,
        action: "role.assigned",
        resourceType: "employee",
        resourceId: saved.id,
        requestId,
        metadata: { role: roleName },
      });
    return {
      employee: await this.get(saved.id, actor),
      account: {
        loginId: saved.workEmail,
        role: roleName,
        invitationToken,
        invitationExpiresAt,
      },
    };
  }
  async update(
    id: string,
    input: any,
    actor: { id: string; role: string; employeeId: string | null },
    requestId?: string,
  ) {
    const e = await this.employees.findById(id);
    if (!e) throw AppError.notFound("Employee not found");
    if (actor.role === "manager" && actor.employeeId) {
      if (e.managerId !== actor.employeeId)
        throw AppError.notFound("Employee not found");
    }
    if (actor.role === "employee")
      throw AppError.forbidden("Use the self-profile endpoint");
    if (
      input.departmentId &&
      !(await this.departments.findById(input.departmentId))
    )
      throw AppError.badRequest("Department does not exist");
    if (input.managerId && !(await this.employees.findById(input.managerId)))
      throw AppError.badRequest("Manager does not exist");
    Object.assign(e, input);
    const saved = await this.employees.save(e);
    await this.audit.record({
      actorEmployeeId: actor.id,
      action: "employee.updated",
      resourceType: "employee",
      resourceId: id,
      requestId,
    });
    return this.get(saved.id, {
      ...actor,
      role: actor.role === "manager" ? "manager" : "hr",
    });
  }
  async selfProfile(
    input: any,
    actor: { id: string; role: string; employeeId: string | null },
  ) {
    if (!actor.employeeId)
      throw AppError.forbidden("No employee profile is linked to this account");
    const e = await this.employees.findById(actor.employeeId);
    if (!e) throw AppError.notFound("Employee profile not found");
    Object.assign(e, input);
    await this.employees.save(e);
    return this.get(e.id, actor);
  }
  async deactivate(id: string, actorId: string, requestId?: string) {
    const e = await this.employees.findById(id);
    if (!e) throw AppError.notFound("Employee not found");
    e.employmentStatus = "inactive";
    e.isActive = false;
    await this.employees.save(e);
    await this.tokens.revokeAll(id);
    await this.audit.record({
      actorEmployeeId: actorId,
      action: "employee.deactivated",
      resourceType: "employee",
      resourceId: id,
      requestId,
    });
    return {
      id,
      employmentStatus: "inactive",
      accountDeactivated: true,
    };
  }
  async exportOwnProfile(actor: {
    id: string;
    role: string;
    employeeId: string | null;
  }) {
    if (!actor.employeeId)
      throw AppError.notFound("Employee profile not found");
    return this.get(actor.employeeId, actor);
  }
}
