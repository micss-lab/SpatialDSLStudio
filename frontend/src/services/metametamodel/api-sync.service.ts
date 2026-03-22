import { EPackage } from '../../models/types';
import { apiClient, API_ENDPOINTS } from '../core';

/**
 * Synchronizes a single EPackage to the API backend.
 * Attempts to update if exists, creates if not found.
 * 
 * @param pkg The EPackage to sync
 */
export async function syncPackageToAPI(pkg: EPackage): Promise<void> {
  try {
    // Try to update existing, if 404 then create new
    try {
      await apiClient.put(`${API_ENDPOINTS.EPACKAGES}/${pkg.id}`, pkg);
    } catch (e: any) {
      if (e.message?.includes('404') || e.message?.includes('not found')) {
        await apiClient.post(API_ENDPOINTS.EPACKAGES, pkg);
      } else {
        throw e;
      }
    }
  } catch (error) {
    console.error('Error syncing package to API:', error);
  }
}

/**
 * Synchronizes all EPackages to the API backend.
 * 
 * @param packages Array of EPackages to sync
 */
export async function syncAllPackagesToAPI(packages: EPackage[]): Promise<void> {
  for (const pkg of packages) {
    await syncPackageToAPI(pkg);
  }
}

/**
 * Deletes an EPackage from the API backend.
 * 
 * @param id The ID of the package to delete
 */
export async function deletePackageFromAPI(id: string): Promise<void> {
  try {
    await apiClient.delete(`${API_ENDPOINTS.EPACKAGES}/${id}`);
  } catch (error) {
    console.error('Error deleting package from API:', error);
  }
}
