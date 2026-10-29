import { Router } from "express";
import authRoutes from "../auth.routes";
import employeeRoutes from "../employee.routes";
import departmentRoutes from "../department.routes";
import documentRoutes from "../document.routes";
import adminRoutes from "../admin.routes";

const v1Router = Router();

v1Router.use("/auth", authRoutes);
v1Router.use("/employees", employeeRoutes);
v1Router.use("/departments", departmentRoutes);
v1Router.use("/admin", adminRoutes);
v1Router.use(documentRoutes);

export default v1Router;