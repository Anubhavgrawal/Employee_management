import crypto from "node:crypto";
import path from "node:path";
import type { Express } from "express";
import { AppDataSource } from "../../../config/database";
import { objectStorage } from "../../../config/object-storage";
import { Employee } from "../entities/Employee";
import { AppError } from "../../../errors/app-error";
import { allowedDocumentTypes } from "../../../middlewares/upload-document";
import { EmployeeDocumentRepository } from "../repositories/employee-document.repository";
import { AuditService } from "./audit.service";
import type { DocumentActor } from "../../../interfaces/actor.interface";
import { errorMessages, roles } from "../../../constants";

export class DocumentService {
  private documents = new EmployeeDocumentRepository();
  private audit = new AuditService();

  private async assertCanAccess(employeeId: string, actor: DocumentActor) {
    if (actor.role === roles.ADMIN || actor.role === roles.HR) return;
    if (actor.role === roles.EMPLOYEE && actor.employeeId === employeeId) return;
    if (actor.role === roles.MANAGER && actor.employeeId && await AppDataSource.getRepository(Employee).exists({ where: { id: employeeId, managerId: actor.employeeId } })) return;
    throw AppError.notFound(errorMessages.EMPLOYEE_NOT_FOUND);
  }

  private validateContent(file: Express.Multer.File) {
    const extension = path.extname(file.originalname).toLowerCase();
    const valid = (extension === ".pdf" && file.buffer.subarray(0, 5).toString() === "%PDF-") ||
      (extension === ".png" && file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      ([".jpg", ".jpeg"].includes(extension) && file.buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) ||
      (extension === ".docx" && file.buffer.subarray(0, 2).toString() === "PK");
    if (!allowedDocumentTypes[extension] || allowedDocumentTypes[extension] !== file.mimetype || !valid) throw AppError.badRequest(errorMessages.DOCUMENT_TYPE_MISMATCH);
    return extension.slice(1);
  }

  async upload(employeeId: string, file: Express.Multer.File | undefined, actor: DocumentActor, requestId?: string) {
    if (!file) throw AppError.badRequest(errorMessages.DOCUMENT_REQUIRED);
    await this.assertCanAccess(employeeId, actor);
    const extension = this.validateContent(file);
    const objectKey = `employees/${employeeId}/documents/${crypto.randomUUID()}.${extension}`;
    const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
    await objectStorage.put(objectKey, file.buffer, file.mimetype);
    try {
      const document = await this.documents.save({ employeeId, objectKey, originalName: path.basename(file.originalname), mimeType: file.mimetype, extension, sizeBytes: file.size, sha256 });
      await this.audit.record({ actorEmployeeId: actor.employeeId, action: "document.uploaded", resourceType: "employee_document", resourceId: document.id, requestId, metadata: { employeeId, sizeBytes: file.size, mimeType: file.mimetype } });
      return document;
    } catch (error) {
      await objectStorage.remove(objectKey).catch(() => undefined);
      throw error;
    }
  }
  async list(employeeId: string, actor: DocumentActor) { await this.assertCanAccess(employeeId, actor); return this.documents.list(employeeId); }
  async downloadUrl(id: string, actor: DocumentActor, requestId?: string) {
    const document = await this.documents.findById(id);
    if (!document) throw AppError.notFound(errorMessages.DOCUMENT_NOT_FOUND);
    await this.assertCanAccess(document.employeeId, actor);
    const url = await objectStorage.downloadUrl(document.objectKey);
    await this.audit.record({ actorEmployeeId: actor.employeeId, action: "document.download_url_created", resourceType: "employee_document", resourceId: id, requestId });
    return { id, fileName: document.originalName, mimeType: document.mimeType, expiresInSeconds: 300, downloadUrl: url };
  }
  async remove(id: string, actor: DocumentActor, requestId?: string) {
    const document = await this.documents.findById(id);
    if (!document) throw AppError.notFound(errorMessages.DOCUMENT_NOT_FOUND);
    await this.assertCanAccess(document.employeeId, actor);
    await objectStorage.remove(document.objectKey);
    await this.documents.remove(document);
    await this.audit.record({ actorEmployeeId: actor.employeeId, action: "document.deleted", resourceType: "employee_document", resourceId: id, requestId });
    return { id, deleted: true };
  }
}