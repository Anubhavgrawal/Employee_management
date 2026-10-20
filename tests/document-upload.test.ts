import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../src/middlewares/error-handler";
import { uploadDocument } from "../src/middlewares/upload-document";

function createUploadApp() {
  const app = express();
  app.post("/upload", uploadDocument.single("file"), (req, res) => res.json({ name: req.file?.originalname }));
  app.use(errorHandler);
  return app;
}

describe("employee document upload validation", () => {
  it("accepts a PDF with matching content and MIME type", async () => {
    const response = await request(createUploadApp())
      .post("/upload")
      .attach("file", Buffer.from("%PDF-1.7\ncontent"), { filename: "contract.pdf", contentType: "application/pdf" });
    expect(response.status).toBe(200);
    expect(response.body.name).toBe("contract.pdf");
  });

  it("rejects a mismatched MIME type", async () => {
    const response = await request(createUploadApp())
      .post("/upload")
      .attach("file", Buffer.from("%PDF-1.7\ncontent"), { filename: "contract.pdf", contentType: "text/plain" });
    expect(response.status).toBe(400);
  });

  it("rejects files larger than 10 MB", async () => {
    const response = await request(createUploadApp())
      .post("/upload")
      .attach("file", Buffer.alloc(10 * 1024 * 1024 + 1, 0), { filename: "large.pdf", contentType: "application/pdf" });
    expect(response.status).toBe(400);
  });
});