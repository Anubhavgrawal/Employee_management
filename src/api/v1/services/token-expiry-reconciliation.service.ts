import {
  cleanupRedisSessionMetadata,
  getRedisSession,
  listRedisSessionKeys,
} from "../../../config/redis";
import { RefreshTokenRepository } from "../repositories/refresh-token.repository";

export class TokenExpiryReconciliationService {
  constructor(private readonly tokens = new RefreshTokenRepository()) {}

  async reconcile(now = new Date()): Promise<number> {
    const removedTokens = await this.tokens.reconcileExpired(now);
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