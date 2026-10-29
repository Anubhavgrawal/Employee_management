import "reflect-metadata";
import { DataSource } from "typeorm";
import { env } from "./env";
import { Employee } from "../api/v1/entities/Employee";
import { Department } from "../api/v1/entities/Department";
import { Role } from "../api/v1/entities/Role";
import { Permission } from "../api/v1/entities/Permission";
import { RefreshToken } from "../api/v1/entities/RefreshToken";
import { AuditLog } from "../api/v1/entities/AuditLog";
import { EmployeeDocument } from "../api/v1/entities/EmployeeDocument";
import { ActivityLog } from "../api/v1/entities/ActivityLog";

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
    ActivityLog,
  ],
  migrations: ["src/migrations/*.ts"],
  synchronize: false,
  logging: env.NODE_ENV === "development",
});
