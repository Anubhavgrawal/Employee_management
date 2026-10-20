import "reflect-metadata";
import { app } from "./app";
import { AppDataSource } from "./config/database";
import { env } from "./config/env";
async function start() {
  try {
    await AppDataSource.initialize();
    const server = app.listen(env.PORT, () =>
      console.log(`Employee Management API listening on port ${env.PORT}`),
    );
    const shutdown = async (signal: string) => {
      console.log(`${signal} received; closing server`);
      server.close(async () => {
        try {
          if (AppDataSource.isInitialized) await AppDataSource.destroy();
          process.exit(0);
        } catch {
          process.exit(1);
        }
      });
      setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
  } catch {
    console.error(
      "Application startup failed. Verify configuration and database connectivity.",
    );
    process.exit(1);
  }
}
void start();
