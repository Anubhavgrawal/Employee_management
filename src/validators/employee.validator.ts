import { z } from "zod";
const uuid = z.string().uuid();
export const createEmployeeSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    workEmail: z
      .string()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase().trim()),
    phone: z.string().trim().max(30).optional().nullable(),
    departmentId: uuid,
    managerId: uuid.optional().nullable(),
    jobTitle: z.string().trim().min(1).max(120),
    joiningDate: z.string().date(),
    employmentStatus: z
      .enum(["active", "inactive", "on_leave"])
      .default("active"),
    salary: z.number().nonnegative().max(999999999).optional(),
  })
  .strict();
export const updateEmployeeSchema = createEmployeeSchema
  .partial()
  .refine(
    (v) => Object.keys(v).length > 0,
    "At least one field must be supplied",
  );
export const selfProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    jobTitle: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .refine(
    (v) => Object.keys(v).length > 0,
    "At least one permitted profile field is required",
  );
export const employeeListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    departmentId: uuid.optional(),
    employmentStatus: z.enum(["active", "inactive", "on_leave"]).optional(),
    search: z.string().trim().max(100).optional(),
    sortBy: z
      .enum(["firstName", "lastName", "workEmail", "joiningDate", "createdAt"])
      .default("createdAt"),
    sortOrder: z.enum(["ASC", "DESC"]).default("DESC"),
  })
  .strict();
export const idSchema = z.object({ id: uuid });
