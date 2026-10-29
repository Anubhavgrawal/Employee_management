import cron, { type ScheduledTask } from "node-cron";
import { MissingPhoneService } from "../api/v1/services/missing-phone.service";

export function startMissingPhoneCron(
  missingPhones = new MissingPhoneService(),
  logger: Pick<Console, "error"> = console,
): ScheduledTask {
  return cron.schedule("*/30 * * * *", async () => {
    try {
      await missingPhones.logEmployeesMissingPhone();
    } catch (error) {
      logger.error("Missing-phone check failed:", error);
    }
  });
}