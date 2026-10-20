import { z } from "zod";
export const createDepartmentSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();
export const updateDepartmentSchema = createDepartmentSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "At least one field is required");
