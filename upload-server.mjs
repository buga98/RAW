import {rejectLegacyService} from "./raw-legacy-service-guard-v526.mjs";
import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import { safeFolderName, safeAudioFilename } from "./upload-safety.mjs";

// Reject before any listener, Firestore client or process spawn can start.
rejectLegacyService("upload");

const PORT = 7072;
const IS_WINDOWS = process.platform === "win32";

const BASE_UPLOAD_DIR = IS_WINDOWS
  ? "C:\\RAW\\uploads"
  : "/Users/Shared/RAW/uploads";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const userId = safeFolderName(req.body.userId);
      const sessionId = safeFolderName(req.body.sessionId);
      const uploadDir = path.join(BASE_UPLOAD_DIR, userId, sessionId);
      fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) { cb(err); }
  },

  filename: (req, file, cb) => {
    try {
      const safeName = safeAudioFilename(file.originalname);
      cb(null, `${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`);
    } catch (err) { cb(err); }
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    try { safeAudioFilename(file.originalname); cb(null, true); }
    catch (err) { cb(err); }
  },
  limits: {
    files: 20,
    fileSize: 1024 * 1024 * 500
  }
});

const app = express();

// Development-only local service. It is not authenticated: never expose it to LAN/Internet.
app.use(cors({ origin: (origin, callback) => callback(null, !origin || origin === "null") }));
app.get("/health", (_req, res) => res.json({ ok: true, service: "upload", mode: "local-only" }));

app.post("/upload", upload.array("files", 20), (req, res) => {
  const userId = safeFolderName(req.body.userId);
  const sessionId = safeFolderName(req.body.sessionId);

  console.log("UPLOAD RECEIVED:");
  console.log("USER:", userId);
  console.log("SESSION:", sessionId);

  const files = req.files.map(file => {
    console.log(file.path);

    return {
      originalName: file.originalname,
      savedName: file.filename,
      path: file.path,
      size: file.size,
      userId,
      sessionId
    };
  });

  res.json({
    ok: true,
    userId,
    sessionId,
    files
  });
});

app.use((err, _req, res, _next) => {
  console.error("UPLOAD ERROR:", err.message);
  res.status(400).json({ ok: false, message: err.message });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`RAW Upload Server radi na http://localhost:${PORT}`);
  console.log(`Upload base folder: ${BASE_UPLOAD_DIR}`);
});
