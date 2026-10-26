import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { AppError } from "../errors/app-error";
import { errorMessages, httpStatuses } from "../constants";
export function notFound(req: Request, res: Response, next: NextFunction) {
  next(AppError.notFound(`Route ${req.method} ${req.path} not found`));
}
// Express 5 forwards rejected async handlers here automatically.
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  let error =
    err instanceof AppError
      ? err
      : new AppError(
          httpStatuses.INTERNAL_SERVER_ERROR,
          "An unexpected error occurred",
          "INTERNAL_ERROR",
        );
  const e = err as { code?: string; constraint?: string; type?: string };
  if (e?.code === "23505")
    error = AppError.conflict(errorMessages.DUPLICATE_RECORD);
  else if (e?.code === "23503")
    error = AppError.badRequest(errorMessages.REFERENCED_RECORD_MISSING);
  else if (e?.type === "entity.parse.failed")
    error = AppError.badRequest(errorMessages.MALFORMED_JSON);
  else if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE")
    error = AppError.badRequest(errorMessages.DOCUMENT_TOO_LARGE);
  if (error.statusCode >= 500)
    console.error(
      JSON.stringify({
        requestId: res.locals.requestId,
        method: req.method,
        path: req.path,
        message: "Unexpected server error",
      }),
    );
  res
    .status(error.statusCode)
    .json({
      success: false,
      message: error.message,
      code: error.code,
      details: error.statusCode < 500 ? error.details : undefined,
      requestId: res.locals.requestId,
    });
}
