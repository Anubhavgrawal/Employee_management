import { httpStatuses } from "../constants";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = "APP_ERROR",
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
  static badRequest(message: string, details?: unknown) {
    return new AppError(httpStatuses.BAD_REQUEST, message, "BAD_REQUEST", details);
  }
  static unauthorized(message = "Authentication required") {
    return new AppError(httpStatuses.UNAUTHORIZED, message, "UNAUTHORIZED");
  }
  static forbidden(
    message = "You do not have permission to perform this action",
  ) {
    return new AppError(httpStatuses.FORBIDDEN, message, "FORBIDDEN");
  }
  static notFound(message = "Resource not found") {
    return new AppError(httpStatuses.NOT_FOUND, message, "NOT_FOUND");
  }
  static conflict(message: string) {
    return new AppError(httpStatuses.CONFLICT, message, "CONFLICT");
  }
}
