import { AppDataSource } from "../../../config/database";
import {
  SessionAuditEvent,
  type SessionAuditEventType,
} from "../entities/SessionAuditEvent";

export type SessionAuditInput = {
  userId: string;
  sessionId: string;
  eventType: SessionAuditEventType;
  correlationId: string;
  occurredAt?: Date;
};

export class SessionAuditRepository {
  private readonly repository = AppDataSource.getRepository(SessionAuditEvent);

  async record(input: SessionAuditInput): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      const repository = manager.getRepository(SessionAuditEvent);
      const result = await repository
        .createQueryBuilder()
        .insert()
        .values({
          ...input,
          occurredAt: input.occurredAt ?? new Date(),
          processedAt: null,
          processingStatus: "pending",
        })
        .orIgnore()
        .execute();
      if (!result.identifiers.length) return;

      await repository.update(
        { correlationId: input.correlationId },
        { processedAt: new Date(), processingStatus: "processed" },
      );
    });
  }

  historyForUser(userId: string, limit: number) {
    return this.repository.find({
      where: { userId },
      order: { occurredAt: "DESC" },
      take: limit,
      select: {
        id: true,
        userId: true,
        sessionId: true,
        eventType: true,
        occurredAt: true,
        processedAt: true,
        processingStatus: true,
        correlationId: true,
      },
    });
  }

  async dailySummary(day: Date) {
    const start = new Date(
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()),
    );
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const result = await this.repository
      .createQueryBuilder("event")
      .select("event.eventType", "eventType")
      .addSelect("COUNT(*)", "count")
      .where("event.occurredAt >= :start AND event.occurredAt < :end", { start, end })
      .groupBy("event.eventType")
      .getRawMany<{ eventType: SessionAuditEventType; count: string }>();
    const counts = new Map(result.map((row) => [row.eventType, Number(row.count)]));

    return {
      date: start.toISOString().slice(0, 10),
      expiredSessions: counts.get("session_expired") ?? 0,
      manualRevocations:
        (counts.get("session_revoked") ?? 0) + (counts.get("logout") ?? 0),
      refreshTokenReuseDetections: counts.get("refresh_token_reuse") ?? 0,
    };
  }
}