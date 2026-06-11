/**
 * Admin Service
 * Handles all admin panel API calls
 */

import { apiClient } from './api.client';
import type { UserRole, ResourceType } from './api.client';

// Admin API endpoints
const ADMIN_ENDPOINTS = {
  USERS: '/admin/users',
  STATS: '/admin/stats',
  RESOURCES: '/admin/resources',
  HEALTH: '/admin/health',
  NOTIFICATIONS_BROADCAST: '/admin/notifications/broadcast',
};

// Types
export interface AdminUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  resourceCounts: {
    metamodels: number;
    models: number;
    diagrams: number;
    transformations: number;
    codegenProjects: number;
    testCases: number;
    files: number;
  };
}

export interface UserListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: UserRole;
  sortBy?: 'email' | 'createdAt' | 'role';
  sortOrder?: 'asc' | 'desc';
}

export interface UserListResponse {
  users: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ResourceStats {
  users: {
    total: number;
    byRole: Record<UserRole, number>;
  };
  resources: {
    metamodels: number;
    models: number;
    diagrams: number;
    transformations: number;
    codegenProjects: number;
    testCases: number;
    sharedResources: number;
  };
  storage: {
    totalFiles: number;
    totalSizeBytes: number;
  };
  recentResources: {
    type: string;
    name: string;
    createdAt: string;
    userId: string;
    userEmail: string;
  }[];
  mostActiveUsers: {
    id: string;
    email: string;
    resourceCount: number;
  }[];
}

export interface AdminResourceItem {
  id: string;
  name: string;
  type: ResourceType;
  userId: string;
  userEmail: string;
  createdAt: string;
  updatedAt: string;
  sharedWith: number;
}

export interface ResourceListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: ResourceType;
  userId?: string;
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'type' | 'userEmail';
  sortOrder?: 'asc' | 'desc';
}

export interface ResourceListResponse {
  resources: AdminResourceItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SystemHealth {
  database: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    responseTimeMs: number;
  };
  api: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    memoryUsage: {
      heapUsed: number;
      heapTotal: number;
      rss: number;
    };
  };
  storage: {
    totalFiles: number;
    totalSizeBytes: number;
    totalSizeMB: number;
  };
}

export interface AdminNotificationPayload {
  subject: string;
  message: string;
  userIds?: string[];
}

export interface AdminNotificationResult {
  totalUsers: number;
  ccAdmins: number;
  bccUsers: number;
  batches: number;
}

class AdminService {
  /**
   * Get paginated list of users
   */
  async getUsers(params: UserListParams = {}): Promise<UserListResponse> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.set('page', String(params.page));
    if (params.pageSize) queryParams.set('pageSize', String(params.pageSize));
    if (params.search) queryParams.set('search', params.search);
    if (params.role) queryParams.set('role', params.role);
    if (params.sortBy) queryParams.set('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);

    const query = queryParams.toString();
    return apiClient.get<UserListResponse>(`${ADMIN_ENDPOINTS.USERS}${query ? `?${query}` : ''}`);
  }

  /**
   * Get single user by ID
   */
  async getUserById(userId: string): Promise<AdminUser> {
    return apiClient.get<AdminUser>(`${ADMIN_ENDPOINTS.USERS}/${userId}`);
  }

  /**
   * Change user role
   */
  async changeUserRole(userId: string, role: UserRole): Promise<AdminUser> {
    return apiClient.patch<AdminUser>(`${ADMIN_ENDPOINTS.USERS}/${userId}/role`, { role });
  }

  /**
   * Reset user password
   */
  async resetUserPassword(userId: string, newPassword: string): Promise<void> {
    await apiClient.post(`${ADMIN_ENDPOINTS.USERS}/${userId}/reset-password`, { newPassword });
  }

  /**
   * Delete user
   */
  async deleteUser(userId: string, reassignToUserId?: string): Promise<{ deletedResources: number; reassignedResources: number }> {
    return apiClient.delete<{ deletedResources: number; reassignedResources: number }>(
      `${ADMIN_ENDPOINTS.USERS}/${userId}${reassignToUserId ? `?reassignToUserId=${reassignToUserId}` : ''}`
    );
  }

  /**
   * Bulk change user roles
   */
  async bulkChangeRole(userIds: string[], role: UserRole): Promise<{ updatedCount: number }> {
    return apiClient.post<{ updatedCount: number }>(`${ADMIN_ENDPOINTS.USERS}/bulk/role`, { userIds, role });
  }

  /**
   * Bulk delete users
   */
  async bulkDeleteUsers(userIds: string[]): Promise<{ deletedCount: number }> {
    return apiClient.post<{ deletedCount: number }>(`${ADMIN_ENDPOINTS.USERS}/bulk/delete`, { userIds });
  }

  /**
   * Get resource statistics
   */
  async getStats(): Promise<ResourceStats> {
    return apiClient.get<ResourceStats>(ADMIN_ENDPOINTS.STATS);
  }

  /**
   * Get paginated list of resources
   */
  async getResources(params: ResourceListParams = {}): Promise<ResourceListResponse> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.set('page', String(params.page));
    if (params.pageSize) queryParams.set('pageSize', String(params.pageSize));
    if (params.search) queryParams.set('search', params.search);
    if (params.type) queryParams.set('type', params.type);
    if (params.userId) queryParams.set('userId', params.userId);
    if (params.sortBy) queryParams.set('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);

    const query = queryParams.toString();
    return apiClient.get<ResourceListResponse>(`${ADMIN_ENDPOINTS.RESOURCES}${query ? `?${query}` : ''}`);
  }

  /**
   * Get resource details
   */
  async getResourceDetails(type: ResourceType, resourceId: string): Promise<any> {
    return apiClient.get(`${ADMIN_ENDPOINTS.RESOURCES}/${type}/${resourceId}`);
  }

  /**
   * Delete resource
   */
  async deleteResource(type: ResourceType, resourceId: string): Promise<void> {
    await apiClient.delete(`${ADMIN_ENDPOINTS.RESOURCES}/${type}/${resourceId}`);
  }

  /**
   * Transfer resource ownership
   */
  async transferOwnership(type: ResourceType, resourceId: string, newOwnerId: string): Promise<void> {
    await apiClient.post(`${ADMIN_ENDPOINTS.RESOURCES}/${type}/${resourceId}/transfer`, { newOwnerId });
  }

  /**
   * Force unshare resource
   */
  async forceUnshare(type: ResourceType, resourceId: string): Promise<{ removedSharesCount: number }> {
    return apiClient.post<{ removedSharesCount: number }>(`${ADMIN_ENDPOINTS.RESOURCES}/${type}/${resourceId}/unshare`, {});
  }

  /**
   * Get system health
   */
  async getSystemHealth(): Promise<SystemHealth> {
    return apiClient.get<SystemHealth>(ADMIN_ENDPOINTS.HEALTH);
  }

  async sendBroadcastNotification(payload: AdminNotificationPayload): Promise<AdminNotificationResult> {
    return apiClient.post<AdminNotificationResult>(ADMIN_ENDPOINTS.NOTIFICATIONS_BROADCAST, payload);
  }
}

export const adminService = new AdminService();
