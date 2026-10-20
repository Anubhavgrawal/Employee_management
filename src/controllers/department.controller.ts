import type { Request, Response } from "express";
import { DepartmentService } from "../services/department.service";
import { ApiResponse } from "../utils/ApiResponse";
export class DepartmentController {
  private service = new DepartmentService();
  list = async (_req: Request, res: Response) =>
    ApiResponse.send(
      res,
      200,
      "Departments fetched",
      await this.service.list(),
    );
  create = async (req: Request, res: Response) =>
    ApiResponse.send(
      res,
      201,
      "Department created",
      await this.service.create(req.body, req.auth!.id, res.locals.requestId),
    );
  update = async (req: Request, res: Response) =>
    ApiResponse.send(
      res,
      200,
      "Department updated",
      await this.service.update(
        req.params.id as string,
        req.body,
        req.auth!.id,
        res.locals.requestId,
      ),
    );
}
