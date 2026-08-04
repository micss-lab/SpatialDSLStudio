import { Router, Request, Response, NextFunction } from 'express';
import { param, query } from 'express-validator';
import {
  validate,
  uploadSingle,
  authenticate,
  AuthenticatedRequest,
  projectResourceParam,
  requireProjectCapability,
  projectArgs,
} from '../middleware';
import { fileStorageService } from '../services';
import { FileType } from '../../../shared/types';

const router = Router({ mergeParams: true });

// All routes require authentication
router.use(authenticate);
router.param('id', projectResourceParam('storedFile'));

// Async handler wrapper
const asyncHandler = (fn: Function) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * @route   GET /api/files
 * @desc    Get all files metadata (without actual data)
 */
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type } = req.query;
  
  let fileType: FileType | undefined;
  if (type && typeof type === 'string' && ['image', 'model', 'other'].includes(type)) {
    fileType = type as FileType;
  }
  
  const files = await fileStorageService.getAll(req.user!.userId, fileType, ...projectArgs(req));
  res.json({ success: true, data: files });
}));

/**
 * @route   GET /api/files/stats
 * @desc    Get storage statistics
 */
router.get('/stats', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const stats = await fileStorageService.getStorageStats(req.user!.userId, ...projectArgs(req));
  res.json({ success: true, data: stats });
}));

/**
 * @route   GET /api/files/:id
 * @desc    Get file metadata by ID (without data)
 */
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const file = await fileStorageService.getMetadataById(req.params.id, req.user!.userId, ...projectArgs(req));
  if (!file) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }
  res.json({ success: true, data: file });
}));

/**
 * @route   GET /api/files/:id/data
 * @desc    Get file with base64 data
 */
router.get('/:id/data', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const file = await fileStorageService.getById(req.params.id, req.user!.userId, ...projectArgs(req));
  if (!file) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }
  res.json({ success: true, data: file });
}));

/**
 * @route   GET /api/files/:id/download
 * @desc    Download file as binary stream
 */
router.get('/:id/download', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const file = await fileStorageService.getRawData(req.params.id, req.user!.userId, ...projectArgs(req));
  if (!file) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }
  
  res.setHeader('Content-Type', file.mimetype);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.setHeader('Content-Length', file.data.length);
  res.send(file.data);
}));

/**
 * @route   POST /api/files/upload
 * @desc    Upload a file (multipart/form-data)
 */
router.post(
  '/upload',
  requireProjectCapability('model.update'),
  uploadSingle,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    
    // Determine file type based on mimetype or extension
    let fileType: FileType = 'other';
    const mimetype = req.file.mimetype;
    const filename = req.file.originalname.toLowerCase();
    
    if (mimetype.startsWith('image/')) {
      fileType = 'image';
    } else if (
      mimetype === 'model/gltf-binary' ||
      mimetype === 'model/gltf+json' ||
      filename.endsWith('.glb') ||
      filename.endsWith('.gltf')
    ) {
      fileType = 'model';
    }
    
    // Override type if specified in body
    if (req.body.type && ['image', 'model', 'other'].includes(req.body.type)) {
      fileType = req.body.type;
    }
    
    const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};
    
    const result = await fileStorageService.storeFromBuffer(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      fileType,
      req.user!.userId,
      metadata,
      ...projectArgs(req)
    );
    
    res.status(201).json({ success: true, data: result });
  })
);

/**
 * @route   POST /api/files/upload-base64
 * @desc    Upload a file from base64 string
 */
router.post(
  '/upload-base64',
  requireProjectCapability('model.update'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { data, filename, mimetype, type, metadata } = req.body;
    
    if (!data || !filename || !mimetype) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: data, filename, mimetype' 
      });
    }
    
    let fileType: FileType = type || 'other';
    if (!['image', 'model', 'other'].includes(fileType)) {
      fileType = 'other';
    }
    
    const result = await fileStorageService.storeFromBase64(
      data,
      filename,
      mimetype,
      fileType as FileType,
      req.user!.userId,
      metadata,
      ...projectArgs(req)
    );
    
    res.status(201).json({ success: true, data: result });
  })
);

/**
 * @route   PUT /api/files/:id/metadata
 * @desc    Update file metadata
 */
router.put(
  '/:id/metadata',
  requireProjectCapability('model.update'),
  validate([param('id').isUUID().withMessage('Invalid ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const file = await fileStorageService.updateMetadata(
      req.params.id,
      req.body,
      req.user!.userId,
      ...projectArgs(req)
    );
    res.json({ success: true, data: file });
  })
);

/**
 * @route   DELETE /api/files/:id
 * @desc    Delete a file
 */
router.delete(
  '/:id',
  requireProjectCapability('model.update'),
  validate([param('id').isUUID().withMessage('Invalid ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await fileStorageService.delete(req.params.id, req.user!.userId, ...projectArgs(req));
    res.json({ success: true, message: 'File deleted successfully' });
  })
);

/**
 * @route   POST /api/files/cleanup
 * @desc    Clean up old files
 */
router.post(
  '/cleanup',
  requireProjectCapability('model.update'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { maxAge } = req.body;
    const count = await fileStorageService.cleanupOldFiles(
      req.user!.userId,
      maxAge,
      ...projectArgs(req)
    );
    res.json({ success: true, message: `${count} file(s) cleaned up` });
  })
);

export default router;
