import rateLimit from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import { redisClient } from "../config/redis";
import { verifyAccessToken } from "../providers/jwt.provider";

function createRedisStore(prefix: string) {
  const client = redisClient;
  if (!client?.isReady) return undefined;

  return new RedisStore({
    prefix,
    sendCommand: (...args: string[]) =>
      client.sendCommand(args as [string, ...string[]]) as Promise<RedisReply>,
  });
}

export const apiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore("employee-api:api:"),
  keyGenerator(req) {
    if (req.auth?.id) return `user:${req.auth.id}`;

    const authorization = req.header("authorization");
    if (authorization?.startsWith("Bearer ")) {
      try {
        const claims = verifyAccessToken(authorization.slice(7));
        return `user:${claims.sub}`;
      } catch {
        // Invalid credentials do not establish an authenticated identity.
      }
    }

    return `ip:${req.ip}`;
  },
  message: {
    success: false,
    message: "Too many requests. Try again in one minute.",
  },
});
