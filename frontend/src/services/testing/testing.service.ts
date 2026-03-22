import {
  Metamodel,
  Model
} from '../../models/types';
import { metamodelService } from '../metamodel';
import { modelService } from '../model';
import { apiClient, API_ENDPOINTS } from '../core';
import { TestCase, TestCoverage, TestGenerationOptions } from './testing-types';
import { generateTestCasesWithRules } from './testing-generation-rules';

class TestingService {
  private testCases: Map<string, TestCase[]> = new Map(); // modelId -> TestCases
  private readonly STORAGE_KEY = 'obeo_like_tool_test_cases';
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  // Track which test cases have been synced to the database
  private syncedToDb: Set<string> = new Set();

  constructor() {
    this.initPromise = this.initializeFromAPI();
  }

  // ── initialization & API sync ──────────────────────────────────────────

  private async initializeFromAPI(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Load from API
      const apiTestCases = await apiClient.get<any[]>(API_ENDPOINTS.TEST_CASES);
      if (apiTestCases && apiTestCases.length > 0) {
        // Group test cases by model/metamodel ID
        apiTestCases.forEach((tc: any) => {
          const modelId = tc.metamodelId || tc.modelId;
          if (modelId) {
            if (!this.testCases.has(modelId)) {
              this.testCases.set(modelId, []);
            }
            this.testCases.get(modelId)!.push(tc);
            // Mark as synced to DB
            this.syncedToDb.add(tc.id);
          }
        });
        console.log('Loaded test cases from API');
      }
      // If no API data, start with empty state - no localStorage fallback
      
      this.initialized = true;
    } catch (error) {
      console.warn('Could not load from API, starting with empty state:', error);
      // Start with empty state - no localStorage fallback
      this.testCases.clear();
      this.initialized = true;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  private async saveToStorage(changedModelId?: string): Promise<void> {
    try {
      // Sync to API only - no localStorage
      if (changedModelId) {
        const testCases = this.testCases.get(changedModelId);
        if (testCases) {
          for (const tc of testCases) {
            await this.syncTestCaseToAPI(tc, changedModelId);
          }
        }
      }
    } catch (error) {
      console.error('Error saving test cases to API:', error);
    }
  }

  private async syncTestCaseToAPI(testCase: TestCase, modelId: string): Promise<void> {
    try {
      const apiTestCase = {
        ...testCase,
        metamodelId: modelId,
      };
      
      // Check if already synced to DB
      if (this.syncedToDb.has(testCase.id)) {
        // Already in DB, use PUT to update
        await apiClient.put(`${API_ENDPOINTS.TEST_CASES}/${testCase.id}`, apiTestCase);
      } else {
        // Not in DB yet, use POST to create
        try {
          await apiClient.post(API_ENDPOINTS.TEST_CASES, apiTestCase);
          this.syncedToDb.add(testCase.id);
        } catch (e: any) {
          // If conflict (already exists), try PUT
          if (e.message?.includes('409') || e.message?.includes('conflict') || e.message?.includes('already exists')) {
            await apiClient.put(`${API_ENDPOINTS.TEST_CASES}/${testCase.id}`, apiTestCase);
            this.syncedToDb.add(testCase.id);
          } else {
            throw e;
          }
        }
      }
    } catch (error) {
      console.error('Error syncing test case to API:', error);
    }
  }

  private async syncAllToAPI(): Promise<void> {
    const entries = Array.from(this.testCases.entries());
    for (const [modelId, testCases] of entries) {
      for (const tc of testCases) {
        await this.syncTestCaseToAPI(tc, modelId);
      }
    }
  }

  // ── CRUD operations ────────────────────────────────────────────────────

  getTestCasesForModel(modelId: string): TestCase[] {
    return this.testCases.get(modelId) || [];
  }

  async getTestCasesForModelAsync(modelId: string): Promise<TestCase[]> {
    await this.ensureInitialized();
    return this.testCases.get(modelId) || [];
  }

  getTestCasesForMetamodel(metamodelId: string): TestCase[] {
    // For metamodel-based testing, we're storing test cases using the metamodel ID directly
    return this.testCases.get(metamodelId) || [];
  }

  async getTestCasesForMetamodelAsync(metamodelId: string): Promise<TestCase[]> {
    await this.ensureInitialized();
    return this.testCases.get(metamodelId) || [];
  }

  deleteTestCasesForModel(modelId: string): void {
    const testCases = this.testCases.get(modelId) || [];
    // Delete from API
    testCases.forEach(tc => {
      apiClient.delete(`${API_ENDPOINTS.TEST_CASES}/${tc.id}`).catch(console.error);
    });
    this.testCases.delete(modelId);
    this.saveToStorage();
  }

  deleteTestCasesForMetamodel(metamodelId: string): void {
    const testCases = this.testCases.get(metamodelId) || [];
    // Delete from API
    testCases.forEach(tc => {
      apiClient.delete(`${API_ENDPOINTS.TEST_CASES}/${tc.id}`).catch(console.error);
    });
    this.testCases.delete(metamodelId);
    this.saveToStorage();
  }

  async refresh(): Promise<void> {
    this.initialized = false;
    this.initPromise = this.initializeFromAPI();
    await this.initPromise;
  }

  // ── test generation (orchestration) ────────────────────────────────────

  async generateTestCases(
    modelId: string, 
    options: TestGenerationOptions
  ): Promise<TestCase[]> {
    const model = modelService.getModelById(modelId);
    if (!model) {
      throw new Error(`Model with ID ${modelId} not found`);
    }

    const metamodel = metamodelService.getMetamodelById(model.metamodelId);
    if (!metamodel) {
      throw new Error(`Metamodel with ID ${model.metamodelId} not found`);
    }

    let newTestCases: TestCase[] = [];

    newTestCases = generateTestCasesWithRules(metamodel, model, options);

    // Store the generated test cases
    this.testCases.set(modelId, newTestCases);
    this.saveToStorage(modelId);

    return newTestCases;
  }

  async generateTestCasesForMetamodel(
    metamodelId: string,
    options: TestGenerationOptions
  ): Promise<TestCase[]> {
    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      throw new Error(`Metamodel with ID ${metamodelId} not found`);
    }

    // Create a minimal model just to satisfy the required interface
    // This model is never stored, just used for the generation process
    const dummyModel: Model = {
      id: metamodelId, // Use metamodel ID as the model ID
      name: `Test Model for ${metamodel.name}`,
      conformsTo: metamodelId,
      metamodelId: metamodelId,
      elements: []
    };

    let newTestCases: TestCase[] = [];

    newTestCases = generateTestCasesWithRules(metamodel, dummyModel, options);

    // Store the generated test cases using the metamodel ID
    this.testCases.set(metamodelId, newTestCases);
    this.saveToStorage(metamodelId);

    return newTestCases;
  }

  // ── coverage calculation ───────────────────────────────────────────────

  calculateTestCoverage(modelId: string): TestCoverage {
    const testCases = this.getTestCasesForModel(modelId);
    const model = modelService.getModelById(modelId);
    
    if (!model) {
      throw new Error(`Model with ID ${modelId} not found`);
    }

    const metamodel = metamodelService.getMetamodelById(model.metamodelId);
    if (!metamodel) {
      throw new Error(`Metamodel with ID ${model.metamodelId} not found`);
    }

    // Count metamodel elements
    const allMetaClasses = metamodel.classes;
    const allAttributes = allMetaClasses.flatMap(cls => cls.attributes);
    const allReferences = allMetaClasses.flatMap(cls => cls.references);
    const allConstraints = allMetaClasses.flatMap(cls => cls.constraints || []);

    // Add global constraints if any
    const globalConstraints = metamodel.constraints || [];
    const totalConstraints = [...allConstraints, ...globalConstraints];

    // Find tested elements
    const testedMetaClassIds = new Set(testCases.map(tc => tc.targetMetaClassId));
    const testedAttributes = new Set(
      testCases
        .filter(tc => tc.type === 'attribute')
        .map(tc => `${tc.targetMetaClassId}.${tc.targetProperty}`)
    );
    const testedReferences = new Set(
      testCases
        .filter(tc => tc.type === 'reference')
        .map(tc => `${tc.targetMetaClassId}.${tc.targetProperty}`)
    );
    const testedConstraints = new Set(
      testCases
        .filter(tc => tc.type === 'constraint' && tc.constraintId)
        .map(tc => tc.constraintId as string)
    );

    // Categorize metaclasses
    const testedMetaClasses = allMetaClasses
      .filter(cls => testedMetaClassIds.has(cls.id))
      .map(cls => ({ id: cls.id, name: cls.name }));

    const untestedMetaClasses = allMetaClasses
      .filter(cls => !testedMetaClassIds.has(cls.id))
      .map(cls => ({ id: cls.id, name: cls.name }));

    return {
      totalElementsCount: allMetaClasses.length,
      testedElementsCount: testedMetaClassIds.size,
      totalAttributesCount: allAttributes.length,
      testedAttributesCount: testedAttributes.size,
      totalReferencesCount: allReferences.length,
      testedReferencesCount: testedReferences.size,
      totalConstraintsCount: totalConstraints.length,
      testedConstraintsCount: testedConstraints.size,
      testedMetaClasses,
      untestedMetaClasses
    };
  }
}

export const testGenerationService = new TestingService();
