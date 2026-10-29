import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockRepositories = {
  employees: {
    find: jest.fn(async (_options: unknown): Promise<Array<{ id: string }>> => []),
  },
  activityLogs: {
    exists: jest.fn(async (_options: unknown): Promise<boolean> => false),
    create: jest.fn((input: { employeeId: string; description: string }) => input),
    save: jest.fn(async (_activity: unknown): Promise<unknown> => undefined),
  },
};

jest.mock("../../src/config/database", () => ({
  AppDataSource: {
    getRepository: (entity: { name?: string }) =>
      entity.name === "ActivityLog" ? mockRepositories.activityLogs : mockRepositories.employees,
  },
}));

import { Employee } from "../../src/api/v1/entities/Employee";
import { ActivityLog } from "../../src/api/v1/entities/ActivityLog";
import {
  ActivityLogRepository,
  MISSING_MANAGER_DESCRIPTION,
} from "../../src/api/v1/repositories/activity-log.repository";
import { ActivityLogService } from "../../src/api/v1/services/activity-log.service";

describe("hourly missing-manager activity logging", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepositories.employees.find.mockResolvedValue([{ id: "employee-1" }]);
    mockRepositories.activityLogs.exists.mockResolvedValue(false);
  });

  it("detects employees with a null managerId", async () => {
    await new ActivityLogRepository().findEmployeesWithoutManager();

    expect(mockRepositories.employees.find).toHaveBeenCalledWith({
      select: { id: true },
      where: { managerId: expect.objectContaining({ _type: "isNull" }) },
    });
    expect(Employee.name).toBe("Employee");
  });

  it("creates a missing-manager activity for each unlogged employee", async () => {
    const service = new ActivityLogService(new ActivityLogRepository());

    const count = await service.logEmployeesMissingManager();

    expect(count).toBe(1);
    expect(mockRepositories.activityLogs.create).toHaveBeenCalledWith({
      employeeId: "employee-1",
      description: MISSING_MANAGER_DESCRIPTION,
    });
    expect(mockRepositories.activityLogs.save).toHaveBeenCalledTimes(1);
    expect(ActivityLog.name).toBe("ActivityLog");
  });

  it("does not create another log while the missing-manager issue remains", async () => {
    mockRepositories.activityLogs.exists.mockResolvedValue(true);
    const service = new ActivityLogService(new ActivityLogRepository());

    const count = await service.logEmployeesMissingManager();

    expect(count).toBe(0);
    expect(mockRepositories.activityLogs.save).not.toHaveBeenCalled();
  });

  it("propagates repository errors for the cron handler to report", async () => {
    mockRepositories.employees.find.mockRejectedValue(new Error("database unavailable"));
    const service = new ActivityLogService(new ActivityLogRepository());

    await expect(service.logEmployeesMissingManager()).rejects.toThrow("database unavailable");
  });
});