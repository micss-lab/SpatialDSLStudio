import { EPackage, EClass, EAttribute, EReference } from '../../models/types';
import { v4 as uuidv4 } from 'uuid';
import { apiClient, API_ENDPOINTS } from '../core';
import { buildEcorePackage } from './ecore-bootstrap.factory';
import { syncPackageToAPI, syncAllPackagesToAPI, deletePackageFromAPI } from './api-sync.service';

class MetaMetamodelService {
  private ePackages: EPackage[] = [];
  private readonly STORAGE_KEY = 'obeo_like_tool_metametamodel';
  private coreEPackage!: EPackage;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  private async initializeFromAPI(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // First try to load from API
      let apiPackages = await apiClient.get<EPackage[]>(API_ENDPOINTS.EPACKAGES);
      if (apiPackages && apiPackages.length > 0) {
        this.ePackages = apiPackages;
        console.log('Loaded meta-metamodel from API:', this.ePackages.length, 'packages');
      } else {
        // No packages exist - call the /core endpoint to initialize on server side
        console.log('No ePackages found, requesting core initialization from server...');
        const corePackage = await apiClient.get<EPackage>(API_ENDPOINTS.EPACKAGES_CORE);
        if (corePackage) {
          this.ePackages = [corePackage];
          console.log('Received core ePackage from server:', corePackage.id);
        } else {
          // Fallback: Initialize locally and sync to API
          this.initializeEcore();
          await syncAllPackagesToAPI(this.ePackages);
        }
      }
      
      // Get the core package for reference
      this.coreEPackage = this.ePackages.find(pkg => pkg.nsURI === 'http://www.modeling-tool.com/ecore') || this.ePackages[0];
      this.initialized = true;
    } catch (error) {
      console.error('Could not load from API:', error);
      // Initialize Ecore if API fails
      if (this.ePackages.length === 0) {
        this.initializeEcore();
      }
      
      this.coreEPackage = this.ePackages.find(pkg => pkg.nsURI === 'http://www.modeling-tool.com/ecore') || this.ePackages[0];
      this.initialized = true;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initializeFromAPI();
    }
    await this.initPromise;
  }

  private async saveToStorage(changedPackageId?: string): Promise<void> {
    try {
      // Sync to API only
      if (changedPackageId) {
        const pkg = this.ePackages.find(p => p.id === changedPackageId);
        if (pkg) {
          await syncPackageToAPI(pkg);
        }
      }
    } catch (error) {
      console.error('Error saving meta-metamodel:', error);
    }
  }

  private initializeEcore(): void {
    const ecorePackage = buildEcorePackage();
    this.ePackages.push(ecorePackage);
    this.saveToStorage(ecorePackage.id);
  }

  getAllEPackages(): EPackage[] {
    return [...this.ePackages];
  }

  async getAllEPackagesAsync(): Promise<EPackage[]> {
    await this.ensureInitialized();
    return [...this.ePackages];
  }

  getEPackageById(id: string): EPackage | undefined {
    return this.ePackages.find(pkg => pkg.id === id);
  }

  async getEPackageByIdAsync(id: string): Promise<EPackage | undefined> {
    await this.ensureInitialized();
    return this.ePackages.find(pkg => pkg.id === id);
  }

  getCoreEPackage(): EPackage {
    return this.coreEPackage;
  }

  async getCoreEPackageAsync(): Promise<EPackage> {
    await this.ensureInitialized();
    return this.coreEPackage;
  }

  getEClassById(packageId: string, classId: string): EClass | undefined {
    const pkg = this.getEPackageById(packageId);
    if (!pkg) return undefined;
    return pkg.classes.find(cls => cls.id === classId);
  }

  getEClassByName(packageId: string, name: string): EClass | undefined {
    const pkg = this.getEPackageById(packageId);
    if (!pkg) return undefined;
    return pkg.classes.find(cls => cls.name === name);
  }

  createEPackage(name: string, nsURI: string, nsPrefix: string): EPackage {
    const newPackage: EPackage = {
      id: uuidv4(),
      name,
      nsURI,
      nsPrefix,
      classes: []
    };

    this.ePackages.push(newPackage);
    this.saveToStorage(newPackage.id);
    return newPackage;
  }

  createEClass(packageId: string, name: string, abstract: boolean = false): EClass | undefined {
    const pkg = this.getEPackageById(packageId);
    if (!pkg) return undefined;

    const newClass: EClass = {
      id: uuidv4(),
      name,
      abstract,
      superTypes: [],
      attributes: [],
      references: []
    };

    pkg.classes.push(newClass);
    this.saveToStorage(packageId);
    return newClass;
  }

  addEAttribute(
    packageId: string,
    classId: string,
    name: string,
    type: 'string' | 'number' | 'boolean' | 'date',
    defaultValue?: any,
    required: boolean = false,
    many: boolean = false
  ): EAttribute | undefined {
    const cls = this.getEClassById(packageId, classId);
    if (!cls) return undefined;

    const newAttribute: EAttribute = {
      id: uuidv4(),
      name,
      type,
      defaultValue,
      required,
      many
    };

    cls.attributes.push(newAttribute);
    this.saveToStorage(packageId);
    return newAttribute;
  }

  addEReference(
    packageId: string,
    classId: string,
    name: string,
    targetClassId: string,
    containment: boolean = false,
    lowerBound: number = 0,
    upperBound: number | '*' = '*',
    oppositeId?: string
  ): EReference | undefined {
    const cls = this.getEClassById(packageId, classId);
    if (!cls) return undefined;

    const newReference: EReference = {
      id: uuidv4(),
      name,
      type: targetClassId,
      containment,
      lowerBound,
      upperBound,
      opposite: oppositeId
    };

    cls.references.push(newReference);
    this.saveToStorage(packageId);
    return newReference;
  }

  updateEPackage(id: string, updates: Partial<EPackage>): boolean {
    const packageIndex = this.ePackages.findIndex(pkg => pkg.id === id);
    if (packageIndex === -1) return false;

    // Prevent changing the ID
    const { id: _, ...restUpdates } = updates;

    this.ePackages[packageIndex] = {
      ...this.ePackages[packageIndex],
      ...restUpdates
    };

    this.saveToStorage(id);
    return true;
  }

  updateEClass(packageId: string, classId: string, updates: Partial<EClass>): boolean {
    const pkg = this.getEPackageById(packageId);
    if (!pkg) return false;

    const classIndex = pkg.classes.findIndex(cls => cls.id === classId);
    if (classIndex === -1) return false;

    // Prevent changing the ID
    const { id: _, ...restUpdates } = updates;

    pkg.classes[classIndex] = {
      ...pkg.classes[classIndex],
      ...restUpdates
    };

    this.saveToStorage(packageId);
    return true;
  }

  deleteEPackage(id: string): boolean {
    // Don't allow deleting the core package
    if (id === this.coreEPackage.id) return false;

    const initialLength = this.ePackages.length;
    this.ePackages = this.ePackages.filter(pkg => pkg.id !== id);
    
    if (initialLength !== this.ePackages.length) {
      // Delete from API
      deletePackageFromAPI(id);
      return true;
    }
    
    return false;
  }

  deleteEClass(packageId: string, classId: string): boolean {
    const pkg = this.getEPackageById(packageId);
    if (!pkg) return false;

    const initialLength = pkg.classes.length;
    pkg.classes = pkg.classes.filter(cls => cls.id !== classId);
    
    if (initialLength !== pkg.classes.length) {
      // Also remove references to this class
      for (const pkgItem of this.ePackages) {
        for (const cls of pkgItem.classes) {
          // Remove from superTypes
          cls.superTypes = cls.superTypes.filter(st => st !== classId);
          
          // Update references that point to this class
          cls.references = cls.references.filter(ref => ref.type !== classId);
        }
      }
      
      this.saveToStorage(packageId);
      return true;
    }
    
    return false;
  }

  deleteEAttribute(packageId: string, classId: string, attributeId: string): boolean {
    const cls = this.getEClassById(packageId, classId);
    if (!cls) return false;

    const initialLength = cls.attributes.length;
    cls.attributes = cls.attributes.filter(attr => attr.id !== attributeId);
    
    if (initialLength !== cls.attributes.length) {
      this.saveToStorage(packageId);
      return true;
    }
    
    return false;
  }

  deleteEReference(packageId: string, classId: string, referenceId: string): boolean {
    const cls = this.getEClassById(packageId, classId);
    if (!cls) return false;

    const initialLength = cls.references.length;
    const refToDelete = cls.references.find(ref => ref.id === referenceId);
    
    cls.references = cls.references.filter(ref => ref.id !== referenceId);
    
    if (initialLength !== cls.references.length && refToDelete) {
      // If this reference has an opposite, remove the opposite reference as well
      if (refToDelete.opposite) {
        for (const pkg of this.ePackages) {
          for (const c of pkg.classes) {
            const oppositeRefIndex = c.references.findIndex(ref => ref.id === refToDelete.opposite);
            if (oppositeRefIndex !== -1) {
              c.references.splice(oppositeRefIndex, 1);
              break;
            }
          }
        }
      }
      
      this.saveToStorage(packageId);
      return true;
    }
    
    return false;
  }

  async refresh(): Promise<void> {
    await this.initializeFromAPI();
  }

  /**
   * Clear cache and re-initialize from API
   * Used when user logs in/out to ensure fresh data
   */
  async clearCacheAndReinitialize(): Promise<void> {
    console.log('MetaMetamodelService: Clearing cache and reinitializing');
    this.ePackages = [];
    this.initialized = false;
    this.initPromise = this.initializeFromAPI();
    await this.initPromise;
  }

  /**
   * Clear cache locally without making API calls
   * Used on logout to prevent 401 errors
   */
  clearCacheLocal(): void {
    console.log('MetaMetamodelService: Clearing cache locally');
    this.ePackages = [];
    this.initialized = false;
    this.initPromise = null;
  }
}

export const metaMetamodelService = new MetaMetamodelService();
