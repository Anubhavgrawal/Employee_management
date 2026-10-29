import { ActivityLogRepository } from "../repositories/activity-log.repository";

export class MissingPhoneService {
  constructor(private readonly activityLogs = new ActivityLogRepository()) {}

  async logEmployeesMissingPhone(): Promise<number> {
    const employees = await this.activityLogs.findEmployeesWithoutPhone();
    let createdLogs = 0;

    for (const employee of employees) {
      if (await this.activityLogs.hasMissingPhoneLog(employee.id)) continue;
      await this.activityLogs.logMissingPhone(employee.id);
      createdLogs += 1;
    }

    return createdLogs;
  }
}