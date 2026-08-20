import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../../middleware/auth.middleware.js';
import { uploadObject, downloadObject, uploadChunk, completeChunkUpload } from './storage.controller.js';
import { verifyStorage, storageStats } from './integrity.controller.js';

const router = Router();

// Ensure temp directory exists
const tempDir = path.join(os.tmpdir(), 'devsync-uploads');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Configure multer to use a temp directory with a 5 GB file size limit
const upload = multer({ dest: tempDir, limits: { fileSize: 5 * 1024 * 1024 * 1024 } });

router.use(authenticate);

// We expect the form field to be named 'file'
router.post('/upload', upload.single('file'), uploadObject);
router.post('/upload/chunk', upload.single('chunk'), uploadChunk);
router.post('/upload/complete', completeChunkUpload);
router.get('/download/:hash', downloadObject);

// System integrity & stats
router.post('/verify', verifyStorage);
router.get('/stats', storageStats);

export default router;
