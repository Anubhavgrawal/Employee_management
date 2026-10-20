import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  save: vi.fn(),
  list: vi.fn(),
  findById: vi.fn(),
  remove: vi.fn(),
  audit: vi.fn(),
  exists: vi.fn(),
}));

vi.mock("../src/config/object-storage", () => ({ objectStorage: { put: mocks.put, remove: vi.fn(), downloadUrl: vi.fn() } }));
vi.mock("../src/repositories/employee-document.repository", () => ({
  EmployeeDocumentRepository: class { list = mocks.list; findById = mocks.findById; save = mocks.save; remove = mocks.remove; },
}));
vi.mock("../src/services/audit.service", () => ({ AuditService: class { record = mocks.audit; } }));
vi.mock("../src/config/database", () => ({ AppDataSource: { getRepository: () => ({ exists: mocks.exists }) } }));

import { DocumentService } from "../src/services/document.service";

const actor = { id: "actor", role: "employee", employeeId: "employee-1" };
const pdf = { originalname: "contract.pdf", mimetype: "application/pdf", size: 12, buffer: Buffer.from("%PDF-1.7\ncontent") } as Express.Multer.File;

describe("DocumentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.save.mockResolvedValue({ id: "document-1", employeeId: "employee-1" });
    mocks.put.mockResolvedValue(undefined);
    mocks.audit.mockResolvedValue(undefined);
  });

  it("uploads an authorised document and records an audit event", async () => {
    const result = await new DocumentService().upload("employee-1", pdf, actor);
    expect(result.id).toBe("document-1");
    expect(mocks.put).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledOnce();
  });

  it("denies access to another employee's documents", async () => {
    await expect(new DocumentService().list("employee-2", actor)).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("propagates storage failures before creating metadata", async () => {
    mocks.put.mockRejectedValue(new Error("storage unavailable"));
    await expect(new DocumentService().upload("employee-1", pdf, actor)).rejects.toThrow("storage unavailable");
    expect(mocks.save).not.toHaveBeenCalled();
  });
});