import express from "express";
import request from "supertest";
import { describe, expect, it } from "@jest/globals";
import { errorHandler } from "../../../src/middlewares/error-handler";
import {
  requirePermission,
  requireRole,
} from "../../../src/middlewares/authorize";
import { protectedPath } from "./auth.test-data";

function createAuthorizationApp(middleware: ReturnType<typeof requireRole>) {
  const app = express();
  app.get(protectedPath, middleware, (_req, res) =>
    res.status(200).json({ reached: true }),
  );
  app.use(errorHandler);
  return app;
}

function createAuthenticatedApp(
  middleware: ReturnType<typeof requireRole>,
  auth?: { id: string; role: string; employeeId: string | null; permissions: string[] },
) {
  const app = express();
  app.get(protectedPath, (req, _res, next) => {
    req.auth = auth;
    next();
  }, middleware, (_req, res) => res.status(200).json({ reached: true }));
  app.use(errorHandler);
  return app;
}

const managerAuth = {
  id: "manager-123",
  role: "manager",
  employeeId: "manager-123",
  permissions: ["employee:read", "employee:update"],
};

const employeeAuth = {
  id: "employee-123",
  role: "employee",
  employeeId: "employee-123",
  permissions: [],
};

describe("requireRole middleware", () => {
  it("allows a user with the required role", async () => {
    const response = await request(
      createAuthenticatedApp(requireRole("manager"), managerAuth),
    ).get(protectedPath);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reached: true });
  });

  it("allows any one of multiple configured roles", async () => {
    const response = await request(
      createAuthenticatedApp(requireRole("admin", "hr", "manager"), managerAuth),
    ).get(protectedPath);

    expect(response.status).toBe(200);
  });

  it("rejects a disallowed role", async () => {
    const response = await request(
      createAuthenticatedApp(requireRole("admin", "hr"), managerAuth),
    ).get(protectedPath);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      code: "FORBIDDEN",
    });
    expect(response.body).not.toHaveProperty("reached");
  });

  it("rejects a request without req.auth", async () => {
    const response = await request(
      createAuthorizationApp(requireRole("employee")),
    ).get(protectedPath);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
    });
    expect(response.body).not.toHaveProperty("reached");
  });
});

describe("requirePermission middleware", () => {
  it("allows a user with the required permission", async () => {
    const response = await request(
      createAuthenticatedApp(requirePermission("employee:update"), managerAuth),
    ).get(protectedPath);

    expect(response.status).toBe(200);
  });

  it("rejects a user with a different permission", async () => {
    const response = await request(
      createAuthenticatedApp(requirePermission("employee:create"), managerAuth),
    ).get(protectedPath);

    expect(response.status).toBe(403);
    expect(response.body).not.toHaveProperty("reached");
  });

  it("rejects a user with an empty permission array", async () => {
    const response = await request(
      createAuthenticatedApp(requirePermission("employee:read"), employeeAuth),
    ).get(protectedPath);

    expect(response.status).toBe(403);
  });

  it("allows the configured admin role even without listed permissions", async () => {
    const response = await request(
      createAuthenticatedApp(requirePermission("audit:read"), {
        ...employeeAuth,
        role: "admin",
        permissions: [],
      }),
    ).get(protectedPath);

    expect(response.status).toBe(200);
  });

  it("rejects a request without req.auth", async () => {
    const response = await request(
      createAuthorizationApp(requirePermission("employee:read")),
    ).get(protectedPath);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
    });
    expect(response.body).not.toHaveProperty("reached");
  });
});
