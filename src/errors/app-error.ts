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
    return new AppError(400, message, "BAD_REQUEST", details);
  }
  static unauthorized(message = "Authentication required") {
    return new AppError(401, message, "UNAUTHORIZED");
  }
  static forbidden(
    message = "You do not have permission to perform this action",
  ) {
    return new AppError(403, message, "FORBIDDEN");
  }
  static notFound(message = "Resource not found") {
    return new AppError(404, message, "NOT_FOUND");
  }
  static conflict(message: string) {
    return new AppError(409, message, "CONFLICT");
  }
}
