import { v4 as uuidv4 } from 'uuid';
import {
  TransformationPattern,
  TransformationRule,
  TransformationExecution,
  PatternElement
} from '../../models/types';
import { apiClient, API_ENDPOINTS } from '../core';

/**
 * CRUD operations for patterns, rules, and executions
 * Includes export/import functionality
 */
class TransformationCrudService {
  private patterns: TransformationPattern[] = [];
  private rules: TransformationRule[] = [];
  private executions: TransformationExecution[] = [];

  // Getters for internal data (used by other services)
  getPatterns(): TransformationPattern[] {
    return this.patterns;
  }

  setPatterns(patterns: TransformationPattern[]): void {
    this.patterns = patterns;
  }

  getRules(): TransformationRule[] {
    return this.rules;
  }

  setRules(rules: TransformationRule[]): void {
    this.rules = rules;
  }

  getExecutions(): TransformationExecution[] {
    return this.executions;
  }

  setExecutions(executions: TransformationExecution[]): void {
    this.executions = executions;
  }

  // ========== PATTERN CRUD ==========
  
  getAllPatterns(): TransformationPattern[] {
    return [...this.patterns];
  }

  getPatternById(id: string): TransformationPattern | undefined {
    return this.patterns.find(p => p.id === id);
  }

  getPatternsByType(type: 'LHS' | 'RHS' | 'NAC'): TransformationPattern[] {
    return this.patterns.filter(p => p.type === type);
  }

  createPattern(name: string, type: 'LHS' | 'RHS' | 'NAC'): TransformationPattern {
    const pattern: TransformationPattern = {
      id: uuidv4(),
      name,
      type,
      elements: []
    };
    this.patterns.push(pattern);
    return pattern;
  }

  updatePattern(id: string, updates: Partial<TransformationPattern>): boolean {
    const index = this.patterns.findIndex(p => p.id === id);
    if (index === -1) return false;

    this.patterns[index] = { ...this.patterns[index], ...updates };
    return true;
  }

  deletePattern(id: string): boolean {
    const initialLength = this.patterns.length;
    this.patterns = this.patterns.filter(p => p.id !== id);
    
    // Also update any rules that reference this pattern
    if (initialLength !== this.patterns.length) {
      this.rules.forEach(rule => {
        if (rule.lhs === id) {
          rule.lhs = '';
        }
        if (rule.rhs === id) {
          rule.rhs = '';
        }
        if (rule.nacs.includes(id)) {
          rule.nacs = rule.nacs.filter(nacId => nacId !== id);
        }
      });
      // Delete from API
      apiClient.delete(`${API_ENDPOINTS.TRANSFORMATION_PATTERNS}/${id}`).catch(console.error);
      return true;
    }
    return false;
  }

  // ========== PATTERN ELEMENT MANAGEMENT ==========
  
  addPatternElement(
    patternId: string,
    name: string,
    type: string, // Metaclass ID
    attributes: Record<string, any> = {},
    references: Record<string, string | string[] | null> = {}
  ): PatternElement | null {
    console.log(`[AddPatternElement] Adding element to pattern ${patternId}`);
    console.log(`[AddPatternElement] Element name: ${name}, type: ${type}`);
    console.log(`[AddPatternElement] Element attributes:`, attributes);
    
    const pattern = this.getPatternById(patternId);
    if (!pattern) {
      console.error(`[AddPatternElement] Pattern with ID ${patternId} not found`);
      return null;
    }
    
    console.log(`[AddPatternElement] Pattern found: ${pattern.name} (${pattern.id}), type: ${pattern.type}`);

    // Calculate a default position based on number of elements
    const elementCount = pattern.elements.length;
    const defaultPosition = {
      x: 100 + (elementCount % 3) * 200,
      y: 100 + Math.floor(elementCount / 3) * 120
    };

    const element: PatternElement = {
      id: uuidv4(),
      name,
      type,
      attributes,
      references,
      constraints: [],
      position: defaultPosition // Add default position
    };
    
    console.log(`[AddPatternElement] Created element:`, element);

    pattern.elements.push(element);
    
    console.log(`[AddPatternElement] Element added successfully with ID ${element.id}`);
    return element;
  }

  updatePatternElement(
    patternId: string,
    elementId: string,
    updates: Partial<PatternElement>
  ): boolean {
    const pattern = this.getPatternById(patternId);
    if (!pattern) return false;

    const index = pattern.elements.findIndex(e => e.id === elementId);
    if (index === -1) return false;

    pattern.elements[index] = { ...pattern.elements[index], ...updates };
    return true;
  }

  deletePatternElement(patternId: string, elementId: string): boolean {
    const pattern = this.getPatternById(patternId);
    if (!pattern) return false;

    const initialLength = pattern.elements.length;
    pattern.elements = pattern.elements.filter(e => e.id !== elementId);

    // Also update references in other pattern elements
    if (initialLength !== pattern.elements.length) {
      pattern.elements.forEach(element => {
        Object.keys(element.references).forEach(refName => {
          const ref = element.references[refName];
          if (Array.isArray(ref)) {
            element.references[refName] = ref.filter(r => r !== elementId) as string[];
          } else if (ref === elementId) {
            element.references[refName] = null;
          }
        });
      });
      return true;
    }
    return false;
  }

  // ========== RULE CRUD ==========
  
  getAllRules(): TransformationRule[] {
    return [...this.rules];
  }

  getRuleById(id: string): TransformationRule | undefined {
    return this.rules.find(r => r.id === id);
  }

  createRule(
    name: string,
    lhsId: string = '',
    rhsId: string = '',
    nacIds: string[] = [],
    priority: number = 0
  ): TransformationRule {
    const rule: TransformationRule = {
      id: uuidv4(),
      name,
      lhs: lhsId,
      rhs: rhsId,
      nacs: nacIds,
      conditions: [],
      priority,
      enabled: true
    };
    this.rules.push(rule);
    return rule;
  }

  updateRule(id: string, updates: Partial<TransformationRule>): boolean {
    const index = this.rules.findIndex(r => r.id === id);
    if (index === -1) return false;

    this.rules[index] = { ...this.rules[index], ...updates };
    return true;
  }

  deleteRule(id: string): boolean {
    const initialLength = this.rules.length;
    this.rules = this.rules.filter(r => r.id !== id);
    
    // Also update any transformation executions that reference this rule
    if (initialLength !== this.rules.length) {
      this.executions.forEach(execution => {
        if (execution.ruleIds.includes(id)) {
          execution.ruleIds = execution.ruleIds.filter(ruleId => ruleId !== id);
        }
      });
      return true;
    }
    return false;
  }

  // ========== EXECUTION CRUD ==========
  
  getAllExecutions(): TransformationExecution[] {
    return [...this.executions];
  }

  getExecutionById(id: string): TransformationExecution | undefined {
    return this.executions.find(e => e.id === id);
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
    const execution: TransformationExecution = {
      id: uuidv4(),
      name,
      ruleIds,
      sourceModelId,
      targetModelId,
      inPlace,
      maxIterations,
      strategy,
      status: 'created',
      stepResults: []
    };
    this.executions.push(execution);
    return execution;
  }

  updateExecution(id: string, updates: Partial<TransformationExecution>): boolean {
    const index = this.executions.findIndex(e => e.id === id);
    if (index === -1) return false;

    this.executions[index] = { ...this.executions[index], ...updates };
    return true;
  }

  deleteExecution(id: string): boolean {
    const initialLength = this.executions.length;
    this.executions = this.executions.filter(e => e.id !== id);
    if (initialLength !== this.executions.length) {
      return true;
    }
    return false;
  }

  // ========== EXPORT/IMPORT ==========
  
  exportRuleAsJson(ruleId: string): string | null {
    const rule = this.getRuleById(ruleId);
    if (!rule) {
      console.error(`[Export] Rule with ID ${ruleId} not found`);
      return null;
    }

    try {
      // Get associated patterns
      const lhsPattern = rule.lhs ? this.getPatternById(rule.lhs) : null;
      const rhsPattern = rule.rhs ? this.getPatternById(rule.rhs) : null;
      const nacPatterns = rule.nacs.map(nacId => this.getPatternById(nacId)).filter(p => p !== undefined);

      // Create exportable object with rule and its patterns
      const exportData = {
        rule,
        patterns: {
          lhs: lhsPattern,
          rhs: rhsPattern,
          nacs: nacPatterns
        }
      };

      // Convert to pretty-printed JSON
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error(`[Export] Error exporting rule ${ruleId}:`, error);
      return null;
    }
  }

  exportAllRulesAsJson(): string | null {
    try {
      const rules = this.getAllRules();
      const patternsMap: Record<string, TransformationPattern> = {};
      
      // First collect all unique patterns used by any rule
      rules.forEach(rule => {
        if (rule.lhs) {
          const pattern = this.getPatternById(rule.lhs);
          if (pattern) patternsMap[pattern.id] = pattern;
        }
        if (rule.rhs) {
          const pattern = this.getPatternById(rule.rhs);
          if (pattern) patternsMap[pattern.id] = pattern;
        }
        rule.nacs.forEach(nacId => {
          const pattern = this.getPatternById(nacId);
          if (pattern) patternsMap[pattern.id] = pattern;
        });
      });

      // Create exportable object with all rules and patterns
      const exportData = {
        rules,
        patterns: Object.values(patternsMap)
      };

      // Convert to pretty-printed JSON
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('[Export] Error exporting all rules:', error);
      return null;
    }
  }

  downloadRuleAsJsonFile(ruleId: string, filename?: string): boolean {
    const jsonData = this.exportRuleAsJson(ruleId);
    if (!jsonData) return false;
    
    return this.downloadJsonFile(jsonData, filename || `rule_${ruleId}.json`);
  }

  downloadAllRulesAsJsonFile(filename?: string): boolean {
    const jsonData = this.exportAllRulesAsJson();
    if (!jsonData) return false;
    
    return this.downloadJsonFile(jsonData, filename || 'all_transformation_rules.json');
  }

  private downloadJsonFile(jsonData: string, filename: string): boolean {
    try {
      // Create a blob with the JSON data
      const blob = new Blob([jsonData], { type: 'application/json' });
      
      // Create a URL for the blob
      const url = URL.createObjectURL(blob);
      
      // Create a temporary anchor element
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      
      // Trigger a click on the anchor to download the file
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
      
      console.log(`[Export] Successfully downloaded ${filename}`);
      return true;
    } catch (error) {
      console.error(`[Export] Error downloading file ${filename}:`, error);
      return false;
    }
  }

  // Import rules from JSON
  importRulesFromJson(jsonData: string): boolean {
    try {
      const importData = JSON.parse(jsonData);
      
      // Handle both single rule export and all rules export formats
      if (importData.rule) {
        // Single rule import
        const { rule, patterns } = importData;
        
        // Import patterns first
        if (patterns.lhs) this.patterns.push(patterns.lhs);
        if (patterns.rhs) this.patterns.push(patterns.rhs);
        if (patterns.nacs && Array.isArray(patterns.nacs)) {
          patterns.nacs.forEach((nac: TransformationPattern) => this.patterns.push(nac));
        }
        
        // Import rule
        this.rules.push(rule);
        
        console.log(`[Import] Successfully imported rule "${rule.name}"`);
        return true;
      } else if (importData.rules && importData.patterns) {
        // All rules import
        const { rules, patterns } = importData;
        
        // Import all patterns
        patterns.forEach((pattern: TransformationPattern) => this.patterns.push(pattern));
        
        // Import all rules
        rules.forEach((rule: TransformationRule) => this.rules.push(rule));
        
        console.log(`[Import] Successfully imported ${rules.length} rules and ${patterns.length} patterns`);
        return true;
      } else {
        console.error('[Import] Invalid JSON format');
        return false;
      }
    } catch (error) {
      console.error('[Import] Error importing rules:', error);
      return false;
    }
  }

  // Clear all data
  clearAll(): void {
    this.patterns = [];
    this.rules = [];
    this.executions = [];
  }
}

export const transformationCrudService = new TransformationCrudService();
