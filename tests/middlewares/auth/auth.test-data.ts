import jwt from "jsonwebtoken";
import { env } from "../../../src/config/env";
import type { AuthUser } from "../../../src/interfaces/auth.interface";

export const authTestUser = {
  id: "employee-123",
  role: "manager",
  employeeId: "employee-123",
  permissions: ["employee:read", "employee:update"],
} satisfies AuthUser;
export const authTestSessionId = "bdb4ee4c-9a80-43fc-9fc9-5ab754fedf14";

export function createAccessToken(
  overrides: Partial<jwt.JwtPayload> = {},
  options: jwt.SignOptions = {},
) {
  return jwt.sign(
    {
      type: "access",
      sessionId: authTestSessionId,
      role: authTestUser.role,
      employeeId: authTestUser.employeeId,
      permissions: authTestUser.permissions,
      ...overrides,
    },
    env.JWT_ACCESS_SECRET,
    {
      subject: authTestUser.id,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      algorithm: "HS256",
      expiresIn: "15m",
      ...options,
    },
  );
}

export const protectedPath = "/protected";
