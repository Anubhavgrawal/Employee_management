import type { Department } from "../api/v1/entities/Department";

export interface SafeEmployee {
  id: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  phone: string | null;
  department: Pick<Department, "id" | "name">;
  managerId: string | null;
  jobTitle: string;
  joiningDate: string;
  employmentStatus: "active" | "inactive" | "on_leave";
  createdAt: Date;
  updatedAt: Date;
}