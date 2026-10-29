import { ActivityLogRepository } from "../repositories/activity-log.repository";

export class ActivityLogService {
  constructor(private readonly activityLogs = new ActivityLogRepository()) {}

  async logEmployeesMissingManager(): Promise<number> {
    const employees = await this.activityLogs.findEmployeesWithoutManager();
    let createdLogs = 0;

    for (const employee of employees) {
      if (await this.activityLogs.hasMissingManagerLog(employee.id)) continue;
      await this.activityLogs.logMissingManager(employee.id);
      createdLogs += 1;
    }

    return createdLogs;
  }
}