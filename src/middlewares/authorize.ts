import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/app-error";
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(AppError.unauthorized());
    if (!roles.includes(req.auth.role)) return next(AppError.forbidden());
    next();
  };
}
export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(AppError.unauthorized());
    if (req.auth.role === "admin" || req.auth.permissions.includes(permission))
      return next();
    next(AppError.forbidden());
  };
}
