import dotenv from "dotenv";
import path from "node:path";

dotenv.config({
  path: path.resolve(process.cwd(), ".env.test"),
  override: true,
});

process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ||
  "jest-only-jwt-secret-that-is-at-least-32-characters";
process.env.JWT_ISSUER = process.env.JWT_ISSUER || "employee-management-api";
process.env.JWT_AUDIENCE =
  process.env.JWT_AUDIENCE || "employee-management-clients";
