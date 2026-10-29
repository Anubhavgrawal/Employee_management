import "reflect-metadata";
import { AppDataSource } from "./config/database";
import { env } from "./config/env";
import { connectRedis, disconnectRedis } from "./config/redis";
import { startManagerCheckCron } from "./cron/manager-check.cron";
import { startMissingPhoneCron } from "./cron/missing-phone.cron";
async function start() {
  let startupStep = "database";
  try {
    await AppDataSource.initialize();
    startupStep = "Redis";
    await connectRedis();
    const managerCheckCron = startManagerCheckCron();
    const missingPhoneCron = startMissingPhoneCron();
    startupStep = "API";
    const { app } = await import("./app.js");
    const server = app.listen(env.PORT, () =>
      console.log(`Employee Management API listening on port ${env.PORT}`),
    );
    const shutdown = async (signal: string) => {
      console.log(`${signal} received; closing server`);
      server.close(async () => {
        try {
          managerCheckCron.stop();
          missingPhoneCron.stop();
          if (AppDataSource.isInitialized) await AppDataSource.destroy();
          await disconnectRedis();
          process.exit(0);
        } catch {
          process.exit(1);
        }
      });
      setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown startup error";
    console.error(
      `Application startup failed during ${startupStep} startup: ${reason}`,
    );
    if (AppDataSource.isInitialized) await AppDataSource.destroy().catch(() => undefined);
    await disconnectRedis().catch(() => undefined);
    process.exit(1);
  }
}
void start();
