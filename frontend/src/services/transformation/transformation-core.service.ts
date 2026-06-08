import { v4 as uuidv4 } from 'uuid';
import { PatternElement, PatternMatch, ModelElement, Metamodel, TransformationStep } from '../../models/types';
import { modelService } from '../model';
import { metamodelService } from '../metamodel';
import { expressionService } from '../constraint';
import { transformationDebugService } from './transformation-debug.service';
import { transformationVF2GraphService, type VF2Graph, type VF2Node } from './transformation-vf2-graph.service';
import { transformationCrudService } from './transformation-crud.service';

// VF2 State type
interface VF2State {
  core1: Map<string, string>;
  core2: Map<string, string>;
  inM1: Set<string>;
  outM1: Set<string>;
  inM2: Set<string>;
  outM2: Set<string>;
  depth: number;
}

/**
 * Core transformation logic: VF2 pattern matching, rule application, and utilities
 * This is the heart of the transformation engine
 */
class TransformationCoreService {
  private readonly TOKEN_ATTRIBUTE_IDS = ['tokens', 'attr-1746858426256', 'attr-1746782938809'];

  // ========== PATTERN MATCHING (VF2 ALGORITHM) ==========

  findPatternMatches(patternId: string, modelId: string): PatternMatch[] {
    transformationDebugService.debugGroup('PATTERN_MATCHING', `Pattern Matching: ${patternId} in model ${modelId}`);
    
    const pattern = transformationCrudService.getPatternById(patternId);
    const model = modelService.getModelById(modelId);
    
    if (!pattern || !model) {
      transformationDebugService.debugError('PATTERN_MATCHING', `Pattern or model not found: pattern=${patternId}, model=${modelId}`);
      transformationDebugService.debugGroupEnd('PATTERN_MATCHING');
      return [];
    }
    
    const metamodel = metamodelService.getMetamodelById(model.conformsTo);
    if (!metamodel) {
      transformationDebugService.debugError('PATTERN_MATCHING', `Metamodel not found for model ${modelId}`);
      transformationDebugService.debugGroupEnd('PATTERN_MATCHING');
      return [];
    }
    
    transformationDebugService.debug('PATTERN_MATCHING', `Pattern "${pattern.name}" has ${pattern.elements.length} elements, Model has ${model.elements.length} elements`);
    
    try {
      // Create VF2 graph structures
      const patternGraph = transformationVF2GraphService.createVF2Graph(pattern);
      const modelGraph = transformationVF2GraphService.createVF2GraphFromModel(model);
      
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
      transformationDebugService.debug('PATTERN_MATCHING', 'Starting VF2 algorithm search');
      this.findAllMatchesVF2(patternGraph, modelGraph, initialState, metamodel, results, patternId);
      
      transformationDebugService.debug('PATTERN_MATCHING', `Found ${results.length} matches for pattern "${pattern.name}"`);
      transformationDebugService.debugGroupEnd('PATTERN_MATCHING');
      return results;
    } catch (error) {
      transformationDebugService.debugError('PATTERN_MATCHING', 'Error during pattern matching', error);
      transformationDebugService.debugGroupEnd('PATTERN_MATCHING');
      return [];
    }
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
      const match: PatternMatch = {
        patternId,
        matches: {},
        valid: true
      };
      
      const core1Entries: Array<[string, string]> = [];
      state.core1.forEach((value: string, key: string) => {
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
      
      if (!this.isDuplicateMatch(match, results)) {
        const pattern = transformationCrudService.getPatternById(patternId);
        if (pattern && pattern.globalExpression) {
          const modelId = transformationVF2GraphService.getModelIdFromGraphFirstNode(modelGraph);
          if (modelId) {
            const model = modelService.getModelById(modelId);
            if (model) {
              const matchedElements: Record<string, ModelElement> = {};
              for (const [patternElemId, modelElemId] of Object.entries(match.matches)) {
                const modelElem = model.elements.find(e => e.id === modelElemId);
                if (modelElem) {
                  matchedElements[patternElemId] = modelElem;
                }
              }
              
              const patternElementsById: Record<string, PatternElement> = {};
              for (const elem of pattern.elements) {
                patternElementsById[elem.id] = elem;
              }
              
              try {
                const expressionResult = expressionService.evaluateExpression(
                  pattern.globalExpression,
                  {
                    patternMatch: match,
                    patternElements: patternElementsById,
                    modelElements: matchedElements,
                    allPatternElements: pattern.elements,
                    allModelElements: model.elements
                  }
                );
                
                if (expressionResult === false) {
                  match.valid = false;
                }
              } catch (error) {
                console.error('[Expression] Error evaluating global expression:', error);
                match.valid = false;
              }
            }
          }
        }
        
        if (match.valid) {
          results.push(match);
        }
      }
      return;
    }
    
    // Generate candidate pairs
    const candidates = this.generateCandidatePairs(state, patternGraph, modelGraph);
    
    // Try each candidate mapping
    for (let i = 0; i < candidates.length; i++) {
      const [patternNodeId, modelNodeId] = candidates[i];
      
      // Check if this mapping is feasible
      if (this.isFeasibleMapping(patternNodeId, modelNodeId, patternGraph, modelGraph, state, metamodel)) {
        // Clone state and add this mapping
        const newState = this.cloneState(state);
        this.updateState(newState, patternNodeId, modelNodeId, patternGraph, modelGraph);
        
        // Recursively search with the extended state
        this.findAllMatchesVF2(patternGraph, modelGraph, newState, metamodel, results, patternId);
      }
    }
  }

  // Generate candidate node pairs for mapping
  private generateCandidatePairs(
    state: VF2State, 
    patternGraph: VF2Graph, 
    modelGraph: VF2Graph
  ): Array<[string, string]> {
    const candidates: Array<[string, string]> = [];
    
    // Get pattern nodes adjacent to the current partial matching
    const patternCandidates: string[] = [];
    
    if (state.inM1.size > 0 || state.outM1.size > 0) {
      // Prioritize inM1, then outM1
      if (state.inM1.size > 0) {
        const inM1Array: string[] = [];
        state.inM1.forEach((nodeId: string) => {
          inM1Array.push(nodeId);
        });
        patternCandidates.push(inM1Array[0]);
      } else {
        const outM1Array: string[] = [];
        state.outM1.forEach((nodeId: string) => {
          outM1Array.push(nodeId);
        });
        patternCandidates.push(outM1Array[0]);
      }
    } else {
      // Pick first unmatched pattern node
      const nodeKeys: string[] = [];
      patternGraph.nodes.forEach((_: VF2Node, key: string) => {
        nodeKeys.push(key);
      });
      
      for (let i = 0; i < nodeKeys.length; i++) {
        const nodeId = nodeKeys[i];
        if (!state.core1.has(nodeId)) {
          patternCandidates.push(nodeId);
          break;
        }
      }
    }
    
    // Get model nodes that could match
    const candidateModelNodes: string[] = [];
    
    if (patternCandidates.length > 0 && (state.inM2.size > 0 || state.outM2.size > 0)) {
      if (state.inM2.size > 0) {
        state.inM2.forEach((nodeId: string) => {
          candidateModelNodes.push(nodeId);
        });
      } else {
        state.outM2.forEach((nodeId: string) => {
          candidateModelNodes.push(nodeId);
        });
      }
    } else if (patternCandidates.length > 0) {
      const modelNodeKeys: string[] = [];
      modelGraph.nodes.forEach((_: VF2Node, key: string) => {
        modelNodeKeys.push(key);
      });
      
      for (let i = 0; i < modelNodeKeys.length; i++) {
        const modelNodeId = modelNodeKeys[i];
        if (!state.core2.has(modelNodeId)) {
          candidateModelNodes.push(modelNodeId);
        }
      }
    }
    
    // Create candidate pairs
    if (patternCandidates.length > 0) {
      for (let i = 0; i < candidateModelNodes.length; i++) {
        candidates.push([patternCandidates[0], candidateModelNodes[i]]);
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
    
    // Check node compatibility
    if (!this.areNodesCompatible(patternNode, modelNode, metamodel)) {
      return false;
    }
    
    // Check structural compatibility (reference structure)
    const modelId = transformationVF2GraphService.getModelIdFromGraphFirstNode(modelGraph);
    let referenceIdToName: Record<string, string> = {};
    let referenceNameToId: Record<string, string> = {};
    
    if (modelId) {
      const attributeInfo = this.getMetaclassAttributeDetails(patternNode.type, modelId);
      referenceIdToName = attributeInfo.referenceIdToName;
      referenceNameToId = attributeInfo.referenceNameToId;
    }
    
    // Check incoming edges
    const patternInEdges = patternGraph.inEdges.get(patternNodeId) || [];
    for (const edgeId of patternInEdges) {
      const edge = patternGraph.edges.get(edgeId);
      if (!edge) continue;
      
      const sourcePatternNodeId = edge.source;
      
      if (state.core1.has(sourcePatternNodeId)) {
        const sourceModelNodeId = state.core1.get(sourcePatternNodeId);
        if (!sourceModelNodeId) continue;
        
        const sourcePatternNode = patternGraph.nodes.get(sourcePatternNodeId);
        if (!sourcePatternNode) continue;
        
        let sourceReferenceIdToName: Record<string, string> = {};
        let sourceReferenceNameToId: Record<string, string> = {};
        
        if (modelId) {
          const sourceAttributeInfo = this.getMetaclassAttributeDetails(sourcePatternNode.type, modelId);
          sourceReferenceIdToName = sourceAttributeInfo.referenceIdToName;
          sourceReferenceNameToId = sourceAttributeInfo.referenceNameToId;
        }
        
        const originalRefId = edge.referenceId;
        const possibleRefNames = [originalRefId];
        
        const mappedName = sourceReferenceIdToName[originalRefId];
        if (mappedName && mappedName !== originalRefId) {
          possibleRefNames.push(mappedName);
        }
        
        const mappedId = sourceReferenceNameToId[originalRefId];
        if (mappedId && mappedId !== originalRefId) {
          possibleRefNames.push(mappedId);
        }
        
        let foundMatchingEdge = false;
        for (const refName of possibleRefNames) {
          if (this.hasMatchingEdge(sourceModelNodeId, modelNodeId, refName, edge.isMultiValued, modelGraph)) {
            foundMatchingEdge = true;
            break;
          }
        }
        
        if (!foundMatchingEdge) {
          return false;
        }
      }
    }
    
    // Check outgoing edges
    const patternOutEdges = patternGraph.outEdges.get(patternNodeId) || [];
    for (const edgeId of patternOutEdges) {
      const edge = patternGraph.edges.get(edgeId);
      if (!edge) continue;
      
      const targetPatternNodeId = edge.target;
      
      if (state.core1.has(targetPatternNodeId)) {
        const targetModelNodeId = state.core1.get(targetPatternNodeId);
        if (!targetModelNodeId) continue;
        
        const originalRefId = edge.referenceId;
        const possibleRefNames = [originalRefId];
        
        const mappedName = referenceIdToName[originalRefId];
        if (mappedName && mappedName !== originalRefId) {
          possibleRefNames.push(mappedName);
        }
        
        const mappedId = referenceNameToId[originalRefId];
        if (mappedId && mappedId !== originalRefId) {
          possibleRefNames.push(mappedId);
        }
        
        let foundMatchingEdge = false;
        for (const refName of possibleRefNames) {
          if (this.hasMatchingEdge(modelNodeId, targetModelNodeId, refName, edge.isMultiValued, modelGraph)) {
            foundMatchingEdge = true;
            break;
          }
        }
        
        if (!foundMatchingEdge) {
          return false;
        }
      }
    }
    
    return true;
  }

  // Check if two nodes are compatible (type and attributes)
  private areNodesCompatible(patternNode: VF2Node, modelNode: VF2Node, metamodel: Metamodel): boolean {
    // Check type compatibility
    if (patternNode.type !== modelNode.type) {
      const patternType = metamodel.classes.find(c => c.id === patternNode.type);
      const modelType = metamodel.classes.find(c => c.id === modelNode.type);
      
      if (!patternType || !modelType) {
        return false;
      }
      
      // Check if model type is a subtype of pattern type
      if (!this.isSubtypeOf(modelType.id, patternType.id, metamodel)) {
        return false;
      }
    }
    
    // Check attribute compatibility
    const patternElement: PatternElement = {
      id: patternNode.id,
      name: patternNode.attributes.name || '',
      type: patternNode.type,
      attributes: patternNode.attributes,
      references: {},
      constraints: []
    };
    
    const modelElement: any = {
      id: modelNode.id,
      modelElementId: modelNode.type,
      style: modelNode.attributes,
      references: {}
    };
    
    return this.matchAttributes(patternElement, modelElement);
  }

  // Check if modelGraph has a matching edge
  private hasMatchingEdge(
    sourceId: string,
    targetId: string,
    referenceId: string,
    isMultiValued: boolean,
    modelGraph: VF2Graph
  ): boolean {
    const outEdges = modelGraph.outEdges.get(sourceId) || [];
    
    for (const edgeId of outEdges) {
      const edge = modelGraph.edges.get(edgeId);
      if (!edge) continue;
      
      if (edge.target === targetId && 
          edge.referenceId === referenceId &&
          edge.isMultiValued === isMultiValued) {
        return true;
      }
    }
    
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
    state.core1.set(patternNodeId, modelNodeId);
    state.core2.set(modelNodeId, patternNodeId);
    
    state.inM1.delete(patternNodeId);
    state.outM1.delete(patternNodeId);
    state.inM2.delete(modelNodeId);
    state.outM2.delete(modelNodeId);
    
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

  // ========== HELPER METHODS ==========

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

  getMetaclassAttributeDetails(typeId: string, modelId: string): { 
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
      
      (metaclass.attributes || []).forEach(attr => {
        result.idToName[attr.id] = attr.name;
        result.nameToId[attr.name] = attr.id;
      });

      (metaclass.references || []).forEach(ref => {
        result.referenceIdToName[ref.id] = ref.name;
        result.referenceNameToId[ref.name] = ref.id;
      });
    } catch (error) {
      console.error('[AttributeMapping] Error getting attribute details:', error);
    }
    
    return result;
  }

  private matchAttributes(patternElement: PatternElement, modelElement: any): boolean {
    if (!patternElement.attributes || Object.keys(patternElement.attributes).length === 0) {
      return true;
    }
    
    const modelAttributes = modelElement.style || (modelElement as any).attributes || {};
    const attributeDetails = this.getMetaclassAttributeDetails(modelElement.modelElementId, modelElement.id.split('/')[0]);
    
    const criticalAttributes = ['name', ...this.TOKEN_ATTRIBUTE_IDS];
    const matchedAttributes: string[] = [];
    const attributes = patternElement.attributes || {};
    
    const nonEmptyAttributes = Object.entries(attributes)
      .filter(([_, value]) => value !== '' && value !== null && value !== undefined)
      .map(([key, _]) => key);
    
    for (const key of Object.keys(attributes)) {
      const patternValue = attributes[key];
      
      if (patternValue === '' || patternValue === null || patternValue === undefined) {
        matchedAttributes.push(key);
        continue;
      }
      
      if (key in modelAttributes) {
        const modelValue = modelAttributes[key];
        const matches = this.areValuesEqual(patternValue, modelValue);
        
        if (matches) {
          matchedAttributes.push(key);
        } else if (criticalAttributes.includes(key)) {
          return false;
        } else if (nonEmptyAttributes.includes(key)) {
          return false;
        }
        continue;
      }
      
      if (key in attributeDetails.idToName) {
        const attributeName = attributeDetails.idToName[key];
        
        if (attributeName in modelAttributes) {
          const modelValue = modelAttributes[attributeName];
          const matches = this.areValuesEqual(patternValue, modelValue);
          
          if (matches) {
            matchedAttributes.push(key);
          } else if (criticalAttributes.includes(attributeName)) {
            return false;
          } else if (nonEmptyAttributes.includes(key)) {
            return false;
          }
          continue;
        }
      }
      
      let foundMatchingValue = false;
      for (const modelKey of Object.keys(modelAttributes)) {
        const modelValue = modelAttributes[modelKey];
        if (this.areValuesEqual(patternValue, modelValue)) {
          matchedAttributes.push(key);
          foundMatchingValue = true;
          break;
        }
      }
      
      if (!foundMatchingValue && nonEmptyAttributes.includes(key)) {
        return false;
      }
    }
    
    const matchedNonEmptyCount = nonEmptyAttributes.filter(attr => matchedAttributes.includes(attr)).length;
    return matchedNonEmptyCount === nonEmptyAttributes.length;
  }

  private areValuesEqual(value1: any, value2: any): boolean {
    if (typeof value1 !== 'object' && typeof value2 !== 'object') {
      return String(value1) === String(value2);
    }
    
    if (typeof value1 !== typeof value2) {
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

  private isDuplicateMatch(match: PatternMatch, results: PatternMatch[]): boolean {
    return results.some(existingMatch => {
      const existingEntries = Object.entries(existingMatch.matches);
      const newEntries = Object.entries(match.matches);
      
      if (existingEntries.length !== newEntries.length) {
        return false;
      }
      
      return newEntries.every(([patternId, modelId]) => {
        return existingMatch.matches[patternId] === modelId;
      });
    });
  }

  // ========== RULE APPLICATION ==========

  /**
   * Apply a transformation rule to a model using a given pattern match
   */
  applyRule(
    ruleId: string,
    modelId: string,
    match: PatternMatch
  ): { success: boolean; resultModelId: string; step?: TransformationStep } {
    const rule = transformationCrudService.getRuleById(ruleId);
    if (!rule) {
      return { success: false, resultModelId: modelId };
    }

    console.log(`[RuleApplication] Applying rule "${rule.name}" to model ${modelId}`);

    const lhsPattern = transformationCrudService.getPatternById(rule.lhs);
    const rhsPattern = transformationCrudService.getPatternById(rule.rhs);

    if (!lhsPattern || !rhsPattern) {
      console.error(`[RuleApplication] LHS or RHS pattern not found`);
      return { success: false, resultModelId: modelId };
    }

    const model = modelService.getModelById(modelId);
    if (!model) {
      console.error(`[RuleApplication] Model not found`);
      return { success: false, resultModelId: modelId };
    }

    // Map LHS pattern element IDs to actual model element IDs from the match
    const lhsIdToModelId: Record<string, string> = match.matches;

    const allAppliedElements: string[] = [];
    const allResultElements: string[] = [];

    // Step 1: Process element deletions and creations
    for (const lhsElement of lhsPattern.elements) {
      const correspondingRhsElement = rhsPattern.elements.find(e => e.name === lhsElement.name);
      
      if (!correspondingRhsElement) {
        // Element exists in LHS but not in RHS => DELETE it
        const modelElementId = lhsIdToModelId[lhsElement.id];
        if (modelElementId) {
          console.log(`[RuleApplication] Deleting element ${modelElementId} (${lhsElement.name})`);
          modelService.deleteModelElement(modelId, modelElementId);
          allAppliedElements.push(modelElementId);
        }
      }
    }

    // Step 2: Create new elements (exists in RHS but not in LHS)
    for (const rhsElement of rhsPattern.elements) {
      const correspondingLhsElement = lhsPattern.elements.find(e => e.name === rhsElement.name);
      
      if (!correspondingLhsElement) {
        // Element exists in RHS but not in LHS => CREATE it
        console.log(`[RuleApplication] Creating new element "${rhsElement.name}" of type ${rhsElement.type}`);
        
        const attributes = this.getAttributesFromPatternElement(rhsElement);
        const newElement = modelService.addModelElement(modelId, rhsElement.type, attributes);
        
        if (newElement) {
          console.log(`[RuleApplication] Successfully created new element with ID ${newElement.id}`);
          allResultElements.push(newElement.id);
        }
      }
    }

    // Step 3: Update attributes of matched elements
    for (const rhsElement of rhsPattern.elements) {
      const correspondingLhsElement = lhsPattern.elements.find(e => e.name === rhsElement.name);
      
      if (correspondingLhsElement) {
        const modelElementId = lhsIdToModelId[correspondingLhsElement.id];
        if (modelElementId) {
          const rhsAttributes = rhsElement.attributes || {};
          
          for (const [attrName, attrValue] of Object.entries(rhsAttributes)) {
            const lhsAttrValue = correspondingLhsElement.attributes?.[attrName];
            
            if (lhsAttrValue !== attrValue && attrValue !== '' && attrValue !== null && attrValue !== undefined) {
              console.log(`[RuleApplication] Updating attribute "${attrName}" of element ${modelElementId} from "${lhsAttrValue}" to "${attrValue}"`);
              
              try {
                const currentElement = model.elements.find(e => e.id === modelElementId);
                if (currentElement) {
                  const updatedStyle = { ...currentElement.style, [attrName]: attrValue };
                  modelService.updateModelElementProperties(modelId, modelElementId, { style: updatedStyle });
                  allAppliedElements.push(modelElementId);
                }
              } catch (error) {
                console.error(`[RuleApplication] Failed to update attribute:`, error);
              }
            }
          }
        }
      }
    }

    // Step 4: Handle references
    for (const rhsElement of rhsPattern.elements) {
      const correspondingLhsElement = lhsPattern.elements.find(e => e.name === rhsElement.name);
      
      if (correspondingLhsElement) {
        const modelElementId = lhsIdToModelId[correspondingLhsElement.id];
        
        if (modelElementId) {
          const rhsReferences = rhsElement.references || {};
          
          for (const [rhsRefName, rhsRefValue] of Object.entries(rhsReferences)) {
            if (rhsRefValue === null || rhsRefValue === undefined) continue;
            
            const attributeInfo = this.getMetaclassAttributeDetails(rhsElement.type, modelId);
            const modelRefName = attributeInfo.referenceIdToName[rhsRefName] || rhsRefName;
            
            const lhsReferences = correspondingLhsElement.references || {};
            const lhsRefValue = lhsReferences[rhsRefName];
            
            if (lhsRefValue === undefined) {
              // New reference created in RHS
              if (Array.isArray(rhsRefValue)) {
                const targetModelIds: string[] = [];
                for (const rhsRefTarget of rhsRefValue) {
                  const targetRhsElement = rhsPattern.elements.find(e => e.id === rhsRefTarget);
                  if (targetRhsElement) {
                    const targetLhsElement = lhsPattern.elements.find(e => e.name === targetRhsElement.name);
                    let targetModelId = null;
                    
                    if (targetLhsElement) {
                      targetModelId = lhsIdToModelId[targetLhsElement.id];
                    } else {
                      const newModelElement = model.elements.find(e => 
                        e.style?.name === targetRhsElement.name || 
                        (e as any).attributes?.name === targetRhsElement.name
                      );
                      if (newModelElement) {
                        targetModelId = newModelElement.id;
                      }
                    }
                    
                    if (targetModelId) {
                      targetModelIds.push(targetModelId);
                    }
                  }
                }
                
                if (targetModelIds.length > 0) {
                  try {
                    modelService.setModelElementReference(modelId, modelElementId, modelRefName, targetModelIds);
                    allAppliedElements.push(modelElementId);
                  } catch (error) {
                    console.error(`[RuleApplication] Failed to create new multi-valued reference:`, error);
                  }
                }
              } else {
                const rhsRefTarget = rhsRefValue as string;
                const targetRhsElement = rhsPattern.elements.find(e => e.id === rhsRefTarget);
                if (targetRhsElement) {
                  const targetLhsElement = lhsPattern.elements.find(e => e.name === targetRhsElement.name);
                  let targetModelId = null;
                  
                  if (targetLhsElement) {
                    targetModelId = lhsIdToModelId[targetLhsElement.id];
                  } else {
                    const newModelElement = model.elements.find(e => 
                      e.style?.name === targetRhsElement.name || 
                      (e as any).attributes?.name === targetRhsElement.name
                    );
                    if (newModelElement) {
                      targetModelId = newModelElement.id;
                    }
                  }
                  
                  if (targetModelId) {
                    try {
                      modelService.setModelElementReference(modelId, modelElementId, modelRefName, targetModelId);
                      allAppliedElements.push(modelElementId);
                    } catch (error) {
                      console.error(`[RuleApplication] Failed to create new single-valued reference:`, error);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    const step: TransformationStep = {
      id: uuidv4(),
      ruleId: ruleId,
      appliedElements: allAppliedElements,
      resultElements: allResultElements,
      timestamp: Date.now(),
      success: true
    };

    return { success: true, resultModelId: modelId, step };
  }

  private getAttributesFromPatternElement(patternElement: PatternElement): Record<string, any> {
    const result: Record<string, any> = {};
    
    if (patternElement.name) {
      result.name = patternElement.name;
    }
    
    if (patternElement.attributes) {
      for (const [key, value] of Object.entries(patternElement.attributes)) {
        if (value !== '' && value !== null && value !== undefined) {
          result[key] = value;
        }
      }
    }
    
    return result;
  }
}

export const transformationCoreService = new TransformationCoreService();
