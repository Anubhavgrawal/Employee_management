import type { JwtPayload } from "jsonwebtoken";

export interface AccessTokenClaims extends JwtPayload {
  sub: string;
  type: "access";
  sessionId: string;
  role: string;
  employeeId?: string;
  permissions?: unknown;
}
