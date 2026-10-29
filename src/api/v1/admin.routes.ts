import { Router } from "express";
import { roles } from "../../constants";
import { authenticate } from "../../middlewares/authenticate";
import { requireRole } from "../../middlewares/authorize";
import { SessionMetricsController } from "./controllers/session-metrics.controller";

const router = Router();
const controller = new SessionMetricsController();

router.use(authenticate, requireRole(roles.ADMIN));
router.get("/session-metrics", controller.daily);

export default router;