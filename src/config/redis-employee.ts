import { createHash } from "node:crypto";
import type { Department } from "../api/v1/entities/Department";
import type { Employee } from "../api/v1/entities/Employee";
import type { EmployeeListQuery } from "../api/v1/validators/employee.validator";
import { redisClient } from "./redis";

const EMPLOYEE_DETAIL_TTL_SECONDS = 300;
const DEPARTMENT_DETAIL_TTL_SECONDS = 300;
const EMPLOYEE_LIST_TTL_SECONDS = 60;

type CachedEmployee = Pick<
  Employee,
  | "id"
  | "firstName"
  | "lastName"
  | "workEmail"
  | "phone"
  | "departmentId"
  | "managerId"
  | "jobTitle"
  | "joiningDate"
  | "employmentStatus"
  | "createdAt"
  | "updatedAt"
> & { department: Pick<Department, "id" | "name"> };

export type EmployeeListCache = {
  items: Employee[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type EmployeeScope = { managerId?: string; employeeId?: string };

const employeeKey = (id: string) => `employee:${id}`;
const departmentKey = (id: string) => `department:${id}`;
const departmentListKey = "departments:all";

export function employeeListCacheKey(
  query: EmployeeListQuery,
  scope?: EmployeeScope,
): string {
  const filters = {
    departmentId: query.departmentId ?? null,
    employmentStatus: query.employmentStatus ?? null,
    search: query.search ?? null,
    page: query.page,
    limit: query.limit,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    managerId: scope?.managerId ?? null,
    employeeId: scope?.employeeId ?? null,
  };
  const hash = createHash("sha256").update(JSON.stringify(filters)).digest("hex");
  return `employees:list:${hash}`;
}

function logCacheError(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown Redis error";
  console.warn(`Could not ${action} in Redis cache:`, message);
}

function safeEmployee(employee: Employee): CachedEmployee {
  return {
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    workEmail: employee.workEmail,
    phone: employee.phone,
    departmentId: employee.departmentId,
    managerId: employee.managerId,
    jobTitle: employee.jobTitle,
    joiningDate: employee.joiningDate,
    employmentStatus: employee.employmentStatus,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
    department: { id: employee.department.id, name: employee.department.name },
  };
}

function restoreEmployee(cached: CachedEmployee): Employee {
  return {
    ...cached,
    createdAt: new Date(cached.createdAt),
    updatedAt: new Date(cached.updatedAt),
    department: cached.department,
  } as Employee;
}

function restoreDepartment(cached: Department): Department {
  return {
    ...cached,
    createdAt: new Date(cached.createdAt),
    updatedAt: new Date(cached.updatedAt),
  };
}

async function deleteByPattern(pattern: string): Promise<void> {
  if (!redisClient?.isReady) return;

  try {
    let cursor = "0";
    do {
      const result = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor;
      if (result.keys.length) await redisClient.del(result.keys);
    } while (cursor !== "0");
  } catch (error) {
    logCacheError(`invalidate ${pattern}`, error);
  }
}

export async function getEmployeeFromRedis(id: string): Promise<Employee | null> {
  if (!redisClient?.isReady) return null;

  try {
    const value = await redisClient.get(employeeKey(id));
    return value ? restoreEmployee(JSON.parse(value) as CachedEmployee) : null;
  } catch (error) {
    logCacheError("read employee", error);
    return null;
  }
}

export async function setEmployeeInRedis(employee: Employee): Promise<void> {
  if (!redisClient?.isReady || !employee.department) return;

  try {
    await redisClient.set(employeeKey(employee.id), JSON.stringify(safeEmployee(employee)), {
      EX: EMPLOYEE_DETAIL_TTL_SECONDS,
    });
  } catch (error) {
    logCacheError("write employee", error);
  }
}

export async function getEmployeeListFromRedis(
  query: EmployeeListQuery,
  scope?: EmployeeScope,
): Promise<EmployeeListCache | null> {
  if (!redisClient?.isReady) return null;

  try {
    const value = await redisClient.get(employeeListCacheKey(query, scope));
    if (!value) return null;
    const cached = JSON.parse(value) as Omit<EmployeeListCache, "items"> & {
      items: CachedEmployee[];
    };
    return { ...cached, items: cached.items.map(restoreEmployee) };
  } catch (error) {
    logCacheError("read employee list", error);
    return null;
  }
}

export async function setEmployeeListInRedis(
  query: EmployeeListQuery,
  result: EmployeeListCache,
  scope?: EmployeeScope,
): Promise<void> {
  if (!redisClient?.isReady || result.items.some((employee) => !employee.department)) return;

  try {
    const cached = { ...result, items: result.items.map(safeEmployee) };
    await redisClient.set(employeeListCacheKey(query, scope), JSON.stringify(cached), {
      EX: EMPLOYEE_LIST_TTL_SECONDS,
    });
  } catch (error) {
    logCacheError("write employee list", error);
  }
}

export async function getDepartmentFromRedis(id: string): Promise<Department | null> {
  if (!redisClient?.isReady) return null;

  try {
    const value = await redisClient.get(departmentKey(id));
    return value ? restoreDepartment(JSON.parse(value) as Department) : null;
  } catch (error) {
    logCacheError("read department", error);
    return null;
  }
}

export async function setDepartmentInRedis(department: Department): Promise<void> {
  if (!redisClient?.isReady) return;

  try {
    const safeDepartment = {
      id: department.id,
      name: department.name,
      description: department.description,
      createdAt: department.createdAt,
      updatedAt: department.updatedAt,
    };
    await redisClient.set(departmentKey(department.id), JSON.stringify(safeDepartment), {
      EX: DEPARTMENT_DETAIL_TTL_SECONDS,
    });
  } catch (error) {
    logCacheError("write department", error);
  }
}

export async function getDepartmentsFromRedis(): Promise<Department[] | null> {
  if (!redisClient?.isReady) return null;

  try {
    const value = await redisClient.get(departmentListKey);
    return value
      ? (JSON.parse(value) as Department[]).map(restoreDepartment)
      : null;
  } catch (error) {
    logCacheError("read department list", error);
    return null;
  }
}

export async function setDepartmentsInRedis(departments: Department[]): Promise<void> {
  if (!redisClient?.isReady) return;

  try {
    const safeDepartments = departments.map((department) => ({
      id: department.id,
      name: department.name,
      description: department.description,
      createdAt: department.createdAt,
      updatedAt: department.updatedAt,
    }));
    await redisClient.set(departmentListKey, JSON.stringify(safeDepartments), {
      EX: EMPLOYEE_LIST_TTL_SECONDS,
    });
  } catch (error) {
    logCacheError("write department list", error);
  }
}

export async function invalidateEmployeeCache(id: string): Promise<void> {
  if (redisClient?.isReady) {
    try {
      await redisClient.del(employeeKey(id));
    } catch (error) {
      logCacheError("invalidate employee", error);
    }
  }
  await invalidateEmployeeLists();
}

export async function invalidateEmployeeLists(): Promise<void> {
  await deleteByPattern("employees:list:*");
}

export async function invalidateDepartmentCache(id: string): Promise<void> {
  if (redisClient?.isReady) {
    try {
      await redisClient.del([departmentKey(id), departmentListKey]);
    } catch (error) {
      logCacheError("invalidate department", error);
    }
  }

  await Promise.all([
    deleteByPattern("employee:*"),
    invalidateEmployeeLists(),
  ]);
}