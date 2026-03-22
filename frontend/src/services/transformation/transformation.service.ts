import {
  TransformationPattern,
  TransformationRule,
  TransformationExecution,
  PatternMatch,
  TransformationStep,
  PatternElement
} from '../../models/types';
import { transformationDebugService } from './transformation-debug.service';
import { transformationApiSyncService } from './transformation-api-sync.service';
import { transformationCrudService } from './transformation-crud.service';
import { transformationCoreService } from './transformation-core.service';
import { transformationExecutionService } from './transformation-execution.service';

/**
 * Main transformation service - orchestrates all transformation functionality
 * Delegates to specialized services for different concerns
 */
class TransformationService {
  private initialized = false;
  private initPromise: Promise<{ patterns: TransformationPattern[]; rules: TransformationRule[]; executions: TransformationExecution[] }> | null = null;

  // ========== INITIALIZATION ==========
  
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    
    if (!this.initPromise) {
      this.initPromise = transformationApiSyncService.initializeFromAPI();
    }
    
    await this.initPromise;
    this.initialized = true;
  }

  // ========== PATTERN CRUD (Delegated) ==========
  
  getAllPatterns(): TransformationPattern[] {
    return transformationCrudService.getAllPatterns();
  }

  getPatternById(id: string): TransformationPattern | undefined {
    return transformationCrudService.getPatternById(id);
  }

  getPatternsByType(type: 'LHS' | 'RHS' | 'NAC'): TransformationPattern[] {
    return transformationCrudService.getPatternsByType(type);
  }

  createPattern(name: string, type: 'LHS' | 'RHS' | 'NAC'): TransformationPattern {
    const pattern = transformationCrudService.createPattern(name, type);
    transformationApiSyncService.syncPatternToAPI(pattern);
    return pattern;
  }

  updatePattern(id: string, updates: Partial<TransformationPattern>): boolean {
    const result = transformationCrudService.updatePattern(id, updates);
    if (result) {
      const pattern = transformationCrudService.getPatternById(id);
      if (pattern) {
        transformationApiSyncService.syncPatternToAPI(pattern);
      }
    }
    return result;
  }

  deletePattern(id: string): boolean {
    return transformationCrudService.deletePattern(id);
  }

  // ========== PATTERN ELEMENT MANAGEMENT (Delegated) ==========
  
  addPatternElement(
    patternId: string,
    name: string,
    type: string,
    attributes: Record<string, any> = {},
    references: Record<string, string | string[] | null> = {}
  ): PatternElement | null {
    const result = transformationCrudService.addPatternElement(
      patternId, name, type, attributes, references
    );
    if (result) {
      const pattern = transformationCrudService.getPatternById(patternId);
      if (pattern) {
        transformationApiSyncService.syncPatternToAPI(pattern);
      }
    }
    return result;
  }

  updatePatternElement(
    patternId: string,
    elementId: string,
    updates: Partial<PatternElement>
  ): boolean {
    const result = transformationCrudService.updatePatternElement(
      patternId, elementId, updates
    );
    if (result) {
      const pattern = transformationCrudService.getPatternById(patternId);
      if (pattern) {
        transformationApiSyncService.syncPatternToAPI(pattern);
      }
    }
    return result;
  }

  deletePatternElement(patternId: string, elementId: string): boolean {
    const result = transformationCrudService.deletePatternElement(
      patternId, elementId
    );
    if (result) {
      const pattern = transformationCrudService.getPatternById(patternId);
      if (pattern) {
        transformationApiSyncService.syncPatternToAPI(pattern);
      }
    }
    return result;
  }

  // ========== RULE CRUD (Delegated) ==========
  
  getAllRules(): TransformationRule[] {
    return transformationCrudService.getAllRules();
  }

  getRuleById(id: string): TransformationRule | undefined {
    return transformationCrudService.getRuleById(id);
  }

  createRule(
    name: string,
    lhsId: string = '',
    rhsId: string = '',
    nacIds: string[] = [],
    priority: number = 0
  ): TransformationRule {
    const rule = transformationCrudService.createRule(
      name, lhsId, rhsId, nacIds, priority
    );
    transformationApiSyncService.syncRuleToAPI(rule, transformationCrudService.getPatterns());
    return rule;
  }

  updateRule(id: string, updates: Partial<TransformationRule>): boolean {
    const result = transformationCrudService.updateRule(
      id, updates
    );
    if (result) {
      const rule = transformationCrudService.getRuleById(id);
      if (rule) {
        transformationApiSyncService.syncRuleToAPI(rule, transformationCrudService.getPatterns());
      }
    }
    return result;
  }

  deleteRule(id: string): boolean {
    const result = transformationCrudService.deleteRule(id);
    if (result) {
      transformationApiSyncService.syncAllToAPI(
        transformationCrudService.getPatterns(),
        transformationCrudService.getRules()
      );
    }
    return result;
  }

  // ========== EXECUTION CRUD (Delegated) ==========
  
  getAllExecutions(): TransformationExecution[] {
    return transformationCrudService.getAllExecutions();
  }

  getExecutionById(id: string): TransformationExecution | undefined {
    return transformationCrudService.getExecutionById(id);
  }

  createTransformationExecution(
    name: string,
    ruleIds: string[],
    sourceModelId: string,
    targetModelId?: string,
    inPlace: boolean = true,
    maxIterations: number = 100,
    strategy: 'sequential' | 'priority' | 'interactive' = 'sequential'
  ): TransformationExecution {
    const execution = transformationCrudService.createTransformationExecution(
      name, ruleIds, sourceModelId, targetModelId, inPlace, maxIterations, strategy
    );
    transformationApiSyncService.syncAllToAPI(
      transformationCrudService.getPatterns(),
      transformationCrudService.getRules()
    );
    return execution;
  }

  updateExecution(id: string, updates: Partial<TransformationExecution>): boolean {
    const result = transformationCrudService.updateExecution(
      id, updates
    );
    if (result) {
      transformationApiSyncService.syncAllToAPI(
        transformationCrudService.getPatterns(),
        transformationCrudService.getRules()
      );
    }
    return result;
  }

  deleteExecution(id: string): boolean {
    const result = transformationCrudService.deleteExecution(
      id
    );
    if (result) {
      transformationApiSyncService.syncAllToAPI(
        transformationCrudService.getPatterns(),
        transformationCrudService.getRules()
      );
    }
    return result;
  }

  // ========== EXPORT/IMPORT (Delegated) ==========
  
  exportRuleAsJson(ruleId: string): string | null {
    return transformationCrudService.exportRuleAsJson(ruleId);
  }

  exportAllRulesAsJson(): string | null {
    return transformationCrudService.exportAllRulesAsJson();
  }

  downloadRuleAsJsonFile(ruleId: string, filename?: string): boolean {
    return transformationCrudService.downloadRuleAsJsonFile(ruleId, filename);
  }

  downloadAllRulesAsJsonFile(filename?: string): boolean {
    return transformationCrudService.downloadAllRulesAsJsonFile(filename);
  }

  importRulesFromJson(jsonData: string): { success: boolean; rulesImported?: number; error?: string } {
    try {
      const result = transformationCrudService.importRulesFromJson(jsonData);
      if (result) {
        const importedCount = transformationCrudService.getAllRules().length;
        transformationApiSyncService.syncAllToAPI(
          transformationCrudService.getPatterns(),
          transformationCrudService.getRules()
        );
        return { success: true, rulesImported: importedCount };
      }
      return { success: false, error: 'Failed to import rules' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  downloadExecutionAsJsonFile(executionId: string, filename?: string): boolean {
    const execution = transformationCrudService.getExecutionById(executionId);
    if (!execution) return false;

    const jsonData = JSON.stringify(execution, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `execution_${executionId}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  }

  // ========== PATTERN MATCHING (Delegated) ==========
  
  findPatternMatches(patternId: string, modelId: string): PatternMatch[] {
    return transformationCoreService.findPatternMatches(patternId, modelId);
  }

  // ========== RULE APPLICATION (Delegated) ==========
  
  applyRule(
    ruleId: string,
    modelId: string,
    match: PatternMatch
  ): { success: boolean; resultModelId: string; step?: TransformationStep } {
    return transformationCoreService.applyRule(ruleId, modelId, match);
  }

  // ========== TRANSFORMATION EXECUTION (Delegated) ==========
  
  executeTransformation(executionId: string): boolean {
    return transformationExecutionService.executeTransformation(executionId);
  }

  applyRuleToDiagram(
    ruleId: string,
    diagramId: string,
    match?: PatternMatch
  ): { success: boolean, resultDiagramId: string, step?: TransformationStep } {
    return transformationExecutionService.applyRuleToDiagram(ruleId, diagramId, match);
  }

  executeDiagramTransformation(executionId: string, diagramId: string): boolean {
    return transformationExecutionService.executeDiagramTransformation(executionId, diagramId);
  }

  // ========== ASYNC GETTERS (With Initialization) ==========
  
  async getAllPatternsAsync(): Promise<TransformationPattern[]> {
    await this.ensureInitialized();
    return transformationCrudService.getAllPatterns();
  }

  async getAllRulesAsync(): Promise<TransformationRule[]> {
    await this.ensureInitialized();
    return transformationCrudService.getAllRules();
  }

  async getAllExecutionsAsync(): Promise<TransformationExecution[]> {
    await this.ensureInitialized();
    return transformationCrudService.getAllExecutions();
  }

  async refresh(): Promise<void> {
    this.initialized = false;
    this.initPromise = transformationApiSyncService.initializeFromAPI();
    await this.initPromise;
  }

  // ========== DEBUG HELPERS (Delegated - accepts any string category) ==========
  
  debug(category: string, message: string, ...args: any[]): void {
    transformationDebugService.debug(category as any, message, ...args);
  }

  debugGroup(category: string, groupName: string): void {
    transformationDebugService.debugGroup(category as any, groupName);
  }

  debugGroupEnd(category: string): void {
    transformationDebugService.debugGroupEnd(category as any);
  }

  debugError(category: string, message: string, error?: any): void {
    transformationDebugService.debugError(category as any, message, error);
  }

  // ========== CACHE MANAGEMENT ==========

  async clearCacheAndReinitialize(): Promise<void> {
    transformationCrudService.clearAll();
    this.initialized = false;
    this.initPromise = null;
    await this.ensureInitialized();
  }

  clearCacheLocal(): void {
    transformationCrudService.clearAll();
    this.initialized = false;
    this.initPromise = null;
  }

  // ========== HELPER METHODS (Delegated) ==========
  
  getMetaclassAttributeDetails(typeId: string, modelId: string): { 
    idToName: Record<string, string>, 
    nameToId: Record<string, string>,
    attributes: any[],
    referenceIdToName: Record<string, string>,
    referenceNameToId: Record<string, string>
  } {
    return transformationCoreService.getMetaclassAttributeDetails(typeId, modelId);
  }
}

export const transformationService = new TransformationService();
