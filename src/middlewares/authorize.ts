import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/app-error";
import { errorMessages, roles } from "../constants";
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(AppError.unauthorized(errorMessages.AUTHORIZATION_REQUIRED));
    if (!roles.includes(req.auth.role)) return next(AppError.forbidden());
    next();
  };
}
export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(AppError.unauthorized(errorMessages.AUTHORIZATION_REQUIRED));
    if (req.auth.role === roles.ADMIN || req.auth.permissions.includes(permission))
      return next();
    next(AppError.forbidden());
  };
}
