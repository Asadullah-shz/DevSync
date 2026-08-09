import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../../middleware/auth.middleware.js';
import { uploadObject, downloadObject } from './storage.controller.js';

const router = Router();

// Ensure temp directory exists
const tempDir = path.join(os.tmpdir(), 'devsync-uploads');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Configure multer to use a temp directory
const upload = multer({ dest: tempDir });

router.use(authenticate);

// We expect the form field to be named 'file'
router.post('/upload', upload.single('file'), uploadObject);
router.get('/download/:hash', downloadObject);

export default router;
