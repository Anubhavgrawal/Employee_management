import { describe, expect, it, jest } from "@jest/globals";
import {
  SessionAuditService,
  SessionAuditUnavailableError,
  sessionAuditCorrelationId,
} from "../../src/api/v1/services/session-audit.service";

describe("SessionAuditService persistence", () => {
  it("generates stable idempotency correlations for the same lifecycle event", () => {
    expect(sessionAuditCorrelationId("logout", "session-uuid"))
      .toBe(sessionAuditCorrelationId("logout", "session-uuid"));
    expect(sessionAuditCorrelationId("logout", "session-uuid"))
      .not.toBe(sessionAuditCorrelationId("session_revoked", "session-uuid"));
  });

  it("retries a transient repository failure and then records the event", async () => {
    const repository = {
      record: jest.fn().mockRejectedValueOnce(new Error("temporary db error")).mockResolvedValue(undefined),
    };
    const pause = jest.fn(async (_delay: number) => undefined);
    const audit = new SessionAuditService(repository as never, pause);

    await audit.recordLifecycle({
      userId: "user-1",
      sessionId: "session-1",
      eventType: "session_created",
    });

    expect(repository.record).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("reports durable storage failure after bounded retries", async () => {
    const repository = { record: jest.fn().mockRejectedValue(new Error("database unavailable")) };
    const audit = new SessionAuditService(repository as never, async () => undefined);

    await expect(audit.recordLifecycle({
      userId: "user-1",
      sessionId: "session-2",
      eventType: "session_created",
    })).rejects.toBeInstanceOf(SessionAuditUnavailableError);
    expect(repository.record).toHaveBeenCalledTimes(3);
  });
});