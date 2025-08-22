import { v4 as uuidv4 } from 'uuid';
import { 
  TransformationPattern, 
  PatternElement,
  TransformationRule,
  TransformationExecution,
  TransformationStep,
  PatternMatch,
  Model,
  ModelElement,
  Metamodel,
  MetaClass,
  MetaReference,
  Expression,
  ExpressionType,
  DiagramElement
} from '../models/types';
import { modelService } from './model.service';
import { metamodelService } from './metamodel.service';
import { oclService } from './ocl.service';
import { jsService } from './js.service';
import { expressionService } from './expression.service';

// VF2 Algorithm Types
interface VF2Node {
  id: string;
  type: string;  // Type ID
  patternElementId?: string; // For pattern nodes, the ID of the original pattern element
  modelElementId?: string;   // For model nodes, the ID of the original model element
  attributes: Record<string, any>;
}

interface VF2Edge {
  source: string;  // ID of source node
  target: string;  // ID of target node
  referenceId: string; // ID/name of the reference
  isMultiValued: boolean;
}

interface VF2Graph {
  nodes: Map<string, VF2Node>;
  edges: Map<string, VF2Edge>; // Using a composite key: source + ":" + referenceId + ":" + target
  outEdges: Map<string, string[]>; // Mapping from node ID to outgoing edge IDs
  inEdges: Map<string, string[]>;  // Mapping from node ID to incoming edge IDs
}

interface VF2State {
  core1: Map<string, string>; // Pattern node ID to Model node ID
  core2: Map<string, string>; // Model node ID to Pattern node ID
  inM1: Set<string>;  // Pattern nodes adjacent to matched nodes
  outM1: Set<string>; // Pattern nodes from which there are edges to matched nodes
  inM2: Set<string>;  // Model nodes adjacent to matched nodes
  outM2: Set<string>; // Model nodes from which there are edges to matched nodes
  depth: number;     // Current depth in the search tree
}

class TransformationService {
  private patterns: TransformationPattern[] = [];
  private rules: TransformationRule[] = [];
  private executions: TransformationExecution[] = [];
  private readonly PATTERNS_STORAGE_KEY = 'obeo_like_tool_patterns';
  private readonly RULES_STORAGE_KEY = 'obeo_like_tool_rules';
  private readonly EXECUTIONS_STORAGE_KEY = 'obeo_like_tool_transformations';
  
  // Known attribute IDs for common attributes to ensure consistent handling
  private readonly TOKEN_ATTRIBUTE_IDS = ['tokens', 'attr-1746858426256', 'attr-1746782938809'];
  private readonly NAME_ATTRIBUTE = 'name';

  // Debug logging configuration
  private debugEnabled = true;
  private debugCategories = {
    PATTERN_MATCHING: true,
    REFERENCE_MATCHING: false,  // Disable now that cross-references are working
    VF2_ALGORITHM: false,       // Disable verbose VF2 debugging
    RULE_APPLICATION: true,
    GRAPH_CREATION: false       // Disable now that graph creation is working
  };

  private debug(category: keyof typeof this.debugCategories, message: string, data?: any) {
    if (!this.debugEnabled || !this.debugCategories[category]) return;
    
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${timestamp}] [${category}] ${message}`, data ? data : '');
  }

  private debugError(category: keyof typeof this.debugCategories, message: string, error?: any) {
    if (!this.debugEnabled || !this.debugCategories[category]) return;
    
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.error(`[${timestamp}] [${category}] ERROR: ${message}`, error ? error : '');
  }

  private debugGroup(category: keyof typeof this.debugCategories, title: string) {
    if (!this.debugEnabled || !this.debugCategories[category]) return;
    console.group(`🔍 ${title}`);
  }

  private debugGroupEnd(category: keyof typeof this.debugCategories) {
    if (!this.debugEnabled || !this.debugCategories[category]) return;
    console.groupEnd();
  }

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const storedPatterns = localStorage.getItem(this.PATTERNS_STORAGE_KEY);
      if (storedPatterns) {
        this.patterns = JSON.parse(storedPatterns);
      }

      const storedRules = localStorage.getItem(this.RULES_STORAGE_KEY);
      if (storedRules) {
        this.rules = JSON.parse(storedRules);
      }

      const storedExecutions = localStorage.getItem(this.EXECUTIONS_STORAGE_KEY);
      if (storedExecutions) {
        this.executions = JSON.parse(storedExecutions);
      }
    } catch (error) {
      console.error('Error loading transformation data:', error);
      this.patterns = [];
      this.rules = [];
      this.executions = [];
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(this.PATTERNS_STORAGE_KEY, JSON.stringify(this.patterns));
      localStorage.setItem(this.RULES_STORAGE_KEY, JSON.stringify(this.rules));
      localStorage.setItem(this.EXECUTIONS_STORAGE_KEY, JSON.stringify(this.executions));
    } catch (error) {
      console.error('Error saving transformation data:', error);
    }
  }

  // Pattern management
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
    this.saveToStorage();
    return pattern;
  }

  updatePattern(id: string, updates: Partial<TransformationPattern>): boolean {
    const index = this.patterns.findIndex(p => p.id === id);
    if (index === -1) return false;

    this.patterns[index] = { ...this.patterns[index], ...updates };
    this.saveToStorage();
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
      this.saveToStorage();
      return true;
    }
    return false;
  }

  // Pattern element management
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
    this.saveToStorage();
    
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
    this.saveToStorage();
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
      this.saveToStorage();
      return true;
    }
    return false;
  }

  // Rule management
  getAllRules(): TransformationRule[] {
    return [...this.rules];
  }

  getRuleById(id: string): TransformationRule | undefined {
    return this.rules.find(r => r.id === id);
  }

  // Export rules and patterns as JSON
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

  // Helper method to download as a file
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
    this.saveToStorage();
    return rule;
  }

  updateRule(id: string, updates: Partial<TransformationRule>): boolean {
    const index = this.rules.findIndex(r => r.id === id);
    if (index === -1) return false;

    this.rules[index] = { ...this.rules[index], ...updates };
    this.saveToStorage();
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
      this.saveToStorage();
      return true;
    }
    return false;
  }

  // Execution management
  getAllExecutions(): TransformationExecution[] {
    return [...this.executions];
  }

  getExecutionById(id: string): TransformationExecution | undefined {
    return this.executions.find(e => e.id === id);
  }

  updateExecution(id: string, updates: Partial<TransformationExecution>): boolean {
    const index = this.executions.findIndex(e => e.id === id);
    if (index === -1) return false;

    this.executions[index] = { ...this.executions[index], ...updates };
    this.saveToStorage();
    return true;
  }

  deleteExecution(id: string): boolean {
    const initialLength = this.executions.length;
    this.executions = this.executions.filter(e => e.id !== id);
    if (initialLength !== this.executions.length) {
      this.saveToStorage();
      return true;
    }
    return false;
  }

  // Transformation execution
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
    this.saveToStorage();
    return execution;
  }

  // Find pattern matches in a model using VF2 algorithm
  findPatternMatches(patternId: string, modelId: string): PatternMatch[] {
    this.debugGroup('PATTERN_MATCHING', `Pattern Matching: ${patternId} in model ${modelId}`);
    
    const pattern = this.getPatternById(patternId);
    const model = modelService.getModelById(modelId);
    
    if (!pattern || !model) {
      this.debugError('PATTERN_MATCHING', `Pattern or model not found: pattern=${patternId}, model=${modelId}`);
      this.debugGroupEnd('PATTERN_MATCHING');
      return [];
    }
    
    const metamodel = metamodelService.getMetamodelById(model.conformsTo);
    if (!metamodel) {
      this.debugError('PATTERN_MATCHING', `Metamodel not found for model ${modelId}`);
      this.debugGroupEnd('PATTERN_MATCHING');
      return [];
    }
    
    this.debug('PATTERN_MATCHING', `Pattern "${pattern.name}" has ${pattern.elements.length} elements, Model has ${model.elements.length} elements`);
    
    // Focus on reference diagnostics
    this.debugGroup('REFERENCE_MATCHING', 'Pattern Reference Analysis');
    pattern.elements.forEach(element => {
      if (element.references && Object.keys(element.references).length > 0) {
        this.debug('REFERENCE_MATCHING', `Element "${element.name}" (${element.type}) references:`, element.references);
        
        // Check reference name mappings
        const attributeInfo = this.getMetaclassAttributeDetails(element.type, modelId);
        if (Object.keys(attributeInfo.referenceIdToName).length > 0) {
          this.debug('REFERENCE_MATCHING', `Reference ID->Name mappings:`, attributeInfo.referenceIdToName);
        }
      }
    });
    this.debugGroupEnd('REFERENCE_MATCHING');
    
    try {
      // Create VF2 graph structures
      this.debug('PATTERN_MATCHING', 'Creating VF2 graphs for pattern and model');
      const patternGraph = this.createVF2Graph(pattern);
      const modelGraph = this.createVF2GraphFromModel(model);
      
      // Report graph statistics
      this.debug('PATTERN_MATCHING', `Pattern graph: ${patternGraph.nodes.size} nodes, ${patternGraph.edges.size} edges`);
      this.debug('PATTERN_MATCHING', `Model graph: ${modelGraph.nodes.size} nodes, ${modelGraph.edges.size} edges`);
      
      // Log edge details for cross-reference debugging
      if (patternGraph.edges.size > 0) {
        this.debugGroup('PATTERN_MATCHING', 'Pattern Graph Edges (Cross-References)');
        patternGraph.edges.forEach((edge, edgeId) => {
          this.debug('PATTERN_MATCHING', `Edge: ${edge.source} --[${edge.referenceId}]--> ${edge.target} (${edge.isMultiValued ? 'multi' : 'single'})`);
        });
        this.debugGroupEnd('PATTERN_MATCHING');
      }
      
      // Initialize the state
      const initialState: VF2State = {
        core1: new Map<string, string>(),
        core2: new Map<string, string>(),
        inM1: new Set<string>(),
        outM1: new Set<string>(),
        inM2: new Set<string>(),
        outM2: new Set<string>(),
        depth: 0
      };
      
      const results: PatternMatch[] = [];
      
      // Search for matches
      this.debug('PATTERN_MATCHING', 'Starting VF2 algorithm search');
      this.findAllMatchesVF2(patternGraph, modelGraph, initialState, metamodel, results, patternId);
      
      this.debug('PATTERN_MATCHING', `Found ${results.length} matches for pattern "${pattern.name}"`);
      
      // If no matches found, provide diagnostic information
      if (results.length === 0) {
        this.debugGroup('PATTERN_MATCHING', 'NO MATCHES FOUND - DIAGNOSTICS');
        this.debug('PATTERN_MATCHING', 'Possible reasons for no matches:');
        this.debug('PATTERN_MATCHING', '  1. Element types do not match between pattern and model');
        this.debug('PATTERN_MATCHING', '  2. Required attributes (name, tokens) don\'t match exactly');
        this.debug('PATTERN_MATCHING', '  3. Reference structure doesn\'t match (MOST LIKELY FOR CROSS-REFERENCES)');
        this.debug('PATTERN_MATCHING', '  4. Reference name/ID mapping issues');
        
        // For each pattern element, find potential compatible model elements
        for (const patternElement of pattern.elements) {
          const compatibleElementTypes = new Set<string>();
          
          for (const modelElement of model.elements) {
            if (this.isElementTypeCompatible(modelElement, patternElement.type, metamodel)) {
              compatibleElementTypes.add(modelElement.modelElementId);
              console.log(`  Found compatible types: pattern=${patternElement.type} (${patternElement.name}) and model=${modelElement.modelElementId} (${modelElement.style?.name || 'Unnamed'})`);
              
              // Check if attributes match for these compatible elements
              const attributesMatch = this.matchAttributes(patternElement, modelElement);
              console.log(`  Attributes match for these elements: ${attributesMatch}`);
            }
          }
          
          if (compatibleElementTypes.size === 0) {
            console.log(`  No compatible types found for pattern element ${patternElement.name} (${patternElement.type})`);
          }
        }
        
        // Check for potential reference mismatches
        console.log("\n[PatternMatching] Checking reference compatibility:");
        for (const patternElement of pattern.elements) {
          if (!patternElement.references || Object.keys(patternElement.references).length === 0) {
            console.log(`  Pattern element ${patternElement.name} has no references to match`);
            continue;
          }
          
          console.log(`  Pattern element ${patternElement.name} has references: ${JSON.stringify(patternElement.references)}`);
          
          // Get reference name mappings for this element type
          const attributeInfo = this.getMetaclassAttributeDetails(patternElement.type, modelId);
          console.log(`  Reference name mappings for element type ${patternElement.type}:`, attributeInfo.referenceIdToName);
          
          // For each reference in the pattern, check if there's a corresponding mapping
          for (const [refName, refValue] of Object.entries(patternElement.references)) {
            let possibleModelRefNames = [refName];
            
            // If reference name looks like an ID, try to find the mapped name
            if (refName.includes('-')) {
              const mappedName = attributeInfo.referenceIdToName[refName];
              if (mappedName) {
                console.log(`  Found reference ID->name mapping: ${refName} -> ${mappedName}`);
                possibleModelRefNames.push(mappedName);
              } else {
                console.log(`  Warning: Pattern reference ${refName} looks like an ID but no mapping found in metamodel`);
              }
            }
            
            console.log(`  Looking for model elements with reference named any of: ${possibleModelRefNames.join(', ')}`);
          }
          
          // Look for model elements with potentially compatible references
          for (const modelElement of model.elements) {
            if (!this.isElementTypeCompatible(modelElement, patternElement.type, metamodel)) {
              continue;
            }
            
            console.log(`  Checking model element ${modelElement.style?.name || 'Unnamed'} references: ${JSON.stringify(modelElement.references)}`);
            
            // Do a simple check for reference structure compatibility
            const patternRefNames = Object.keys(patternElement.references).filter(k => 
              patternElement.references[k] !== null && patternElement.references[k] !== undefined
            );
            
            const modelRefNames = Object.keys(modelElement.references);
            
            // Check for direct matches between pattern reference names and model reference names
            let directMatchFound = false;
            for (const patternRefName of patternRefNames) {
              // Get possible reference names (original and mapped)
              let possibleRefNames = [patternRefName];
              
              if (patternRefName.includes('-')) {
                const mappedName = attributeInfo.referenceIdToName[patternRefName];
                if (mappedName) {
                  possibleRefNames.push(mappedName);
                }
              } else {
                const mappedId = attributeInfo.referenceNameToId[patternRefName];
                if (mappedId) {
                  possibleRefNames.push(mappedId);
                }
              }
              
              // Check if any of the possible names match model reference names
              if (possibleRefNames.some(name => modelRefNames.includes(name))) {
                console.log(`  Found reference name match: pattern uses ${patternRefName}, model has matching reference`);
                directMatchFound = true;
                break;
              }
            }
            
            if (directMatchFound) {
              console.log(`  Found potential reference matches between pattern element ${patternElement.name} and model element ${modelElement.style?.name || 'Unnamed'}`);
            } else {
              console.log(`  No direct reference name matches between pattern element ${patternElement.name} and model element ${modelElement.style?.name || 'Unnamed'}`);
              
              // Check if reference structure is similar (same number of references, possibly different names)
              if (patternRefNames.length > 0 && patternRefNames.length <= modelRefNames.length) {
                console.log(`  But reference structures might be compatible (pattern has ${patternRefNames.length} refs, model has ${modelRefNames.length} refs)`);
                
                // Suggest possible reference name mappings
                for (const patternRefName of patternRefNames) {
                  console.log(`  Pattern reference '${patternRefName}' might correspond to any of model references: ${modelRefNames.join(', ')}`);
                  
                  // If it looks like an ID, print a suggestion to check metamodel
                  if (patternRefName.includes('-')) {
                    console.log(`  Suggestion: Reference '${patternRefName}' might be a reference ID, check metamodel reference mappings`);
                  }
                }
              }
            }
          }
        }
      }
              this.debugGroupEnd('PATTERN_MATCHING'); // Close any open diagnostic groups
      
      this.debugGroupEnd('PATTERN_MATCHING'); // Close main pattern matching group
      return results;
    } catch (error) {
      this.debugError('PATTERN_MATCHING', 'Error during pattern matching', error);
      this.debugGroupEnd('PATTERN_MATCHING'); // Ensure groups are closed on error
      return [];
    }
  }
  
  // Creates a VF2 graph from a transformation pattern
  private createVF2Graph(pattern: TransformationPattern): VF2Graph {
    this.debugGroup('GRAPH_CREATION', `Creating VF2 graph for pattern "${pattern.name}"`);
    
    const graph: VF2Graph = {
      nodes: new Map<string, VF2Node>(),
      edges: new Map<string, VF2Edge>(),
      outEdges: new Map<string, string[]>(),
      inEdges: new Map<string, string[]>()
    };
    
    // Add nodes
    for (const element of pattern.elements) {
      const node: VF2Node = {
        id: element.id,
        type: element.type,
        patternElementId: element.id,
        attributes: element.attributes || {}
      };
      
      graph.nodes.set(element.id, node);
      graph.outEdges.set(element.id, []);
      graph.inEdges.set(element.id, []);
      
      this.debug('GRAPH_CREATION', `Added node: ${element.name} (${element.id}) of type ${element.type}`);
    }
    
    // Add edges for references
    this.debug('GRAPH_CREATION', `Processing references for ${pattern.elements.length} elements`);
    
    for (const element of pattern.elements) {
      const sourceId = element.id;
      
      if (!element.references) {
        this.debug('GRAPH_CREATION', `Element ${element.name} has no references`);
        continue;
      }
      
      this.debug('GRAPH_CREATION', `Element ${element.name} has references:`, element.references);
      
      for (const [refName, refValue] of Object.entries(element.references)) {
        // Skip special properties and null values
        if (refName.endsWith('_bendPoints') || refName.endsWith('_attributes') || refValue === null || refValue === undefined) {
          this.debug('GRAPH_CREATION', `Skipping special/null reference: ${refName}`);
          continue;
        }
        
        if (Array.isArray(refValue)) {
          // Multi-valued references
          this.debug('GRAPH_CREATION', `Processing multi-valued reference ${refName} with targets:`, refValue);
          for (const targetId of refValue) {
            // First try direct ID match
            let actualTargetId = targetId;
            
            if (graph.nodes.has(targetId)) {
              actualTargetId = targetId;
            } else {
              // If direct match fails, try to find the target by element matching
              this.debug('GRAPH_CREATION', `Direct ID match failed for ${targetId}, trying to find by element matching`);
              
              let foundMatch = false;
              for (const potentialElement of pattern.elements) {
                // Check if this element's ID matches the target
                if (potentialElement.id === targetId) {
                  actualTargetId = potentialElement.id;
                  foundMatch = true;
                  break;
                }
                
                // Check if the target ID somehow refers to this element
                if (potentialElement.name && targetId.includes(potentialElement.name)) {
                  actualTargetId = potentialElement.id;
                  foundMatch = true;
                  this.debug('GRAPH_CREATION', `Found target by name matching: ${targetId} -> ${potentialElement.id}`);
                  break;
                }
              }
              
              if (!foundMatch) {
                this.debug('GRAPH_CREATION', `❌ Could not resolve target ${targetId} for multi-valued reference ${refName} from ${element.name}`);
                continue; // Skip this target
              }
            }
            
            // Create the edge with the resolved target ID
            const edgeId = `${sourceId}:${refName}:${actualTargetId}`;
            const edge: VF2Edge = {
              source: sourceId,
              target: actualTargetId,
              referenceId: refName,
              isMultiValued: true
            };
            
            graph.edges.set(edgeId, edge);
            
            // Update outgoing and incoming edge lists
            const outEdges = graph.outEdges.get(sourceId) || [];
            outEdges.push(edgeId);
            graph.outEdges.set(sourceId, outEdges);
            
            const inEdges = graph.inEdges.get(actualTargetId) || [];
            inEdges.push(edgeId);
            graph.inEdges.set(actualTargetId, inEdges);
            
            this.debug('GRAPH_CREATION', `✅ Created multi-valued edge: ${element.name} --[${refName}]--> ${actualTargetId}`);
          }
        } else {
          // Single-valued reference
          const targetId = refValue as string;
          this.debug('GRAPH_CREATION', `Processing single-valued reference ${refName} to target: ${targetId}`);
          
          // First try direct ID match
          let actualTargetId = targetId;
          
          if (graph.nodes.has(targetId)) {
            actualTargetId = targetId;
          } else {
            // If direct match fails, try to find the target by name
            // This handles cases where reference value might not exactly match element ID
            this.debug('GRAPH_CREATION', `Direct ID match failed for ${targetId}, trying to find by element matching`);
            
            // Try to find an element that matches this target ID by various criteria
            let foundMatch = false;
            for (const potentialElement of pattern.elements) {
              // Check if this element's ID matches the target
              if (potentialElement.id === targetId) {
                actualTargetId = potentialElement.id;
                foundMatch = true;
                break;
              }
              
              // Check if the target ID somehow refers to this element
              // (This handles potential ID format mismatches)
              if (potentialElement.name && targetId.includes(potentialElement.name)) {
                actualTargetId = potentialElement.id;
                foundMatch = true;
                this.debug('GRAPH_CREATION', `Found target by name matching: ${targetId} -> ${potentialElement.id}`);
                break;
              }
            }
            
            if (!foundMatch) {
              this.debug('GRAPH_CREATION', `❌ Could not resolve target ${targetId} for reference ${refName} from ${element.name}`);
              this.debug('GRAPH_CREATION', `Available pattern elements:`, pattern.elements.map(e => ({id: e.id, name: e.name})));
              this.debug('GRAPH_CREATION', `Available graph nodes:`, Array.from(graph.nodes.keys()));
              continue; // Skip this reference
            }
          }
          
          // Create the edge with the resolved target ID
          const edgeId = `${sourceId}:${refName}:${actualTargetId}`;
          const edge: VF2Edge = {
            source: sourceId,
            target: actualTargetId,
            referenceId: refName,
            isMultiValued: false
          };
          
          graph.edges.set(edgeId, edge);
          
          // Update outgoing and incoming edge lists
          const outEdges = graph.outEdges.get(sourceId) || [];
          outEdges.push(edgeId);
          graph.outEdges.set(sourceId, outEdges);
          
          const inEdges = graph.inEdges.get(actualTargetId) || [];
          inEdges.push(edgeId);
          graph.inEdges.set(actualTargetId, inEdges);
          
          this.debug('GRAPH_CREATION', `✅ Created single-valued edge: ${element.name} --[${refName}]--> ${actualTargetId}`);
        }
      }
    }
    
    this.debug('GRAPH_CREATION', `Pattern graph complete: ${graph.nodes.size} nodes, ${graph.edges.size} edges`);
    this.debugGroupEnd('GRAPH_CREATION');
    
    return graph;
  }
  
  // Creates a VF2 graph from a model
  private createVF2GraphFromModel(model: Model): VF2Graph {
    this.debugGroup('GRAPH_CREATION', `Creating VF2 graph for model "${model.name}"`);
    
    const graph: VF2Graph = {
      nodes: new Map<string, VF2Node>(),
      edges: new Map<string, VF2Edge>(),
      outEdges: new Map<string, string[]>(),
      inEdges: new Map<string, string[]>()
    };
    
    // Add nodes
    for (const element of model.elements) {
      const node: VF2Node = {
        id: element.id,
        type: element.modelElementId,
        modelElementId: element.id,
        attributes: element.style || {}
      };
      
      graph.nodes.set(element.id, node);
      graph.outEdges.set(element.id, []);
      graph.inEdges.set(element.id, []);
      
      this.debug('GRAPH_CREATION', `Added model node: ${element.style?.name || 'Unnamed'} (${element.id}) of type ${element.modelElementId}`);
    }
    
    // Add edges for references
    this.debug('GRAPH_CREATION', `Processing model references for ${model.elements.length} elements`);
    
    for (const element of model.elements) {
      const sourceId = element.id;
      
      if (!element.references) {
        this.debug('GRAPH_CREATION', `Model element ${element.style?.name || element.id} has no references`);
        continue;
      }
      
      this.debug('GRAPH_CREATION', `Model element ${element.style?.name || element.id} has references:`, element.references);
      
      for (const [refName, refValue] of Object.entries(element.references)) {
        if (refValue === null || refValue === undefined) continue;
        
        if (Array.isArray(refValue)) {
          // Multi-valued references
          this.debug('GRAPH_CREATION', `Processing model multi-valued reference ${refName} with targets:`, refValue);
          for (const targetId of refValue) {
            if (graph.nodes.has(targetId)) {
              const edgeId = `${sourceId}:${refName}:${targetId}`;
              const edge: VF2Edge = {
                source: sourceId,
                target: targetId,
                referenceId: refName,
                isMultiValued: true
              };
              
              graph.edges.set(edgeId, edge);
              
              // Update outgoing and incoming edge lists
              const outEdges = graph.outEdges.get(sourceId) || [];
              outEdges.push(edgeId);
              graph.outEdges.set(sourceId, outEdges);
              
              const inEdges = graph.inEdges.get(targetId) || [];
              inEdges.push(edgeId);
              graph.inEdges.set(targetId, inEdges);
              
              this.debug('GRAPH_CREATION', `✅ Created model multi-valued edge: ${element.style?.name || sourceId} --[${refName}]--> ${targetId}`);
            } else {
              this.debug('GRAPH_CREATION', `❌ Model target node ${targetId} not found for reference ${refName}`);
            }
          }
        } else {
          // Single-valued reference
          const targetId = refValue as string;
          this.debug('GRAPH_CREATION', `Processing model single-valued reference ${refName} to target: ${targetId}`);
          
          if (graph.nodes.has(targetId)) {
            const edgeId = `${sourceId}:${refName}:${targetId}`;
            const edge: VF2Edge = {
              source: sourceId,
              target: targetId,
              referenceId: refName,
              isMultiValued: false
            };
            
            graph.edges.set(edgeId, edge);
            
            // Update outgoing and incoming edge lists
            const outEdges = graph.outEdges.get(sourceId) || [];
            outEdges.push(edgeId);
            graph.outEdges.set(sourceId, outEdges);
            
            const inEdges = graph.inEdges.get(targetId) || [];
            inEdges.push(edgeId);
            graph.inEdges.set(targetId, inEdges);
            
            this.debug('GRAPH_CREATION', `✅ Created model single-valued edge: ${element.style?.name || sourceId} --[${refName}]--> ${targetId}`);
          } else {
            this.debug('GRAPH_CREATION', `❌ Model target node ${targetId} not found for reference ${refName}`);
            this.debug('GRAPH_CREATION', `Available model nodes:`, Array.from(graph.nodes.keys()));
          }
        }
      }
    }
    
    this.debug('GRAPH_CREATION', `Model graph complete: ${graph.nodes.size} nodes, ${graph.edges.size} edges`);
    this.debugGroupEnd('GRAPH_CREATION');
    
    return graph;
  }
  
  // Core VF2 algorithm for finding all pattern matches
  private findAllMatchesVF2(
    patternGraph: VF2Graph, 
    modelGraph: VF2Graph, 
    state: VF2State, 
    metamodel: Metamodel, 
    results: PatternMatch[],
    patternId: string
  ): void {
    // If all pattern nodes have been matched, we've found a complete match
    if (state.core1.size === patternGraph.nodes.size) {
      // Create a new pattern match
      const match: PatternMatch = {
        patternId,
        matches: {},
        valid: true
      };
      
      // Convert the mapping to our expected output format
      // Use old-style loop to avoid ES6 iterator issues
      const core1Entries: Array<[string, string]> = [];
      state.core1.forEach((value, key) => {
        core1Entries.push([key, value]);
      });
      
      for (let i = 0; i < core1Entries.length; i++) {
        const patternNodeId = core1Entries[i][0];
        const modelNodeId = core1Entries[i][1];
        const patternNode = patternGraph.nodes.get(patternNodeId);
        if (patternNode && patternNode.patternElementId) {
          const modelNode = modelGraph.nodes.get(modelNodeId);
          if (modelNode && modelNode.modelElementId) {
            match.matches[patternNode.patternElementId] = modelNode.modelElementId;
          }
        }
      }
      
      // Check if this match is unique (avoiding duplicates due to search path variations)
      if (!this.isDuplicateMatch(match, results)) {
        // Evaluate global expression if present
        const pattern = this.getPatternById(patternId);
        if (pattern && pattern.globalExpression) {
          // Get the model based on the modelGraph's first node's modelElementId
          const modelId = this.getModelIdFromGraphFirstNode(modelGraph);
          if (modelId) {
            const model = modelService.getModelById(modelId);
            if (model) {
              console.log('[Expression] Evaluating global expression for pattern match');
              
              // Load matched elements
              const matchedElements: Record<string, ModelElement> = {};
              
              // Create a map from pattern element IDs to the matched model elements
              for (const [patternElemId, modelElemId] of Object.entries(match.matches)) {
                console.log(`[Expression] Finding model element for pattern element ${patternElemId} -> model element ${modelElemId}`);
                const modelElem = model.elements.find(e => e.id === modelElemId);
                if (modelElem) {
                  matchedElements[patternElemId] = modelElem;
                }
              }
              
              // Create an array of pattern elements for reference
              const patternElementsArray = pattern.elements;
              console.log(`[Expression] Pattern has ${patternElementsArray.length} elements`);
              
              // Convert pattern elements array to a map indexed by ID for easier lookup
              const patternElementsById: Record<string, PatternElement> = {};
              for (const elem of patternElementsArray) {
                patternElementsById[elem.id] = elem;
                console.log(`[Expression] Pattern element: ${elem.id} (${elem.name})`);
              }
              
              // Evaluate the global expression in the context of the match
              try {
                console.log(`[Expression] Evaluating expression:`, pattern.globalExpression);
                
                const expressionResult = expressionService.evaluateExpression(
                  pattern.globalExpression,
                  {
                    patternMatch: match,
                    patternElements: patternElementsById,
                    modelElements: matchedElements,
                    allPatternElements: patternElementsArray,
                    allModelElements: model.elements
                  }
                );
                
                // If the expression evaluates to false, mark the match as invalid
                if (expressionResult === false) {
                  console.log(`[Expression] Expression evaluated to false, marking match as invalid`);
                  match.valid = false;
                } else {
                  console.log(`[Expression] Expression evaluated to: ${expressionResult}`);
                }
              } catch (error) {
                console.error('[Expression] Error evaluating global expression:', error);
                // If there's an error, we mark the match as invalid to be safe
                match.valid = false;
              }
            }
          }
        }
        
        // Only add valid matches
        if (match.valid) {
          results.push(match);
        }
      }
      return;
    }
    
    // Find the next candidate pair to match
    const candidatePairs = this.findNextCandidatePair(patternGraph, modelGraph, state);
    
    // Try each candidate pair
    for (let i = 0; i < candidatePairs.length; i++) {
      const patternNodeId = candidatePairs[i][0];
      const modelNodeId = candidatePairs[i][1];
      if (this.isFeasibleMapping(patternNodeId, modelNodeId, patternGraph, modelGraph, state, metamodel)) {
        // Clone the current state to avoid modifying it during backtracking
        const newState = this.cloneState(state);
      
        // Update the state with the new mapping
        this.updateState(newState, patternNodeId, modelNodeId, patternGraph, modelGraph);
      
        // Continue the search with the updated state
        this.findAllMatchesVF2(patternGraph, modelGraph, newState, metamodel, results, patternId);
      }
    }
  }
  
  // Helper method to get the model ID from the first node in a model graph
  private getModelIdFromGraphFirstNode(modelGraph: VF2Graph): string | null {
    // Use old-style loop to avoid ES6 iterator issues
    const nodeEntries: Array<[string, VF2Node]> = [];
    modelGraph.nodes.forEach((node, key) => {
      nodeEntries.push([key, node]);
    });
    
    for (let i = 0; i < nodeEntries.length; i++) {
      const node = nodeEntries[i][1];
      if (node.modelElementId) {
        // Find the model by querying all models
        const allModels = modelService.getAllModels();
        for (let j = 0; j < allModels.length; j++) {
          const model = allModels[j];
          if (model.elements.some(elem => elem.id === node.modelElementId)) {
            return model.id;
          }
        }
        break;
      }
    }
    return null;
  }
  
  // Find the next candidate pair to match
  private findNextCandidatePair(
    patternGraph: VF2Graph, 
    modelGraph: VF2Graph, 
    state: VF2State
  ): Array<[string, string]> {
    const candidates: Array<[string, string]> = [];
    
    // Try to use nodes adjacent to the matching
    if (state.inM1.size > 0 || state.outM1.size > 0) {
      // Choose a pattern node from inM1 or outM1
      let patternNode: string | undefined;
      
      // Prefer nodes from inM1 (in-connection constraints are more selective)
      if (state.inM1.size > 0) {
        patternNode = state.inM1.values().next().value;
      } else {
        patternNode = state.outM1.values().next().value;
      }
      
      // Find candidate model nodes
      const candidateModelNodes: string[] = [];
      
      // If pattern node is in inM1, consider model nodes in inM2
      if (patternNode && state.inM1.has(patternNode)) {
        // ES5 compatible iteration without Array.from
        const inM2Array: string[] = [];
        state.inM2.forEach((value) => {
          inM2Array.push(value);
        });
        
        for (let i = 0; i < inM2Array.length; i++) {
          const modelNode = inM2Array[i];
          if (!state.core2.has(modelNode)) {
            candidateModelNodes.push(modelNode);
          }
        }
      } 
      // If pattern node is in outM1, consider model nodes in outM2
      else if (patternNode && state.outM1.has(patternNode)) {
        // ES5 compatible iteration without Array.from
        const outM2Array: string[] = [];
        state.outM2.forEach((value) => {
          outM2Array.push(value);
        });
        
        for (let i = 0; i < outM2Array.length; i++) {
          const modelNode = outM2Array[i];
          if (!state.core2.has(modelNode)) {
            candidateModelNodes.push(modelNode);
          }
        }
      }
      
      // Create candidate pairs
      if (patternNode) {
        for (let i = 0; i < candidateModelNodes.length; i++) {
          candidates.push([patternNode, candidateModelNodes[i]]);
        }
      }
    } 
    // If no adjacent nodes, take any unmatched pattern node
    else if (state.core1.size < patternGraph.nodes.size) {
      // Find first unmatched pattern node
      let patternNode: string | undefined;
      
      // ES5 compatible iteration without Array.from
      const nodeKeys: string[] = [];
      patternGraph.nodes.forEach((_, key) => {
        nodeKeys.push(key);
      });
      
      for (let i = 0; i < nodeKeys.length; i++) {
        const nodeId = nodeKeys[i];
        if (!state.core1.has(nodeId)) {
          patternNode = nodeId;
          break;
        }
      }
      
      // Pair with all unmatched model nodes
      if (patternNode) {
        // ES5 compatible iteration without Array.from
        const modelNodeKeys: string[] = [];
        modelGraph.nodes.forEach((_, key) => {
          modelNodeKeys.push(key);
        });
        
        for (let i = 0; i < modelNodeKeys.length; i++) {
          const modelNodeId = modelNodeKeys[i];
          if (!state.core2.has(modelNodeId)) {
            candidates.push([patternNode, modelNodeId]);
          }
        }
      }
    }
    
    return candidates;
  }
  
  // Check if a mapping is feasible
  private isFeasibleMapping(
    patternNodeId: string, 
    modelNodeId: string, 
    patternGraph: VF2Graph, 
    modelGraph: VF2Graph, 
    state: VF2State,
    metamodel: Metamodel
  ): boolean {
    const patternNode = patternGraph.nodes.get(patternNodeId);
    const modelNode = modelGraph.nodes.get(modelNodeId);
    
    if (!patternNode || !modelNode) {
      return false;
    }
    
    // 1. Check node compatibility (type and attributes)
    if (!this.areNodesCompatible(patternNode, modelNode, metamodel)) {
      return false;
    }
    
    // 2. Check structural compatibility (reference structure)
    
    // Get reference mappings using the same method as reference matching
    const modelId = this.getModelIdFromGraphFirstNode(modelGraph);
    let referenceIdToName: Record<string, string> = {};
    let referenceNameToId: Record<string, string> = {};
    
    if (modelId) {
      const attributeInfo = this.getMetaclassAttributeDetails(patternNode.type, modelId);
      referenceIdToName = attributeInfo.referenceIdToName;
      referenceNameToId = attributeInfo.referenceNameToId;
      
      this.debug('VF2_ALGORITHM', `Got reference mappings for type ${patternNode.type}:`);
      this.debug('VF2_ALGORITHM', `ID->Name mappings:`, referenceIdToName);
      this.debug('VF2_ALGORITHM', `Name->ID mappings:`, referenceNameToId);
    }
    
    // Check incoming edges of pattern node
    const patternInEdges = patternGraph.inEdges.get(patternNodeId) || [];
    for (const edgeId of patternInEdges) {
      const edge = patternGraph.edges.get(edgeId);
      if (!edge) continue;
      
      const sourcePatternNodeId = edge.source;
      
      // If source node is already mapped, check if the corresponding model edge exists
      if (state.core1.has(sourcePatternNodeId)) {
        const sourceModelNodeId = state.core1.get(sourcePatternNodeId);
        if (!sourceModelNodeId) continue;
        
        // Get reference mappings for the SOURCE node type (since the reference belongs to the source)
        const sourcePatternNode = patternGraph.nodes.get(sourcePatternNodeId);
        if (!sourcePatternNode) continue;
        
        let sourceReferenceIdToName: Record<string, string> = {};
        let sourceReferenceNameToId: Record<string, string> = {};
        
        if (modelId) {
          const sourceAttributeInfo = this.getMetaclassAttributeDetails(sourcePatternNode.type, modelId);
          sourceReferenceIdToName = sourceAttributeInfo.referenceIdToName;
          sourceReferenceNameToId = sourceAttributeInfo.referenceNameToId;
        }
        
        // Get potential reference names (original and mapped)
        const originalRefId = edge.referenceId;
        const possibleRefNames = [originalRefId];
        
        // Add mapped name if available
        const mappedName = sourceReferenceIdToName[originalRefId];
        this.debug('VF2_ALGORITHM', `[INCOMING] Looking for mapping of ${originalRefId} from source type ${sourcePatternNode.type}: found ${mappedName}`);
        if (mappedName && mappedName !== originalRefId) {
          possibleRefNames.push(mappedName);
          this.debug('VF2_ALGORITHM', `[INCOMING] Added mapped name: ${mappedName}`);
        }
        
        // Add mapped ID if available (for reverse mapping)
        const mappedId = sourceReferenceNameToId[originalRefId];
        if (mappedId && mappedId !== originalRefId) {
          possibleRefNames.push(mappedId);
          this.debug('VF2_ALGORITHM', `[INCOMING] Added mapped ID: ${mappedId}`);
        }
        
        // Check if there's a matching edge in the model graph for any of the possible reference names
        let foundMatchingEdge = false;
        
        this.debug('VF2_ALGORITHM', `Checking structural compatibility for edge ${sourceModelNodeId} --[${originalRefId}]--> ${modelNodeId}`);
        this.debug('VF2_ALGORITHM', `Trying reference names: ${possibleRefNames.join(', ')}`);
        
        for (const refName of possibleRefNames) {
          if (this.hasMatchingEdge(
            sourceModelNodeId, 
            modelNodeId, 
            refName, 
            edge.isMultiValued, 
            modelGraph
          )) {
            this.debug('VF2_ALGORITHM', `✅ Found matching edge with reference name: ${refName}`);
            foundMatchingEdge = true;
            break;
          }
        }
        
        if (!foundMatchingEdge) {
          this.debug('VF2_ALGORITHM', `❌ No matching edge found for any reference name: ${possibleRefNames.join(', ')}`);
        }
        
        if (!foundMatchingEdge) {
          return false;
        }
      }
    }
    
    // Check outgoing edges of pattern node
    const patternOutEdges = patternGraph.outEdges.get(patternNodeId) || [];
    for (const edgeId of patternOutEdges) {
      const edge = patternGraph.edges.get(edgeId);
      if (!edge) continue;
      
      const targetPatternNodeId = edge.target;
      
      // If target node is already mapped, check if the corresponding model edge exists
      if (state.core1.has(targetPatternNodeId)) {
        const targetModelNodeId = state.core1.get(targetPatternNodeId);
        if (!targetModelNodeId) continue;
        
        // Get potential reference names (original and mapped)
        const originalRefId = edge.referenceId;
        const possibleRefNames = [originalRefId];
        
        // Add mapped name if available
        const mappedName = referenceIdToName[originalRefId];
        this.debug('VF2_ALGORITHM', `[OUTGOING] Looking for mapping of ${originalRefId}: found ${mappedName}`);
        if (mappedName && mappedName !== originalRefId) {
          possibleRefNames.push(mappedName);
          this.debug('VF2_ALGORITHM', `[OUTGOING] Added mapped name: ${mappedName}`);
        }
        
        // Add mapped ID if available (for reverse mapping)
        const mappedId = referenceNameToId[originalRefId];
        if (mappedId && mappedId !== originalRefId) {
          possibleRefNames.push(mappedId);
          this.debug('VF2_ALGORITHM', `[OUTGOING] Added mapped ID: ${mappedId}`);
        }
        
        // Check if there's a matching edge in the model graph for any of the possible reference names
        let foundMatchingEdge = false;
        
        this.debug('VF2_ALGORITHM', `Checking structural compatibility for outgoing edge ${modelNodeId} --[${originalRefId}]--> ${targetModelNodeId}`);
        this.debug('VF2_ALGORITHM', `Trying reference names: ${possibleRefNames.join(', ')}`);
        
        for (const refName of possibleRefNames) {
          if (this.hasMatchingEdge(
            modelNodeId, 
            targetModelNodeId, 
            refName, 
            edge.isMultiValued, 
            modelGraph
          )) {
            this.debug('VF2_ALGORITHM', `✅ Found matching outgoing edge with reference name: ${refName}`);
            foundMatchingEdge = true;
            break;
          }
        }
        
        if (!foundMatchingEdge) {
          this.debug('VF2_ALGORITHM', `❌ No matching outgoing edge found for any reference name: ${possibleRefNames.join(', ')}`);
        }
        
        if (!foundMatchingEdge) {
          return false;
        }
      }
    }
    
    return true;
  }
  
  // Check if node types and attributes are compatible
  private areNodesCompatible(patternNode: VF2Node, modelNode: VF2Node, metamodel: Metamodel): boolean {
    console.log(`[NodeCompatibility] Checking if nodes are compatible:`);
    console.log(`[NodeCompatibility] Pattern node: type=${patternNode.type}, id=${patternNode.id}`);
    console.log(`[NodeCompatibility] Model node: type=${modelNode.type}, id=${modelNode.id}`);
    
    // Check type compatibility (including inheritance)
    if (!this.isElementTypeCompatible({
      modelElementId: modelNode.type,
      id: modelNode.id,
      style: modelNode.attributes,
      references: {}
    }, patternNode.type, metamodel)) {
      console.log(`[NodeCompatibility] Type incompatible: pattern=${patternNode.type}, model=${modelNode.type}`);
      return false;
    } else {
      console.log(`[NodeCompatibility] Types are compatible`);
    }
    
    // If there are no attributes to check in the pattern, it's a match
    if (Object.keys(patternNode.attributes).length === 0) {
      console.log(`[NodeCompatibility] No attributes to check, nodes are compatible`);
      return true;
    }
    
    // Check attribute compatibility - rely on existing matchAttributes method
    const isAttributesMatch = this.matchAttributes({
      id: patternNode.id,
      name: patternNode.id,
      type: patternNode.type,
      attributes: patternNode.attributes,
      references: {}
    }, {
      id: modelNode.id,
      modelElementId: modelNode.type,
      style: modelNode.attributes,
      modelId: '', // Will be populated by matchAttributes
      references: {}
    });
    
    if (isAttributesMatch) {
      console.log(`[NodeCompatibility] Attributes match, nodes are compatible`);
    } else {
      console.log(`[NodeCompatibility] Attributes don't match, nodes are incompatible`);
    }
    
    return isAttributesMatch;
  }
  
  // Check if there's a matching edge in the model graph
  private hasMatchingEdge(
    sourceId: string, 
    targetId: string, 
    referenceId: string, 
    isMultiValued: boolean, 
    graph: VF2Graph
  ): boolean {
    this.debug('VF2_ALGORITHM', `Checking for edge: ${sourceId} --[${referenceId}]--> ${targetId} (${isMultiValued ? 'multi' : 'single'})`);
    
    // Direct check for single-valued reference
    if (!isMultiValued) {
      const edgeId = `${sourceId}:${referenceId}:${targetId}`;
      const hasEdge = graph.edges.has(edgeId);
      this.debug('VF2_ALGORITHM', `Direct edge check: ${edgeId} = ${hasEdge}`);
      return hasEdge;
    }
    
    // For multi-valued references, need to check all edges with the same source and reference
    const outEdges = graph.outEdges.get(sourceId) || [];
    this.debug('VF2_ALGORITHM', `Checking ${outEdges.length} outgoing edges from ${sourceId}`);
    
    for (const edgeId of outEdges) {
      const edge = graph.edges.get(edgeId);
      if (edge && edge.referenceId === referenceId && edge.target === targetId) {
        this.debug('VF2_ALGORITHM', `✅ Found matching multi-valued edge: ${edgeId}`);
        return true;
      }
    }
    
    this.debug('VF2_ALGORITHM', `❌ No matching edge found for ${sourceId} --[${referenceId}]--> ${targetId}`);
    return false;
  }
  
  // Clone the current state
  private cloneState(state: VF2State): VF2State {
    return {
      core1: new Map(state.core1),
      core2: new Map(state.core2),
      inM1: new Set(state.inM1),
      outM1: new Set(state.outM1),
      inM2: new Set(state.inM2),
      outM2: new Set(state.outM2),
      depth: state.depth + 1
    };
  }
  
  // Update state with a new mapping
  private updateState(
    state: VF2State, 
    patternNodeId: string, 
    modelNodeId: string, 
    patternGraph: VF2Graph, 
    modelGraph: VF2Graph
  ): void {
    // Add the mapping
    state.core1.set(patternNodeId, modelNodeId);
    state.core2.set(modelNodeId, patternNodeId);
    
    // Remove the matched nodes from the candidate sets
    state.inM1.delete(patternNodeId);
    state.outM1.delete(patternNodeId);
    state.inM2.delete(modelNodeId);
    state.outM2.delete(modelNodeId);
    
    // Update inM1 and outM1 with neighbors of patternNodeId
    for (const edgeId of (patternGraph.inEdges.get(patternNodeId) || [])) {
      const edge = patternGraph.edges.get(edgeId);
      if (edge) {
        const sourceId = edge.source;
        if (!state.core1.has(sourceId)) {
          state.inM1.add(sourceId);
        }
      }
    }
    
    for (const edgeId of (patternGraph.outEdges.get(patternNodeId) || [])) {
      const edge = patternGraph.edges.get(edgeId);
      if (edge) {
        const targetId = edge.target;
        if (!state.core1.has(targetId)) {
          state.outM1.add(targetId);
        }
      }
    }
    
    // Update inM2 and outM2 with neighbors of modelNodeId
    for (const edgeId of (modelGraph.inEdges.get(modelNodeId) || [])) {
      const edge = modelGraph.edges.get(edgeId);
      if (edge) {
        const sourceId = edge.source;
        if (!state.core2.has(sourceId)) {
          state.inM2.add(sourceId);
        }
      }
    }
    
    for (const edgeId of (modelGraph.outEdges.get(modelNodeId) || [])) {
      const edge = modelGraph.edges.get(edgeId);
      if (edge) {
        const targetId = edge.target;
        if (!state.core2.has(targetId)) {
          state.outM2.add(targetId);
        }
      }
    }
  }

  // Keep the existing helper methods for type checking, attribute matching, etc.
  private isElementTypeCompatible(
    modelElement: ModelElement, 
    patternElementTypeId: string, 
    metamodel: Metamodel
  ): boolean {
    if (modelElement.modelElementId === patternElementTypeId) {
      return true;
    }
    
    // Check if modelElement's type is a subtype of patternElementTypeId
    const modelElementType = metamodel.classes.find(c => c.id === modelElement.modelElementId);
    if (!modelElementType) {
      return false;
    }
    
    // Check supertype hierarchy
    return this.isSubtypeOf(modelElementType.id, patternElementTypeId, metamodel);
  }

  private isSubtypeOf(typeId: string, potentialSuperTypeId: string, metamodel: Metamodel): boolean {
    if (typeId === potentialSuperTypeId) {
      return true;
    }
    
    const type = metamodel.classes.find(c => c.id === typeId);
    if (!type || !type.superTypes || type.superTypes.length === 0) {
      return false;
    }
    
    return type.superTypes.some(superTypeId => 
      this.isSubtypeOf(superTypeId, potentialSuperTypeId, metamodel)
    );
  }

  // Helper function to get attribute and reference details for a metaclass
  private getMetaclassAttributeDetails(typeId: string, modelId: string): { 
    idToName: Record<string, string>, 
    nameToId: Record<string, string>,
    attributes: any[],
    referenceIdToName: Record<string, string>,
    referenceNameToId: Record<string, string>
  } {
    const result = {
      idToName: {} as Record<string, string>,
      nameToId: {} as Record<string, string>,
      attributes: [] as any[],
      referenceIdToName: {} as Record<string, string>,
      referenceNameToId: {} as Record<string, string>
    };
    
    try {
      const model = modelService.getModelById(modelId);
      if (!model) return result;
      
      const metamodel = metamodelService.getMetamodelById(model.conformsTo);
      if (!metamodel) return result;
      
      const metaclass = metamodel.classes.find(c => c.id === typeId);
      if (!metaclass) return result;
      
      result.attributes = metaclass.attributes || [];
      
      // Build mappings for attributes
      (metaclass.attributes || []).forEach(attr => {
        result.idToName[attr.id] = attr.name;
        result.nameToId[attr.name] = attr.id;
      });

      // Build mappings for references
      (metaclass.references || []).forEach(ref => {
        result.referenceIdToName[ref.id] = ref.name;
        result.referenceNameToId[ref.name] = ref.id;
      });
    } catch (error) {
      console.error('[AttributeMapping] Error getting attribute details:', error);
    }
    
    return result;
  }

  // Check if all attributes in a pattern element match a model element
  private matchAttributes(patternElement: PatternElement, modelElement: any): boolean {
    console.log('[AttributeMatching] Starting attribute matching');
    console.log('[AttributeMatching] Pattern element:', patternElement.id);
    console.log('[AttributeMatching] Pattern attributes:', patternElement.attributes);
    console.log('[AttributeMatching] Model element:', modelElement.id);
    
    // If pattern has no attributes, then it matches any element
    if (!patternElement.attributes || Object.keys(patternElement.attributes).length === 0) {
      console.log('[AttributeMatching] No pattern attributes, automatic match');
      return true;
    }
    
    console.log('[AttributeMatching] Pattern attribute keys:', Object.keys(patternElement.attributes));
    
    // For model elements, the attributes may be in either style or attributes property
    const modelAttributes = modelElement.style || (modelElement as any).attributes || {};
    console.log('[AttributeMatching] Model attributes:', modelAttributes);
    console.log('[AttributeMatching] Model attribute keys:', Object.keys(modelAttributes));
    
    // Get attribute mappings for this metamodel element
    const attributeDetails = this.getMetaclassAttributeDetails(modelElement.modelElementId, modelElement.id.split('/')[0]);
    console.log('[AttributeMatching] Attribute ID to name mapping:', attributeDetails.idToName);
    console.log('[AttributeMatching] Attribute name to ID mapping:', attributeDetails.nameToId);
    
    // Special handling for critical attributes that must match
    const criticalAttributes = ['name', ...this.TOKEN_ATTRIBUTE_IDS];
    
    // Keep track of which pattern attributes we've successfully matched
    const matchedAttributes: string[] = [];
    const attributes = patternElement.attributes || {};
    
    // Track non-empty attribute values (those that are not wildcards)
    const nonEmptyAttributes = Object.entries(attributes)
      .filter(([_, value]) => value !== '' && value !== null && value !== undefined)
      .map(([key, _]) => key);
    
    console.log('[AttributeMatching] Non-empty attributes that must match:', nonEmptyAttributes);
    
    // First pass: check for direct name matches and critical attributes
    for (const key of Object.keys(attributes)) {
      const patternValue = attributes[key];
      console.log('[AttributeMatching] Checking pattern attribute: key=' + key + ', value=' + patternValue);
      
      // Skip attributes with empty string values - they are considered wildcards
      if (patternValue === '' || patternValue === null || patternValue === undefined) {
        console.log('[AttributeMatching] Skipping empty value attribute:', key);
        matchedAttributes.push(key);
        continue;
      }
      
      // Check for a direct match in model attributes
      if (key in modelAttributes) {
        const modelValue = modelAttributes[key];
        const matches = this.areValuesEqual(patternValue, modelValue);
        
        console.log(`[AttributeMatching] Direct comparison of '${key}': pattern='${patternValue}' vs model='${modelValue}' => ${matches}`);
        
        if (matches) {
          matchedAttributes.push(key);
        } else if (criticalAttributes.includes(key)) {
          // If a critical attribute doesn't match, it's an automatic no-match
          console.log(`[AttributeMatching] Critical attribute '${key}' doesn't match: pattern='${patternValue}' vs model='${modelValue}'`);
          return false;
        } else {
          // Non-critical attribute doesn't match - but we need to check if it's required
          console.log(`[AttributeMatching] Non-critical attribute '${key}' doesn't match: pattern='${patternValue}' vs model='${modelValue}'`);
          // If this is a non-empty attribute, then this is a failed match
          if (nonEmptyAttributes.includes(key)) {
            return false;
          }
        }
        continue;
      }
      
      // If not a direct match, check if the key is actually an attribute ID that needs to be mapped
      if (key in attributeDetails.idToName) {
        const attributeName = attributeDetails.idToName[key];
        
        if (attributeName in modelAttributes) {
          const modelValue = modelAttributes[attributeName];
          const matches = this.areValuesEqual(patternValue, modelValue);
          
          console.log(`[AttributeMatching] ID-mapped comparison of '${key}' (${attributeName}): pattern='${patternValue}' vs model='${modelValue}' => ${matches}`);
          
          if (matches) {
            matchedAttributes.push(key);
          } else if (criticalAttributes.includes(attributeName)) {
            // If a critical attribute doesn't match, it's an automatic no-match
            console.log(`[AttributeMatching] Critical mapped attribute '${attributeName}' doesn't match: pattern='${patternValue}' vs model='${modelValue}'`);
            return false;
          } else {
            // Non-critical attribute doesn't match
            console.log(`[AttributeMatching] Non-critical mapped attribute '${attributeName}' doesn't match: pattern='${patternValue}' vs model='${modelValue}'`);
            // If this is a non-empty attribute, then this is a failed match
            if (nonEmptyAttributes.includes(key)) {
              return false;
            }
          }
          continue;
        }
      }
      
      // Last resort: try all model attributes to see if any have a value that matches
      console.log('[AttributeMatching] Last resort - checking all model attributes for value match');
      let foundMatchingValue = false;
      
      for (const modelKey of Object.keys(modelAttributes)) {
        const modelValue = modelAttributes[modelKey];
        if (this.areValuesEqual(patternValue, modelValue)) {
          console.log(`[AttributeMatching] Found value match for '${key}': model attribute '${modelKey}' with value '${modelValue}'`);
          matchedAttributes.push(key);
          foundMatchingValue = true;
          break;
        }
      }
      
      // If this attribute has a non-empty value but no match was found, the element doesn't match
      if (!foundMatchingValue && nonEmptyAttributes.includes(key)) {
        console.log(`[AttributeMatching] No matching attribute value found for key '${key}' with value '${patternValue}'`);
        return false;
      }
    }
    
    // Count how many non-empty attributes we've matched
    const matchedNonEmptyCount = nonEmptyAttributes.filter(attr => matchedAttributes.includes(attr)).length;
    
    // We consider it a match if we've matched all non-empty attributes
    const isMatch = matchedNonEmptyCount === nonEmptyAttributes.length;
    console.log(`[AttributeMatching] Matched ${matchedNonEmptyCount}/${nonEmptyAttributes.length} non-empty attributes`);
    
    if (isMatch) {
      console.log('[AttributeMatching] Attributes match successfully - all non-empty attributes match');
    } else {
      console.log('[AttributeMatching] Attributes don\'t match - not all non-empty attributes matched');
    }
    
    return isMatch;
  }

  /**
   * Compare an expression result with a model value
   */
  private compareExpressionResult(expressionResult: any, modelValue: any): boolean {
    // If the expression result is a boolean, use it directly as the match result
    if (typeof expressionResult === 'boolean') {
      return expressionResult;
    }
    
    // Otherwise, compare the expression result with the model value
    return String(expressionResult) === String(modelValue);
  }

  private areValuesEqual(value1: any, value2: any): boolean {
    // Try string comparison first for primitive values
    if (typeof value1 !== 'object' && typeof value2 !== 'object') {
      return String(value1) === String(value2);
    }
    
    // Handle different types of comparisons based on value type
    if (typeof value1 !== typeof value2) {
      // Special case: number and string representation of that number
      if ((typeof value1 === 'number' && typeof value2 === 'string') || 
          (typeof value1 === 'string' && typeof value2 === 'number')) {
        return String(value1) === String(value2);
      }
      return false;
    }
    
    if (typeof value1 === 'object') {
      if (Array.isArray(value1) && Array.isArray(value2)) {
        return value1.length === value2.length && 
               value1.every((v, i) => this.areValuesEqual(v, value2[i]));
      }
      
      return JSON.stringify(value1) === JSON.stringify(value2);
    }
    
    return value1 === value2;
  }

  private matchReferences(
    patternElement: PatternElement,
    modelElement: ModelElement,
    pattern: TransformationPattern,
    model: Model,
    currentMatch: PatternMatch
  ): boolean {
    this.debugGroup('REFERENCE_MATCHING', `Reference matching for pattern element "${patternElement.name}"`);
    
    // If no references to match, it's a match
    if (!patternElement.references || Object.keys(patternElement.references).length === 0) {
      this.debug('REFERENCE_MATCHING', 'No references to match - automatic match');
      this.debugGroupEnd('REFERENCE_MATCHING');
      return true;
    }
    
    this.debug('REFERENCE_MATCHING', 'Pattern element references:', patternElement.references);
    this.debug('REFERENCE_MATCHING', 'Model element references:', modelElement.references);
    
    // Get the known reference names for this element type
    const modelId = model.id;
    const attributeInfo = this.getMetaclassAttributeDetails(patternElement.type, modelId);
    this.debug('REFERENCE_MATCHING', 'Reference mappings:', {
      'ID->Name': attributeInfo.referenceIdToName,
      'Name->ID': attributeInfo.referenceNameToId
    });
    
    let allReferencesMatched = true;
    
    for (const [refName, refValue] of Object.entries(patternElement.references)) {
      // Skip null/undefined references
      if (refValue === null || refValue === undefined) {
        continue;
      }
      
      this.debugGroup('REFERENCE_MATCHING', `Checking reference "${refName}"`);
      this.debug('REFERENCE_MATCHING', `Reference value:`, refValue);
      
      // Try all possible reference names (original, ID version, name version)
      const possibleRefNames = [refName];
      
      // Check if the reference name is an ID
      if (refName.includes('-')) {
        const mappedName = attributeInfo.referenceIdToName[refName];
        if (mappedName) {
          possibleRefNames.push(mappedName);
          this.debug('REFERENCE_MATCHING', `Found ID->name mapping: ${refName} -> ${mappedName}`);
        }
      } else {
        // Check if the reference name has a known ID
        const mappedId = attributeInfo.referenceNameToId[refName];
        if (mappedId) {
          possibleRefNames.push(mappedId);
          this.debug('REFERENCE_MATCHING', `Found name->ID mapping: ${refName} -> ${mappedId}`);
        }
      }
      
      this.debug('REFERENCE_MATCHING', `Trying reference names:`, possibleRefNames);
      
      // Check references by all possible names
      let matchFound = false;
      
      for (const possibleRefName of possibleRefNames) {
        if (modelElement.references[possibleRefName] !== undefined) {
          this.debug('REFERENCE_MATCHING', `Found reference "${possibleRefName}" in model element`);
          
          const modelRefValue = modelElement.references[possibleRefName];
          
          // Check for correct reference type (single vs. multi-valued)
          if (Array.isArray(refValue)) {
            // Multi-valued reference in pattern
            if (!Array.isArray(modelRefValue)) {
              this.debug('REFERENCE_MATCHING', `Type mismatch: pattern expects array, model has single value`);
              continue; // Try other reference names
            }
            
            this.debug('REFERENCE_MATCHING', `Checking multi-valued reference targets:`, {
              patternTargets: refValue,
              modelTargets: modelRefValue,
              currentMappings: currentMatch.matches
            });
            
            // Check if all pattern references are matched
            let allReferencesMapped = true;
            for (const patternRefId of refValue) {
              // If the pattern element is already matched, check if the reference is consistent
              if (currentMatch.matches[patternRefId]) {
                const expectedModelId = currentMatch.matches[patternRefId];
                if (!modelRefValue.includes(expectedModelId)) {
                  this.debug('REFERENCE_MATCHING', `❌ Cross-reference FAILED: pattern element ${patternRefId} should map to model element ${expectedModelId}, but model reference points to ${JSON.stringify(modelRefValue)}`);
                  allReferencesMapped = false;
                  break;
                } else {
                  this.debug('REFERENCE_MATCHING', `✅ Cross-reference OK: ${patternRefId} -> ${expectedModelId}`);
                }
              } else {
                this.debug('REFERENCE_MATCHING', `⚠️ Pattern element ${patternRefId} not yet mapped - will validate later`);
              }
            }
            
            if (allReferencesMapped) {
              this.debug('REFERENCE_MATCHING', `✅ Multi-valued reference matched successfully`);
              matchFound = true;
              break; // Successfully matched this reference
            }
          } else {
            // Single-valued reference in pattern
            if (Array.isArray(modelRefValue)) {
              this.debug('REFERENCE_MATCHING', `Type mismatch: pattern expects single value, model has array`);
              continue; // Try other reference names
            }
            
            this.debug('REFERENCE_MATCHING', `Checking single-valued reference:`, {
              patternTarget: refValue,
              modelTarget: modelRefValue,
              currentMappings: currentMatch.matches
            });
            
            // If the pattern element is already matched, check if the reference is consistent
            if (typeof refValue === 'string' && currentMatch.matches[refValue]) {
              const expectedModelId = currentMatch.matches[refValue];
              if (modelRefValue === expectedModelId) {
                this.debug('REFERENCE_MATCHING', `✅ Cross-reference OK: ${refValue} -> ${expectedModelId}`);
                matchFound = true;
                break; // Successfully matched this reference
              } else {
                this.debug('REFERENCE_MATCHING', `❌ Cross-reference FAILED: pattern element ${refValue} should map to model element ${expectedModelId}, but model reference points to ${modelRefValue}`);
              }
            } else if (modelRefValue !== null) {
              // If we don't have a mapping yet, any non-null reference could potentially match
              this.debug('REFERENCE_MATCHING', `⚠️ Potential match - pattern element ${refValue} not yet mapped`);
              matchFound = true;
              break; // Successfully matched this reference
            }
          }
        }
      }
      
      if (!matchFound) {
        this.debug('REFERENCE_MATCHING', `❌ REFERENCE MATCH FAILED for "${refName}"`);
        this.debug('REFERENCE_MATCHING', `Pattern expects reference to: ${JSON.stringify(refValue)}`);
        this.debug('REFERENCE_MATCHING', `Model element has references: ${JSON.stringify(Object.keys(modelElement.references))}`);
        this.debug('REFERENCE_MATCHING', `Current element mappings: ${JSON.stringify(currentMatch.matches)}`);
        
        allReferencesMatched = false;
        this.debugGroupEnd('REFERENCE_MATCHING'); // End the reference-specific group
        break; // Exit early on first failure
      }
      
             this.debug('REFERENCE_MATCHING', `✅ Reference "${refName}" matched successfully`);
       this.debugGroupEnd('REFERENCE_MATCHING'); // End the reference-specific group
     }
    
     this.debugGroupEnd('REFERENCE_MATCHING'); // End the main reference matching group
     
     if (!allReferencesMatched) {
       this.debug('REFERENCE_MATCHING', `❌ Overall reference matching FAILED for element "${patternElement.name}"`);
       return false;
     }
     
     this.debug('REFERENCE_MATCHING', `✅ All references matched successfully for element "${patternElement.name}"`);
     return true;
  }

  // Apply transformation rule
  applyRule(
    ruleId: string, 
    modelId: string, 
    match?: PatternMatch
  ): { success: boolean, resultModelId: string, step?: TransformationStep } {
    console.log(`[RuleApplication] Attempting to apply rule ${ruleId} to model ${modelId}`);
    
    const rule = this.getRuleById(ruleId);
    if (!rule) {
      console.error(`[RuleApplication] Rule ${ruleId} not found`);
      return { success: false, resultModelId: modelId };
    }
    
    const model = modelService.getModelById(modelId);
    if (!model) {
      console.error(`[RuleApplication] Model ${modelId} not found`);
      return { success: false, resultModelId: modelId };
    }
    
    // If no match was provided, find the first match
    let currentMatch: PatternMatch;
    if (!match) {
      console.log(`[RuleApplication] No match provided, finding first match for rule ${rule.name}`);
      const matches = this.findPatternMatches(rule.lhs, modelId);
      if (matches.length === 0) {
        console.log(`[RuleApplication] No matches found for rule ${rule.name} on model ${modelId}`);
        return { success: false, resultModelId: modelId };
      }
      currentMatch = matches[0];
    } else {
      currentMatch = match;
    }
    
    // LHS pattern for reference
    const lhsPattern = this.getPatternById(rule.lhs);
    if (!lhsPattern) {
      console.error(`[RuleApplication] LHS pattern ${rule.lhs} not found`);
      return { success: false, resultModelId: modelId };
    }
    
    // RHS pattern to apply
    const rhsPattern = this.getPatternById(rule.rhs);
    if (!rhsPattern) {
      console.error(`[RuleApplication] RHS pattern ${rule.rhs} not found`);
      return { success: false, resultModelId: modelId };
    }
    
    // Check for NAC patterns
    if (rule.nacs && rule.nacs.length > 0) {
      for (const nacId of rule.nacs) {
        const nac = this.getPatternById(nacId);
        if (!nac) continue;
        
        // If any NAC matches, this rule should not be applied
        const nacMatches = this.findPatternMatches(nacId, modelId);
        if (nacMatches.length > 0) {
          console.log(`[RuleApplication] NAC ${nac.name} (${nacId}) matches, rule application blocked`);
          return { success: false, resultModelId: modelId };
        }
      }
    }
    
    // We'll use a single ID for the target model - either the same as the source model (in-place)
    // or a new model if it's an out-of-place transformation
    const targetModelId = modelId; // In-place transformation
    
    console.log(`[RuleApplication] Applying rule ${rule.name} to model ${modelId} with match:`, currentMatch);
    
    // Create mappings between LHS and RHS elements
    const lhsToRhsMapping: Record<string, string> = {};
    const lhsIdToModelId: Record<string, string> = {};
    
    // Associate LHS pattern element IDs with matched model element IDs
    for (const [patternElementId, modelElementId] of Object.entries(currentMatch.matches)) {
      // Store the mapping from LHS element ID to model element ID
      lhsIdToModelId[patternElementId] = modelElementId;
      
      // Get the element names
      const lhsElement = lhsPattern.elements.find(e => e.id === patternElementId);
      if (!lhsElement) continue;
      
      // Find corresponding RHS element by name
      const rhsElement = rhsPattern.elements.find(e => e.name === lhsElement.name);
      if (rhsElement) {
        // Create a mapping from LHS to RHS by element ID
        lhsToRhsMapping[patternElementId] = rhsElement.id;
      }
    }
    
    console.log(`[RuleApplication] Mappings established: LHS-RHS =`, lhsToRhsMapping);
    console.log(`[RuleApplication] Mappings established: LHS-Model =`, lhsIdToModelId);
    
    // Apply transformations based on the RHS pattern
    // 1. Create new elements defined in RHS but not in LHS
    // 2. Update properties of existing elements
    // 3. Delete elements that are in LHS but not in RHS
    
    // Track created/modified elements for the transformation step record
    const allAppliedElements: string[] = [];
    const allResultElements: string[] = [];
    
    // First, process the global expression if there is one
    if (rhsPattern.globalExpression) {
      console.log(`[RuleApplication] Processing global expression:`, rhsPattern.globalExpression);
      
      // Create a mapping from pattern elements to model element IDs for reference in the expression
      const patternIdMap: Record<string, PatternElement> = {};
      lhsPattern.elements.forEach(element => {
        patternIdMap[element.id] = element;
      });
      
      // Apply the global expression to the matched elements
      try {
        // Create a context for expression evaluation
        const context = {
          patternMatch: currentMatch,
          patternElements: patternIdMap,
          modelElements: currentMatch.matches,
          allPatternElements: lhsPattern.elements,
          allModelElements: model.elements
        };
        
        // Try to infer the target element and attribute
        const target = this.inferExpressionTarget(rhsPattern.globalExpression, {
          patternElements: patternIdMap,
          modelElements: currentMatch.matches
        });
        
        if (target) {
          // We have a target element and attribute to update
          const { elementName, attributeName } = target;
          
          // Find the model element ID based on pattern element name
          let modelElementIds: string[] = [];
          
          // Try to find the element by name in the pattern
          const patternElement = lhsPattern.elements.find(el => el.name === elementName);
          if (patternElement) {
            const modelElementId = currentMatch.matches[patternElement.id];
            if (modelElementId) {
              modelElementIds = [modelElementId];
            }
          }
          
          // If we couldn't find it by pattern element, try to find it directly in the model
          if (modelElementIds.length === 0) {
            modelElementIds = model.elements
              .filter(el => (el.style?.name === elementName || (el as any).attributes?.name === elementName))
              .map(el => el.id);
          }
          
          for (const elementId of modelElementIds) {
            console.log(`[RuleApplication] Found target element ${elementId} for attribute ${attributeName}`);
            
            const element = model.elements.find(el => el.id === elementId);
            if (!element) continue;
            
            // Get the current value of the attribute
            const attributes = element.style || (element as any).attributes || {};
            const currentValue = attributes[attributeName];
            
            // For subtract operation, we want to actually calculate the result based on the current value
            if (typeof rhsPattern.globalExpression !== 'string' && 
                rhsPattern.globalExpression.operator === 'SUBTRACT' && 
                rhsPattern.globalExpression.rightOperand) {
              
              const rightOperand = rhsPattern.globalExpression.rightOperand;
              let subtractBy = 1;
              
              if (rightOperand.type === 'LITERAL' && rightOperand.value) {
                subtractBy = parseFloat(rightOperand.value as string) || 1;
              }
              
              const numericCurrentValue = parseFloat(currentValue as string) || 0;
              const newValue = Math.max(0, numericCurrentValue - subtractBy);
              
              console.log(`[RuleApplication] Applying SUBTRACT operation to ${elementId}.${attributeName}: ${numericCurrentValue} - ${subtractBy} = ${newValue}`);
              
              // Update the element's attribute - ensure we're using the correct attribute name
              // and not creating a new attribute with a UUID name
              if (attributes[attributeName] !== undefined) {
                // Only update if the attribute already exists
                modelService.updateModelElementProperties(
                  modelId,
                  elementId,
                  { [attributeName]: newValue.toString() }
                );
                
                // Record that we modified this element
                allAppliedElements.push(elementId);
                allResultElements.push(elementId);
              } else {
                console.warn(`[RuleApplication] Attribute ${attributeName} not found on element ${elementId}, skipping update`);
              }
            }
          }
        }
      } catch (error) {
        console.error(`[RuleApplication] Error applying global expression:`, error);
      }
    }
    
    // Identify elements to delete (in LHS but not in RHS)
    const elementsToDelete: string[] = [];
    
    // Find LHS elements that don't have a corresponding RHS element
    for (const lhsElement of lhsPattern.elements) {
      // Skip if this LHS element has a corresponding RHS element
      if (lhsToRhsMapping[lhsElement.id]) {
        continue;
      }
      
      // Find the model element ID for this LHS element
      const modelElementId = lhsIdToModelId[lhsElement.id];
      if (modelElementId) {
        elementsToDelete.push(modelElementId);
      }
    }
    
    // Delete all the identified elements
    for (const elementId of elementsToDelete) {
      console.log(`[RuleApplication] Deleting element ${elementId}`);
      modelService.deleteModelElement(modelId, elementId);
      allAppliedElements.push(elementId);
    }
    
    // Update attributes of existing elements based on the RHS pattern
    for (const [lhsElementId, rhsElementId] of Object.entries(lhsToRhsMapping)) {
      // Get the model element ID corresponding to this LHS element
      const modelElementId = lhsIdToModelId[lhsElementId];
      if (!modelElementId) continue;
      
      // Get the RHS element to apply its attributes
      const rhsElement = rhsPattern.elements.find(e => e.id === rhsElementId);
      if (!rhsElement || !rhsElement.attributes) continue;
      
      console.log(`[RuleApplication] Updating element ${modelElementId} with attributes from RHS element ${rhsElementId}`);
      
      // Get the model element to ensure we only update existing attributes
      const modelElement = model.elements.find(el => el.id === modelElementId);
      if (!modelElement) continue;
      
      // Filter out attributes that don't exist in the model element
      // to prevent creating new attributes with UUID-like names
      const existingAttributes = modelElement.style || {};
      const validAttributes: Record<string, any> = {};
      
      // Only copy attributes that already exist in the model element
      Object.entries(rhsElement.attributes).forEach(([key, value]) => {
        if (existingAttributes[key] !== undefined || key === 'name') {
          validAttributes[key] = value;
        } else {
          console.warn(`[RuleApplication] Skipping attribute ${key} as it doesn't exist in model element ${modelElementId}`);
        }
      });
      
      // Update the element's attributes with only the valid ones
      modelService.updateModelElementProperties(
        targetModelId,
        modelElementId,
        validAttributes
      );
      
      // Add to applied and result elements
      allAppliedElements.push(modelElementId);
      allResultElements.push(modelElementId);
    }
    
    // Create new elements that exist in RHS but don't have a corresponding element in LHS
    const rhsElementIdsWithMapping = Object.values(lhsToRhsMapping);
    const newRhsElements = rhsPattern.elements.filter(e => !rhsElementIdsWithMapping.includes(e.id));
    
    console.log(`[RuleApplication] Found ${newRhsElements.length} new elements to create from RHS pattern`);
    
    for (const rhsElement of newRhsElements) {
      console.log(`[RuleApplication] Creating new element from RHS: ${rhsElement.name} (${rhsElement.type})`);
      
      // Create attribute object for the new element, avoiding using internal pattern names as model element names
      const newElementAttributes: Record<string, any> = { ...rhsElement.attributes };
      
      // Only set the name from pattern element if 'name' is explicitly set in the attributes
      // otherwise don't copy the internal name/id to the model element
      if (!rhsElement.attributes || !rhsElement.attributes.name) {
        delete newElementAttributes.name;
      }
      
      // Create the new element in the target model
      const newElement = modelService.addModelElement(
        targetModelId,
        rhsElement.type,
        newElementAttributes
      );
      
      if (newElement) {
        console.log(`[RuleApplication] Created new element with ID: ${newElement.id}`);
        
        // Add to result elements
        allResultElements.push(newElement.id);
      } else {
        console.error(`[RuleApplication] Failed to create new element ${rhsElement.name} of type ${rhsElement.type}`);
      }
    }
    
    // Process references - handle creation, deletion, and modification of references
    console.log(`[RuleApplication] Processing references between matched elements`);
    
    // First, get all model elements and their references
    const modelElements = model.elements;
    
    // Go through each LHS element and compare its references with its RHS counterpart
    for (const [lhsElementId, rhsElementId] of Object.entries(lhsToRhsMapping)) {
      const lhsElement = lhsPattern.elements.find(e => e.id === lhsElementId);
      const rhsElement = rhsPattern.elements.find(e => e.id === rhsElementId);
      const modelElementId = lhsIdToModelId[lhsElementId];
      
      if (!lhsElement || !rhsElement || !modelElementId) continue;
      
      const modelElement = modelElements.find(e => e.id === modelElementId);
      if (!modelElement) continue;
      
      console.log(`[RuleApplication] Processing references for model element ${modelElement.id}`);
      
      // Get reference name mappings for this model element type
      const attributeInfo = this.getMetaclassAttributeDetails(lhsElement.type, modelId);
      
      // First, handle reference deletions
      // If a reference exists in LHS but not in RHS, or has a different value in RHS, it should be modified/deleted
      if (lhsElement.references && Object.keys(lhsElement.references).length > 0) {
        for (const [lhsRefName, lhsRefValue] of Object.entries(lhsElement.references)) {
          // Skip null references temporarily - we'll handle them separately to account for null->value transitions
          if (lhsRefValue === null) continue;
          
          // Find possible reference names in the model based on metamodel mappings
          let modelRefNames = [lhsRefName];
          
          // Add mapped name if it's an ID reference
          if (lhsRefName.includes('-')) {
            const mappedName = attributeInfo.referenceIdToName[lhsRefName];
            if (mappedName) {
              modelRefNames.push(mappedName);
            }
          }
          
          // Check each possible reference name
          for (const modelRefName of modelRefNames) {
            // If this reference exists in the model element
            if (modelElement.references && modelElement.references[modelRefName] !== undefined) {
              // Check if it exists in RHS with the same value
              let rhsHasRef = false;
              let rhsRefValue = null;
              let rhsRefName = null;
              
              if (rhsElement.references) {
                // Check if RHS has this reference with the same value
                if (rhsElement.references[lhsRefName] !== undefined) {
                  rhsHasRef = true;
                  rhsRefValue = rhsElement.references[lhsRefName];
                  rhsRefName = lhsRefName;
                } else {
                  // Check other possible reference names in RHS
                  for (const [candidateRhsRefName, candidateRhsRefVal] of Object.entries(rhsElement.references)) {
                    if (modelRefNames.includes(candidateRhsRefName)) {
                      rhsHasRef = true;
                      rhsRefValue = candidateRhsRefVal;
                      rhsRefName = candidateRhsRefName;
                      break;
                    }
                  }
                }
              }
              
              // If reference doesn't exist in RHS, or has a different value, update it
              if (!rhsHasRef) {
                console.log(`[RuleApplication] Reference '${modelRefName}' exists in LHS but not in RHS - removing it`);
                // Remove the reference by setting to null or empty array
                if (Array.isArray(modelElement.references[modelRefName])) {
                  modelService.setModelElementReference(
                    modelId, // Use the actual model ID
                    modelElementId,
                    modelRefName, 
                    []
                  );
                } else {
                  modelService.setModelElementReference(
                    modelId, // Use the actual model ID
                    modelElementId, 
                    modelRefName, 
                    null
                  );
                }
                allAppliedElements.push(modelElementId);
              } else if (rhsRefValue !== null) {
                // Check if the reference values are different by comparing by name rather than ID
                const referencesAreDifferent = !this.areReferencesEqual(lhsRefValue, rhsRefValue, lhsPattern, rhsPattern);
                
                // If values are different, update with the RHS value
                if (referencesAreDifferent) {
                  console.log(`[RuleApplication] Reference '${modelRefName}' has a different value in RHS - updating`);
                  
                  // Handle multi-valued or single-valued references
                  const isMultiValued = Array.isArray(rhsRefValue);
                  
                  if (isMultiValued) {
                    // Handle multi-valued references
                    const newRefValues: string[] = [];
                    for (const rhsRefTarget of rhsRefValue) {
                      // Find RHS element this points to
                      const targetRhsElement = rhsPattern.elements.find(e => e.id === rhsRefTarget);
                      if (targetRhsElement) {
                        // Find corresponding LHS element with same name
                        const targetLhsElement = lhsPattern.elements.find(e => e.name === targetRhsElement.name);
                        if (targetLhsElement) {
                          // Find model element
                          const modelRefTargetId = lhsIdToModelId[targetLhsElement.id];
                          if (modelRefTargetId) {
                            newRefValues.push(modelRefTargetId);
                          }
                        } else {
                          // This is a new element in RHS - find it in created elements
                          const newModelElement = model.elements.find(e => 
                            e.style?.name === targetRhsElement.name || 
                            (e as any).attributes?.name === targetRhsElement.name
                          );
                          if (newModelElement) {
                            newRefValues.push(newModelElement.id);
                          }
                        }
                      }
                    }
                    
                    if (newRefValues.length > 0 || (Array.isArray(lhsRefValue) && lhsRefValue.length > 0)) {
                      console.log(`[RuleApplication] Updating multi-valued reference '${modelRefName}' to [${newRefValues.join(', ')}]`);
                      try {
                        modelService.setModelElementReference(
                          modelId, // Use the actual model ID
                          modelElementId,
                          modelRefName,
                          newRefValues
                        );
                        console.log(`[RuleApplication] Successfully updated multi-valued reference '${modelRefName}'`);
                        allAppliedElements.push(modelElementId);
                      } catch (error) {
                        console.error(`[RuleApplication] Failed to update multi-valued reference:`, error);
                      }
                    }
                  } else {
                    // Handle single-valued reference
                    const rhsRefTarget = rhsRefValue as string;
                    
                    // Find RHS element this points to
                    const targetRhsElement = rhsPattern.elements.find(e => e.id === rhsRefTarget);
                    if (targetRhsElement) {
                      // Find corresponding LHS element with same name
                      const targetLhsElement = lhsPattern.elements.find(e => e.name === targetRhsElement.name);
                      let targetModelId = null;
                      
                      if (targetLhsElement) {
                        // Find model element
                        targetModelId = lhsIdToModelId[targetLhsElement.id];
                      } else {
                        // This is a new element in RHS - find it in created elements
                        const newModelElement = model.elements.find(e => 
                          e.style?.name === targetRhsElement.name || 
                          (e as any).attributes?.name === targetRhsElement.name
                        );
                        if (newModelElement) {
                          targetModelId = newModelElement.id;
                        }
                      }
                      
                      if (targetModelId) {
                        console.log(`[RuleApplication] Updating single-valued reference '${modelRefName}' to ${targetModelId}`);
                        try {
                          modelService.setModelElementReference(
                            modelId, // Use the actual model ID
                            modelElementId,
                            modelRefName,
                            targetModelId
                          );
                          console.log(`[RuleApplication] Successfully updated single-valued reference '${modelRefName}'`);
                          allAppliedElements.push(modelElementId);
                        } catch (error) {
                          console.error(`[RuleApplication] Failed to update single-valued reference:`, error);
                        }
                      }
                    }
                  }
                } else {
                  console.log(`[RuleApplication] Reference '${modelRefName}' has the same value in RHS - no update needed`);
                }
              } else {
                console.log(`[RuleApplication] Reference '${modelRefName}' exists in both LHS and RHS with null value - no update needed`);
              }
            }
          }
        }
      }
      
      // Now handle null references in LHS that have values in RHS (null -> value transitions)
      if (lhsElement.references && rhsElement.references) {
        for (const [lhsRefName, lhsRefValue] of Object.entries(lhsElement.references)) {
          // Only process null references here
          if (lhsRefValue !== null) continue;
          
          // Find possible model reference names from LHS reference name
          let modelRefNames = [lhsRefName];
          
          // Add mapped name if it's an ID reference
          if (lhsRefName.includes('-')) {
            const mappedName = attributeInfo.referenceIdToName[lhsRefName];
            if (mappedName) {
              modelRefNames.push(mappedName);
            }
          }
          
          // Check if there's a corresponding reference in model element
          let modelRefName = null;
          
          // First look for existing reference names in the model
          if (modelElement.references) {
            for (const existingRefName of Object.keys(modelElement.references)) {
              if (modelRefNames.includes(existingRefName)) {
                modelRefName = existingRefName;
                break;
              }
            }
          }
          
          // If no existing reference found, use the preferred name (mapped human-readable name if available)
          if (!modelRefName) {
            if (lhsRefName.includes('-') && modelRefNames.length > 1) {
              modelRefName = modelRefNames[1]; // Use mapped name
            } else {
              modelRefName = lhsRefName; // Use original name
            }
          }
          
          // Check if this reference has a non-null value in RHS
          let rhsRefName = null;
          let rhsRefValue = null;
          
          // First check if the same reference name exists in RHS
          if (rhsElement.references[lhsRefName] !== undefined && rhsElement.references[lhsRefName] !== null) {
            rhsRefName = lhsRefName;
            rhsRefValue = rhsElement.references[lhsRefName];
          } else {
            // Try to find a matching reference in RHS by name
            for (const modelName of modelRefNames) {
              if (rhsElement.references[modelName] !== undefined && rhsElement.references[modelName] !== null) {
                rhsRefName = modelName;
                rhsRefValue = rhsElement.references[modelName];
                break;
              }
            }
          }
          
          // If a matching reference with non-null value is found in RHS, update the model
          if (rhsRefName && rhsRefValue !== null) {
            console.log(`[RuleApplication] Reference '${modelRefName}' changes from null in LHS to non-null in RHS - updating`);
            
            // Handle multi-valued or single-valued references
            if (Array.isArray(rhsRefValue)) {
              // Multi-valued reference
              const newRefValues: string[] = [];
              for (const rhsRefTarget of rhsRefValue) {
                // Find corresponding LHS element by following RHS element's mapping
                const targetRhsElement = rhsPattern.elements.find(e => e.id === rhsRefTarget);
                if (targetRhsElement) {
                  // Find LHS element with same name
                  const targetLhsElement = lhsPattern.elements.find(e => e.name === targetRhsElement.name);
                  if (targetLhsElement) {
                    // Find model element
                    const targetModelId = lhsIdToModelId[targetLhsElement.id];
                    if (targetModelId) {
                      newRefValues.push(targetModelId);
                    }
                  } else {
                    // This is a new element in RHS - find it in created elements
                    const newModelElement = model.elements.find(e => 
                      e.style?.name === targetRhsElement.name || 
                      (e as any).attributes?.name === targetRhsElement.name
                    );
                    if (newModelElement) {
                      newRefValues.push(newModelElement.id);
                    }
                  }
                }
              }
              
              if (newRefValues.length > 0) {
                console.log(`[RuleApplication] Updating null reference '${modelRefName}' to multi-valued [${newRefValues.join(', ')}]`);
                try {
                  modelService.setModelElementReference(
                    modelId, // Use the actual model ID
                    modelElementId,
                    modelRefName,
                    newRefValues
                  );
                  console.log(`[RuleApplication] Successfully updated null reference to multi-valued`);
                  allAppliedElements.push(modelElementId);
                } catch (error) {
                  console.error(`[RuleApplication] Failed to update null to multi-valued reference:`, error);
                }
              }
            } else {
              // Handle single-valued references
              const rhsRefTarget = rhsRefValue as string;
              
              // Find RHS element this points to
              const targetRhsElement = rhsPattern.elements.find(e => e.id === rhsRefTarget);
              if (targetRhsElement) {
                // Find corresponding LHS element with same name
                const targetLhsElement = lhsPattern.elements.find(e => e.name === targetRhsElement.name);
                if (targetLhsElement) {
                  // Find model element
                  const targetModelId = lhsIdToModelId[targetLhsElement.id];
                  if (targetModelId) {
                    console.log(`[RuleApplication] Updating null reference '${modelRefName}' to ${targetModelId}`);
                    try {
                      modelService.setModelElementReference(
                        modelId, // Use the actual model ID
                        modelElementId,
                        modelRefName,
                        targetModelId
                      );
                      console.log(`[RuleApplication] Successfully updated null reference to single-valued`);
                      allAppliedElements.push(modelElementId);
                    } catch (error) {
                      console.error(`[RuleApplication] Failed to update null to single-valued reference:`, error);
                    }
                  }
                } else {
                  // This is a new element in RHS - find it in created elements
                  const newModelElement = model.elements.find(e => 
                    e.style?.name === targetRhsElement.name || 
                    (e as any).attributes?.name === targetRhsElement.name
                  );
                  if (newModelElement) {
                    const targetModelId = newModelElement.id;
                    console.log(`[RuleApplication] Updating null reference '${modelRefName}' to ${targetModelId} (new element)`);
                    try {
                      modelService.setModelElementReference(
                        modelId, // Use the actual model ID
                        modelElementId,
                        modelRefName,
                        targetModelId
                      );
                      console.log(`[RuleApplication] Successfully updated null reference to single-valued (new element)`);
                      allAppliedElements.push(modelElementId);
                    } catch (error) {
                      console.error(`[RuleApplication] Failed to update null to single-valued reference (new element):`, error);
                    }
                  }
                }
              }
            }
          }
        }
      }
      
      // Now handle reference creations - references in RHS that don't exist in LHS
      if (rhsElement.references && Object.keys(rhsElement.references).length > 0) {
        for (const [rhsRefName, rhsRefValue] of Object.entries(rhsElement.references)) {
          // Skip null references
          if (rhsRefValue === null) continue;
          
          // Find possible reference names in the model
          let modelRefNames = [rhsRefName];
          
          // Add mapped name if it's an ID reference
          if (rhsRefName.includes('-')) {
            const mappedName = attributeInfo.referenceIdToName[rhsRefName];
            if (mappedName) {
              modelRefNames.push(mappedName);
            }
          }
          
          console.log(`[RuleApplication] Processing potential new RHS reference '${rhsRefName}' with value:`, rhsRefValue);
          
          // Check if this reference (or a corresponding one) exists in LHS
          let lhsHasRef = false;
          
          if (lhsElement.references) {
            // First check direct name match
            if (lhsElement.references[rhsRefName] !== undefined) {
              lhsHasRef = true;
              console.log(`[RuleApplication] Reference '${rhsRefName}' already exists in LHS with direct match`);
            } else {
              // Check if any reference name in LHS matches any possible model reference name
              for (const lhsRefName of Object.keys(lhsElement.references)) {
                // Check if this LHS reference name could map to any of our potential model reference names
                if (modelRefNames.includes(lhsRefName)) {
                  lhsHasRef = true;
                  console.log(`[RuleApplication] Reference '${rhsRefName}' already exists in LHS as '${lhsRefName}'`);
                  break;
                }
                
                // Also try to map LHS reference names to IDs or human-readable names
                if (lhsRefName.includes('-')) {
                  // This is an ID, check if it maps to a name that matches
                  const mappedName = attributeInfo.referenceIdToName[lhsRefName];
                  if (mappedName && modelRefNames.includes(mappedName)) {
                    lhsHasRef = true;
                    console.log(`[RuleApplication] Reference '${rhsRefName}' already exists in LHS as '${lhsRefName}' (ID -> ${mappedName})`);
                    break;
                  }
                } else {
                  // This is a name, check if it maps to an ID that matches
                  const mappedId = attributeInfo.referenceNameToId[lhsRefName];
                  if (mappedId && modelRefNames.includes(mappedId)) {
                    lhsHasRef = true;
                    console.log(`[RuleApplication] Reference '${rhsRefName}' already exists in LHS as '${lhsRefName}' (name -> ${mappedId})`);
                    break;
                  }
                }
              }
            }
          }
          
          // Check if this reference is in the model
          let modelHasRef = false;
          let matchingModelRefName = null;
          
          if (modelElement.references) {
            for (const modelRefName of Object.keys(modelElement.references)) {
              if (modelRefNames.includes(modelRefName)) {
                modelHasRef = true;
                matchingModelRefName = modelRefName;
                console.log(`[RuleApplication] Found matching reference in model: ${modelRefName}`);
                break;
              }
            }
          }
          
          // For completely new references only in RHS (not in LHS)
          if (!lhsHasRef) {
            console.log(`[RuleApplication] Creating totally new reference (not in LHS): ${rhsRefName}`);
            
            // Find the most appropriate reference name to use
            // Priority 1: Existing reference name in the model element
            // Priority 2: Human-readable name from metamodel mapping
            // Priority 3: Original reference name from RHS
            let modelRefName = rhsRefName;
            
            // Check if any reference names already exist in the model element
            if (modelHasRef && matchingModelRefName) {
              // Use existing reference name in the model
              modelRefName = matchingModelRefName;
              console.log(`[RuleApplication] Using existing model reference name '${modelRefName}' instead of '${rhsRefName}'`);
            } else if (modelRefName === rhsRefName && rhsRefName.includes('-') && modelRefNames.length > 1) {
              // If no existing reference name found but we have a mapped name from ID, prefer that
              // Use the mapped human-readable name
              modelRefName = modelRefNames[1];
              console.log(`[RuleApplication] Using mapped reference name '${modelRefName}' instead of ID '${rhsRefName}'`);
            }
            
            // Handle different reference types (multi-valued or single-valued)
            if (Array.isArray(rhsRefValue)) {
              // Multi-valued reference
              const newRefValues: string[] = [];
              
              for (const rhsRefTarget of rhsRefValue) {
                // Find RHS element this points to
                const targetRhsElement = rhsPattern.elements.find(e => e.id === rhsRefTarget);
                if (targetRhsElement) {
                  // Find corresponding LHS element with same name
                  const targetLhsElement = lhsPattern.elements.find(e => e.name === targetRhsElement.name);
                  if (targetLhsElement) {
                    // Find model element
                    const modelRefTargetId = lhsIdToModelId[targetLhsElement.id];
                    if (modelRefTargetId) {
                      newRefValues.push(modelRefTargetId);
                    }
                  } else {
                    // This is a new element in RHS - find it in created elements
                    const newModelElement = model.elements.find(e => 
                      e.style?.name === targetRhsElement.name || 
                      (e as any).attributes?.name === targetRhsElement.name
                    );
                    if (newModelElement) {
                      newRefValues.push(newModelElement.id);
                    }
                  }
                }
              }
              
              if (newRefValues.length > 0) {
                console.log(`[RuleApplication] Creating new multi-valued reference '${modelRefName}' = [${newRefValues.join(', ')}]`);
                try {
                  modelService.setModelElementReference(
                    modelId, // Use the actual model ID
                    modelElementId,
                    modelRefName,
                    newRefValues
                  );
                  console.log(`[RuleApplication] Successfully created new multi-valued reference`);
                  allAppliedElements.push(modelElementId);
                } catch (error) {
                  console.error(`[RuleApplication] Failed to create new multi-valued reference:`, error);
                }
              }
            } else {
              // Single-valued reference
              const rhsRefTarget = rhsRefValue as string;
              
              // Find RHS element this points to
              const targetRhsElement = rhsPattern.elements.find(e => e.id === rhsRefTarget);
              if (targetRhsElement) {
                // Find corresponding LHS element with same name
                const targetLhsElement = lhsPattern.elements.find(e => e.name === targetRhsElement.name);
                let targetModelId = null;
                
                if (targetLhsElement) {
                  // Find model element
                  targetModelId = lhsIdToModelId[targetLhsElement.id];
                } else {
                  // This is a new element in RHS - find it in created elements
                  const newModelElement = model.elements.find(e => 
                    e.style?.name === targetRhsElement.name || 
                    (e as any).attributes?.name === targetRhsElement.name
                  );
                  if (newModelElement) {
                    targetModelId = newModelElement.id;
                  }
                }
                
                if (targetModelId) {
                  console.log(`[RuleApplication] Creating new single-valued reference '${modelRefName}' = ${targetModelId}`);
                  try {
                    modelService.setModelElementReference(
                      modelId, // Use the actual model ID
                      modelElementId,
                      modelRefName,
                      targetModelId
                    );
                    console.log(`[RuleApplication] Successfully created new single-valued reference`);
                    allAppliedElements.push(modelElementId);
                  } catch (error) {
                    console.error(`[RuleApplication] Failed to create new single-valued reference:`, error);
                  }
                }
              }
            }
          } else {
            console.log(`[RuleApplication] Not creating reference '${rhsRefName}' because it exists in LHS`);
          }
        }
      }
    }
    
    // Add to the aggregate results
    allAppliedElements.push(...[]);  // No additional applied elements in this version
    allResultElements.push(...[]);   // No additional result elements in this version
        
    // Create a transformation step record for all matches combined
    const step: TransformationStep = {
      id: uuidv4(),
      ruleId: ruleId,
      appliedElements: allAppliedElements,
      resultElements: allResultElements,
      timestamp: Date.now(),
      success: true
    };

    return { success: true, resultModelId: targetModelId, step };
  }

  private createTargetModel(sourceModel: Model): Model {
    console.log(`[CreateTargetModel] Creating transformed model from source model ${sourceModel.id}`);
    
    // Create a new model based on the source model
    const targetModel = modelService.createModel(
      `${sourceModel.name}_transformed`,
      sourceModel.conformsTo
    );
    console.log(`[CreateTargetModel] Created target model ${targetModel.id}`);
    
    // Create a map to keep track of old ID to new ID mapping
    const idMapping: Record<string, string> = {};
    
    // Step 1: Create all elements with their properties
    console.log(`[CreateTargetModel] Step 1: Creating all elements`);
    for (const element of sourceModel.elements) {
      console.log(`[CreateTargetModel] Creating element corresponding to source element ${element.id}`);
      
      // Create a deep copy of the style object
      const styleCopy = JSON.parse(JSON.stringify(element.style));
      
      // Preserve positions for visual consistency between original and transformed model
      if (element.style.position) {
        styleCopy.position = { ...element.style.position };
      }
      
      // Add the element to the target model
      const newElement = modelService.addModelElement(
        targetModel.id,
        element.modelElementId,
        styleCopy
      );
      
      if (newElement) {
        // Store the mapping from old ID to new ID
        idMapping[element.id] = newElement.id;
        console.log(`[CreateTargetModel] Created element ${newElement.id} -> mapped from ${element.id}`);
      } else {
        console.error(`[CreateTargetModel] Failed to create element corresponding to ${element.id}`);
      }
    }
    
    // Step 2: Set up all references using the ID mapping
    console.log(`[CreateTargetModel] Step 2: Setting up all references`);
    for (const element of sourceModel.elements) {
      const newElementId = idMapping[element.id];
      
      if (!newElementId) {
        console.warn(`[CreateTargetModel] No mapped element found for ${element.id}, skipping references`);
        continue;
      }
      
      console.log(`[CreateTargetModel] Setting up references for element ${newElementId} (from ${element.id})`);
      
      // If there are no references, initialize as empty object but don't write to model
      if (!element.references || Object.keys(element.references).length === 0) {
        console.log(`[CreateTargetModel] No references to copy for element ${element.id}`);
        continue;
      }
      
      // Process all references defined in the source element
      for (const [refName, refValue] of Object.entries(element.references)) {
        console.log(`[CreateTargetModel] Processing reference '${refName}' with value:`, refValue);
        
        if (refValue === null || refValue === undefined) {
          // Explicitly set null references
          console.log(`[CreateTargetModel] Setting null reference '${refName}' for ${newElementId}`);
          modelService.setModelElementReference(
            targetModel.id,
            newElementId,
            refName,
            null
          );
          continue;
        }
        
        if (Array.isArray(refValue)) {
          // For multi-valued references
          if (refValue.length === 0) {
            // Preserve empty arrays
            console.log(`[CreateTargetModel] Setting empty array for reference '${refName}' for ${newElementId}`);
            modelService.setModelElementReference(
              targetModel.id,
              newElementId,
              refName,
              []
            );
            continue;
          }
          
          const newRefValues: string[] = [];
          
          // Map each old ID to new ID
          for (const oldId of refValue) {
            const newId = idMapping[oldId];
            if (newId) {
              newRefValues.push(newId);
              console.log(`[CreateTargetModel] Mapped reference ${oldId} -> ${newId} for '${refName}'`);
            } else {
              console.warn(`[CreateTargetModel] Could not map reference ${oldId} for '${refName}', reference will be lost`);
            }
          }
          
          // Set the reference even if empty (to preserve reference existence)
          console.log(`[CreateTargetModel] Setting multi-valued reference '${refName}' for ${newElementId} to [${newRefValues.join(', ')}]`);
          modelService.setModelElementReference(
            targetModel.id,
            newElementId,
            refName,
            newRefValues
          );
        } else {
          // For single-valued references
          const newRefValue = idMapping[refValue as string];
          
          if (newRefValue) {
            console.log(`[CreateTargetModel] Setting single-valued reference '${refName}' for ${newElementId} to ${newRefValue}`);
            modelService.setModelElementReference(
              targetModel.id,
              newElementId,
              refName,
              newRefValue
            );
          } else {
            // If we can't map the reference target, set to null to preserve the reference key
            console.warn(`[CreateTargetModel] Could not map reference ${refValue} for '${refName}', setting to null`);
            modelService.setModelElementReference(
              targetModel.id,
              newElementId,
              refName,
              null
            );
          }
        }
      }
    }
    
    return targetModel;
  }

  // Execute transformation workflow
  executeTransformation(executionId: string): boolean {
    const execution = this.executions.find(e => e.id === executionId);
    if (!execution) return false;

    const sourceModel = modelService.getModelById(execution.sourceModelId);
    if (!sourceModel) {
      console.error(`[Transformation] Source model ${execution.sourceModelId} not found`);
      return false;
    }

    execution.status = 'in_progress';
    execution.stepResults = [];
    this.saveToStorage();

    try {
      // Prepare target model
      let targetModelId: string;
      const isInPlace = execution.inPlace;
      
      if (isInPlace) {
        // Use the source model directly for in-place transformations
        console.log(`[Transformation] Using in-place transformation on model ${sourceModel.id}`);
        targetModelId = execution.sourceModelId;
      } else {
        // Create a new model as a copy of the source model
        console.log(`[Transformation] Creating new model as copy of ${sourceModel.id}`);
        const targetModel = this.createTargetModel(sourceModel);
        targetModelId = targetModel.id;
        
        // Save the resultModelId in the execution
        execution.resultModelId = targetModelId;
        this.updateExecution(execution.id, { resultModelId: targetModelId });
      }

      // Execute rules based on strategy - allow multiple applications of the same rule
      // Remove the limit of 1 application per rule
      let iterations = 0;
      let ruleApplied = true;

      // Keep track of which rule indices we've already tried in this iteration
      // Using indices instead of rule IDs allows the same rule to appear multiple times
      const appliedRuleIndices = new Set<number>();

      while (ruleApplied && iterations < execution.maxIterations) {
        ruleApplied = false;
        iterations++;

        // Get rules to execute in this iteration
        const ruleIds = this.prepareRuleExecutionOrder(execution);

        // Try each rule in order
        for (let i = 0; i < ruleIds.length; i++) {
          // Skip rule indices we've already tried in this iteration
          if (appliedRuleIndices.has(i)) continue;
          
          const ruleId = ruleIds[i];
          const rule = this.getRuleById(ruleId);
          if (!rule || !rule.enabled) continue;

          console.log(`[Transformation] Applying rule ${rule.name} (${rule.id}) to model ${targetModelId}`);
          
          // Find all matches for this rule
          const matches = this.findPatternMatches(rule.lhs, targetModelId);
          console.log(`[Transformation] Found ${matches.length} matches for rule ${rule.name}`);
          
          let anyMatchApplied = false;
          
          // Apply the rule for each match (but stop after first successful application)
          for (const match of matches) {
            // Apply the rule
            const result = this.applyRule(ruleId, targetModelId, match);
          
            if (result.success && result.step) {
              anyMatchApplied = true;
              targetModelId = result.resultModelId;
              if (execution.stepResults) {
                execution.stepResults.push(result.step);
              }
              
              console.log(`[Transformation] Rule ${rule.name} applied successfully to match`);
              
              // Only apply once per rule per iteration to avoid exhausting the transformation in one step
              break;
            } else {
              console.log(`[Transformation] Rule ${rule.name} could not be applied to match`);
            }
          }
          
          if (anyMatchApplied) {
            ruleApplied = true;
            appliedRuleIndices.add(i); // Mark this rule index as applied
            
            // If interactive mode, stop after each rule application
            if (execution.strategy === 'interactive') {
              break;
            }
          } else {
            console.log(`[Transformation] Rule ${rule.name} could not be applied to any match`);
          }
        }

        // If sequential or priority, and we've tried all rules, clear the applied rules set for next iteration
        if ((execution.strategy === 'sequential' || execution.strategy === 'priority') && appliedRuleIndices.size === ruleIds.length) {
          appliedRuleIndices.clear();
        }
        
        // If sequential or priority, stop when no rule can be applied
        if ((execution.strategy === 'sequential' || execution.strategy === 'priority') && !ruleApplied) {
          break;
        }
      }

      // Apply completed status
      execution.status = 'completed';
      execution.resultModelId = targetModelId;
      this.updateExecution(execution.id, { 
        status: 'completed',
        resultModelId: targetModelId
      });
      
      this.saveToStorage();
      return true;
    } catch (error) {
      console.error('Transformation execution failed:', error);
      execution.status = 'failed';
      this.saveToStorage();
      return false;
    }
  }

  /**
   * Validates that a model's references are correctly set up
   */
  private validateModelReferences(modelId: string): void {
    console.log(`[ValidateModel] Validating references in model ${modelId}`);
    
    const model = modelService.getModelById(modelId);
    if (!model) {
      console.error(`[ValidateModel] Model ${modelId} not found`);
      return;
    }
  }

  private prepareRuleExecutionOrder(execution: TransformationExecution): string[] {
    // Implementation based on strategy
    if (execution.strategy === 'priority') {
      // Sort rules by priority (highest first)
      return [...execution.ruleIds].sort((a, b) => {
        const ruleA = this.getRuleById(a);
        const ruleB = this.getRuleById(b);
        const priorityA = ruleA?.priority || 0;
        const priorityB = ruleB?.priority || 0;
        return priorityB - priorityA;
      });
    }
    
    // Default: sequential execution in order defined
    return [...execution.ruleIds];
  }

  // Helper function to check if a match is already in the results array
  private isDuplicateMatch(match: PatternMatch, results: PatternMatch[]): boolean {
    return results.some(existingMatch => {
      // Check if all element mappings are the same
      const existingEntries = Object.entries(existingMatch.matches);
      const newEntries = Object.entries(match.matches);
      
      if (existingEntries.length !== newEntries.length) {
        return false;
      }
      
      // Compare all mappings
      return newEntries.every(([patternId, modelId]) => {
        return existingMatch.matches[patternId] === modelId;
      });
    });
  }

  /**
   * Extract attributes from a pattern element into a format suitable for model elements
   */
  private getAttributesFromPatternElement(patternElement: PatternElement): Record<string, any> {
    const result: Record<string, any> = {};
    
    // Set the name - this is a common attribute
    result.name = patternElement.name;
    
    // Copy all other attributes
    if (patternElement.attributes) {
      for (const [key, value] of Object.entries(patternElement.attributes)) {
        // Skip if already processed
        if (key === 'name') continue;
        
        result[key] = value;
      }
    }
    
    return result;
  }
  
  /**
   * Try to infer the target element and attribute from an expression
   */
  private inferExpressionTarget(expression: Expression | string, context: { 
    patternElements: Record<string, PatternElement>,
    modelElements: Record<string, any>
  }): { elementName: string, attributeName: string } | null {
    // If it's a string, try to parse the expression
    if (typeof expression === 'string') {
      // Simple check for "element.attribute decrement X" pattern
      const decrementMatch = expression.match(/([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\s+decrement\s+/);
      if (decrementMatch && decrementMatch.length >= 3) {
        return {
          elementName: decrementMatch[1],
          attributeName: decrementMatch[2]
        };
      }
      
      const incrementMatch = expression.match(/([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\s+increment\s+/);
      if (incrementMatch && incrementMatch.length >= 3) {
        return {
          elementName: incrementMatch[1],
          attributeName: incrementMatch[2]
        };
      }
      
      return null;
    }
    
    // If it's an Expression object
    if (expression.type === 'OPERATION' && expression.operator === 'SUBTRACT') {
      // For operations, check if the left operand is a reference to an element's attribute
      if (expression.leftOperand && expression.leftOperand.type === 'REFERENCE') {
        const references = expression.leftOperand.references;
        if (references && references.length > 0) {
          return {
            elementName: references[0].elementName,
            attributeName: references[0].attributeName
          };
        }
      }
      
      // If the left operand is a literal that looks like "element.attribute"
      if (expression.leftOperand && expression.leftOperand.type === 'LITERAL') {
        const value = expression.leftOperand.value;
        if (typeof value === 'string') {
          const match = value.match(/([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)/);
          if (match && match.length >= 3) {
            return {
              elementName: match[1],
              attributeName: match[2]
            };
          }
        }
      }
    }
    
    return null;
  }

  // Add these methods after the downloadAllRulesAsJsonFile method

  // Import rules from JSON
  importRulesFromJson(jsonData: string): { 
    success: boolean, 
    rulesImported: number, 
    error?: string 
  } {
    try {
      const data = JSON.parse(jsonData);
      
      // Check if this is a single rule or multiple rules
      if (Array.isArray(data)) {
        // Multiple rules
        let importCount = 0;
        
        data.forEach(rule => {
          if (this.importSingleRule(rule)) {
            importCount++;
          }
        });
        
        this.saveToStorage();
        return { success: true, rulesImported: importCount };
      } else if (data.type === 'transformation_execution') {
        // This is an execution configuration
        return this.importExecutionConfig(data);
      } else {
        // Single rule
        const success = this.importSingleRule(data);
        this.saveToStorage();
        return { success, rulesImported: success ? 1 : 0 };
      }
    } catch (error) {
      console.error('Error importing rules from JSON:', error);
      return { 
        success: false, 
        rulesImported: 0, 
        error: error instanceof Error ? error.message : 'Invalid JSON format' 
      };
    }
  }
  
  // Import a single rule
  private importSingleRule(ruleData: any): boolean {
    try {
      // Validation
      if (!ruleData.name || !ruleData.lhs || !ruleData.rhs) {
        console.error('Invalid rule format: missing required fields');
        return false;
      }
      
      // Import LHS pattern if not already exists
      let lhsId = ruleData.lhs.id;
      if (!this.getPatternById(lhsId)) {
        const lhsPattern = this.importPattern(ruleData.lhs);
        if (lhsPattern) {
          lhsId = lhsPattern.id;
        } else {
          console.error('Failed to import LHS pattern');
          return false;
        }
      }
      
      // Import RHS pattern if not already exists
      let rhsId = ruleData.rhs.id;
      if (!this.getPatternById(rhsId)) {
        const rhsPattern = this.importPattern(ruleData.rhs);
        if (rhsPattern) {
          rhsId = rhsPattern.id;
        } else {
          console.error('Failed to import RHS pattern');
          return false;
        }
      }
      
      // Import NAC patterns if not already exists
      const nacIds: string[] = [];
      if (ruleData.nacs && Array.isArray(ruleData.nacs)) {
        for (const nac of ruleData.nacs) {
          let nacId = nac.id;
          if (!this.getPatternById(nacId)) {
            const nacPattern = this.importPattern(nac);
            if (nacPattern) {
              nacId = nacPattern.id;
            } else {
              console.warn('Failed to import NAC pattern - skipping');
              continue;
            }
          }
          nacIds.push(nacId);
        }
      }
      
      // Create the rule
      const newRule: TransformationRule = {
        id: ruleData.id || uuidv4(),
        name: ruleData.name,
        description: ruleData.description || '',
        lhs: lhsId,
        rhs: rhsId,
        nacs: nacIds,
        conditions: ruleData.conditions || [],
        priority: ruleData.priority || 0,
        enabled: ruleData.enabled !== undefined ? ruleData.enabled : true
      };
      
      // Add it to the rules collection, replacing if same ID exists
      const existingIndex = this.rules.findIndex(r => r.id === newRule.id);
      if (existingIndex >= 0) {
        this.rules[existingIndex] = newRule;
      } else {
        this.rules.push(newRule);
      }
      
      return true;
    } catch (error) {
      console.error('Error importing rule:', error);
      return false;
    }
  }
  
  // Import a pattern
  private importPattern(patternData: any): TransformationPattern | null {
    try {
      if (!patternData.name || !patternData.type || !patternData.elements) {
        console.error('Invalid pattern format: missing required fields');
        return null;
      }
      
      const pattern: TransformationPattern = {
        id: patternData.id || uuidv4(),
        name: patternData.name,
        type: patternData.type,
        elements: []
      };
      
      // Add elements
      if (Array.isArray(patternData.elements)) {
        for (const elementData of patternData.elements) {
          const element: PatternElement = {
            id: elementData.id || uuidv4(),
            name: elementData.name,
            type: elementData.type,
            attributes: elementData.attributes || {},
            references: elementData.references || {},
            constraints: elementData.constraints || []
          };
          
          pattern.elements.push(element);
        }
      }
      
      // Add to patterns collection, replacing if same ID exists
      const existingIndex = this.patterns.findIndex(p => p.id === pattern.id);
      if (existingIndex >= 0) {
        this.patterns[existingIndex] = pattern;
      } else {
        this.patterns.push(pattern);
      }
      
      return pattern;
    } catch (error) {
      console.error('Error importing pattern:', error);
      return null;
    }
  }
  
  // Import a transformation execution configuration
  private importExecutionConfig(data: any): { 
    success: boolean, 
    rulesImported: number, 
    error?: string 
  } {
    try {
      if (!data.name || !data.ruleIds || !data.sourceModelId) {
        return { 
          success: false, 
          rulesImported: 0, 
          error: 'Invalid execution configuration: missing required fields' 
        };
      }
      
      // Import the rules first
      let rulesImported = 0;
      if (data.rules && Array.isArray(data.rules)) {
        for (const rule of data.rules) {
          if (this.importSingleRule(rule)) {
            rulesImported++;
          }
        }
      }
      
      // Create the execution configuration
      const execution: TransformationExecution = {
        id: data.id || uuidv4(),
        name: data.name,
        ruleIds: data.ruleIds,
        sourceModelId: data.sourceModelId,
        targetModelId: data.targetModelId,
        inPlace: data.inPlace !== undefined ? data.inPlace : true,
        maxIterations: data.maxIterations || 100,
        strategy: data.strategy || 'sequential',
        status: 'created',
        stepResults: data.stepResults || []
      };
      
      // Add to executions, replacing if same ID exists
      const existingIndex = this.executions.findIndex(e => e.id === execution.id);
      if (existingIndex >= 0) {
        this.executions[existingIndex] = execution;
      } else {
        this.executions.push(execution);
      }
      
      this.saveToStorage();
      return { 
        success: true, 
        rulesImported 
      };
    } catch (error) {
      console.error('Error importing execution configuration:', error);
      return { 
        success: false, 
        rulesImported: 0, 
        error: error instanceof Error ? error.message : 'Invalid JSON format' 
      };
    }
  }
  
  // Download execution configuration as JSON file
  downloadExecutionAsJsonFile(executionId: string, filename?: string): boolean {
    const execution = this.getExecutionById(executionId);
    if (!execution) return false;
    
    // Get all the rules used by this execution
    const rules = execution.ruleIds.map(ruleId => this.getRuleById(ruleId)).filter(Boolean);
    
    // Create a full exportable object with rules included
    const exportData = {
      ...execution,
      type: 'transformation_execution',
      rules: rules.map(rule => {
        const lhsPattern = this.getPatternById(rule!.lhs);
        const rhsPattern = this.getPatternById(rule!.rhs);
        const nacPatterns = rule!.nacs.map(nacId => this.getPatternById(nacId)).filter(Boolean);
        
        return {
          ...rule,
          lhs: lhsPattern,
          rhs: rhsPattern,
          nacs: nacPatterns
        };
      })
    };
    
    const jsonData = JSON.stringify(exportData, null, 2);
    return this.downloadJsonFile(
      jsonData, 
      filename || `${execution.name.replace(/\s+/g, '_')}_execution.json`
    );
  }
  
  // Apply rule to a diagram instead of a model
  applyRuleTodiagram(
    ruleId: string,
    diagramId: string,
    match?: PatternMatch
  ): { success: boolean, resultDiagramId: string, step?: TransformationStep } {
    // Import necessary services
    const { diagramService } = require('./diagram.service');
    
    // Get the diagram
    const diagram = diagramService.getDiagramById(diagramId);
    if (!diagram) {
      console.error(`[RuleApplication] Diagram ${diagramId} not found`);
      return { success: false, resultDiagramId: diagramId };
    }
    
    // Get the model associated with the diagram
    const modelId = diagram.modelId;
    
    // Get the rule
    const rule = this.getRuleById(ruleId);
    if (!rule) {
      console.error(`[RuleApplication] Rule ${ruleId} not found`);
      return { success: false, resultDiagramId: diagramId };
    }
    
    // Find a match if none was provided
    if (!match) {
      const matches = this.findPatternMatches(rule.lhs, modelId);
      if (matches.length === 0) {
        console.error(`[RuleApplication] No matches found for rule ${rule.name}`);
        return { success: false, resultDiagramId: diagramId };
      }
      match = matches[0];
    }
    
    // Apply the rule to the model directly with the found match
    const modelResult = this.applyRule(ruleId, modelId, match);
    if (!modelResult.success || !modelResult.step) {
      return { success: false, resultDiagramId: diagramId };
    }
    
    // If successful, update the diagram to reflect the changes
    // Map model elements to diagram elements
    const diagramElementsToUpdate: string[] = [];
    
    // For created/modified elements from RHS, create corresponding diagram elements if needed
    if (modelResult.step.resultElements) {
      modelResult.step.resultElements.forEach(modelElementId => {
        // Check if this element already has a diagram representation
        const existingDiagramElements = diagramService.getDiagramElementsByModelElement(diagramId, modelElementId);
        
        if (existingDiagramElements.length === 0) {
          // No diagram element exists for this model element, we might want to create one
          // However, we need positioning information which is lacking
          // For now, we'll just log this as something to handle via the UI
          console.log(`[DiagramTransformation] New model element ${modelElementId} has no diagram representation`);
        } else {
          // Add existing diagram elements to the update list
          existingDiagramElements.forEach((element: DiagramElement) => {
            diagramElementsToUpdate.push(element.id);
          });
        }
      });
    }
    
    // Create a new step with the diagram elements
    const stepWithDiagram: TransformationStep = {
      ...modelResult.step,
      diagramElements: diagramElementsToUpdate
    };
    
    // Return information about the diagram transformation
    return {
      success: modelResult.success,
      resultDiagramId: diagramId,
      step: stepWithDiagram
    };
  }
  
  // Execute transformation on a diagram
  executeDiagramTransformation(
    executionId: string,
    diagramId: string
  ): boolean {
    console.log(`[DiagramTransformation] Starting execution of ${executionId} on diagram ${diagramId}`);
    const execution = this.executions.find(e => e.id === executionId);
    if (!execution) {
      console.error(`[DiagramTransformation] Execution ${executionId} not found`);
      return false;
    }
    
    // Import necessary services
    const diagramService = require('./diagram.service').diagramService;
    const modelService = require('./model.service').modelService;
    
    // Get the diagram
    const diagram = diagramService.getDiagramById(diagramId);
    if (!diagram) {
      console.error(`[DiagramTransformation] Diagram ${diagramId} not found`);
      return false;
    }
    
    // Get the model ID associated with the diagram
    const modelId = diagram.modelId;
    console.log(`[DiagramTransformation] Using model ${modelId} from diagram ${diagramId}`);
    
    // Update the execution to use this model as the source
    execution.sourceModelId = modelId;
    
    // Execute the transformation on the model first
    const modelTransformationSuccess = this.executeTransformation(executionId);
    if (!modelTransformationSuccess) {
      console.error(`[DiagramTransformation] Model transformation failed for execution ${executionId}`);
      return false;
    }
    
    // Now map the model transformation results to diagram elements
    const updatedExecution = this.getExecutionById(executionId);
    if (!updatedExecution || !updatedExecution.stepResults) {
      console.error(`[DiagramTransformation] No step results after model transformation`);
      return false;
    }
    
    console.log(`[DiagramTransformation] Found ${updatedExecution.stepResults.length} steps to map to diagram elements`);
    
    // Get updated model
    const updatedModel = modelService.getModelById(modelId);
    if (!updatedModel) {
      console.error(`[DiagramTransformation] Could not retrieve updated model ${modelId}`);
      return false;
    }
    
    // Track all affected diagram elements that need updating
    const diagramElementsToSync = new Set<string>();
    
    // Map each step's model elements to diagram elements
    const stepsWithDiagramElements = updatedExecution.stepResults.map(step => {
      const diagramElements: string[] = [];
      
      // Process applied elements (LHS)
      if (step.appliedElements && step.appliedElements.length > 0) {
        step.appliedElements.forEach(modelElementId => {
          // Get diagram elements directly matching modelElementId
          let elements = diagramService.getDiagramElementsByModelElement(diagramId, modelElementId);
          console.log(`[DiagramTransformation] Found ${elements.length} diagram elements for applied model element ${modelElementId} by modelElementId`);
          
          // If no elements found, try to find elements where style.linkedModelElementId matches
          if (elements.length === 0) {
            const diagram = diagramService.getDiagramById(diagramId);
            if (diagram) {
              elements = diagram.elements.filter((element: DiagramElement) => 
                element.style && element.style.linkedModelElementId === modelElementId
              );
              console.log(`[DiagramTransformation] Found ${elements.length} diagram elements for applied model element ${modelElementId} by linkedModelElementId`);
            }
          }
          
          elements.forEach((element: DiagramElement) => {
            if (!diagramElements.includes(element.id)) {
              diagramElements.push(element.id);
              diagramElementsToSync.add(element.id);
            }
          });
        });
      }
      
      // Process result elements (RHS)
      if (step.resultElements && step.resultElements.length > 0) {
        step.resultElements.forEach(modelElementId => {
          // Get diagram elements directly matching modelElementId
          let elements = diagramService.getDiagramElementsByModelElement(diagramId, modelElementId);
          console.log(`[DiagramTransformation] Found ${elements.length} diagram elements for result model element ${modelElementId} by modelElementId`);
          
          // If no elements found, try to find elements where style.linkedModelElementId matches
          if (elements.length === 0) {
            const diagram = diagramService.getDiagramById(diagramId);
            if (diagram) {
              elements = diagram.elements.filter((element: DiagramElement) => 
                element.style && element.style.linkedModelElementId === modelElementId
              );
              console.log(`[DiagramTransformation] Found ${elements.length} diagram elements for result model element ${modelElementId} by linkedModelElementId`);
            }
          }
          
          elements.forEach((element: DiagramElement) => {
            if (!diagramElements.includes(element.id)) {
              diagramElements.push(element.id);
              diagramElementsToSync.add(element.id);
            }
          });
        });
      }
      
      // Create a new step with diagram elements
      return {
        ...step,
        diagramElements
      };
    });
    
    // Sync diagram elements with their corresponding model elements
    const syncedElements = Array.from(diagramElementsToSync);
    console.log(`[DiagramTransformation] Syncing ${syncedElements.length} diagram elements with their model elements`);
    
    syncedElements.forEach(diagramElementId => {
      const diagramElement = diagram.elements.find((e: DiagramElement) => e.id === diagramElementId);
      if (!diagramElement) return;
      
      // Find the model element this diagram element is linked to
      let modelElementId = diagramElement.modelElementId;
      
      // If no direct model element ID, try the linked model element ID from style
      if (!modelElementId && diagramElement.style && diagramElement.style.linkedModelElementId) {
        modelElementId = diagramElement.style.linkedModelElementId;
      }
      
      if (!modelElementId) {
        console.log(`[DiagramTransformation] Could not find model element ID for diagram element ${diagramElementId}`);
        return;
      }
      
      // Find the model element
      const modelElement = updatedModel.elements.find((e: ModelElement) => e.id === modelElementId);
      if (!modelElement) {
        console.log(`[DiagramTransformation] Could not find model element ${modelElementId}`);
        return;
      }
      
      // Copy model element attributes to diagram element style
      if (modelElement.style) {
        // Keep existing style properties that shouldn't be overwritten
        const newStyle = {
          ...diagramElement.style,
          ...modelElement.style
        };
        
        // Update the diagram element
        console.log(`[DiagramTransformation] Syncing diagram element ${diagramElementId} with model element ${modelElementId}`);
        diagramService.updateElement(diagramId, diagramElementId, {
          style: newStyle
        });
      }
    });
    
    // Update the execution with the new steps
    updatedExecution.stepResults = stepsWithDiagramElements;
    this.updateExecution(executionId, { stepResults: stepsWithDiagramElements });
    
    console.log(`[DiagramTransformation] Completed execution with ${stepsWithDiagramElements.length} steps with diagram elements`);
    this.saveToStorage();
    return true;
  }
  
  // Extract attribute values from diagram elements for pattern matching
  extractDiagramElementAttributes(diagramId: string, elementId: string): Record<string, any> {
    // Import necessary services
    const { diagramService } = require('./diagram.service');
    
    // Get the diagram and element
    const diagram = diagramService.getDiagramById(diagramId);
    if (!diagram) return {};
    
    const element = diagram.elements.find((e: DiagramElement) => e.id === elementId);
    if (!element) return {};
    
    // Extract style properties as attributes
    const attributes: Record<string, any> = {};
    
    // Add style properties
    if (element.style) {
      Object.entries(element.style).forEach(([key, value]) => {
        attributes[key] = value;
      });
    }
    
    // Add reference attributes if they exist
    if (element.referenceAttributes) {
      Object.entries(element.referenceAttributes).forEach(([key, value]) => {
        attributes[key] = value;
      });
    }
    
    // Add position and size properties
    if (element.x !== undefined) attributes.x = element.x;
    if (element.y !== undefined) attributes.y = element.y;
    if (element.width !== undefined) attributes.width = element.width;
    if (element.height !== undefined) attributes.height = element.height;
    
    return attributes;
  }

  // Add the missing method for comparing references between patterns
  private areReferencesEqual(lhsRef: any, rhsRef: any, lhsPattern: TransformationPattern, rhsPattern: TransformationPattern): boolean {
    // If one is null and the other isn't, they're not equal
    if ((lhsRef === null) !== (rhsRef === null)) {
      console.log(`[ReferenceComparison] One reference is null and the other isn't: lhs=${lhsRef}, rhs=${rhsRef}`);
      return false;
    }
    
    // If both are null, they're equal
    if (lhsRef === null && rhsRef === null) {
      console.log(`[ReferenceComparison] Both references are null - considered equal`);
      return true;
    }
    
    // If one is array and the other is not, they're not equal
    if (Array.isArray(lhsRef) !== Array.isArray(rhsRef)) {
      console.log(`[ReferenceComparison] One reference is array and the other isn't: lhs is array=${Array.isArray(lhsRef)}, rhs is array=${Array.isArray(rhsRef)}`);
      return false;
    }
    
    // Handle array comparison
    if (Array.isArray(lhsRef) && Array.isArray(rhsRef)) {
      // If array lengths differ, they're not equal
      if (lhsRef.length !== rhsRef.length) {
        console.log(`[ReferenceComparison] Arrays have different lengths: lhs=${lhsRef.length}, rhs=${rhsRef.length}`);
        return false;
      }
      
      // Empty arrays are considered equal
      if (lhsRef.length === 0 && rhsRef.length === 0) {
        console.log(`[ReferenceComparison] Both arrays are empty - considered equal`);
        return true;
      }
      
      // We need to match elements by their names rather than IDs
      const lhsElemNames = lhsRef.map(id => {
        const elem = lhsPattern.elements.find(e => e.id === id);
        const name = elem ? elem.name : null;
        console.log(`[ReferenceComparison] LHS array element ID ${id} maps to name ${name}`);
        return name;
      }).filter(Boolean);
      
      const rhsElemNames = rhsRef.map(id => {
        const elem = rhsPattern.elements.find(e => e.id === id);
        const name = elem ? elem.name : null;
        console.log(`[ReferenceComparison] RHS array element ID ${id} maps to name ${name}`);
        return name;
      }).filter(Boolean);
      
      // If filtered name arrays have different lengths, some references couldn't be resolved
      if (lhsElemNames.length !== rhsElemNames.length) {
        console.log(`[ReferenceComparison] Different number of valid element names after filtering nulls: lhs=${lhsElemNames.length}, rhs=${rhsElemNames.length}`);
        return false;
      }
      
      // If no elements could be mapped to names in either array, something is wrong with the references
      if (lhsElemNames.length === 0 || rhsElemNames.length === 0) {
        console.log(`[ReferenceComparison] One or both arrays have no valid element names after filtering`);
        return false;
      }
      
      // Check if all names in LHS are in RHS and vice versa
      const lhsNamesInRhs = lhsElemNames.every(name => rhsElemNames.includes(name));
      const rhsNamesInLhs = rhsElemNames.every(name => lhsElemNames.includes(name));
      const equalLength = lhsElemNames.length === rhsElemNames.length;
      
      const areEqual = lhsNamesInRhs && rhsNamesInLhs && equalLength;
      console.log(`[ReferenceComparison] Array references equal by name comparison: ${areEqual}`);
      console.log(`[ReferenceComparison] LHS names: [${lhsElemNames.join(', ')}], RHS names: [${rhsElemNames.join(', ')}]`);
      
      return areEqual;
    }
    
    // For single values, compare by element names
    const lhsElem = lhsPattern.elements.find(e => e.id === lhsRef);
    const rhsElem = rhsPattern.elements.find(e => e.id === rhsRef);
    
    // If either element is not found, they can't be equal
    if (!lhsElem || !rhsElem) {
      console.log(`[ReferenceComparison] One or both elements not found: lhs found=${!!lhsElem}, rhs found=${!!rhsElem}`);
      return false;
    }
    
    // Compare by element names
    const areEqual = lhsElem.name === rhsElem.name;
    console.log(`[ReferenceComparison] Single-valued references - LHS name: ${lhsElem.name}, RHS name: ${rhsElem.name}, equal: ${areEqual}`);
    return areEqual;
  }
}

export const transformationService = new TransformationService(); 