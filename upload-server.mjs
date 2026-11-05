import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import path from "path";

const PORT = 7072;
const IS_WINDOWS = process.platform === "win32";

const BASE_UPLOAD_DIR = IS_WINDOWS
  ? "C:\\RAW\\uploads"
  : "/Users/Shared/RAW/uploads";

function safeFolderName(value) {
  return String(value || "unknown")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = safeFolderName(req.body.userId);
    const sessionId = safeFolderName(req.body.sessionId);

    const uploadDir = path.join(BASE_UPLOAD_DIR, userId, sessionId);

    fs.mkdirSync(uploadDir, { recursive: true });

    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^\w.\- ]+/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: {
    files: 20,
    fileSize: 1024 * 1024 * 500
  }
});

const app = express();

app.use(cors());

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

app.listen(PORT, () => {
  console.log(`RAW Upload Server radi na http://localhost:${PORT}`);
  console.log(`Upload base folder: ${BASE_UPLOAD_DIR}`);
});