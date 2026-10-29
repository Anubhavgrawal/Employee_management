import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const values = new Map<string, string>();
  const cachedSessionByHash = new Map<string, unknown>();
  return {
    values,
    cachedSessionByHash,
    repository: {
      findOne: vi.fn(),
      save: vi.fn(),
      create: vi.fn((session: unknown) => session),
      createQueryBuilder: vi.fn(),
    },
    setSessionInRedis: vi.fn(async (session: { tokenHash: string }) => {
      cachedSessionByHash.set(session.tokenHash, session);
    }),
    getSessionFromRedis: vi.fn(async (hash: string) => {
      return (cachedSessionByHash.get(hash) as ReturnType<typeof makeSession>) ?? null;
    }),
    deleteSessionFromRedis: vi.fn(),
  };
});

vi.mock("../src/config/redis", () => ({
  setSessionInRedis: mocks.setSessionInRedis,
  getSessionFromRedis: mocks.getSessionFromRedis,
  deleteSessionFromRedis: mocks.deleteSessionFromRedis,
}));
vi.mock("../src/config/database", () => ({
  AppDataSource: { getRepository: () => mocks.repository },
}));

import { RefreshTokenRepository } from "../src/api/v1/repositories/refresh-token.repository";

const tokenHash = "hashed-refresh-token";

function makeSession() {
  return {
    id: "session-1",
    employeeId: "employee-1",
    tokenHash,
    familyId: "family-1",
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    replacedById: null,
    userAgent: "test-agent",
    ipAddress: "127.0.0.1",
    createdAt: new Date(),
    employee: {
      id: "employee-1",
      isActive: true,
      role: { name: "employee", permissions: [] },
    },
  };
}

describe("refresh token Redis cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.values.clear();
    mocks.cachedSessionByHash.clear();
    mocks.repository.findOne.mockResolvedValue(makeSession());
  });

  it("loads a cache miss from PostgreSQL and stores it in Redis", async () => {
    const repository = new RefreshTokenRepository();

    const session = await repository.findByHash(tokenHash);

    expect(session?.id).toBe("session-1");
    expect(mocks.repository.findOne).toHaveBeenCalledOnce();
    expect(mocks.setSessionInRedis).toHaveBeenCalledWith(session);
  });

  it("returns the cached session on the next lookup without querying PostgreSQL", async () => {
    const repository = new RefreshTokenRepository();

    await repository.findByHash(tokenHash);
    const cachedSession = await repository.findByHash(tokenHash);

    expect(cachedSession?.employee.role.name).toBe("employee");
    expect(mocks.repository.findOne).toHaveBeenCalledOnce();
    expect(mocks.getSessionFromRedis).toHaveBeenCalledTimes(2);
  });
});