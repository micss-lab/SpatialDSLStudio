import { apiClient, API_ENDPOINTS, UserRole } from './api.client';

export interface RoleRequest {
  id: string;
  userId: string;
  currentRole: UserRole;
  requestedRole: UserRole;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedById?: string;
  reviewNote?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
  user?: { email: string };
  reviewedBy?: { email: string };
}

class RoleRequestService {
  async createRequest(requestedRole: UserRole, reason: string): Promise<RoleRequest> {
    return apiClient.post<RoleRequest>(API_ENDPOINTS.ROLE_REQUESTS, { requestedRole, reason });
  }

  async getMyRequests(): Promise<RoleRequest[]> {
    return apiClient.get<RoleRequest[]>(API_ENDPOINTS.ROLE_REQUESTS_MY);
  }

  async getAllRequests(status?: string): Promise<RoleRequest[]> {
    const query = status ? `?status=${status}` : '';
    return apiClient.get<RoleRequest[]>(`${API_ENDPOINTS.ROLE_REQUESTS}${query}`);
  }

  async reviewRequest(requestId: string, approved: boolean, reviewNote?: string): Promise<RoleRequest> {
    return apiClient.patch<RoleRequest>(
      `${API_ENDPOINTS.ROLE_REQUESTS}/${requestId}`,
      { approved, reviewNote }
    );
  }
}

export const roleRequestService = new RoleRequestService();
