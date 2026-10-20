import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { AppError } from "../errors/app-error";
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
      : new AppError(500, "An unexpected error occurred", "INTERNAL_ERROR");
  const e = err as { code?: string; constraint?: string; type?: string };
  if (e?.code === "23505")
    error = AppError.conflict("A record with this unique value already exists");
  else if (e?.code === "23503")
    error = AppError.badRequest("A referenced record does not exist");
  else if (e?.type === "entity.parse.failed")
    error = AppError.badRequest("Malformed JSON request body");
  else if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE")
    error = AppError.badRequest("Document exceeds the 10 MB size limit");
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
