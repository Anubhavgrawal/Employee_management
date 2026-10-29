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

import { ActivityLog } from "../../src/api/v1/entities/ActivityLog";
import { Employee } from "../../src/api/v1/entities/Employee";
import {
  ActivityLogRepository,
  MISSING_PHONE_DESCRIPTION,
} from "../../src/api/v1/repositories/activity-log.repository";
import { MissingPhoneService } from "../../src/api/v1/services/missing-phone.service";

describe("missing-phone activity logging", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepositories.employees.find.mockResolvedValue([{ id: "employee-1" }]);
    mockRepositories.activityLogs.exists.mockResolvedValue(false);
  });

  it("detects employees whose phone is null", async () => {
    await new ActivityLogRepository().findEmployeesWithoutPhone();

    expect(mockRepositories.employees.find).toHaveBeenCalledWith({
      select: { id: true },
      where: { phone: expect.objectContaining({ _type: "isNull" }) },
    });
    expect(Employee.name).toBe("Employee");
  });

  it("creates a missing-phone activity for each unlogged employee", async () => {
    const service = new MissingPhoneService(new ActivityLogRepository());

    const count = await service.logEmployeesMissingPhone();

    expect(count).toBe(1);
    expect(mockRepositories.activityLogs.create).toHaveBeenCalledWith({
      employeeId: "employee-1",
      description: MISSING_PHONE_DESCRIPTION,
    });
    expect(mockRepositories.activityLogs.save).toHaveBeenCalledTimes(1);
    expect(ActivityLog.name).toBe("ActivityLog");
  });

  it("does not log the same unresolved issue more than once", async () => {
    mockRepositories.activityLogs.exists.mockResolvedValue(true);
    const service = new MissingPhoneService(new ActivityLogRepository());

    const count = await service.logEmployeesMissingPhone();

    expect(count).toBe(0);
    expect(mockRepositories.activityLogs.save).not.toHaveBeenCalled();
  });

  it("propagates repository errors for the cron handler to report", async () => {
    mockRepositories.employees.find.mockRejectedValue(new Error("database unavailable"));
    const service = new MissingPhoneService(new ActivityLogRepository());

    await expect(service.logEmployeesMissingPhone()).rejects.toThrow("database unavailable");
  });
});