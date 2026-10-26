import type { Request, Response } from "express";
import { AuthService } from "../services/auth.service";
import { ApiResponse } from "../../../utils/ApiResponse";
export class AuthController {
  private service = new AuthService();
  login = async (req: Request, res: Response) =>
    ApiResponse.send(
      res,
      200,
      "Login successful",
      await this.service.login(req.body.email, req.body.password, {
        ip: req.ip,
        agent: req.get("user-agent"),
        requestId: res.locals.requestId,
      }),
    );
  activateAccount = async (req: Request, res: Response) =>
    ApiResponse.send(
      res,
      200,
      "Account activated",
      await this.service.activateAccount(
        req.body.invitationToken,
        req.body.newPassword,
      ),
    );
  refresh = async (req: Request, res: Response) =>
    ApiResponse.send(
      res,
      200,
      "Tokens refreshed",
      await this.service.refresh(req.body.refreshToken, {
        ip: req.ip,
        agent: req.get("user-agent"),
        requestId: res.locals.requestId,
      }),
    );
  logout = async (req: Request, res: Response) =>
    ApiResponse.send(
      res,
      200,
      "Logged out",
      await this.service.logout(req.body.refreshToken),
    );
  logoutAll = async (req: Request, res: Response) =>
    ApiResponse.send(
      res,
      200,
      "All sessions revoked",
      await this.service.logoutAll(req.auth!.id),
    );
  sessions = async (req: Request, res: Response) =>
    ApiResponse.send(
      res,
      200,
      "Sessions fetched",
      await this.service.sessions(req.auth!.id),
    );
  revokeSession = async (req: Request, res: Response) =>
    ApiResponse.send(
      res,
      200,
      "Session revoked",
      await this.service.revokeSession(req.auth!.id, req.params.id as string),
    );
  changePassword = async (req: Request, res: Response) =>
    ApiResponse.send(
      res,
      200,
      "Password changed",
      await this.service.changePassword(
        req.auth!.id,
        req.body.currentPassword,
        req.body.newPassword,
      ),
    );
}
