import { IsNull } from "typeorm";
import { AppDataSource } from "../../../config/database";
import { ActivityLog } from "../entities/ActivityLog";
import { Employee } from "../entities/Employee";

export const MISSING_MANAGER_DESCRIPTION = "Employee is missing an assigned manager.";
export const MISSING_PHONE_DESCRIPTION = "Employee is missing a phone number.";

export class ActivityLogRepository {
  private logs = AppDataSource.getRepository(ActivityLog);
  private employees = AppDataSource.getRepository(Employee);

  findEmployeesWithoutManager() {
    return this.employees.find({
      select: { id: true },
      where: { managerId: IsNull() },
    });
  }

  findEmployeesWithoutPhone() {
    return this.employees.find({
      select: { id: true },
      where: { phone: IsNull() },
    });
  }

  hasMissingManagerLog(employeeId: string) {
    return this.logs.exists({
      where: { employeeId, description: MISSING_MANAGER_DESCRIPTION },
    });
  }

  hasMissingPhoneLog(employeeId: string) {
    return this.logs.exists({
      where: { employeeId, description: MISSING_PHONE_DESCRIPTION },
    });
  }

  async logMissingManager(employeeId: string) {
    const activity = this.logs.create({
      employeeId,
      description: MISSING_MANAGER_DESCRIPTION,
    });
    await this.logs.save(activity);
  }

  async logMissingPhone(employeeId: string) {
    const activity = this.logs.create({
      employeeId,
      description: MISSING_PHONE_DESCRIPTION,
    });
    await this.logs.save(activity);
  }
}