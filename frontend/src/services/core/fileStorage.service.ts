/**
 * Service for storing large files (like 3D models) using API
 * This replaces IndexedDB with backend PostgreSQL storage
 */

import { apiClient, API_ENDPOINTS } from './api.client';

interface StoredFile {
  id: string;
  data: string; // base64 data
  type: 'image' | 'model';
  filename?: string;
  size: number;
  timestamp: number;
}

interface FileMetadata {
  id: string;
  filename: string;
  mimetype: string;
  size: number;
  type: 'image' | 'model' | 'other';
  createdAt?: string;
  updatedAt?: string;
}

class FileStorageService {
  // For backward compatibility with code expecting init()
  async init(): Promise<void> {
    // No initialization needed for API-based storage
    return Promise.resolve();
  }

  async storeFile(data: string, type: 'image' | 'model', filename?: string): Promise<string> {
    // Determine mimetype from data URL prefix if present
    let mimetype = type === 'model' ? 'model/gltf-binary' : 'image/png';
    let cleanData = data;

    if (data.startsWith('data:')) {
      const match = data.match(/^data:([^;]+);base64,/);
      if (match) {
        mimetype = match[1];
        cleanData = data.replace(/^data:[^;]+;base64,/, '');
      }
    }

    try {
      const response = await apiClient.post<FileMetadata>(
        API_ENDPOINTS.FILES_UPLOAD_BASE64,
        {
          data: cleanData,
          filename: filename || `${type}_${Date.now()}`,
          mimetype,
          type,
        }
      );

      return response.id;
    } catch (error) {
      console.error('Error storing file via API:', error);
      throw error;
    }
  }

  async getFile(id: string): Promise<string | null> {
    try {
      const response = await apiClient.get<{ data: string; mimetype: string }>(
        `${API_ENDPOINTS.FILES}/${id}/data`
      );
      
      if (!response || !response.data) {
        return null;
      }

      // Return as data URL
      return `data:${response.mimetype};base64,${response.data}`;
    } catch (error) {
      console.error('Error getting file from API:', error);
      return null;
    }
  }

  async deleteFile(id: string): Promise<void> {
    try {
      await apiClient.delete(`${API_ENDPOINTS.FILES}/${id}`);
    } catch (error) {
      console.error('Error deleting file from API:', error);
      throw error;
    }
  }

  async getAllFiles(type?: 'image' | 'model'): Promise<StoredFile[]> {
    try {
      const endpoint = type 
        ? `${API_ENDPOINTS.FILES}?type=${type}` 
        : API_ENDPOINTS.FILES;
      
      const files = await apiClient.get<FileMetadata[]>(endpoint);
      
      // Convert API response to StoredFile format for backward compatibility
      return files.map(f => ({
        id: f.id,
        data: '', // Data is not included in list response
        type: f.type as 'image' | 'model',
        filename: f.filename,
        size: f.size,
        timestamp: f.createdAt ? new Date(f.createdAt).getTime() : Date.now()
      }));
    } catch (error) {
      console.error('Error getting files from API:', error);
      return [];
    }
  }

  async cleanupOldFiles(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    try {
      await apiClient.post(`${API_ENDPOINTS.FILES}/cleanup`, { maxAge });
    } catch (error) {
      console.error('Error cleaning up files:', error);
    }
  }

  async getStorageInfo(): Promise<{ used: number; available: number }> {
    try {
      const stats = await apiClient.get<{ totalFiles: number; totalSize: number }>(
        API_ENDPOINTS.FILES_STATS
      );
      return {
        used: stats.totalSize || 0,
        available: 1024 * 1024 * 1024, // Assume 1GB available (server-side limit)
      };
    } catch (error) {
      console.error('Error getting storage info:', error);
      return {
        used: 0,
        available: 1024 * 1024 * 1024,
      };
    }
  }

  /**
   * Upload a File object directly
   */
  async uploadFile(file: File, type: 'image' | 'model'): Promise<string> {
    try {
      const response = await apiClient.uploadFile(API_ENDPOINTS.FILES_UPLOAD, file, { type });
      return response.id;
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }

  /**
   * Download a file as a Blob
   */
  async downloadFile(id: string): Promise<Blob | null> {
    try {
      return await apiClient.downloadFile(`${API_ENDPOINTS.FILES}/${id}/download`);
    } catch (error) {
      console.error('Error downloading file:', error);
      return null;
    }
  }
}

export const fileStorageService = new FileStorageService();
export default fileStorageService;
