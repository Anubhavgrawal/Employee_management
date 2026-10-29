import { createHash } from "node:crypto";
import {
  clearExpiryEventMarker,
  markExpiryEventProcessed,
} from "../../../config/redis";
import { RefreshTokenRepository } from "../repositories/refresh-token.repository";

const SESSION_PREFIX = "employee-api:session:";
const REFRESH_TOKEN_PREFIX = "employee-api:session:token:";

type ExpiryLogger = Pick<Console, "info" | "error">;
export type ExpiryEventOutcome = "processed" | "duplicate" | "ignored";

export class TokenExpiryEventService {
  constructor(
    private readonly tokens = new RefreshTokenRepository(),
    private readonly logger: ExpiryLogger = console,
  ) {}

  async processExpiredKey(key: string, eventTime = new Date()): Promise<ExpiryEventOutcome> {
    const event = this.parseKey(key);
    if (!event) {
      this.log("ignored", "unknown", "none", eventTime);
      return "ignored";
    }

    const eventHash = createHash("sha256").update(key).digest("hex");
    const claimed = await markExpiryEventProcessed(eventHash);
    if (claimed === false) {
      this.log("duplicate", event.type, event.identifier, eventTime);
      return "duplicate";
    }

    try {
      const outcome = event.type === "session"
        ? (await this.tokens.expireSessionFamily(event.identifier, eventTime)) > 0
          ? "processed"
          : "duplicate"
        : await this.tokens.expireRefreshTokenByHash(event.identifier, eventTime) === "removed"
          ? "processed"
          : "duplicate";
      this.log(outcome, event.type, this.safeIdentifier(event), eventTime);
      return outcome;
    } catch (error) {
      if (claimed) await clearExpiryEventMarker(eventHash);
      this.logger.error("Redis expiry event processing failed", {
        eventType: event.type,
        identifier: this.safeIdentifier(event),
        timestamp: eventTime.toISOString(),
        outcome: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private parseKey(key: string): { type: "session" | "refresh-token"; identifier: string } | null {
    if (key.startsWith(REFRESH_TOKEN_PREFIX)) {
      const tokenHash = key.slice(REFRESH_TOKEN_PREFIX.length);
      return /^[a-f\d]{64}$/i.test(tokenHash)
        ? { type: "refresh-token", identifier: tokenHash }
        : null;
    }
    if (key.startsWith(SESSION_PREFIX)) {
      const sessionId = key.slice(SESSION_PREFIX.length);
      if (sessionId.startsWith("token:")) return null;
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)
        ? { type: "session", identifier: sessionId }
        : null;
    }
    return null;
  }

  private safeIdentifier(event: { type: "session" | "refresh-token"; identifier: string }) {
    return event.type === "session" ? event.identifier : event.identifier.slice(0, 12);
  }

  private log(
    outcome: ExpiryEventOutcome,
    eventType: string,
    identifier: string,
    eventTime: Date,
  ) {
    this.logger.info("Redis expiry event handled", {
      eventType,
      identifier,
      timestamp: eventTime.toISOString(),
      outcome,
    });
  }
}