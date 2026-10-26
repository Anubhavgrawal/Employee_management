import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import type { AccessTokenClaims } from "../interfaces/jwt.interface";

export function signAccessToken(
  claims: {
    type: "access";
    role: string;
    employeeId: string;
    permissions: string[];
  },
  subject: string,
) {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    subject,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    expiresIn: env.JWT_ACCESS_TTL as SignOptions["expiresIn"],
    algorithm: "HS256",
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    algorithms: ["HS256"],
  });

  if (
    typeof payload !== "object" ||
    payload === null ||
    payload.type !== "access" ||
    typeof payload.sub !== "string" ||
    typeof payload.role !== "string"
  ) {
    throw new Error("Invalid access token claims");
  }

  return payload as AccessTokenClaims;
}
