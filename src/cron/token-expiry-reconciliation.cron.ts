import cron, { type ScheduledTask } from "node-cron";
import { TokenExpiryReconciliationService } from "../api/v1/services/token-expiry-reconciliation.service";

export function startTokenExpiryReconciliationCron(
  reconciliation = new TokenExpiryReconciliationService(),
  logger: Pick<Console, "error"> = console,
): ScheduledTask {
  return cron.schedule("*/15 * * * *", async () => {
    try {
      await reconciliation.reconcile();
    } catch (error) {
      logger.error("Token/session reconciliation failed:", error);
    }
  });
}