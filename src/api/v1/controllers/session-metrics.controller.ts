import type { Request, Response } from "express";
import { ApiResponse } from "../../../utils/ApiResponse";
import { SessionAuditService } from "../services/session-audit.service";

export class SessionMetricsController {
  private readonly audit = new SessionAuditService();

  daily = async (_req: Request, res: Response) =>
    ApiResponse.send(
      res,
      200,
      "Daily session metrics fetched",
      await this.audit.dailySummary(),
    );
}