import "reflect-metadata";
import dotenv from "dotenv";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { Employee } from "../../src/api/v1/entities/Employee";
import { Department } from "../../src/api/v1/entities/Department";
import { Role } from "../../src/api/v1/entities/Role";

dotenv.config({ path: path.resolve(process.cwd(), ".env.test"), override: true });

const { TestDataSource } = require("../config/database") as typeof import("../config/database");
const { AppDataSource } = require("../../src/config/database") as typeof import("../../src/config/database");
const redis = require("../../src/config/redis") as typeof import("../../src/config/redis");
const { TokenExpiryEventService } = require("../../src/api/v1/services/token-expiry-event.service") as typeof import("../../src/api/v1/services/token-expiry-event.service");
const { TokenExpiryReconciliationService } = require("../../src/api/v1/services/token-expiry-reconciliation.service") as typeof import("../../src/api/v1/services/token-expiry-reconciliation.service");

const runId = randomUUID();
let employee: Employee;
let department: Department;
let role: Role;
let createdRole = false;
let redisWasOpen = false;

function assertTestDatabase(value: unknown, source: string): asserts value is string {
  if (typeof value !== "string" || decodeURIComponent(new URL(value).pathname.slice(1)) !== "employee_management_test") {
    throw new Error(`${source} must connect only to employee_management_test`);
  }
}

describe("Redis token-expiry processing", () => {
  beforeAll(async () => {
    assertTestDatabase(process.env.DATABASE_URL, "TestDataSource");
    const appUrl = AppDataSource.options.type === "postgres" && "url" in AppDataSource.options
      ? AppDataSource.options.url
      : undefined;
    assertTestDatabase(appUrl, "AppDataSource");
    if (!TestDataSource.isInitialized) await TestDataSource.initialize();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    await redis.connectRedis();
    if (!redis.redisClient?.isReady) throw new Error("Test Redis is required for expiry integration tests");
    redisWasOpen = true;

    const roleRepository = TestDataSource.getRepository(Role);
    role = await roleRepository.findOneBy({ name: "employee" }) as Role;
    if (!role) {
      role = await roleRepository.save(roleRepository.create({ name: "employee", description: "expiry test" }));
      createdRole = true;
    }
    department = await TestDataSource.getRepository(Department).save(
      TestDataSource.getRepository(Department).create({ name: `Expiry ${runId}` }),
    );
    employee = await TestDataSource.getRepository(Employee).save(
      TestDataSource.getRepository(Employee).create({
        firstName: "Expiry",
        lastName: "Test",
        workEmail: `expiry-${runId}@example.test`,
        passwordHash: null,
        invitationTokenHash: null,
        invitationExpiresAt: null,
        roleId: role.id,
        isActive: true,
        phone: null,
        departmentId: department.id,
        managerId: null,
        jobTitle: "Expiry test",
        joiningDate: new Date().toISOString().slice(0, 10),
        employmentStatus: "active",
        salary: null,
      }),
    );
  });

  afterAll(async () => {
    if (TestDataSource.isInitialized) {
      if (employee?.id) await TestDataSource.getRepository("RefreshToken").delete({ employeeId: employee.id });
      if (employee?.id) await TestDataSource.getRepository(Employee).delete(employee.id);
      if (department?.id) await TestDataSource.getRepository(Department).delete(department.id);
      if (createdRole && role?.id) await TestDataSource.getRepository(Role).delete(role.id);
    }
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
    if (TestDataSource.isInitialized) await TestDataSource.destroy();
    if (redisWasOpen) await redis.disconnectRedis();
  });

  it("revokes and removes a refresh-token family when its session key expires", async () => {
    const familyId = randomUUID();
    const tokenHash = randomBytes(32).toString("hex");
    const tokenRepo = TestDataSource.getRepository("RefreshToken");
    await tokenRepo.save(tokenRepo.create({
      employeeId: employee.id,
      familyId,
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      replacedById: null,
      ipAddress: null,
      userAgent: null,
    }));
    await redis.saveRedisSession({
      id: familyId,
      userId: employee.id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      revokedAt: null,
      ipAddress: null,
      userAgent: null,
    });
    await redis.redisClient!.set(
      `employee-api:session:${familyId}`,
      JSON.stringify({
        id: familyId,
        userId: employee.id,
        createdAt: new Date(Date.now() - 20_000).toISOString(),
        expiresAt: new Date(Date.now() - 10_000).toISOString(),
        revokedAt: null,
        ipAddress: null,
        userAgent: null,
      }),
      { EX: 60 },
    );

    const service = new TokenExpiryEventService();
    expect(await service.processExpiredKey(`employee-api:session:${familyId}`)).toBe("processed");
    const record = await tokenRepo.findOneBy({ tokenHash });
    expect(record?.revokedAt).not.toBeNull();
    expect(await redis.getRedisSession(familyId)).toBeNull();
  });

  it("handles duplicate expiry notifications idempotently", async () => {
    const familyId = randomUUID();
    const tokenHash = randomBytes(32).toString("hex");
    const tokenRepo = TestDataSource.getRepository("RefreshToken");
    await tokenRepo.save(tokenRepo.create({
      employeeId: employee.id,
      familyId,
      tokenHash,
      expiresAt: new Date(Date.now() - 10_000),
      revokedAt: null,
      replacedById: null,
      ipAddress: null,
      userAgent: null,
    }));
    await redis.saveRedisSession({
      id: familyId,
      userId: employee.id,
      createdAt: new Date(Date.now() - 20_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      revokedAt: null,
      ipAddress: null,
      userAgent: null,
    });
    await redis.redisClient!.set(
      `employee-api:session:${familyId}`,
      JSON.stringify({
        id: familyId,
        userId: employee.id,
        createdAt: new Date(Date.now() - 20_000).toISOString(),
        expiresAt: new Date(Date.now() - 10_000).toISOString(),
        revokedAt: null,
        ipAddress: null,
        userAgent: null,
      }),
      { EX: 60 },
    );
    const logs = { info: jest.fn(), error: jest.fn() };
    const tracked = new TokenExpiryEventService(undefined, logs);

    expect(await tracked.processExpiredKey(`employee-api:session:${familyId}`)).toBe("processed");
    expect(await tracked.processExpiredKey(`employee-api:session:${familyId}`)).toBe("duplicate");
    expect(logs.info).toHaveBeenCalledTimes(2);
    expect(logs.info.mock.calls[0][1]).toMatchObject({ eventType: "session", outcome: "processed" });
    expect(JSON.stringify(logs.info.mock.calls)).not.toContain(tokenHash);
  });

  it("reconciles expired refresh-token rows and session metadata after missed events", async () => {
    const familyId = randomUUID();
    const tokenHash = randomBytes(32).toString("hex");
    const tokenRepo = TestDataSource.getRepository("RefreshToken");
    await tokenRepo.save(tokenRepo.create({
      employeeId: employee.id,
      familyId,
      tokenHash,
      expiresAt: new Date(Date.now() - 10_000),
      revokedAt: null,
      replacedById: null,
      ipAddress: null,
      userAgent: null,
    }));
    await redis.saveRedisSession({
      id: familyId,
      userId: employee.id,
      createdAt: new Date(Date.now() - 20_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      revokedAt: null,
      ipAddress: null,
      userAgent: null,
    });
    await redis.redisClient!.set(
      `employee-api:session:${familyId}`,
      JSON.stringify({
        id: familyId,
        userId: employee.id,
        createdAt: new Date(Date.now() - 20_000).toISOString(),
        expiresAt: new Date(Date.now() - 10_000).toISOString(),
        revokedAt: null,
        ipAddress: null,
        userAgent: null,
      }),
      { EX: 60 },
    );

    const removed = await new TokenExpiryReconciliationService().reconcile();
    expect(removed).toBeGreaterThan(0);
    expect(await tokenRepo.findOneBy({ tokenHash })).toBeNull();
    expect(await redis.getRedisSession(familyId)).toBeNull();
  });

  it("reports a Redis disconnection without treating it as a processed expiry", async () => {
    await redis.redisClient!.disconnect();
    try {
      await expect(new TokenExpiryReconciliationService().reconcile()).rejects.toThrow();
    } finally {
      await redis.connectRedis();
    }
  });

  it("preserves existing Redis notification flags when enabling expiry events", async () => {
    await redis.redisClient!.sendCommand([
      "CONFIG",
      "SET",
      "notify-keyspace-events",
      "K$",
    ]);

    await redis.configureExpiryNotifications();
    const config = await redis.redisClient!.sendCommand([
      "CONFIG",
      "GET",
      "notify-keyspace-events",
    ]);
    const flags = String((config as string[])[1]);

    expect(flags).toContain("K");
    expect(flags).toContain("$");
    expect(flags).toContain("E");
    expect(flags).toContain("x");
  });
});