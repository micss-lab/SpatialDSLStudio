import { prismaMock } from '../helpers/prisma.mock';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockReset } from 'jest-mock-extended';

const fileStorageServiceMock = {
  getAll: jest.fn(),
  getStorageStats: jest.fn(),
  getMetadataById: jest.fn(),
  getById: jest.fn(),
  getRawData: jest.fn(),
  storeFromBuffer: jest.fn(),
  storeFromBase64: jest.fn(),
  updateMetadata: jest.fn(),
  delete: jest.fn(),
  cleanupOldFiles: jest.fn(),
};

jest.mock('../../services/fileStorage.service', () => ({
  fileStorageService: fileStorageServiceMock,
}));
jest.mock('../../services', () => ({
  fileStorageService: fileStorageServiceMock,
}));

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
  // Satisfy the authenticate middleware's db lookup
  prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);
});

import fileRouter from '../../routes/file.routes';

const JWT_SECRET = process.env.JWT_SECRET!;

function makeToken(role = 'DSL_DESIGNER') {
  return jwt.sign(
    { userId: 'user-uuid-1', email: 'test@example.com', role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return _res.status(401).json({ error: 'Authorization header required' });
    }
    const token = authHeader.split(' ')[1];
    try {
      const payload = jwt.verify(token, JWT_SECRET) as any;
      req.user = { userId: payload.userId, email: payload.email, role: payload.role };
    } catch {
      return _res.status(401).json({ error: 'Invalid token' });
    }
    next();
  });
  app.use('/api/files', fileRouter);
  return app;
}

const now = new Date().toISOString();

const mockFileMeta = {
  id: 'file-uuid-1',
  filename: 'test.png',
  mimetype: 'image/png',
  size: 1024,
  type: 'image',
  metadata: {},
  createdAt: now,
  updatedAt: now,
};

const mockFileWithData = {
  ...mockFileMeta,
  data: Buffer.from('image data').toString('base64'),
};

describe('GET /api/files', () => {
  it('returns list of files', async () => {
    fileStorageServiceMock.getAll.mockResolvedValue([mockFileMeta]);

    const res = await request(buildApp())
      .get('/api/files')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('returns 401 without authentication', async () => {
    const res = await request(buildApp()).get('/api/files');

    expect(res.status).toBe(401);
  });

  it('passes type query param to service', async () => {
    fileStorageServiceMock.getAll.mockResolvedValue([]);

    await request(buildApp())
      .get('/api/files?type=image')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(fileStorageServiceMock.getAll).toHaveBeenCalledWith('user-uuid-1', 'image');
  });

  it('ignores invalid type query param', async () => {
    fileStorageServiceMock.getAll.mockResolvedValue([]);

    await request(buildApp())
      .get('/api/files?type=invalid')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(fileStorageServiceMock.getAll).toHaveBeenCalledWith('user-uuid-1', undefined);
  });

  it('accepts model type', async () => {
    fileStorageServiceMock.getAll.mockResolvedValue([]);

    await request(buildApp())
      .get('/api/files?type=model')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(fileStorageServiceMock.getAll).toHaveBeenCalledWith('user-uuid-1', 'model');
  });

  it('accepts other type', async () => {
    fileStorageServiceMock.getAll.mockResolvedValue([]);

    await request(buildApp())
      .get('/api/files?type=other')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(fileStorageServiceMock.getAll).toHaveBeenCalledWith('user-uuid-1', 'other');
  });
});

describe('GET /api/files/stats', () => {
  it('returns storage stats', async () => {
    const stats = {
      totalFiles: 5,
      totalSize: 10000,
      byType: {
        image: { count: 3, size: 6000 },
        model: { count: 1, size: 3000 },
        other: { count: 1, size: 1000 },
      },
    };
    fileStorageServiceMock.getStorageStats.mockResolvedValue(stats);

    const res = await request(buildApp())
      .get('/api/files/stats')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalFiles).toBe(5);
  });

  it('returns 401 without authentication', async () => {
    const res = await request(buildApp()).get('/api/files/stats');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/files/:id', () => {
  it('returns file metadata by id', async () => {
    fileStorageServiceMock.getMetadataById.mockResolvedValue(mockFileMeta);

    const res = await request(buildApp())
      .get('/api/files/file-uuid-1')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('file-uuid-1');
  });

  it('returns 404 when file not found', async () => {
    fileStorageServiceMock.getMetadataById.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/files/nonexistent-uuid')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/files/:id/data', () => {
  it('returns file with base64 data', async () => {
    fileStorageServiceMock.getById.mockResolvedValue(mockFileWithData);

    const res = await request(buildApp())
      .get('/api/files/file-uuid-1/data')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.data).toBeDefined();
  });

  it('returns 404 when file not found', async () => {
    fileStorageServiceMock.getById.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/files/nonexistent/data')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/files/:id/download', () => {
  it('returns file as binary with correct headers', async () => {
    const fileBuffer = Buffer.from('binary content');
    fileStorageServiceMock.getRawData.mockResolvedValue({
      data: fileBuffer,
      mimetype: 'image/png',
      filename: 'photo.png',
    });

    const res = await request(buildApp())
      .get('/api/files/file-uuid-1/download')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(res.headers['content-disposition']).toContain('photo.png');
  });

  it('returns 404 when file not found', async () => {
    fileStorageServiceMock.getRawData.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/files/nonexistent/download')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/files/upload', () => {
  it('returns 400 when no file uploaded', async () => {
    const res = await request(buildApp())
      .post('/api/files/upload')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/No file uploaded/);
  });

  it('uploads a file via multipart form', async () => {
    fileStorageServiceMock.storeFromBuffer.mockResolvedValue({
      id: 'file-uuid-new',
      filename: 'upload.png',
      mimetype: 'image/png',
      size: 100,
      type: 'image',
    });

    const res = await request(buildApp())
      .post('/api/files/upload')
      .set('Authorization', `Bearer ${makeToken()}`)
      .attach('file', Buffer.from('fake image data'), {
        filename: 'upload.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('file-uuid-new');
  });

  it('determines image type from mimetype', async () => {
    fileStorageServiceMock.storeFromBuffer.mockResolvedValue({
      id: 'file-uuid-img',
      filename: 'img.jpeg',
      mimetype: 'image/jpeg',
      size: 200,
      type: 'image',
    });

    await request(buildApp())
      .post('/api/files/upload')
      .set('Authorization', `Bearer ${makeToken()}`)
      .attach('file', Buffer.from('jpeg data'), {
        filename: 'img.jpeg',
        contentType: 'image/jpeg',
      });

    expect(fileStorageServiceMock.storeFromBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      'img.jpeg',
      'image/jpeg',
      'image',
      'user-uuid-1',
      {}
    );
  });

  it('determines model type from .glb extension', async () => {
    fileStorageServiceMock.storeFromBuffer.mockResolvedValue({
      id: 'file-uuid-model',
      filename: 'scene.glb',
      mimetype: 'application/octet-stream',
      size: 500,
      type: 'model',
    });

    await request(buildApp())
      .post('/api/files/upload')
      .set('Authorization', `Bearer ${makeToken()}`)
      .attach('file', Buffer.from('glb data'), {
        filename: 'scene.glb',
        contentType: 'application/octet-stream',
      });

    expect(fileStorageServiceMock.storeFromBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      'scene.glb',
      'application/octet-stream',
      'model',
      'user-uuid-1',
      {}
    );
  });

  it('determines model type from .gltf extension', async () => {
    fileStorageServiceMock.storeFromBuffer.mockResolvedValue({
      id: 'file-uuid-gltf',
      filename: 'scene.gltf',
      mimetype: 'application/octet-stream',
      size: 300,
      type: 'model',
    });

    await request(buildApp())
      .post('/api/files/upload')
      .set('Authorization', `Bearer ${makeToken()}`)
      .attach('file', Buffer.from('gltf data'), {
        filename: 'scene.gltf',
        contentType: 'application/octet-stream',
      });

    expect(fileStorageServiceMock.storeFromBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      'scene.gltf',
      'application/octet-stream',
      'model',
      'user-uuid-1',
      {}
    );
  });

  it('overrides file type when body type provided', async () => {
    fileStorageServiceMock.storeFromBuffer.mockResolvedValue({
      id: 'file-uuid-override',
      filename: 'data.bin',
      mimetype: 'application/octet-stream',
      size: 100,
      type: 'other',
    });

    await request(buildApp())
      .post('/api/files/upload')
      .set('Authorization', `Bearer ${makeToken()}`)
      .field('type', 'other')
      .attach('file', Buffer.from('binary data'), {
        filename: 'data.bin',
        contentType: 'application/octet-stream',
      });

    expect(fileStorageServiceMock.storeFromBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      'data.bin',
      'application/octet-stream',
      'other',
      'user-uuid-1',
      {}
    );
  });

  it('parses metadata from body', async () => {
    fileStorageServiceMock.storeFromBuffer.mockResolvedValue({
      id: 'file-uuid-meta',
      filename: 'file.png',
      mimetype: 'image/png',
      size: 100,
      type: 'image',
    });

    const metadata = JSON.stringify({ description: 'test image' });

    await request(buildApp())
      .post('/api/files/upload')
      .set('Authorization', `Bearer ${makeToken()}`)
      .field('metadata', metadata)
      .attach('file', Buffer.from('image data'), {
        filename: 'file.png',
        contentType: 'image/png',
      });

    expect(fileStorageServiceMock.storeFromBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      'file.png',
      'image/png',
      'image',
      'user-uuid-1',
      { description: 'test image' }
    );
  });
});

describe('POST /api/files/upload-base64', () => {
  it('uploads file from base64 string', async () => {
    fileStorageServiceMock.storeFromBase64.mockResolvedValue({
      id: 'file-uuid-b64',
      filename: 'encoded.png',
      mimetype: 'image/png',
      size: 50,
      type: 'image',
    });

    const res = await request(buildApp())
      .post('/api/files/upload-base64')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        data: Buffer.from('png data').toString('base64'),
        filename: 'encoded.png',
        mimetype: 'image/png',
        type: 'image',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('file-uuid-b64');
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(buildApp())
      .post('/api/files/upload-base64')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ filename: 'test.png' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Missing required fields/);
  });

  it('returns 400 when data field is missing', async () => {
    const res = await request(buildApp())
      .post('/api/files/upload-base64')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ filename: 'test.png', mimetype: 'image/png' });

    expect(res.status).toBe(400);
  });

  it('defaults to other type when no type provided', async () => {
    fileStorageServiceMock.storeFromBase64.mockResolvedValue({
      id: 'file-uuid-other',
      filename: 'data.bin',
      mimetype: 'application/octet-stream',
      size: 50,
      type: 'other',
    });

    await request(buildApp())
      .post('/api/files/upload-base64')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        data: Buffer.from('data').toString('base64'),
        filename: 'data.bin',
        mimetype: 'application/octet-stream',
      });

    expect(fileStorageServiceMock.storeFromBase64).toHaveBeenCalledWith(
      expect.any(String),
      'data.bin',
      'application/octet-stream',
      'other',
      'user-uuid-1',
      undefined
    );
  });

  it('normalizes invalid type to other', async () => {
    fileStorageServiceMock.storeFromBase64.mockResolvedValue({
      id: 'file-uuid-invalid',
      filename: 'data.bin',
      mimetype: 'application/octet-stream',
      size: 50,
      type: 'other',
    });

    await request(buildApp())
      .post('/api/files/upload-base64')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        data: Buffer.from('data').toString('base64'),
        filename: 'data.bin',
        mimetype: 'application/octet-stream',
        type: 'invalidtype',
      });

    expect(fileStorageServiceMock.storeFromBase64).toHaveBeenCalledWith(
      expect.any(String),
      'data.bin',
      'application/octet-stream',
      'other',
      'user-uuid-1',
      undefined
    );
  });
});

describe('PUT /api/files/:id/metadata', () => {
  it('updates file metadata', async () => {
    fileStorageServiceMock.updateMetadata.mockResolvedValue({
      ...mockFileMeta,
      metadata: { tag: 'updated' },
    });

    const res = await request(buildApp())
      .put('/api/files/a0000000-0000-4000-8000-000000000001/metadata')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ tag: 'updated' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 for invalid UUID format', async () => {
    const res = await request(buildApp())
      .put('/api/files/not-a-uuid/metadata')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ tag: 'value' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/files/:id', () => {
  it('deletes a file', async () => {
    fileStorageServiceMock.delete.mockResolvedValue(undefined);

    const res = await request(buildApp())
      .delete('/api/files/a0000000-0000-4000-8000-000000000001')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/deleted/i);
  });

  it('returns 400 for invalid UUID format', async () => {
    const res = await request(buildApp())
      .delete('/api/files/not-a-valid-uuid')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
  });
});

describe('POST /api/files/cleanup', () => {
  it('cleans up old files and returns count', async () => {
    fileStorageServiceMock.cleanupOldFiles.mockResolvedValue(3);

    const res = await request(buildApp())
      .post('/api/files/cleanup')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ maxAge: 86400000 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('3');
  });

  it('cleans up with default maxAge when not provided', async () => {
    fileStorageServiceMock.cleanupOldFiles.mockResolvedValue(0);

    const res = await request(buildApp())
      .post('/api/files/cleanup')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(200);
    expect(fileStorageServiceMock.cleanupOldFiles).toHaveBeenCalledWith('user-uuid-1', undefined);
  });

  it('returns 401 without authentication', async () => {
    const res = await request(buildApp()).post('/api/files/cleanup').send({});

    expect(res.status).toBe(401);
  });
});
