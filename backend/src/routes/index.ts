import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import authRoutes from './auth.routes';
import epackageRoutes from './epackage.routes';
import metamodelRoutes from './metamodel.routes';
import modelRoutes from './model.routes';
import diagramRoutes from './diagram.routes';
import viewpointRoutes from './viewpoint.routes';
import transformationRoutes from './transformation.routes';
import codegenRoutes from './codegen.routes';
import testRoutes from './test.routes';
import fileRoutes from './file.routes';
import shareRoutes from './share.routes';
import adminRoutes from './admin.routes';
import roleRequestRoutes from './roleRequest.routes';
import interoperabilityRoutes from './interoperability.routes';

const router = Router();

// Auth routes (public - no authentication required)
router.use('/auth', authRoutes);

// Health check endpoint (public)
router.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

// Protected routes (authentication required)
router.use('/epackages', authenticate, epackageRoutes);
router.use('/metamodels', authenticate, metamodelRoutes);
router.use('/models', authenticate, modelRoutes);
router.use('/diagrams', authenticate, diagramRoutes);
router.use('/viewpoints', authenticate, viewpointRoutes);
router.use('/transformations', authenticate, transformationRoutes);
router.use('/codegen', authenticate, codegenRoutes);
router.use('/tests', authenticate, testRoutes);
router.use('/files', authenticate, fileRoutes);
router.use('/share', authenticate, shareRoutes);
router.use('/admin', authenticate, adminRoutes);
router.use('/role-requests', authenticate, roleRequestRoutes);
router.use('/interoperability', authenticate, interoperabilityRoutes);

export default router;
