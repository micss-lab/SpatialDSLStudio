import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import config from './config';
import prisma from './config/database';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware';

// Create Express app
const app = express();

// Trust reverse proxy headers (required behind containerized nginx)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS configuration
app.use(cors({
  origin: config.corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Request logging
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API routes
app.use('/api', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Modeling Tool Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      epackages: '/api/epackages',
      metamodels: '/api/metamodels',
      models: '/api/models',
      diagrams: '/api/diagrams',
      transformations: '/api/transformations',
      codegen: '/api/codegen',
      tests: '/api/tests',
      files: '/api/files',
    },
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connection established');

    // Start the server
    app.listen(config.port, () => {
      console.log(`
🚀 Server is running!
   
   Environment: ${config.nodeEnv}
   Port: ${config.port}
   API URL: http://localhost:${config.port}/api
   
   Available endpoints:
   - GET  /api/health          - Health check
   - GET  /api/epackages       - Meta-metamodels
   - GET  /api/metamodels      - Metamodels
   - GET  /api/models          - Models
   - GET  /api/diagrams        - Diagrams
   - GET  /api/transformations - Transformations
   - GET  /api/codegen         - Code generation
   - GET  /api/tests           - Test cases
   - GET  /api/files           - File storage
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

// Start the server
startServer();

export default app;
