import multer from 'multer';
import config from '../config';
import { ApiError } from './errorHandler';

// Configure multer for file uploads
// Store files in memory as Buffer for direct database storage
const storage = multer.memoryStorage();

// File filter for allowed types
const fileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) => {
  // Allowed mime types for 3D models and images
  const allowedMimeTypes = [
    // 3D models
    'model/gltf-binary',
    'model/gltf+json',
    'application/octet-stream', // Common for .glb files
    // Images
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
  ];

  // Also check file extension for GLB files (sometimes MIME type is wrong)
  const allowedExtensions = ['.glb', '.gltf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
  const fileExtension = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));

  if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    callback(null, true);
  } else {
    callback(new ApiError(400, `File type not allowed: ${file.mimetype}`));
  }
};

// Create multer instance
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.maxFileSize,
  },
});

// Middleware for single file upload
export const uploadSingle = upload.single('file');

// Middleware for multiple file uploads
export const uploadMultiple = upload.array('files', 10);
