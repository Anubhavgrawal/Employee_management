import { redisClient, configureExpiryNotifications } from "./redis";
import { env } from "./env";
import { TokenExpiryEventService } from "../api/v1/services/token-expiry-event.service";

export type ExpirySubscription = { stop(): Promise<void> };

export async function startRedisExpirySubscriber(
  processor = new TokenExpiryEventService(),
  logger: Pick<Console, "error"> = console,
): Promise<ExpirySubscription | null> {
  if (!redisClient) return null;

  const subscriber = redisClient.duplicate();
  subscriber.on("error", (error: Error) => {
    logger.error("Redis expiry subscriber connection error", error.message);
  });

  try {
    await configureExpiryNotifications();
    await subscriber.connect();
    const database = new URL(env.REDIS_URL!).pathname.slice(1) || "0";
    const channel = `__keyevent@${database}__:expired`;
    await subscriber.pSubscribe(channel, (key) => {
      void processor.processExpiredKey(key).catch(() => undefined);
    });

    return {
      async stop() {
        await subscriber.pUnsubscribe(channel);
        if (subscriber.isOpen) await subscriber.quit();
      },
    };
  } catch (error) {
    logger.error("Could not start Redis expiry subscriber; reconciliation remains active", error);
    if (subscriber.isOpen) await subscriber.quit().catch(() => undefined);
    return null;
  }
}