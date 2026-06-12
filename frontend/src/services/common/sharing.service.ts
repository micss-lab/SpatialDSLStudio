/**
 * Sharing Service
 * 
 * Handles resource sharing operations (share/unshare resources with other users)
 */

import { apiClient } from '../core';

// Resource types that can be shared (matches backend)
export type ResourceType = 'METAMODEL' | 'MODEL' | 'DIAGRAM' | 'TRANSFORMATION_RULE' | 'CODEGEN_PROJECT' | 'TEST_CASE';

// Share permission levels
export type SharePermission = 'VIEWER' | 'EDITOR';

// Shared resource interface
export interface SharedResource {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  ownerId: string;
  ownerEmail?: string;
  sharedWithId: string;
  sharedWithEmail?: string;
  permission: SharePermission;
  createdAt: string;
  updatedAt: string;
}

// Share request interface
export interface ShareRequest {
  email: string;
  permission: SharePermission;
}

// Access check response
export interface AccessCheckResponse {
  hasAccess: boolean;
  permission: SharePermission | 'OWNER' | null;
  isOwner: boolean;
}

class SharingService {
  private baseUrl = '/share';

  /**
   * Share a resource with another user
   */
  async shareResource(
    resourceType: ResourceType,
    resourceId: string,
    request: ShareRequest
  ): Promise<SharedResource> {
    // Use resourceType directly as the backend expects (e.g., "METAMODEL" not "metamodels")
    return apiClient.post<SharedResource>(
      `${this.baseUrl}/${resourceType}/${resourceId}/share`,
      request
    );
  }

  /**
   * Remove sharing (unshare) for a specific user
   */
  async unshareResource(
    resourceType: ResourceType,
    resourceId: string,
    userId: string
  ): Promise<void> {
    await apiClient.delete(
      `${this.baseUrl}/${resourceType}/${resourceId}/share/${userId}`
    );
  }

  /**
   * Get all shares for a resource (who the resource is shared with)
   */
  async getResourceShares(
    resourceType: ResourceType,
    resourceId: string
  ): Promise<SharedResource[]> {
    return apiClient.get<SharedResource[]>(
      `${this.baseUrl}/${resourceType}/${resourceId}/shares`
    );
  }

  /**
   * Get all resources shared with the current user
   */
  async getSharedWithMe(resourceType?: ResourceType): Promise<SharedResource[]> {
    let url = `${this.baseUrl}/shared-with-me`;
    if (resourceType) {
      url += `?resourceType=${resourceType}`;
    }
    return apiClient.get<SharedResource[]>(url);
  }

  /**
   * Check access to a resource
   */
  async checkAccess(
    resourceType: ResourceType,
    resourceId: string
  ): Promise<AccessCheckResponse> {
    return apiClient.get<AccessCheckResponse>(
      `${this.baseUrl}/${resourceType}/${resourceId}/access`
    );
  }

  /**
   * Get display name for resource type
   */
  getResourceTypeName(resourceType: ResourceType): string {
    const names: Record<ResourceType, string> = {
      METAMODEL: 'Metamodel',
      MODEL: 'Model',
      DIAGRAM: 'View',
      TRANSFORMATION_RULE: 'Transformation Rule',
      CODEGEN_PROJECT: 'Code Generation Project',
      TEST_CASE: 'Test Case',
    };
    return names[resourceType] || resourceType;
  }

  /**
   * Get permission display name
   */
  getPermissionName(permission: SharePermission | 'OWNER'): string {
    const names: Record<string, string> = {
      OWNER: 'Owner',
      EDITOR: 'Can Edit',
      VIEWER: 'Can View',
    };
    return names[permission] || permission;
  }
}

// Export singleton instance
export const sharingService = new SharingService();
