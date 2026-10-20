import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
export interface AuthUser {
  id: string;
  role: string;
  employeeId: string | null;
  permissions: string[];
}
declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer "))
    return next(
      AppError.unauthorized("Use Authorization: Bearer <access-token>"),
    );
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      algorithms: ["HS256"],
    }) as jwt.JwtPayload;
    if (
      payload.type !== "access" ||
      typeof payload.sub !== "string" ||
      typeof payload.role !== "string"
    )
      throw new Error("Invalid token claims");
    req.auth = {
      id: payload.sub,
      role: payload.role,
      employeeId:
        typeof payload.employeeId === "string" ? payload.employeeId : null,
      permissions: Array.isArray(payload.permissions)
        ? payload.permissions
        : [],
    };
    next();
  } catch {
    next(AppError.unauthorized("Invalid or expired access token"));
  }
}
