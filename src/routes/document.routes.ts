import { Router } from "express";
import { DocumentController } from "../controllers/document.controller";
import { authenticate } from "../middlewares/authenticate";
import { uploadDocument } from "../middlewares/upload-document";

const router = Router();
const controller = new DocumentController();
router.use(authenticate);
router.post("/employees/:id/documents", uploadDocument.single("file"), controller.upload);
router.get("/employees/:id/documents", controller.list);
router.get("/documents/:id/download-url", controller.downloadUrl);
router.delete("/documents/:id", controller.remove);
export default router;