import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { authenticate } from "../middlewares/authenticate";
import { authRateLimit } from "../middlewares/rate-limit";
import { validateBody } from "../middlewares/validate-request";
import {
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  activateAccountSchema,
} from "../validators/auth.validator";
const router = Router();
const controller = new AuthController();

router.post("/login", authRateLimit, validateBody(loginSchema), controller.login);
router.post(
  "/activate",
  validateBody(activateAccountSchema),
  controller.activateAccount,
);
router.post("/refresh", authRateLimit, validateBody(refreshSchema), controller.refresh);
router.post("/logout", authenticate, validateBody(refreshSchema), controller.logout);
router.post("/logout-all", authenticate, controller.logoutAll);
router.get("/sessions", authenticate, controller.sessions);
router.delete("/sessions/:id", authenticate, controller.revokeSession);
router.post(
  "/change-password",
  authenticate,
  authRateLimit,
  validateBody(changePasswordSchema),
  controller.changePassword,
);
export default router;
