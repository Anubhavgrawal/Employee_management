import { Router } from "express";
import { DepartmentController } from "../controllers/department.controller";
import { authenticate } from "../middlewares/authenticate";
import { requireRole } from "../middlewares/authorize";
import { validateBody } from "../middlewares/validate-request";
import {
  createDepartmentSchema,
  updateDepartmentSchema,
} from "../validators/department.validator";
const router = Router();
const controller = new DepartmentController();

router.use(authenticate);
router.get("/", controller.list);
router.post(
  "/",
  requireRole("admin", "hr"),
  validateBody(createDepartmentSchema),
  controller.create,
);
router.patch(
  "/:id",
  requireRole("admin", "hr"),
  validateBody(updateDepartmentSchema),
  controller.update,
);
export default router;
