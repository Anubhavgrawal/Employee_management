import cron, { type ScheduledTask } from "node-cron";
import { ActivityLogService } from "../api/v1/services/activity-log.service";

export function startManagerCheckCron(
  activityLogs = new ActivityLogService(),
  logger: Pick<Console, "error"> = console,
): ScheduledTask {
  return cron.schedule("0 * * * *", async () => {
    try {
      await activityLogs.logEmployeesMissingManager();
    } catch (error) {
      logger.error("Hourly missing-manager check failed:", error);
    }
  });
}