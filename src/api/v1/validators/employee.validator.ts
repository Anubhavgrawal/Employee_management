import { z } from "zod";
import { roles } from "../../../constants";
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
    role: z
      .enum([roles.ADMIN, roles.HR, roles.MANAGER, roles.EMPLOYEE])
      .default(roles.EMPLOYEE),
  })
  .strict();
export const updateEmployeeSchema = createEmployeeSchema
  .omit({ role: true })
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

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type SelfProfileInput = z.infer<typeof selfProfileSchema>;
export type EmployeeListQuery = z.infer<typeof employeeListSchema>;
