import { MetaClass, Metamodel, MetaAttribute, MetaReference } from '../../models/types';
import { v4 as uuidv4 } from 'uuid';
import { metaMetamodelService } from '../metametamodel';
import { exampleDataService } from './exampleData.service';
import { apiClient, API_ENDPOINTS } from '../core';
import { migrateMetamodels } from './metamodel-migration.service';
import { syncMetamodelToAPI, saveMetamodelToAPI, deleteMetamodelFromAPI } from './metamodel-api-sync.service';
import { validateMetamodel } from './metamodel-validation.service';
import { addMetaClass, updateMetaClass, deleteMetaClass } from './metaclass-crud.service';
import { addMetaAttribute, updateMetaAttribute, deleteMetaAttribute } from './metaattribute-crud.service';
import { 
  addMetaReference, 
  updateMetaReference, 
  deleteMetaReference,
  addReferenceAttribute,
  updateReferenceAttribute,
  deleteReferenceAttribute
} from './metareference-crud.service';

class MetamodelService {
  private metamodels: Metamodel[] = [];
  private readonly STORAGE_KEY = 'obeo_like_tool_metamodels';
  private readonly EXAMPLES_LOADED_KEY = 'obeo_like_tool_examples_loaded';
  private initPromise: Promise<void> | null = null;
  private initialized: boolean = false;
  // Track which metamodels have been synced to the database
  private syncedToDb: Set<string> = new Set();
  // Track pending save operations to prevent race conditions
  private pendingSaves: Map<string, Promise<void>> = new Map();

  constructor() {
    // Start loading from API immediately
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Try to load from API first
      await this.loadFromAPI();
      
      // Load example metamodels if none exist
      if (this.metamodels.length === 0) {
        await this.loadExampleMetamodels();
      }
      
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing MetamodelService:', error);
      // API failed - start with empty state
      this.metamodels = [];
      this.initialized = true;
    }
  }

  // Wait for initialization to complete
  async waitForInit(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  private async loadExampleMetamodels(): Promise<void> {
    const exampleMetamodels = exampleDataService.getExampleMetamodels();
    
    // Get the actual core ePackage to use its real ID
    const corePackage = await metaMetamodelService.getCoreEPackageAsync();
    
    // Add example metamodels if they don't already exist
    for (const exampleMM of exampleMetamodels) {
      const exists = this.metamodels.some(mm => mm.id === exampleMM.id);
      if (!exists) {
        // Update the conformsTo field to use the actual ePackage ID from the database
        const metamodelWithCorrectRef = {
          ...exampleMM,
          conformsTo: corePackage.id, // Use the actual ePackage ID
        };
        this.metamodels.push(metamodelWithCorrectRef);
        // Save to API
        saveMetamodelToAPI(metamodelWithCorrectRef, this.syncedToDb, this.pendingSaves);
      }
    }
  }

  private async loadFromAPI(): Promise<void> {
    try {
      const data = await apiClient.get<Metamodel[]>(API_ENDPOINTS.METAMODELS);
      if (data && Array.isArray(data)) {
        this.metamodels = data;
        // Mark all loaded metamodels as synced to DB
        data.forEach(mm => this.syncedToDb.add(mm.id));
        this.migrateMetamodels();
      }
    } catch (error) {
      console.error('Error loading metamodels from API:', error);
      throw error; // Re-throw to trigger fallback
    }
  }

  private migrateMetamodels(): void {
    const corePackage = metaMetamodelService.getCoreEPackage();
    migrateMetamodels(this.metamodels, corePackage);
  }

  private saveToStorage(changedMetamodelId?: string): void {
    // Sync to API only - no localStorage
    if (changedMetamodelId) {
      const metamodel = this.metamodels.find(m => m.id === changedMetamodelId);
      if (metamodel) {
        syncMetamodelToAPI(metamodel, this.syncedToDb, this.pendingSaves);
      }
    }
  }

  getAllMetamodels(): Metamodel[] {
    return [...this.metamodels];
  }

  getMetamodelById(id: string): Metamodel | undefined {
    return this.metamodels.find(mm => mm.id === id);
  }

  createMetamodel(name: string): Metamodel {
    const corePackage = metaMetamodelService.getCoreEPackage();
    const ePackageClass = corePackage.classes.find(cls => cls.name === 'EPackage');
    
    const newMetamodel: Metamodel = {
      id: uuidv4(),
      name,
      eClass: ePackageClass ? ePackageClass.id : '',
      uri: `http://www.modeling-tool.com/${name.toLowerCase()}`,
      prefix: name.toLowerCase(),
      classes: [],
      conformsTo: corePackage.id,
      constraints: []
    };
    
    this.metamodels.push(newMetamodel);
    this.saveToStorage();
    saveMetamodelToAPI(newMetamodel, this.syncedToDb, this.pendingSaves); // Save to PostgreSQL
    return newMetamodel;
  }

  deleteMetamodel(id: string): boolean {
    const initialLength = this.metamodels.length;
    this.metamodels = this.metamodels.filter(mm => mm.id !== id);
    const result = initialLength !== this.metamodels.length;
    if (result) {
      this.saveToStorage();
      deleteMetamodelFromAPI(id); // Delete from PostgreSQL
      this.syncedToDb.delete(id); // Remove from synced tracking
    }
    return result;
  }

  addMetaClass(metamodelId: string, name: string, abstract: boolean = false): MetaClass | null {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) {
      console.error('Metamodel not found:', metamodelId);
      return null;
    }

    const corePackage = metaMetamodelService.getCoreEPackage();
    const newClass = addMetaClass(metamodel, name, abstract, corePackage);
    
    if (newClass) {
      // Save changes to storage and sync to API
      this.saveToStorage(metamodelId);
    }
    
    return newClass;
  }

  addMetaAttribute(
    metamodelId: string, 
    classId: string, 
    name: string, 
    type: 'string' | 'number' | 'boolean' | 'date', 
    defaultValue?: any,
    required?: boolean,
    many: boolean = false
  ): MetaAttribute | null {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return null;

    const corePackage = metaMetamodelService.getCoreEPackage();
    const newAttribute = addMetaAttribute(
      metamodel, 
      classId, 
      name, 
      type, 
      defaultValue, 
      required, 
      many, 
      corePackage
    );

    if (newAttribute) {
      this.saveToStorage(metamodelId);
    }

    return newAttribute;
  }

  addMetaReference(
    metamodelId: string,
    sourceClassId: string,
    name: string,
    targetClassId: string,
    containment: boolean = false,
    lowerBound: number = 0,
    upperBound: number | '*' = '*',
    opposite?: string,
    allowSelfReference: boolean = false
  ): MetaReference | null {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return null;

    const corePackage = metaMetamodelService.getCoreEPackage();
    const newReference = addMetaReference(
      metamodel,
      sourceClassId,
      name,
      targetClassId,
      containment,
      lowerBound,
      upperBound,
      opposite,
      allowSelfReference,
      corePackage
    );

    if (newReference) {
      this.saveToStorage(metamodelId);
    }

    return newReference;
  }

  // Add an attribute to a reference
  addReferenceAttribute(
    metamodelId: string,
    classId: string,
    referenceId: string,
    name: string,
    type: 'string' | 'number' | 'boolean' | 'date',
    defaultValue?: any,
    required?: boolean,
    many: boolean = false
  ): MetaAttribute | null {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return null;

    const corePackage = metaMetamodelService.getCoreEPackage();
    const newAttribute = addReferenceAttribute(
      metamodel,
      classId,
      referenceId,
      name,
      type,
      defaultValue,
      required,
      many,
      corePackage
    );

    if (newAttribute) {
      this.saveToStorage(metamodelId);
    }

    return newAttribute;
  }

  // Delete a reference attribute
  deleteReferenceAttribute(
    metamodelId: string,
    classId: string,
    referenceId: string,
    attributeId: string
  ): boolean {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return false;

    const result = deleteReferenceAttribute(metamodel, classId, referenceId, attributeId);
    
    if (result) {
      this.saveToStorage(metamodelId);
    }
    return result;
  }

  // Update a reference attribute
  updateReferenceAttribute(
    metamodelId: string,
    classId: string,
    referenceId: string,
    attributeId: string,
    updates: Partial<MetaAttribute>
  ): boolean {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return false;

    const result = updateReferenceAttribute(metamodel, classId, referenceId, attributeId, updates);

    if (result) {
      this.saveToStorage(metamodelId);
    }
    return result;
  }

  // Methods for updating and deleting classes, attributes, and references
  updateMetaClass(metamodelId: string, classId: string, updates: Partial<MetaClass>): boolean {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return false;

    const result = updateMetaClass(metamodel, classId, updates);

    if (result) {
      this.saveToStorage(metamodelId);
    }
    return result;
  }

  updateMetaAttribute(
    metamodelId: string,
    classId: string,
    attributeId: string,
    updates: Partial<MetaAttribute>
  ): boolean {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return false;

    const result = updateMetaAttribute(metamodel, classId, attributeId, updates);

    if (result) {
      this.saveToStorage(metamodelId);
    }
    return result;
  }

  updateMetaReference(
    metamodelId: string,
    classId: string,
    referenceId: string,
    updates: Partial<MetaReference>
  ): boolean {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return false;

    const result = updateMetaReference(metamodel, classId, referenceId, updates);

    if (result) {
      this.saveToStorage(metamodelId);
    }
    return result;
  }

  deleteMetaClass(metamodelId: string, classId: string): boolean {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return false;

    const result = deleteMetaClass(metamodel, classId);
    
    if (result) {
      this.saveToStorage(metamodelId);
    }
    return result;
  }

  deleteMetaAttribute(metamodelId: string, classId: string, attributeId: string): boolean {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return false;

    const result = deleteMetaAttribute(metamodel, classId, attributeId);
    
    if (result) {
      this.saveToStorage(metamodelId);
    }
    return result;
  }

  deleteMetaReference(metamodelId: string, classId: string, referenceId: string): boolean {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return false;

    const result = deleteMetaReference(metamodel, classId, referenceId);
    
    if (result) {
      this.saveToStorage(metamodelId);
    }
    return result;
  }

  // Check if a metamodel conforms to its meta-metamodel
  validateMetamodel(metamodelId: string): { valid: boolean; issues: string[] } {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) {
      return { valid: false, issues: ['Metamodel not found'] };
    }

    return validateMetamodel(metamodel);
  }

  /**
   * Update an existing metamodel
   * @param id The ID of the metamodel to update
   * @param updatedMetamodel The new metamodel data
   * @returns The updated metamodel or undefined if not found
   */
  updateMetamodel(id: string, updatedMetamodel: Metamodel): Metamodel | undefined {
    const index = this.metamodels.findIndex(m => m.id === id);
    if (index === -1) return undefined;
    
    this.metamodels[index] = updatedMetamodel;
    this.saveToStorage(id);
    return updatedMetamodel;
  }

  /**
   * Download metamodel as JSON file
   * @param metamodelId The ID of the metamodel to download
   * @returns True if download was initiated, false otherwise
   */
  downloadMetamodelAsJson(metamodelId: string): boolean {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return false;
    
    // Create a blob and trigger download
    const blob = new Blob([JSON.stringify(metamodel, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metamodel.name.replace(/\s+/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    return true;
  }

  /**
   * Clear cache and re-initialize from API
   * Used when user logs in/out to ensure fresh data
   */
  async clearCacheAndReinitialize(): Promise<void> {
    console.log('MetamodelService: Clearing cache and reinitializing');
    this.metamodels = [];
    this.syncedToDb.clear();
    this.pendingSaves.clear();
    this.initialized = false;
    this.initPromise = this.initialize();
    await this.initPromise;
  }

  /**
   * Clear cache locally without making API calls
   * Used on logout to prevent 401 errors
   */
  clearCacheLocal(): void {
    console.log('MetamodelService: Clearing cache locally');
    this.metamodels = [];
    this.syncedToDb.clear();
    this.pendingSaves.clear();
    this.initialized = false;
    this.initPromise = null;
  }
}

export const metamodelService = new MetamodelService();
