import type { JwtPayload } from "jsonwebtoken";

export interface AccessTokenClaims extends JwtPayload {
  sub: string;
  type: "access";
  role: string;
  employeeId?: string;
  permissions?: unknown;
}
