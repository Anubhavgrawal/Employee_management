import { createClient } from "redis";
import type { RefreshToken } from "../api/v1/entities/RefreshToken";
import { env } from "./env";
import { createHash } from "node:crypto";

export const redisClient = env.REDIS_URL
  ? createClient({ url: env.REDIS_URL })
  : undefined;

redisClient?.on("error", (error: Error) => {
  console.error("Redis client error:", error.message);
});

type CachedSession = {
  id: string;
  employeeId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: string;
  revokedAt: string | null;
  replacedById: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  employee: {
    id: string;
    isActive: boolean;
    role: {
      name: string;
      permissions: Array<{ name: string }>;
    };
  };
};

const sessionKey = (hash: string) => `employee-api:session:token:${hash}`;
const redisSessionKey = (id: string) => `employee-api:session:${id}`;
const userSessionsKey = (id: string) => `employee-api:user-sessions:${id}`;
const FAILED_LOGIN_LIMIT = 5;
const FAILED_LOGIN_TTL_SECONDS = 24 * 60 * 60;

export type RedisSessionMetadata = {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

export class SessionStoreUnavailableError extends Error {
  constructor() {
    super("Session store is unavailable");
    this.name = "SessionStoreUnavailableError";
  }
}

function requireSessionStore() {
  if (!redisClient?.isReady) throw new SessionStoreUnavailableError();
  return redisClient;
}

export async function saveRedisSession(session: RedisSessionMetadata): Promise<void> {
  const client = requireSessionStore();
  const ttlSeconds = Math.ceil((Date.parse(session.expiresAt) - Date.now()) / 1000);
  if (ttlSeconds <= 0) throw new SessionStoreUnavailableError();

  try {
    await client.set(redisSessionKey(session.id), JSON.stringify(session), { EX: ttlSeconds });
    await client.sAdd(userSessionsKey(session.userId), session.id);
    const indexTtl = await client.ttl(userSessionsKey(session.userId));
    if (indexTtl < ttlSeconds) await client.expire(userSessionsKey(session.userId), ttlSeconds);
  } catch (error) {
    logRedisOperationError("save session metadata", error);
    throw new SessionStoreUnavailableError();
  }
}

export async function getRedisSession(id: string): Promise<RedisSessionMetadata | null> {
  const client = requireSessionStore();
  try {
    const value = await client.get(redisSessionKey(id));
    return value ? (JSON.parse(value) as RedisSessionMetadata) : null;
  } catch (error) {
    logRedisOperationError("read session metadata", error);
    throw new SessionStoreUnavailableError();
  }
}

export async function isRedisSessionActive(id: string, userId: string): Promise<boolean> {
  const session = await getRedisSession(id);
  return Boolean(
    session &&
    session.userId === userId &&
    session.revokedAt === null &&
    Date.parse(session.expiresAt) > Date.now(),
  );
}

export async function listRedisSessions(userId: string): Promise<RedisSessionMetadata[]> {
  const client = requireSessionStore();
  try {
    const ids = await client.sMembers(userSessionsKey(userId));
    const sessions = await Promise.all(ids.map((id) => getRedisSession(id)));
    const active = sessions.filter((session): session is RedisSessionMetadata =>
      Boolean(
        session &&
        session.userId === userId &&
        session.revokedAt === null &&
        Date.parse(session.expiresAt) > Date.now(),
      ),
    );
    const activeIds = new Set(active.map(({ id }) => id));
    const expiredIds = ids.filter((id) => !activeIds.has(id));
    if (expiredIds.length) await client.sRem(userSessionsKey(userId), expiredIds);
    return active.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  } catch (error) {
    if (error instanceof SessionStoreUnavailableError) throw error;
    logRedisOperationError("list user sessions", error);
    throw new SessionStoreUnavailableError();
  }
}

export async function revokeRedisSession(id: string, userId: string): Promise<boolean> {
  const client = requireSessionStore();
  const session = await getRedisSession(id);
  if (!session || session.userId !== userId) return false;
  if (session.revokedAt !== null) return true;

  const revoked: RedisSessionMetadata = { ...session, revokedAt: new Date().toISOString() };
  const ttlSeconds = Math.ceil((Date.parse(session.expiresAt) - Date.now()) / 1000);
  try {
    if (ttlSeconds > 0) {
      await client.set(redisSessionKey(id), JSON.stringify(revoked), { EX: ttlSeconds });
    } else {
      await client.del(redisSessionKey(id));
    }
    await client.sRem(userSessionsKey(userId), id);
    return true;
  } catch (error) {
    logRedisOperationError("revoke session", error);
    throw new SessionStoreUnavailableError();
  }
}

export async function revokeAllRedisSessions(userId: string): Promise<void> {
  const sessions = await listRedisSessions(userId);
  await Promise.all(sessions.map(({ id }) => revokeRedisSession(id, userId)));
}

function logRedisOperationError(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown Redis error";
  console.log(`Could not ${action} in Redis:`, message);
}

function deserializeSession(value: string): RefreshToken {
  const cached = JSON.parse(value) as CachedSession;
  return {
    ...cached,
    expiresAt: new Date(cached.expiresAt),
    revokedAt: cached.revokedAt ? new Date(cached.revokedAt) : null,
    createdAt: new Date(cached.createdAt),
  } as RefreshToken;
}

export async function getSessionFromRedis(tokenHash: string): Promise<RefreshToken | null> {
  if (!redisClient?.isReady) return null;

  try {
    const cached = await redisClient.get(sessionKey(tokenHash));
    return cached ? deserializeSession(cached) : null;
  } catch (error) {
    logRedisOperationError("read a session", error);
    return null;
  }
}

export async function setSessionInRedis(session: RefreshToken): Promise<void> {
  if (!redisClient?.isReady || !session.employee?.role) return;

  const remainingSeconds = Math.ceil((session.expiresAt.getTime() - Date.now()) / 1000);
  const ttlSeconds = remainingSeconds;
  if (ttlSeconds <= 0) return;

  const cached: CachedSession = {
    id: session.id,
    employeeId: session.employeeId,
    tokenHash: session.tokenHash,
    familyId: session.familyId,
    expiresAt: session.expiresAt.toISOString(),
    revokedAt: session.revokedAt?.toISOString() ?? null,
    replacedById: session.replacedById,
    userAgent: session.userAgent,
    ipAddress: session.ipAddress,
    createdAt: session.createdAt.toISOString(),
    employee: {
      id: session.employee.id,
      isActive: session.employee.isActive,
      role: {
        name: session.employee.role.name,
        permissions: session.employee.role.permissions?.map(({ name }) => ({ name })) ?? [],
      },
    },
  };

  try {
    await redisClient.set(sessionKey(session.tokenHash), JSON.stringify(cached), {
      EX: ttlSeconds,
    });
  } catch (error) {
    logRedisOperationError("cache a session", error);
  }
}

export async function deleteSessionFromRedis(tokenHash: string): Promise<void> {
  if (!redisClient?.isReady) return;

  try {
    await redisClient.del(sessionKey(tokenHash));
  } catch (error) {
    logRedisOperationError("remove a session", error);
  }
}

function failedLoginKey(identifier: string) {
  const hash = createHash("sha256")
    .update(identifier.trim().toLowerCase())
    .digest("hex");
  return `employee-api:login-failures:${hash}`;
}

export async function getFailedLoginAttempts(identifier: string): Promise<number | null> {
  if (!redisClient?.isReady) return null;

  try {
    const count = await redisClient.get(failedLoginKey(identifier));
    return count ? Number(count) : 0;
  } catch (error) {
    logRedisOperationError("read failed login attempts", error);
    return null;
  }
}

export async function recordFailedLoginAttempt(identifier: string): Promise<number | null> {
  if (!redisClient?.isReady) return null;

  const script = `
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then
      redis.call('EXPIRE', KEYS[1], ARGV[1])
    end
    return count
  `;

  try {
    return Number(
      await redisClient.eval(script, {
        keys: [failedLoginKey(identifier)],
        arguments: [String(FAILED_LOGIN_TTL_SECONDS)],
      }),
    );
  } catch (error) {
    logRedisOperationError("record a failed login", error);
    return null;
  }
}

export async function clearFailedLoginAttempts(identifier: string): Promise<void> {
  if (!redisClient?.isReady) return;

  try {
    await redisClient.del(failedLoginKey(identifier));
  } catch (error) {
    logRedisOperationError("clear failed login attempts", error);
  }
}

export async function connectRedis() {
  if (redisClient && !redisClient.isOpen) await redisClient.connect();
}

export async function disconnectRedis() {
  if (redisClient?.isOpen) await redisClient.quit();
}