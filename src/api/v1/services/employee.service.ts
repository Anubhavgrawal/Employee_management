import { AppDataSource } from "../../../config/database";
import { Employee } from "../entities/Employee";
import { EmployeeRepository } from "../repositories/employee.repository";
import { DepartmentRepository } from "../repositories/department.repository";
import { RefreshTokenRepository } from "../repositories/refresh-token.repository";
import { AppError } from "../../../errors/app-error";
import { AuditService } from "./audit.service";
import { Role } from "../entities/Role";
import { createHash, randomBytes } from "node:crypto";
import type { EmployeeActor } from "../../../interfaces/actor.interface";
import { errorMessages, roles } from "../../../constants";
import { invalidateEmployeeCache } from "../../../config/redis-employee";
import type { SafeEmployee } from "../../../interfaces/employee.interface";
import type {
  CreateEmployeeInput,
  EmployeeListQuery,
  SelfProfileInput,
  UpdateEmployeeInput,
} from "../validators/employee.validator";

const hashInvitationToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export class EmployeeService {
  private employees = new EmployeeRepository();
  private departments = new DepartmentRepository();
  private tokens = new RefreshTokenRepository();
  private audit = new AuditService();
  async list(
    q: EmployeeListQuery,
    actor: EmployeeActor,
  ) {
    if (actor.role === roles.EMPLOYEE) {
      if (!actor.employeeId) throw AppError.forbidden();
      return this.employees.list(q, { employeeId: actor.employeeId });
    }
    if (actor.role === roles.MANAGER) {
      if (!actor.employeeId) throw AppError.forbidden();
      return this.employees.list(q, { managerId: actor.employeeId });
    }
    return this.employees.list(q);
  }
  async get(
    id: string,
    actor: EmployeeActor,
  ) {
    const e = await this.employees.findById(id);
    if (!e || (e.employmentStatus === "inactive" && actor.role === roles.EMPLOYEE))
      throw AppError.notFound(errorMessages.EMPLOYEE_NOT_FOUND);
    await this.assertCanView(e, actor);
    return this.safeEmployee(e, actor.role);
  }
  private async assertCanView(
    e: Employee,
    actor: Pick<EmployeeActor, "role" | "employeeId">,
  ) {
    if (actor.role === roles.ADMIN || actor.role === roles.HR) return;
    if (actor.role === roles.EMPLOYEE && actor.employeeId === e.id) return;
    if (actor.role === roles.MANAGER && actor.employeeId) {
      const inScope = await AppDataSource.getRepository(Employee).exists({
        where: { id: e.id, managerId: actor.employeeId },
      });
      if (inScope) return;
    }
    throw AppError.notFound(errorMessages.EMPLOYEE_NOT_FOUND);
  }
  private safeEmployee(e: Employee, role: string): SafeEmployee {
    const out: SafeEmployee = {
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
    if (role === roles.ADMIN || role === roles.HR) {
      /* Salary is only returned by explicit privileged lookup, never by default. */
    }
    return out;
  }
  async create(input: CreateEmployeeInput, actor: EmployeeActor, requestId?: string) {
    const roleName = input.role || roles.EMPLOYEE;
    if (
      roleName !== roles.EMPLOYEE &&
      actor.role !== roles.ADMIN
    )
      throw AppError.forbidden(errorMessages.ONLY_ADMIN_ASSIGN_ROLE);
    const dept = await this.departments.findById(input.departmentId);
    if (!dept) throw AppError.badRequest(errorMessages.DEPARTMENT_DOES_NOT_EXIST);
    if (input.managerId) {
      const manager = await this.employees.findById(input.managerId);
      if (!manager) throw AppError.badRequest(errorMessages.MANAGER_DOES_NOT_EXIST);
    }
    const existing = await this.employees.findByWorkEmail(input.workEmail);
    if (existing) throw AppError.conflict("An employee with this email already exists");
    const role = await AppDataSource.getRepository(Role).findOneBy({
      name: roleName,
    });
    if (!role) throw AppError.badRequest(errorMessages.ROLE_DOES_NOT_EXIST);
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
    await invalidateEmployeeCache(saved.id);
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
    input: UpdateEmployeeInput,
    actor: EmployeeActor,
    requestId?: string,
  ) {
    const e = await this.employees.findById(id);
    if (!e) throw AppError.notFound("Employee not found");
    if (actor.role === roles.MANAGER && actor.employeeId) {
      if (e.managerId !== actor.employeeId)
        throw AppError.notFound(errorMessages.EMPLOYEE_NOT_FOUND);
    }
    if (actor.role === roles.EMPLOYEE)
      throw AppError.forbidden(errorMessages.SELF_PROFILE_ONLY);
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
      role: actor.role === roles.MANAGER ? roles.MANAGER : roles.HR,
    });
  }
  async selfProfile(
    input: SelfProfileInput,
    actor: EmployeeActor,
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
  async exportOwnProfile(actor: EmployeeActor) {
    if (!actor.employeeId)
      throw AppError.notFound("Employee profile not found");
    return this.get(actor.employeeId, actor);
  }
}
