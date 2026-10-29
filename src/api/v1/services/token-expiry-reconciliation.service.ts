import {
  cleanupRedisSessionMetadata,
  getRedisSession,
  listRedisSessionKeys,
} from "../../../config/redis";
import { RefreshTokenRepository } from "../repositories/refresh-token.repository";
import {
  SessionAuditService,
  sessionAuditCorrelationId,
} from "./session-audit.service";

export class TokenExpiryReconciliationService {
  constructor(
    private readonly tokens = new RefreshTokenRepository(),
    private readonly audit = new SessionAuditService(),
  ) {}

  async reconcile(now = new Date()): Promise<number> {
    const expiredFamilies = await this.tokens.expiredFamilies(now);
    const removedTokens = await this.tokens.reconcileExpired(now);
    for (const { familyId, userId } of expiredFamilies) {
      await this.audit.recordLifecycle({
        userId,
        sessionId: familyId,
        eventType: "session_expired",
        occurredAt: now,
        correlationId: sessionAuditCorrelationId("session_expired", familyId),
      });
    }
    const keys = await listRedisSessionKeys();
    let removedSessions = 0;

    for (const key of keys) {
      const sessionId = key.slice("employee-api:session:".length);
      if (!sessionId || sessionId.startsWith("token:")) continue;

      const session = await getRedisSession(sessionId);
      if (
        session &&
        (session.revokedAt !== null || Date.parse(session.expiresAt) <= now.getTime())
      ) {
        await cleanupRedisSessionMetadata(session.id, session.userId);
        removedSessions += 1;
      }
    }

    return removedTokens + removedSessions;
  }
}