import { createHash, randomUUID } from "node:crypto";
import { SessionAuditRepository, type SessionAuditInput } from "../repositories/session-audit.repository";
import type { SessionAuditEventType } from "../entities/SessionAuditEvent";

export class SessionAuditUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("Session audit storage is temporarily unavailable", options);
    this.name = "SessionAuditUnavailableError";
  }
}

export function sessionAuditCorrelationId(eventType: SessionAuditEventType, sessionId: string): string {
  const bytes = createHash("sha256").update(`${eventType}:${sessionId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class SessionAuditService {
  constructor(
    private readonly repository = new SessionAuditRepository(),
    private readonly pause: (milliseconds: number) => Promise<void> =
      (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {}

  async record(input: Omit<SessionAuditInput, "correlationId"> & { correlationId?: string }): Promise<void> {
    await this.recordWithRetry({ ...input, correlationId: input.correlationId ?? randomUUID() });
  }

  async recordLifecycle(
    input: Omit<SessionAuditInput, "correlationId"> & { correlationId?: string },
  ): Promise<void> {
    await this.recordWithRetry({
      ...input,
      correlationId:
        input.correlationId ?? sessionAuditCorrelationId(input.eventType, input.sessionId),
    });
  }

  historyForUser(userId: string, limit = 100) {
    return this.repository.historyForUser(userId, Math.max(1, Math.min(limit, 200)));
  }

  dailySummary(day = new Date()) {
    return this.repository.dailySummary(day);
  }

  private async recordWithRetry(input: SessionAuditInput): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.repository.record(input);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await this.pause(20 * (attempt + 1));
      }
    }

    console.error("Could not durably record session audit event", {
      eventType: input.eventType,
      sessionId: input.sessionId,
      correlationId: input.correlationId,
    });
    throw new SessionAuditUnavailableError({ cause: lastError });
  }
}