import { AppDataSource } from "../config/database";
import { AuditLog } from "../entities/AuditLog";
export class AuditService {
  async record(input: {
    actorEmployeeId: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    requestId?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const log = AppDataSource.getRepository(AuditLog).create({
      ...input,
      resourceId: input.resourceId ?? null,
      requestId: input.requestId ?? null,
      metadata: input.metadata ?? null,
    });
    await AppDataSource.getRepository(AuditLog).save(log);
  }
}
