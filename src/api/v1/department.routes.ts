import { Router } from "express";
import { DepartmentController } from "./controllers/department.controller";
import { authenticate } from "../../middlewares/authenticate";
import { requireRole } from "../../middlewares/authorize";
import { validateBody } from "../../middlewares/validate-request";
import {
  createDepartmentSchema,
  updateDepartmentSchema,
} from "./validators/department.validator";
import { roles } from "../../constants";
const router = Router();
const controller = new DepartmentController();

router.use(authenticate);
router.get("/", controller.list);
router.post(
  "/",
  requireRole(roles.ADMIN, roles.HR),
  validateBody(createDepartmentSchema),
  controller.create,
);
router.patch(
  "/:id",
  requireRole(roles.ADMIN, roles.HR),
  validateBody(updateDepartmentSchema),
  controller.update,
);
export default router;
