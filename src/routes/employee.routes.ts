import { Router } from "express";
import { EmployeeController } from "../controllers/employee.controller";
import { authenticate } from "../middlewares/authenticate";
import { requirePermission, requireRole } from "../middlewares/authorize";
import { validateBody, validateQuery } from "../middlewares/validate-request";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  selfProfileSchema,
  employeeListSchema,
} from "../validators/employee.validator";
const router = Router();
const controller = new EmployeeController();

router.use(authenticate);
router.get("/me/export", controller.exportMe);
router.get("/me", controller.me);
router.patch("/me", validateBody(selfProfileSchema), controller.updateMe);
router.get("/", validateQuery(employeeListSchema), controller.list);
router.post(
  "/",
  requirePermission("employee:create"),
  validateBody(createEmployeeSchema),
  controller.create,
);
router.get("/:id", controller.get);
router.patch(
  "/:id",
  requireRole("admin", "hr", "manager"),
  validateBody(updateEmployeeSchema),
  controller.update,
);
router.delete("/:id", requireRole("admin", "hr"), controller.deactivate);

export default router;


