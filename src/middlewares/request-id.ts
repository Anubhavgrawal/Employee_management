import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("x-request-id");
  res.locals.requestId =
    incoming && /^[a-zA-Z0-9-]{1,80}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader("X-Request-Id", res.locals.requestId);
  next();
}
