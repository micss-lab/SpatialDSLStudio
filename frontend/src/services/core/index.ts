// Barrel export for core services
export { apiClient, ApiClient, API_ENDPOINTS, authApi } from './api.client';
export type { LoginRequest, RegisterRequest, AuthUser, AuthResponse, UserRole, ResourceType } from './api.client';
export { fileStorageService } from './fileStorage.service';
export { adminService } from './admin.service';
export { roleRequestService } from './roleRequest.service';
export type { RoleRequest } from './roleRequest.service';
export type {
  AdminUser,
  UserListParams,
  UserListResponse,
  ResourceStats,
  AdminResourceItem,
  ResourceListParams,
  ResourceListResponse,
  SystemHealth,
} from './admin.service';
