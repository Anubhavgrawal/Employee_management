import "reflect-metadata";
import dotenv from "dotenv";
import path from "node:path";
import argon2 from "argon2";
import { createHash } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import { In } from "typeorm";
import { Employee } from "../../src/api/v1/entities/Employee";
import { Department } from "../../src/api/v1/entities/Department";
import { Role } from "../../src/api/v1/entities/Role";

// Load the guarded test environment before importing the application datasource.
dotenv.config({
  path: path.resolve(process.cwd(), ".env.test"),
  override: true,
});

process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ||
  "integration-only-jwt-secret-that-is-at-least-32-characters";
process.env.JWT_ISSUER = process.env.JWT_ISSUER || "employee-management-api";
process.env.JWT_AUDIENCE =
  process.env.JWT_AUDIENCE || "employee-management-clients";

const { TestDataSource } = require("../config/database") as typeof import("../config/database");
const { AppDataSource } = require("../../src/config/database") as typeof import("../../src/config/database");
const {
  connectRedis,
  disconnectRedis,
  redisClient,
  revokeAllRedisSessions,
} = require("../../src/config/redis") as typeof import("../../src/config/redis");
const { app } = require("../../src/app") as typeof import("../../src/app");
const { apiRateLimit } = require("../../src/middlewares/rate-limit") as typeof import("../../src/middlewares/rate-limit");

const password = "IntegrationPassword123!";
const runId = Date.now().toString();
const employeeEmail = (suffix: string) =>
  `integration-${suffix}-${runId}@example.test`;
let requestIpCounter = 1;

let departmentId: string;
let employeeRole: Role;
let firstEmployee: Employee;
let secondEmployee: Employee;
let createdRoleDuringTest = false;

const fixtureEmails = [employeeEmail("one"), employeeEmail("two")];

function assertTestDatabaseUrl(databaseUrl: unknown, source: string) {
  if (typeof databaseUrl !== "string" || !databaseUrl) {
    throw new Error(`${source} DATABASE_URL is missing`);
  }
  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  if (databaseName !== "employee_management_test") {
    throw new Error(
      `${source} must connect only to employee_management_test, received ${databaseName}`,
    );
  }
}

async function login(email: string, loginPassword = password) {
  const response = await request(app)
    .post("/api/v1/auth/login")
    .set("X-Forwarded-For", `198.51.100.${requestIpCounter++}`)
    .send({ email, password: loginPassword });
  return response;
}

async function createFixtures() {
  const roleRepository = TestDataSource.getRepository(Role);
  employeeRole = await roleRepository.findOneBy({ name: "employee" }) as Role;
  if (!employeeRole) {
    employeeRole = await roleRepository.save(
      roleRepository.create({ name: "employee", description: "Integration test role", permissions: [] }),
    );
    createdRoleDuringTest = true;
  }

  const departmentRepository = TestDataSource.getRepository(Department);
  const department = await departmentRepository.save(
    departmentRepository.create({
      name: `Integration Department ${runId}`,
      description: "Created only for integration tests",
    }),
  );
  departmentId = department.id;

  const employeeRepository = TestDataSource.getRepository(Employee);
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const employees = await employeeRepository.save(
    employeeRepository.create([
      {
        firstName: "Integration",
        lastName: "One",
        workEmail: fixtureEmails[0],
        passwordHash,
        roleId: employeeRole.id,
        isActive: true,
        departmentId,
        jobTitle: "Integration Tester",
        joiningDate: "2026-10-23",
        employmentStatus: "active",
        phone: null,
        managerId: null,
        salary: null,
        invitationTokenHash: null,
        invitationExpiresAt: null,
      },
      {
        firstName: "Integration",
        lastName: "Two",
        workEmail: fixtureEmails[1],
        passwordHash,
        roleId: employeeRole.id,
        isActive: true,
        departmentId,
        jobTitle: "Integration Tester",
        joiningDate: "2026-10-23",
        employmentStatus: "active",
        phone: null,
        managerId: null,
        salary: null,
        invitationTokenHash: null,
        invitationExpiresAt: null,
      },
    ]),
  );
  [firstEmployee, secondEmployee] = employees;
}

async function cleanupFixtures() {
  if (!TestDataSource.isInitialized) return;

  const sessionUserIds = [firstEmployee?.id, secondEmployee?.id].filter(
    (id): id is string => Boolean(id),
  );
  for (const employeeId of sessionUserIds)
    await revokeAllRedisSessions(employeeId);

  const employeeRows = await TestDataSource.getRepository(Employee).find({
    where: { workEmail: In(fixtureEmails) },
    select: { id: true },
  });
  const employeeIds = employeeRows.map((employee) => employee.id);

  if (employeeIds.length > 0) {
    await TestDataSource.query(
      "DELETE FROM audit_logs WHERE actor_employee_id = ANY($1::uuid[]) OR resource_id = ANY($1::uuid[])",
      [employeeIds],
    );
    await TestDataSource.getRepository("RefreshToken").delete({
      employeeId: In(employeeIds),
    });
    await TestDataSource.getRepository(Employee).delete({ id: In(employeeIds) });
  }

  if (departmentId) {
    await TestDataSource.getRepository(Department).delete({ id: departmentId });
  }
  if (createdRoleDuringTest && employeeRole?.id) {
    await TestDataSource.getRepository(Role).delete({ id: employeeRole.id });
  }
}

describe("Employee Management API security integration", () => {
  beforeAll(async () => {
    assertTestDatabaseUrl(process.env.DATABASE_URL, "TestDataSource");
    assertTestDatabaseUrl(process.env.DATABASE_URL, "AppDataSource");
    if (!TestDataSource.isInitialized) await TestDataSource.initialize();
    const appDatabaseOptions = AppDataSource.options;
    if (appDatabaseOptions.type !== "postgres" || !("url" in appDatabaseOptions)) {
      throw new Error("AppDataSource must use a PostgreSQL URL for the test database");
    }
    const appDatabaseUrl = appDatabaseOptions.url;
    assertTestDatabaseUrl(appDatabaseUrl, "AppDataSource");
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    await connectRedis();
    if (!redisClient?.isReady) throw new Error("Test Redis is required for session integration tests");
    // Keep auth-rate-limit buckets isolated without changing production code.
    app.set("trust proxy", 1);
    await createFixtures();
  });

  afterAll(async () => {
    try {
      await cleanupFixtures();
    } finally {
      if (AppDataSource.isInitialized) await AppDataSource.destroy();
      if (TestDataSource.isInitialized) await TestDataSource.destroy();
      await disconnectRedis();
    }
  });

  beforeEach(async () => {
    if (firstEmployee) await apiRateLimit.resetKey(`user:${firstEmployee.id}`);
    if (secondEmployee) await apiRateLimit.resetKey(`user:${secondEmployee.id}`);
  });

  it("rejects missing authentication on a protected employee route", async () => {
    const response = await request(app).get(`/api/v1/employees/${firstEmployee.id}`);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
    });
  });

  it("rejects invalid login credentials", async () => {
    const response = await login(firstEmployee.workEmail, "WrongPassword123!");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
      message: "Invalid email or password",
    });
  });

  it("prevents one employee from reading another employee's profile", async () => {
    const loginResponse = await login(firstEmployee.workEmail);
    const accessToken = loginResponse.body.data.accessToken as string;

    const response = await request(app)
      .get(`/api/v1/employees/${secondEmployee.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(loginResponse.status).toBe(200);
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      code: "NOT_FOUND",
      message: "Employee not found",
    });
  });

  it("rejects restricted fields instead of mass assigning them through self-profile", async () => {
    const loginResponse = await login(firstEmployee.workEmail);
    const accessToken = loginResponse.body.data.accessToken as string;
    const before = await TestDataSource.getRepository("Employee").findOneByOrFail({
      id: firstEmployee.id,
    });

    const response = await request(app)
      .patch("/api/v1/employees/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        role: "admin",
        isActive: false,
        passwordHash: "attacker-controlled-hash",
      });

    const after = await TestDataSource.getRepository("Employee").findOneByOrFail({
      id: firstEmployee.id,
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "BAD_REQUEST",
    });
    expect(after.roleId).toBe(before.roleId);
    expect(after.isActive).toBe(before.isActive);
  });

  it("rejects replay of an already-rotated refresh token", async () => {
    const loginResponse = await login(firstEmployee.workEmail);
    const originalRefreshToken = loginResponse.body.data.refreshToken as string;

    const rotationResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("X-Forwarded-For", `198.51.100.${requestIpCounter++}`)
      .send({ refreshToken: originalRefreshToken });
    expect(rotationResponse.status).toBe(200);
    const rotatedRefreshToken = rotationResponse.body.data.refreshToken as string;

    const replayResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("X-Forwarded-For", `198.51.100.${requestIpCounter++}`)
      .send({ refreshToken: originalRefreshToken });
    const familyTokenResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("X-Forwarded-For", `198.51.100.${requestIpCounter++}`)
      .send({ refreshToken: rotatedRefreshToken });

    expect(loginResponse.status).toBe(200);
    expect(rotationResponse.status).toBe(200);
    expect(replayResponse.status).toBe(401);
    expect(replayResponse.body).toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
      message: "Refresh token is invalid or has already been used",
    });
    expect(familyTokenResponse.status).toBe(401);
  });

  it("allows only one concurrent refresh and revokes the family on reuse", async () => {
    const loginResponse = await login(firstEmployee.workEmail);
    const originalRefreshToken = loginResponse.body.data.refreshToken as string;
    const requests = [0, 1].map(() =>
      request(app)
        .post("/api/v1/auth/refresh")
        .set("X-Forwarded-For", `198.51.100.${requestIpCounter++}`)
        .send({ refreshToken: originalRefreshToken }),
    );

    const [first, second] = await Promise.all(requests);
    expect([first.status, second.status].sort()).toEqual([200, 401]);
    const successful = first.status === 200 ? first : second;
    expect(successful.body.data.refreshToken).toBeTruthy();

    const protectedResponse = await request(app)
      .get("/api/v1/employees/me")
      .set("Authorization", `Bearer ${successful.body.data.accessToken}`);
    expect(protectedResponse.status).toBe(401);
  });

  it("rejects an expired refresh token without treating it as replay", async () => {
    const loginResponse = await login(secondEmployee.workEmail);
    const refreshToken = loginResponse.body.data.refreshToken as string;
    const tokenHash = createHash("sha256").update(refreshToken).digest("hex");

    await redisClient!.del(`employee-api:session:token:${tokenHash}`);
    await TestDataSource.getRepository("RefreshToken").update(
      { tokenHash },
      { expiresAt: new Date(Date.now() - 1000) },
    );

    const response = await request(app)
      .post("/api/v1/auth/refresh")
      .set("X-Forwarded-For", `198.51.100.${requestIpCounter++}`)
      .send({ refreshToken });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid refresh token");
  });

  it("supports concurrent sessions and lists them independently", async () => {
    const firstLogin = await login(firstEmployee.workEmail);
    const secondLogin = await login(firstEmployee.workEmail);
    const accessToken = firstLogin.body.data.accessToken as string;

    const sessionsResponse = await request(app)
      .get("/api/v1/auth/sessions")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(firstLogin.status).toBe(200);
    expect(secondLogin.status).toBe(200);
    expect(firstLogin.body.data.sessionId).not.toBe(secondLogin.body.data.sessionId);
    expect(sessionsResponse.status).toBe(200);
    expect(sessionsResponse.body.data.map((session: { id: string }) => session.id))
      .toEqual(expect.arrayContaining([
        firstLogin.body.data.sessionId,
        secondLogin.body.data.sessionId,
      ]));

    const rawRefresh = firstLogin.body.data.refreshToken as string;
    const refreshHash = createHash("sha256").update(rawRefresh).digest("hex");
    const cachedRefresh = await redisClient!.get(`employee-api:session:token:${refreshHash}`);
    expect(cachedRefresh).toBeTruthy();
    expect(cachedRefresh).not.toContain(rawRefresh);
    expect(await redisClient!.ttl(`employee-api:session:token:${refreshHash}`)).toBeGreaterThan(0);
  });

  it("rejects the access token after logout", async () => {
    const loginResponse = await login(firstEmployee.workEmail);
    const { accessToken, refreshToken } = loginResponse.body.data;

    const logoutResponse = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken });
    const protectedResponse = await request(app)
      .get("/api/v1/employees/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(logoutResponse.status).toBe(200);
    expect(protectedResponse.status).toBe(401);
    expect(protectedResponse.body.message).toBe("Session is invalid, revoked, or expired");
  });

  it("revokes only an owned session and rejects its access token", async () => {
    const firstLogin = await login(firstEmployee.workEmail);
    const secondLogin = await login(firstEmployee.workEmail);
    const firstSessionId = firstLogin.body.data.sessionId as string;

    const revokeResponse = await request(app)
      .delete(`/api/v1/auth/sessions/${firstSessionId}`)
      .set("Authorization", `Bearer ${secondLogin.body.data.accessToken}`);
    const revokedAccess = await request(app)
      .get("/api/v1/employees/me")
      .set("Authorization", `Bearer ${firstLogin.body.data.accessToken}`);
    const remainingAccess = await request(app)
      .get("/api/v1/employees/me")
      .set("Authorization", `Bearer ${secondLogin.body.data.accessToken}`);

    expect(revokeResponse.status).toBe(200);
    expect(revokedAccess.status).toBe(401);
    expect(remainingAccess.status).toBe(200);
  });

  it("does not allow another employee to revoke an owned session", async () => {
    const ownerLogin = await login(firstEmployee.workEmail);
    const otherLogin = await login(secondEmployee.workEmail);
    const sessionId = ownerLogin.body.data.sessionId as string;

    const revokeResponse = await request(app)
      .delete(`/api/v1/auth/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${otherLogin.body.data.accessToken}`);
    const ownerAccess = await request(app)
      .get("/api/v1/employees/me")
      .set("Authorization", `Bearer ${ownerLogin.body.data.accessToken}`);

    expect(revokeResponse.status).toBe(404);
    expect(ownerAccess.status).toBe(200);
  });

  it("rejects an access token after its Redis session TTL expires", async () => {
    const loginResponse = await login(firstEmployee.workEmail);
    const { accessToken, sessionId } = loginResponse.body.data;
    await redisClient!.expire(`employee-api:session:${sessionId}`, 1);
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const response = await request(app)
      .get("/api/v1/employees/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(401);
  });

  it("returns 503 instead of accepting a token when Redis is unavailable", async () => {
    const loginResponse = await login(secondEmployee.workEmail);
    const accessToken = loginResponse.body.data.accessToken as string;
    await redisClient!.disconnect();

    try {
      const response = await request(app)
        .get("/api/v1/employees/me")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(response.status).toBe(503);
      expect(response.body.code).toBe("SESSION_STORE_UNAVAILABLE");
    } finally {
      await connectRedis();
    }
  });
});
