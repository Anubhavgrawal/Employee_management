import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../errors/app-error";
import { verifyAccessToken } from "../providers/jwt.provider";
import "../interfaces/auth.interface";
import { errorMessages } from "../constants";
import {
  isRedisSessionActive,
  SessionStoreUnavailableError,
} from "../config/redis";

function tokenErrorMessage(error: unknown): string {
  if (error instanceof jwt.TokenExpiredError)
    return errorMessages.ACCESS_TOKEN_EXPIRED;
  if (error instanceof jwt.NotBeforeError)
    return errorMessages.ACCESS_TOKEN_NOT_ACTIVE;
  if (error instanceof jwt.JsonWebTokenError) {
    if (error.message.includes("signature"))
      return errorMessages.ACCESS_TOKEN_SIGNATURE_INVALID;
    if (error.message.includes("issuer"))
      return errorMessages.ACCESS_TOKEN_ISSUER_INVALID;
    if (error.message.includes("audience"))
      return errorMessages.ACCESS_TOKEN_AUDIENCE_INVALID;
    if (error.message.includes("malformed"))
      return errorMessages.ACCESS_TOKEN_MALFORMED;
    return errorMessages.ACCESS_TOKEN_INVALID;
  }
  if (error instanceof Error && error.message === "Invalid access token claims")
    return errorMessages.ACCESS_TOKEN_CLAIMS_INVALID;
  return errorMessages.ACCESS_TOKEN_INVALID;
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer "))
    return next(
      AppError.unauthorized(errorMessages.BEARER_TOKEN_REQUIRED),
    );
  try {
    const payload = verifyAccessToken(header.slice(7));
    let active: boolean;
    try {
      active = await isRedisSessionActive(payload.sessionId, payload.sub);
    } catch (error) {
      if (error instanceof SessionStoreUnavailableError) {
        return next(new AppError(503, "Session service is temporarily unavailable", "SESSION_STORE_UNAVAILABLE"));
      }
      throw error;
    }
    if (!active)
      return next(AppError.unauthorized("Session is invalid, revoked, or expired"));

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
  } catch (error) {
    next(AppError.unauthorized(tokenErrorMessage(error)));
  }
}
