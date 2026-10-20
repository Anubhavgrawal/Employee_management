import type { Response } from "express";
// Every successful JSON response uses the same shape.
export class ApiResponse {
  static send<T>(res: Response, statusCode: number, message: string, data: T) {
    return res
      .status(statusCode)
      .json({ success: true, message, data, requestId: res.locals.requestId });
  }
}
