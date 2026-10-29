import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  attempts: 0,
  user: null as null | { id: string; isActive: boolean; passwordHash: string; role: { name: string; permissions: [] } },
  getAttempts: vi.fn(async () => mocks.attempts),
  recordAttempt: vi.fn(async () => ++mocks.attempts),
  clearAttempts: vi.fn(async () => { mocks.attempts = 0; }),
  saveSession: vi.fn(async () => undefined),
  findByEmail: vi.fn(async () => mocks.user),
  saveToken: vi.fn(async (token: object) => token),
  audit: vi.fn(async () => undefined),
}));

vi.mock("../src/config/redis", () => ({
  getFailedLoginAttempts: mocks.getAttempts,
  recordFailedLoginAttempt: mocks.recordAttempt,
  clearFailedLoginAttempts: mocks.clearAttempts,
  saveRedisSession: mocks.saveSession,
}));
vi.mock("../src/api/v1/repositories/user.repository", () => ({
  UserRepository: class { findByEmail = mocks.findByEmail; },
}));
vi.mock("../src/api/v1/repositories/refresh-token.repository", () => ({
  RefreshTokenRepository: class {
    save = mocks.saveToken;
    cacheSession = vi.fn();
    revokeAll = vi.fn();
    revokeFamily = vi.fn();
    activeForUser = vi.fn();
    revokeSession = vi.fn();
  },
}));
vi.mock("../src/services/audit.service", () => ({
  AuditService: class { record = mocks.audit; },
}));
vi.mock("../src/api/v1/services/audit.service", () => ({
  AuditService: class { record = mocks.audit; },
}));
vi.mock("../src/config/database", () => ({
  AppDataSource: {
    getRepository: () => ({ create: (token: object) => ({ id: "session-1", ...token }) }),
  },
}));
vi.mock("argon2", () => ({ default: { verify: vi.fn(async () => true) } }));
vi.mock("../src/providers/jwt.provider", () => ({ signAccessToken: () => "access-token" }));

import { AuthService } from "../src/api/v1/services/auth.service";

describe("failed login attempt limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.attempts = 0;
    mocks.user = null;
    mocks.getAttempts.mockImplementation(async () => mocks.attempts);
    mocks.recordAttempt.mockImplementation(async () => ++mocks.attempts);
    mocks.clearAttempts.mockImplementation(async () => { mocks.attempts = 0; });
    mocks.saveSession.mockResolvedValue(undefined);
    mocks.findByEmail.mockImplementation(async () => mocks.user);
  });

  it("allows five failed attempts, then returns a generic 429", async () => {
    const auth = new AuthService();
    const metadata = {};

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(auth.login(" PERSON@example.test ", "wrong", metadata))
        .rejects.toMatchObject({ statusCode: 401, message: "Invalid email or password" });
    }

    await expect(auth.login("person@example.test", "wrong", metadata))
      .rejects.toMatchObject({
        statusCode: 429,
        code: "TOO_MANY_REQUESTS",
        message: "Too many login attempts. Try again in 24 hours.",
      });
    expect(mocks.recordAttempt).toHaveBeenCalledTimes(5);
    expect(mocks.recordAttempt).toHaveBeenLastCalledWith("person@example.test");
  });

  it("blocks an already-limited identifier before checking credentials", async () => {
    mocks.attempts = 5;
    await expect(new AuthService().login("person@example.test", "password", {}))
      .rejects.toMatchObject({ statusCode: 429 });
    expect(mocks.findByEmail).not.toHaveBeenCalled();
  });

  it("clears prior failures after a successful login", async () => {
    mocks.attempts = 3;
    mocks.user = {
      id: "employee-1",
      isActive: true,
      passwordHash: "hash",
      role: { name: "employee", permissions: [] },
    };

    const result = await new AuthService().login(" PERSON@example.test ", "correct", {});

    expect(result.accessToken).toBe("access-token");
    expect(mocks.clearAttempts).toHaveBeenCalledWith("person@example.test");
    expect(mocks.attempts).toBe(0);
  });
});