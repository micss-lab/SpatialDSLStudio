import prisma from '../config/database';
import { ApiError } from '../middleware';
import { StoredFile, FileType, FileUploadResponse } from '../../../shared/types';

class FileStorageService {
  /**
   * Get all stored files for a user
   */
  async getAll(userId: string, type?: FileType, projectId?: string): Promise<Omit<StoredFile, 'data'>[]> {
    const files = await prisma.storedFile.findMany({
      where: { ...(projectId ? { projectId } : { userId }), ...(type ? { type } : {}) },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        projectId: true,
        filename: true,
        mimetype: true,
        size: true,
        type: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return files.map(f => ({
      id: f.id,
      projectId: f.projectId || undefined,
      filename: f.filename,
      mimetype: f.mimetype,
      size: f.size,
      type: f.type as FileType,
      metadata: f.metadata as Record<string, any>,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }));
  }

  /**
   * Get file metadata by ID (without data, with user ownership check)
   */
  async getMetadataById(id: string, userId: string, projectId?: string): Promise<Omit<StoredFile, 'data'> | null> {
    const file = await prisma.storedFile.findFirst({
      where: projectId ? { id, projectId } : { id, userId },
      select: {
        id: true,
        projectId: true,
        filename: true,
        mimetype: true,
        size: true,
        type: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!file) return null;

    return {
      id: file.id,
      projectId: file.projectId || undefined,
      filename: file.filename,
      mimetype: file.mimetype,
      size: file.size,
      type: file.type as FileType,
      metadata: file.metadata as Record<string, any>,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  /**
   * Get file with data by ID (with user ownership check)
   */
  async getById(id: string, userId: string, projectId?: string): Promise<StoredFile | null> {
    const file = await prisma.storedFile.findFirst({
      where: projectId ? { id, projectId } : { id, userId },
    });

    if (!file) return null;

    return {
      id: file.id,
      projectId: file.projectId || undefined,
      filename: file.filename,
      mimetype: file.mimetype,
      size: file.size,
      type: file.type as FileType,
      data: file.data.toString('base64'),
      metadata: file.metadata as Record<string, any>,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  /**
   * Get raw file data as Buffer (with user ownership check)
   */
  async getRawData(
    id: string,
    userId: string,
    projectId?: string
  ): Promise<{ data: Buffer; mimetype: string; filename: string } | null> {
    const file = await prisma.storedFile.findFirst({
      where: projectId ? { id, projectId } : { id, userId },
      select: {
        data: true,
        mimetype: true,
        filename: true,
      },
    });

    if (!file) return null;

    return {
      data: file.data,
      mimetype: file.mimetype,
      filename: file.filename,
    };
  }

  /**
   * Store a file from a buffer (e.g., from multer) for a user
   */
  async storeFromBuffer(
    data: Buffer,
    filename: string,
    mimetype: string,
    type: FileType,
    userId: string,
    metadata?: Record<string, any>,
    projectId?: string
  ): Promise<FileUploadResponse> {
    const file = await prisma.storedFile.create({
      data: {
        filename,
        mimetype,
        size: data.length,
        type,
        data,
        metadata: metadata || {},
        userId,
        projectId,
      },
    });

    return {
      id: file.id,
      filename: file.filename,
      mimetype: file.mimetype,
      size: file.size,
      type: file.type as FileType,
    };
  }

  /**
   * Store a file from base64 string for a user
   */
  async storeFromBase64(
    base64Data: string,
    filename: string,
    mimetype: string,
    type: FileType,
    userId: string,
    metadata?: Record<string, any>,
    projectId?: string
  ): Promise<FileUploadResponse> {
    // Remove data URL prefix if present
    const base64Clean = base64Data.replace(/^data:[^;]+;base64,/, '');
    const data = Buffer.from(base64Clean, 'base64');

    return this.storeFromBuffer(data, filename, mimetype, type, userId, metadata, projectId);
  }

  /**
   * Update file metadata (with user ownership check)
   */
  async updateMetadata(
    id: string,
    metadata: Record<string, any>,
    userId: string,
    projectId?: string
  ): Promise<Omit<StoredFile, 'data'>> {
    const existing = await prisma.storedFile.findFirst({
      where: projectId ? { id, projectId } : { id, userId },
    });

    if (!existing) {
      throw new ApiError(404, 'File not found');
    }

    const file = await prisma.storedFile.update({
      where: { id },
      data: {
        metadata: {
          ...(existing.metadata as Record<string, any>),
          ...metadata,
        },
      },
      select: {
        id: true,
        projectId: true,
        filename: true,
        mimetype: true,
        size: true,
        type: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      id: file.id,
      projectId: file.projectId || undefined,
      filename: file.filename,
      mimetype: file.mimetype,
      size: file.size,
      type: file.type as FileType,
      metadata: file.metadata as Record<string, any>,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  /**
   * Delete a file (with user ownership check)
   */
  async delete(id: string, userId: string, projectId?: string): Promise<void> {
    // First verify ownership
    const existing = await prisma.storedFile.findFirst({
      where: projectId ? { id, projectId } : { id, userId },
    });

    if (!existing) {
      throw new ApiError(404, 'File not found');
    }

    await prisma.storedFile.delete({
      where: { id },
    });
  }

  /**
   * Delete files older than a specified age (in milliseconds) for a user
   */
  async cleanupOldFiles(
    userId: string,
    maxAge: number = 7 * 24 * 60 * 60 * 1000,
    projectId?: string
  ): Promise<number> {
    const cutoffDate = new Date(Date.now() - maxAge);

    const result = await prisma.storedFile.deleteMany({
      where: {
        ...(projectId ? { projectId } : { userId }),
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }

  /**
   * Get storage statistics for a user
   */
  async getStorageStats(userId: string, projectId?: string): Promise<{
    totalFiles: number;
    totalSize: number;
    byType: Record<FileType, { count: number; size: number }>;
  }> {
    const files = await prisma.storedFile.groupBy({
      by: ['type'],
      where: projectId ? { projectId } : { userId },
      _count: true,
      _sum: {
        size: true,
      },
    });

    const byType: Record<FileType, { count: number; size: number }> = {
      image: { count: 0, size: 0 },
      model: { count: 0, size: 0 },
      other: { count: 0, size: 0 },
    };

    let totalFiles = 0;
    let totalSize = 0;

    for (const group of files) {
      const type = group.type as FileType;
      byType[type] = {
        count: group._count,
        size: group._sum.size || 0,
      };
      totalFiles += group._count;
      totalSize += group._sum.size || 0;
    }

    return {
      totalFiles,
      totalSize,
      byType,
    };
  }
}

export const fileStorageService = new FileStorageService();
export default fileStorageService;
