import "dotenv/config";
import { z } from "zod";

// Validate configuration once, when the app starts. Fail early if a secret is missing.
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url().optional(),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, "JWT_ACCESS_SECRET must contain at least 32 characters")
    .refine(
      (secret) => !secret.toLowerCase().startsWith("replace_with"),
      "JWT_ACCESS_SECRET must not use a placeholder value",
    ),
  JWT_ISSUER: z.string().default("employee-management-api"),
  JWT_AUDIENCE: z.string().default("employee-management-clients"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(30),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
  STORAGE_REGION: z.string().default("us-east-1"),
  STORAGE_BUCKET: z.string().min(1).default("employee-documents"),
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
  STORAGE_SSE: z.enum(["AES256", "aws:kms"]).optional(),
  STORAGE_DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Do not print environment values because they can contain secrets.
  console.error(
    "Invalid environment configuration:",
    parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  );
  throw new Error(
    "Application configuration is invalid. Check your .env file.",
  );
}
export const env = {
  ...parsed.data,
  CORS_ORIGINS: parsed.data.CORS_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  COOKIE_SECURE: parsed.data.COOKIE_SECURE === "true",
  STORAGE_FORCE_PATH_STYLE: parsed.data.STORAGE_FORCE_PATH_STYLE === "true",
};
