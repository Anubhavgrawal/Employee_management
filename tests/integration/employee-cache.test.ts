import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { Department } from "../../src/api/v1/entities/Department";
import { Employee } from "../../src/api/v1/entities/Employee";
import { DepartmentRepository } from "../../src/api/v1/repositories/department.repository";
import { EmployeeRepository } from "../../src/api/v1/repositories/employee.repository";
import { AppDataSource } from "../../src/config/database";
import {
  connectRedis,
  disconnectRedis,
  redisClient,
} from "../../src/config/redis";
import {
  employeeListCacheKey,
  invalidateEmployeeCache,
} from "../../src/config/redis-employee";
import { TestDataSource } from "../config/database";

const runId = `cache-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const employeeEmail = `${runId}@example.test`;
const listQuery = {
  page: 1,
  limit: 20,
  search: runId,
  sortBy: "firstName" as const,
  sortOrder: "ASC" as const,
};

let department: Department;
let employee: Employee;
const employeeRepository = new EmployeeRepository();
const departmentRepository = new DepartmentRepository();

function assertTestDatabase(url: string | undefined) {
  if (!url || decodeURIComponent(new URL(url).pathname.slice(1)) !== "employee_management_test") {
    throw new Error("Employee cache integration tests may only use employee_management_test");
  }
}

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.get("/employees/:id", async (req, res) => {
    const result = await employeeRepository.findById(req.params.id);
    if (!result) return res.sendStatus(404);
    return res.json(result);
  });
  app.get("/employees", async (_req, res) =>
    res.json(await employeeRepository.list(listQuery)),
  );
  app.patch("/employees/:id", async (req, res) => {
    const record = await employeeRepository.findById(req.params.id);
    if (!record) return res.sendStatus(404);
    record.firstName = req.body.firstName;
    return res.json(await employeeRepository.save(record));
  });
  app.post("/employees", async (req, res) =>
    res.status(201).json(await employeeRepository.save(req.body as Employee)),
  );
  app.delete("/employees/:id", async (req, res) => {
    const result = await employeeRepository.delete(req.params.id);
    return res.json({ deleted: Boolean(result.affected) });
  });
  app.get("/departments", async (_req, res) =>
    res.json(await departmentRepository.list()),
  );
  app.get("/departments/:id", async (req, res) => {
    const result = await departmentRepository.findById(req.params.id);
    if (!result) return res.sendStatus(404);
    return res.json(result);
  });
  app.patch("/departments/:id", async (req, res) => {
    const record = await departmentRepository.findById(req.params.id);
    if (!record) return res.sendStatus(404);
    record.name = req.body.name;
    return res.json(await departmentRepository.save(record));
  });
  app.post("/departments", async (req, res) =>
    res.status(201).json(await departmentRepository.save(req.body as Department)),
  );
  app.delete("/departments/:id", async (req, res) => {
    const result = await departmentRepository.delete(req.params.id);
    return res.json({ deleted: Boolean(result.affected) });
  });
  return app;
}

const app = createTestApp();

describe("employee and department Redis cache-aside", () => {
  beforeAll(async () => {
    assertTestDatabase(process.env.DATABASE_URL);
    const appDatabaseUrl = AppDataSource.options.type === "postgres" && "url" in AppDataSource.options
      ? AppDataSource.options.url
      : undefined;
    assertTestDatabase(appDatabaseUrl);

    if (!TestDataSource.isInitialized) await TestDataSource.initialize();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    await connectRedis();
    if (!redisClient?.isReady) throw new Error("REDIS_URL must be available to run cache integration tests");

    department = await TestDataSource.getRepository(Department).save(
      TestDataSource.getRepository(Department).create({
        name: `Cache Department ${runId}`,
        description: "Cache integration fixture",
      }),
    );
    employee = await TestDataSource.getRepository(Employee).save(
      TestDataSource.getRepository(Employee).create({
        firstName: "Cache",
        lastName: "Fixture",
        workEmail: employeeEmail,
        passwordHash: null,
        invitationTokenHash: null,
        invitationExpiresAt: null,
        roleId: null,
        isActive: true,
        phone: "+15550001111",
        departmentId: department.id,
        managerId: null,
        jobTitle: "Cache Test",
        joiningDate: "2026-10-29",
        employmentStatus: "active",
        salary: null,
      }),
    );
  });

  afterAll(async () => {
    if (redisClient?.isReady) {
      await Promise.all([
        redisClient.del(`employee:${employee?.id}`),
        redisClient.del(`department:${department?.id}`),
        redisClient.del("departments:all"),
        redisClient.del(employeeListCacheKey(listQuery)),
      ]);
    }
    if (TestDataSource.isInitialized) {
      if (employee?.id) await TestDataSource.getRepository(Employee).delete(employee.id);
      if (department?.id) await TestDataSource.getRepository(Department).delete(department.id);
      await TestDataSource.destroy();
    }
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
    await disconnectRedis();
  });

  it("loads an employee on a miss, caches a safe projection, then serves the hit", async () => {
    const first = await request(app).get(`/employees/${employee.id}`);
    expect(first.status).toBe(200);
    expect(first.body.firstName).toBe("Cache");

    const cachedValue = await redisClient!.get(`employee:${employee.id}`);
    expect(cachedValue).toBeTruthy();
    expect(cachedValue).not.toContain("passwordHash");
    expect(cachedValue).not.toContain("invitationTokenHash");

    await TestDataSource.getRepository(Employee).update(employee.id, { firstName: "Database" });
    const second = await request(app).get(`/employees/${employee.id}`);
    expect(second.body.firstName).toBe("Cache");
  });

  it("caches filtered employee lists and expires the list entry", async () => {
    const first = await request(app).get("/employees");
    expect(first.body.items.some((item: Employee) => item.id === employee.id)).toBe(true);

    const key = employeeListCacheKey(listQuery);
    expect(await redisClient!.ttl(key)).toBeGreaterThan(0);
    await redisClient!.pExpire(key, 1);
    await new Promise((resolve) => setTimeout(resolve, 25));

    await TestDataSource.getRepository(Employee).update(employee.id, { firstName: "AfterExpiry" });
    const afterExpiry = await request(app).get("/employees");
    expect(afterExpiry.body.items.find((item: Employee) => item.id === employee.id).firstName)
      .toBe("AfterExpiry");
  });

  it("invalidates employee details and list entries after updates, creates, and deletes", async () => {
    await request(app).get(`/employees/${employee.id}`);
    await request(app).get("/employees");

    const updated = await request(app)
      .patch(`/employees/${employee.id}`)
      .send({ firstName: "Updated" });
    expect(updated.status).toBe(200);
    expect((await request(app).get(`/employees/${employee.id}`)).body.firstName).toBe("Updated");

    const newEmployee = TestDataSource.getRepository(Employee).create({
      ...employee,
      id: undefined,
      workEmail: `created-${runId}@example.test`,
      firstName: "Created",
    });
    const created = await request(app).post("/employees").send(newEmployee);
    expect(created.status).toBe(201);
    expect((await request(app).get("/employees")).body.items
      .some((item: Employee) => item.id === created.body.id)).toBe(true);

    await request(app).get(`/employees/${created.body.id}`);
    await request(app).delete(`/employees/${created.body.id}`);
    expect((await request(app).get(`/employees/${created.body.id}`)).status).toBe(404);
  });

  it("invalidates department details and lists after create, update, and delete", async () => {
    await request(app).get(`/departments/${department.id}`);
    await request(app).get("/departments");

    const updated = await request(app)
      .patch(`/departments/${department.id}`)
      .send({ name: `Updated ${runId}` });
    expect(updated.status).toBe(200);
    expect((await request(app).get(`/departments/${department.id}`)).body.name)
      .toBe(`Updated ${runId}`);

    const createdDepartment = await TestDataSource.getRepository(Department).save(
      TestDataSource.getRepository(Department).create({ name: `Created ${runId}` }),
    );
    await departmentRepository.save(createdDepartment);
    expect((await request(app).get("/departments")).body
      .some((item: Department) => item.id === createdDepartment.id)).toBe(true);

    await request(app).get(`/departments/${createdDepartment.id}`);
    await request(app).delete(`/departments/${createdDepartment.id}`);
    expect((await request(app).get(`/departments/${createdDepartment.id}`)).status).toBe(404);
  });

  it("falls back to PostgreSQL when Redis is disconnected", async () => {
    await redisClient!.disconnect();
    try {
      const response = await request(app).get(`/employees/${employee.id}`);
      expect(response.status).toBe(200);
    } finally {
      await connectRedis();
    }
  });
});