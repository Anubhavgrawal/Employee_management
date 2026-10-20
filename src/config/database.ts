import "reflect-metadata";
import { DataSource } from "typeorm";
import { env } from "./env";
import { Employee } from "../entities/Employee";
import { Department } from "../entities/Department";
import { Role } from "../entities/Role";
import { Permission } from "../entities/Permission";
import { RefreshToken } from "../entities/RefreshToken";
import { AuditLog } from "../entities/AuditLog";
import { EmployeeDocument } from "../entities/EmployeeDocument";

// synchronize is deliberately disabled: migrations are the source of schema changes.
export const AppDataSource = new DataSource({
  type: "postgres",
  url: env.DATABASE_URL,
  entities: [
    Employee,
    Department,
    Role,
    Permission,
    RefreshToken,
    AuditLog,
    EmployeeDocument,
  ],
  migrations: ["src/migrations/*.ts"],
  synchronize: false,
  logging: env.NODE_ENV === "development",
});
