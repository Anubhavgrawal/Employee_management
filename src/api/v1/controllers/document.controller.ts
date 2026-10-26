import type { Request, Response } from "express";
import { DocumentService } from "../services/document.service";
import { ApiResponse } from "../../../utils/ApiResponse";

export class DocumentController {
  private service = new DocumentService();
  upload = async (req: Request, res: Response) => ApiResponse.send(res, 201, "Document uploaded", await this.service.upload(req.params.id as string, req.file, req.auth!, res.locals.requestId));
  list = async (req: Request, res: Response) => ApiResponse.send(res, 200, "Documents fetched", await this.service.list(req.params.id as string, req.auth!));
  downloadUrl = async (req: Request, res: Response) => ApiResponse.send(res, 200, "Download URL generated", await this.service.downloadUrl(req.params.id as string, req.auth!, res.locals.requestId));
  remove = async (req: Request, res: Response) => ApiResponse.send(res, 200, "Document deleted", await this.service.remove(req.params.id as string, req.auth!, res.locals.requestId));
}