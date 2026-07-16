import { MetaClass, Metamodel, MetaAttribute, MetaAttributeType, MetaReference, Viewpoint } from '../../models/types';
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
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    await this.initPromise;
  }

  private async loadExampleMetamodels(): Promise<void> {
    // The example bundle carries fresh per-session ids (see ExampleDataService),
    // so this account owns every row it seeds
    const exampleMetamodels = exampleDataService.getExampleMetamodels();
    const exampleViewpoints = exampleDataService.getExampleViewpoints();

    // Get the actual core ePackage to use its real ID
    const corePackage = await metaMetamodelService.getCoreEPackageAsync();

    for (const exampleMM of exampleMetamodels) {
      const exists = this.metamodels.some(mm => mm.id === exampleMM.id);
      if (exists) continue;

      // Update the conformsTo field to use the actual ePackage ID from the database
      const metamodelWithCorrectRef = {
        ...exampleMM,
        conformsTo: corePackage.id, // Use the actual ePackage ID
      };
      this.metamodels.push(metamodelWithCorrectRef);
      // Save to API, waiting so dependent example viewpoints can be persisted
      // against the created row
      saveMetamodelToAPI(metamodelWithCorrectRef, this.syncedToDb, this.pendingSaves);
      await this.pendingSaves.get(metamodelWithCorrectRef.id)?.catch(() => {});

      if (this.syncedToDb.has(metamodelWithCorrectRef.id)) {
        await this.seedExampleViewpoints(metamodelWithCorrectRef.id, exampleViewpoints);
      }
    }
  }

  private async seedExampleViewpoints(metamodelId: string, exampleViewpoints: Viewpoint[]): Promise<void> {
    const viewpointsForMetamodel = exampleViewpoints.filter(vp => vp.metamodelId === metamodelId);
    for (const viewpoint of viewpointsForMetamodel) {
      try {
        await apiClient.post(API_ENDPOINTS.VIEWPOINTS, viewpoint);
      } catch (error) {
        // Best effort: the session cache still serves the bundle viewpoints
        console.error('Error seeding example viewpoint:', error);
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

  createMetamodel(name: string, description: string = ''): Metamodel {
    const corePackage = metaMetamodelService.getCoreEPackage();
    const ePackageClass = corePackage.classes.find(cls => cls.name === 'EPackage');
    
    const newMetamodel: Metamodel = {
      id: uuidv4(),
      name,
      description,
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

  importMetamodel(metamodelData: Metamodel): Metamodel {
    if (!metamodelData.id || !metamodelData.name || !Array.isArray(metamodelData.classes)) {
      throw new Error('Invalid metamodel format');
    }

    const corePackage = metaMetamodelService.getCoreEPackage();
    const importedMetamodel: Metamodel = {
      ...metamodelData,
      conformsTo: metamodelData.conformsTo && metamodelData.conformsTo !== 'core-ecore'
        ? metamodelData.conformsTo
        : corePackage.id,
      constraints: metamodelData.constraints || []
    };

    const existingIndex = this.metamodels.findIndex(m => m.id === importedMetamodel.id);
    if (existingIndex >= 0) {
      this.metamodels[existingIndex] = importedMetamodel;
    } else {
      this.metamodels.push(importedMetamodel);
    }

    this.saveToStorage(importedMetamodel.id);
    return importedMetamodel;
  }

  async deleteMetamodel(id: string): Promise<boolean> {
    if (!this.metamodels.some(mm => mm.id === id)) {
      return false;
    }

    // Let an in-flight save settle first, otherwise its 404 fallback can
    // re-create the metamodel right after we delete it
    const pendingSave = this.pendingSaves.get(id);
    if (pendingSave) {
      await pendingSave.catch(() => {});
    }

    try {
      await deleteMetamodelFromAPI(id);
    } catch (error) {
      // A metamodel that never reached the database has nothing to delete
      // there; any other refusal (dependent models, not the owner) must keep
      // the local copy so the UI stays consistent with the server
      const missingRemotely =
        !this.syncedToDb.has(id) &&
        error instanceof Error &&
        /not found/i.test(error.message);
      if (!missingRemotely) {
        throw error;
      }
    }

    this.metamodels = this.metamodels.filter(mm => mm.id !== id);
    this.syncedToDb.delete(id);
    return true;
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
    type: MetaAttributeType,
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
    type: MetaAttributeType,
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
