import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { signAccessToken } from "../src/providers/jwt.provider";
import { apiRateLimit } from "../src/middlewares/rate-limit";

describe("API rate limit", () => {
  it("allows ten requests per authenticated user across IPs, then returns 429", async () => {
    const app = express();
    app.set("trust proxy", 1);
    app.get("/limited", apiRateLimit, (_req, res) => res.sendStatus(200));

    const userId = `user-${Date.now()}`;
    const token = signAccessToken(
      { type: "access", sessionId: `session-${userId}`, role: "employee", employeeId: userId, permissions: [] },
      userId,
    );
    const requestAs = (ip: string, subject = userId) =>
      request(app)
        .get("/limited")
        .set("X-Forwarded-For", ip)
        .set("Authorization", `Bearer ${subject === userId ? token : signAccessToken(
          { type: "access", sessionId: `session-${subject}`, role: "employee", employeeId: subject, permissions: [] },
          subject,
        )}`);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await requestAs(`198.51.100.${attempt + 1}`)).status).toBe(200);
    }
    const limited = await requestAs("198.51.100.20");
    expect(limited.status).toBe(429);
    expect(limited.body.message).toMatch(/too many requests/i);
    expect((await requestAs("198.51.100.20", `other-${Date.now()}`)).status).toBe(200);
  });

  it("uses IP counters for unauthenticated requests", async () => {
    const app = express();
    app.set("trust proxy", 1);
    app.get("/limited", apiRateLimit, (_req, res) => res.sendStatus(200));
    const clientIp = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
    const requestFrom = (ip: string) =>
      request(app).get("/limited").set("X-Forwarded-For", ip);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await requestFrom(clientIp)).status).toBe(200);
    }
    expect((await requestFrom(clientIp)).status).toBe(429);
    expect((await requestFrom(`203.0.113.${Math.floor(Math.random() * 200) + 20}`)).status).toBe(200);
  });
});