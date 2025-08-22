/**
 * Service for storing large files (like 3D models) using IndexedDB
 * This avoids localStorage quota issues for large base64 encoded files
 */

interface StoredFile {
  id: string;
  data: string; // base64 data
  type: 'image' | 'model';
  filename?: string;
  size: number;
  timestamp: number;
}

class FileStorageService {
  private dbName = 'obeo_tool_files';
  private version = 1;
  private storeName = 'files';
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async storeFile(data: string, type: 'image' | 'model', filename?: string): Promise<string> {
    if (!this.db) {
      await this.init();
    }

    const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const file: StoredFile = {
      id,
      data,
      type,
      filename,
      size: data.length,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.add(file);

      request.onsuccess = () => resolve(id);
      request.onerror = () => reject(request.error);
    });
  }

  async getFile(id: string): Promise<string | null> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onsuccess = () => {
        const result = request.result as StoredFile;
        resolve(result ? result.data : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteFile(id: string): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllFiles(type?: 'image' | 'model'): Promise<StoredFile[]> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      
      let request: IDBRequest;
      if (type) {
        const index = store.index('type');
        request = index.getAll(type);
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => resolve(request.result as StoredFile[]);
      request.onerror = () => reject(request.error);
    });
  }

  async cleanupOldFiles(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    // Clean up files older than maxAge (default: 7 days)
    if (!this.db) {
      await this.init();
    }

    const cutoffTime = Date.now() - maxAge;
    const files = await this.getAllFiles();
    
    for (const file of files) {
      if (file.timestamp < cutoffTime) {
        await this.deleteFile(file.id);
      }
    }
  }

  async getStorageInfo(): Promise<{ used: number; available: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        available: estimate.quota || 0
      };
    }
    
    // Fallback estimation
    const files = await this.getAllFiles();
    const used = files.reduce((total, file) => total + file.size, 0);
    
    return {
      used,
      available: 50 * 1024 * 1024 // Estimate 50MB available
    };
  }
}

export const fileStorageService = new FileStorageService();
export default fileStorageService;
