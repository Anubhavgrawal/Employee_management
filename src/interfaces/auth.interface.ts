export interface AuthUser {
  id: string;
  role: string;
  employeeId: string | null;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}
