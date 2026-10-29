import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { AppError } from "../errors/app-error";
import { errorMessages } from "../constants";
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success)
      return next(
        AppError.badRequest(
          errorMessages.REQUEST_VALIDATION_FAILED,
          result.error.flatten(),
        ),
      );
    req.body = result.data;
    next();
  };
}
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success)
      return next(
        AppError.badRequest(errorMessages.QUERY_VALIDATION_FAILED, result.error.flatten()),
      );
    res.locals.validatedQuery = result.data;
    next();
  };
}
