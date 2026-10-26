import express from "express";
import request from "supertest";
import { describe, expect, it } from "@jest/globals";
import jwt from "jsonwebtoken";
import { env } from "../../../src/config/env";
import { authenticate } from "../../../src/middlewares/authenticate";
import { errorHandler } from "../../../src/middlewares/error-handler";
import {
  authTestUser,
  createAccessToken,
  protectedPath,
} from "./auth.test-data";

function createAuthenticationApp() {
  const app = express();
  app.get(protectedPath, authenticate, (req, res) =>
    res.status(200).json({ reached: true, auth: req.auth }),
  );
  app.use(errorHandler);
  return app;
}

const app = createAuthenticationApp();

describe("authenticate middleware", () => {
  it.each([
    ["missing Authorization header", undefined],
    ["non-Bearer Authorization header", "Basic abc123"],
    ["wrong Bearer prefix casing", "bearer abc123"],
  ])("rejects a %s", async (_description, authorization) => {
    const response = await request(app)
      .get(protectedPath)
      .set("Authorization", authorization || "");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
      message: "Use Authorization: Bearer <access-token>",
    });
    expect(response.body).not.toHaveProperty("reached");
  });

  it("rejects a Bearer prefix without a token", async () => {
    const response = await request(app)
      .get(protectedPath)
      .set("Authorization", "Bearer ");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
      message: "Use Authorization: Bearer <access-token>",
    });
    expect(response.body).not.toHaveProperty("reached");
  });

  it.each([
    ["malformed JWT", "not-a-token", "Access token is malformed"],
    ["incorrectly signed JWT", jwt.sign({ type: "access", sub: authTestUser.id, role: authTestUser.role }, "wrong-secret"), "Access token signature is invalid"],
    ["expired JWT", createAccessToken({}, { expiresIn: -1 }), "Access token has expired"],
    ["wrong issuer", createAccessToken({}, { issuer: "wrong-issuer" }), "Access token issuer is invalid"],
    ["wrong audience", createAccessToken({}, { audience: "wrong-audience" }), "Access token audience is invalid"],
    ["wrong token type", createAccessToken({ type: "refresh" }), "Access token claims are invalid"],
    ["missing role claim", createAccessToken({ role: undefined }), "Access token claims are invalid"],
  ])("rejects a %s", async (_description, token, message) => {
    const response = await request(app)
      .get(protectedPath)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
      message,
    });
    expect(response.body).not.toHaveProperty("reached");
  });

  it("rejects a token with no subject claim", async () => {
    const token = jwt.sign(
      { type: "access", role: authTestUser.role },
      env.JWT_ACCESS_SECRET,
      {
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        algorithm: "HS256",
      },
    );
    const response = await request(app)
      .get(protectedPath)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
      message: "Access token claims are invalid",
    });
    expect(response.body).not.toHaveProperty("reached");
  });

  it("accepts a valid access token and exposes the expected auth context", async () => {
    const response = await request(app)
      .get(protectedPath)
      .set("Authorization", `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      reached: true,
      auth: authTestUser,
    });
  });

  it("defaults optional employeeId and permissions claims safely", async () => {
    const token = jwt.sign(
      { type: "access", role: "employee" },
      env.JWT_ACCESS_SECRET,
      {
        subject: authTestUser.id,
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        algorithm: "HS256",
      },
    );
    const response = await request(app)
      .get(protectedPath)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.auth).toEqual({
      id: authTestUser.id,
      role: "employee",
      employeeId: null,
      permissions: [],
    });
  });
});
