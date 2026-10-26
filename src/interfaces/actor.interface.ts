export interface EmployeeActor {
  id: string;
  role: string;
  employeeId: string | null;
  permissions: string[];
}

export interface DocumentActor {
  id: string;
  role: string;
  employeeId: string | null;
}
