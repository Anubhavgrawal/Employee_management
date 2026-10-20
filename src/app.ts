import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import { env } from "./config/env";
import { requestId } from "./middlewares/request-id";
import { apiRateLimit } from "./middlewares/rate-limit";
import { notFound, errorHandler } from "./middlewares/error-handler";
import authRoutes from "./routes/auth.routes";
import employeeRoutes from "./routes/employee.routes";
import departmentRoutes from "./routes/department.routes";
import documentRoutes from "./routes/document.routes";
export const app = express();
app.disable("x-powered-by");
app.use(requestId);
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.CORS_ORIGINS.includes(origin))
        return callback(null, true);
      return callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "100kb", strict: true }));
app.use("/api/v1", apiRateLimit);
app.get("/health", (_req, res) =>
  res.json({
    success: true,
    message: "Service is healthy",
    data: { status: "ok" },
    requestId: res.locals.requestId,
  }),
);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/employees", employeeRoutes);
app.use("/api/v1/departments", departmentRoutes);
app.use("/api/v1", documentRoutes);
app.use(notFound);
app.use(errorHandler);
