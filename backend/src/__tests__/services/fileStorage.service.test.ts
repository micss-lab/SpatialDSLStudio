import { prismaMock } from '../helpers/prisma.mock';
import { mockReset } from 'jest-mock-extended';

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
});

import { fileStorageService } from '../../services/fileStorage.service';
import { ApiError } from '../../middleware/errorHandler';

const now = new Date();

const makeStoredFile = (overrides: any = {}) => ({
  id: 'file-uuid-1',
  filename: 'test.png',
  mimetype: 'image/png',
  size: 1024,
  type: 'image',
  data: Buffer.from('fakedata'),
  metadata: { tag: 'test' },
  createdAt: now,
  updatedAt: now,
  userId: 'user-uuid-1',
  ...overrides,
});

describe('FileStorageService', () => {
  describe('getAll', () => {
    it('returns all files for a user', async () => {
      prismaMock.storedFile.findMany.mockResolvedValue([makeStoredFile()]);

      const result = await fileStorageService.getAll('user-uuid-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('file-uuid-1');
      expect(result[0].filename).toBe('test.png');
      expect((result[0] as any).data).toBeUndefined();
    });

    it('filters by type when provided', async () => {
      prismaMock.storedFile.findMany.mockResolvedValue([makeStoredFile({ type: 'image' })]);

      const result = await fileStorageService.getAll('user-uuid-1', 'image');

      expect(prismaMock.storedFile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-uuid-1', type: 'image' }),
        })
      );
      expect(result).toHaveLength(1);
    });

    it('returns empty array when no files found', async () => {
      prismaMock.storedFile.findMany.mockResolvedValue([]);

      const result = await fileStorageService.getAll('user-uuid-1');

      expect(result).toHaveLength(0);
    });

    it('maps metadata and type correctly', async () => {
      prismaMock.storedFile.findMany.mockResolvedValue([makeStoredFile({ type: 'model', metadata: { key: 'val' } })]);

      const result = await fileStorageService.getAll('user-uuid-1', 'model');

      expect(result[0].type).toBe('model');
      expect(result[0].metadata).toEqual({ key: 'val' });
    });
  });

  describe('getMetadataById', () => {
    it('returns metadata without data field', async () => {
      prismaMock.storedFile.findFirst.mockResolvedValue(makeStoredFile());

      const result = await fileStorageService.getMetadataById('file-uuid-1', 'user-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('file-uuid-1');
      expect((result as any).data).toBeUndefined();
    });

    it('returns null when file not found', async () => {
      prismaMock.storedFile.findFirst.mockResolvedValue(null);

      const result = await fileStorageService.getMetadataById('nonexistent', 'user-uuid-1');

      expect(result).toBeNull();
    });

    it('queries with correct id and userId', async () => {
      prismaMock.storedFile.findFirst.mockResolvedValue(makeStoredFile());

      await fileStorageService.getMetadataById('file-uuid-1', 'user-uuid-1');

      expect(prismaMock.storedFile.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'file-uuid-1', userId: 'user-uuid-1' },
        })
      );
    });
  });

  describe('getById', () => {
    it('returns file with base64 encoded data', async () => {
      const fileData = Buffer.from('hello world');
      prismaMock.storedFile.findFirst.mockResolvedValue(makeStoredFile({ data: fileData }));

      const result = await fileStorageService.getById('file-uuid-1', 'user-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.data).toBe(fileData.toString('base64'));
    });

    it('returns null when file not found', async () => {
      prismaMock.storedFile.findFirst.mockResolvedValue(null);

      const result = await fileStorageService.getById('nonexistent', 'user-uuid-1');

      expect(result).toBeNull();
    });

    it('returns all fields including id, filename, mimetype', async () => {
      prismaMock.storedFile.findFirst.mockResolvedValue(makeStoredFile());

      const result = await fileStorageService.getById('file-uuid-1', 'user-uuid-1');

      expect(result!.id).toBe('file-uuid-1');
      expect(result!.filename).toBe('test.png');
      expect(result!.mimetype).toBe('image/png');
      expect(result!.size).toBe(1024);
    });
  });

  describe('getRawData', () => {
    it('returns raw data buffer with mimetype and filename', async () => {
      const fileData = Buffer.from('raw binary content');
      prismaMock.storedFile.findFirst.mockResolvedValue({
        data: fileData,
        mimetype: 'image/jpeg',
        filename: 'photo.jpg',
      } as any);

      const result = await fileStorageService.getRawData('file-uuid-1', 'user-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.data).toBe(fileData);
      expect(result!.mimetype).toBe('image/jpeg');
      expect(result!.filename).toBe('photo.jpg');
    });

    it('returns null when file not found', async () => {
      prismaMock.storedFile.findFirst.mockResolvedValue(null);

      const result = await fileStorageService.getRawData('nonexistent', 'user-uuid-1');

      expect(result).toBeNull();
    });
  });

  describe('storeFromBuffer', () => {
    it('stores file from buffer and returns upload response', async () => {
      const buffer = Buffer.from('file content');
      prismaMock.storedFile.create.mockResolvedValue(makeStoredFile({ size: buffer.length }));

      const result = await fileStorageService.storeFromBuffer(
        buffer,
        'test.png',
        'image/png',
        'image',
        'user-uuid-1',
        { tag: 'test' }
      );

      expect(result.id).toBe('file-uuid-1');
      expect(result.filename).toBe('test.png');
      expect(result.mimetype).toBe('image/png');
      expect(result.type).toBe('image');
    });

    it('stores file with empty metadata when not provided', async () => {
      const buffer = Buffer.from('content');
      prismaMock.storedFile.create.mockResolvedValue(makeStoredFile());

      await fileStorageService.storeFromBuffer(buffer, 'file.bin', 'application/octet-stream', 'other', 'user-uuid-1');

      expect(prismaMock.storedFile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: {},
          }),
        })
      );
    });

    it('stores file size as buffer length', async () => {
      const buffer = Buffer.alloc(512, 0);
      prismaMock.storedFile.create.mockResolvedValue(makeStoredFile({ size: 512 }));

      await fileStorageService.storeFromBuffer(buffer, 'test.bin', 'application/octet-stream', 'other', 'user-uuid-1');

      expect(prismaMock.storedFile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            size: 512,
          }),
        })
      );
    });
  });

  describe('storeFromBase64', () => {
    it('decodes base64 and stores file', async () => {
      const base64Data = Buffer.from('hello world').toString('base64');
      prismaMock.storedFile.create.mockResolvedValue(makeStoredFile());

      const result = await fileStorageService.storeFromBase64(
        base64Data,
        'hello.txt',
        'text/plain',
        'other',
        'user-uuid-1'
      );

      expect(result.id).toBe('file-uuid-1');
      expect(prismaMock.storedFile.create).toHaveBeenCalled();
    });

    it('strips data URL prefix before decoding', async () => {
      const base64Data = `data:image/png;base64,${Buffer.from('png data').toString('base64')}`;
      prismaMock.storedFile.create.mockResolvedValue(makeStoredFile());

      await fileStorageService.storeFromBase64(base64Data, 'img.png', 'image/png', 'image', 'user-uuid-1');

      expect(prismaMock.storedFile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            data: Buffer.from('png data'),
          }),
        })
      );
    });

    it('handles base64 without data URL prefix', async () => {
      const rawBase64 = Buffer.from('simple data').toString('base64');
      prismaMock.storedFile.create.mockResolvedValue(makeStoredFile());

      await fileStorageService.storeFromBase64(rawBase64, 'data.bin', 'application/octet-stream', 'other', 'user-uuid-1');

      expect(prismaMock.storedFile.create).toHaveBeenCalled();
    });
  });

  describe('updateMetadata', () => {
    it('merges metadata and returns updated file', async () => {
      prismaMock.storedFile.findFirst.mockResolvedValue(makeStoredFile({ metadata: { existing: 'value' } }));
      prismaMock.storedFile.update.mockResolvedValue(makeStoredFile({ metadata: { existing: 'value', new: 'data' } }));

      const result = await fileStorageService.updateMetadata('file-uuid-1', { new: 'data' }, 'user-uuid-1');

      expect(result.metadata).toEqual({ existing: 'value', new: 'data' });
    });

    it('throws 404 when file not found', async () => {
      prismaMock.storedFile.findFirst.mockResolvedValue(null);

      await expect(
        fileStorageService.updateMetadata('nonexistent', { key: 'val' }, 'user-uuid-1')
      ).rejects.toThrow(ApiError);

      await expect(
        fileStorageService.updateMetadata('nonexistent', { key: 'val' }, 'user-uuid-1')
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('calls update with merged metadata', async () => {
      const existingMetadata = { a: 1 };
      const newMetadata = { b: 2 };
      prismaMock.storedFile.findFirst.mockResolvedValue(makeStoredFile({ metadata: existingMetadata }));
      prismaMock.storedFile.update.mockResolvedValue(makeStoredFile({ metadata: { a: 1, b: 2 } }));

      await fileStorageService.updateMetadata('file-uuid-1', newMetadata, 'user-uuid-1');

      expect(prismaMock.storedFile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'file-uuid-1' },
          data: { metadata: { a: 1, b: 2 } },
        })
      );
    });
  });

  describe('delete', () => {
    it('deletes file when user is owner', async () => {
      prismaMock.storedFile.findFirst.mockResolvedValue(makeStoredFile());
      prismaMock.storedFile.delete.mockResolvedValue(makeStoredFile());

      await fileStorageService.delete('file-uuid-1', 'user-uuid-1');

      expect(prismaMock.storedFile.delete).toHaveBeenCalledWith({ where: { id: 'file-uuid-1' } });
    });

    it('throws 404 when file not found', async () => {
      prismaMock.storedFile.findFirst.mockResolvedValue(null);

      await expect(fileStorageService.delete('nonexistent', 'user-uuid-1')).rejects.toThrow(ApiError);

      await expect(fileStorageService.delete('nonexistent', 'user-uuid-1')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('verifies ownership before deleting', async () => {
      prismaMock.storedFile.findFirst.mockResolvedValue(makeStoredFile());
      prismaMock.storedFile.delete.mockResolvedValue(makeStoredFile());

      await fileStorageService.delete('file-uuid-1', 'user-uuid-1');

      expect(prismaMock.storedFile.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'file-uuid-1', userId: 'user-uuid-1' },
        })
      );
    });
  });

  describe('cleanupOldFiles', () => {
    it('deletes files older than maxAge and returns count', async () => {
      prismaMock.storedFile.deleteMany.mockResolvedValue({ count: 5 });

      const result = await fileStorageService.cleanupOldFiles('user-uuid-1', 1000 * 60 * 60);

      expect(result).toBe(5);
      expect(prismaMock.storedFile.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-uuid-1' }),
        })
      );
    });

    it('uses default 7-day max age when not provided', async () => {
      prismaMock.storedFile.deleteMany.mockResolvedValue({ count: 0 });

      await fileStorageService.cleanupOldFiles('user-uuid-1');

      expect(prismaMock.storedFile.deleteMany).toHaveBeenCalled();
    });

    it('returns 0 when no files were deleted', async () => {
      prismaMock.storedFile.deleteMany.mockResolvedValue({ count: 0 });

      const result = await fileStorageService.cleanupOldFiles('user-uuid-1');

      expect(result).toBe(0);
    });

    it('passes cutoff date in query', async () => {
      prismaMock.storedFile.deleteMany.mockResolvedValue({ count: 3 });
      const beforeCall = Date.now();

      await fileStorageService.cleanupOldFiles('user-uuid-1', 7 * 24 * 60 * 60 * 1000);

      const call = prismaMock.storedFile.deleteMany.mock.calls[0][0]!;
      const where = (call as any).where;
      expect(where.createdAt.lt).toBeInstanceOf(Date);
      expect(where.createdAt.lt.getTime()).toBeLessThanOrEqual(beforeCall);
    });
  });

  describe('getStorageStats', () => {
    it('returns stats with byType breakdown', async () => {
      prismaMock.storedFile.groupBy.mockResolvedValue([
        { type: 'image', _count: 3, _sum: { size: 3000 } },
        { type: 'model', _count: 1, _sum: { size: 5000 } },
      ] as any);

      const result = await fileStorageService.getStorageStats('user-uuid-1');

      expect(result.totalFiles).toBe(4);
      expect(result.totalSize).toBe(8000);
      expect(result.byType.image.count).toBe(3);
      expect(result.byType.image.size).toBe(3000);
      expect(result.byType.model.count).toBe(1);
      expect(result.byType.model.size).toBe(5000);
    });

    it('initializes all types with zero counts', async () => {
      prismaMock.storedFile.groupBy.mockResolvedValue([]);

      const result = await fileStorageService.getStorageStats('user-uuid-1');

      expect(result.totalFiles).toBe(0);
      expect(result.totalSize).toBe(0);
      expect(result.byType.image).toEqual({ count: 0, size: 0 });
      expect(result.byType.model).toEqual({ count: 0, size: 0 });
      expect(result.byType.other).toEqual({ count: 0, size: 0 });
    });

    it('handles null sum from groupBy', async () => {
      prismaMock.storedFile.groupBy.mockResolvedValue([
        { type: 'other', _count: 2, _sum: { size: null } },
      ] as any);

      const result = await fileStorageService.getStorageStats('user-uuid-1');

      expect(result.byType.other.size).toBe(0);
      expect(result.totalSize).toBe(0);
    });
  });
});
