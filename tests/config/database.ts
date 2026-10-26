
import "reflect-metadata";
import dotenv from "dotenv";
import path from "node:path";
import { DataSource } from "typeorm";

import { AuditLog } from "../../src/api/v1/entities/AuditLog";
import { Department } from "../../src/api/v1/entities/Department";
import { Employee } from "../../src/api/v1/entities/Employee";
import { EmployeeDocument } from "../../src/api/v1/entities/EmployeeDocument";
import { Permission } from "../../src/api/v1/entities/Permission";
import { RefreshToken } from "../../src/api/v1/entities/RefreshToken";
import { Role } from "../../src/api/v1/entities/Role";

dotenv.config({
  path: path.resolve(process.cwd(), ".env.test"),
  override: true,
});

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Test DATABASE_URL is missing from .env.test");
}

const databaseName = decodeURIComponent(
  new URL(databaseUrl).pathname.slice(1),
);

if (databaseName !== "employee_management_test") {
  throw new Error(
    "Tests can only connect to employee_management_test",
  );
}

export const TestDataSource = new DataSource({
  type: "postgres",
  url: databaseUrl,
  entities: [
    AuditLog,
    Department,
    Employee,
    EmployeeDocument,
    Permission,
    RefreshToken,
    Role,
  ],
  migrations: [path.resolve(process.cwd(), "src/migrations/*.ts")],
  synchronize: false,
  logging: false,
});
