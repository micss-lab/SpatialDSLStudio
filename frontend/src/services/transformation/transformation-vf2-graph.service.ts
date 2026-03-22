import {
  TransformationPattern,
  Model,
  ModelElement
} from '../../models/types';
import { transformationDebugService } from './transformation-debug.service';

// VF2 Algorithm Types (Internal)
interface VF2Node {
  id: string;
  type: string;
  patternElementId?: string;
  modelElementId?: string;
  attributes: Record<string, any>;
}

interface VF2Edge {
  source: string;
  target: string;
  referenceId: string;
  isMultiValued: boolean;
}

interface VF2Graph {
  nodes: Map<string, VF2Node>;
  edges: Map<string, VF2Edge>;
  outEdges: Map<string, string[]>;
  inEdges: Map<string, string[]>;
}

/**
 * VF2 graph construction from patterns and models
 * Creates graph structures needed for pattern matching
 */
class TransformationVF2GraphService {
  
  // Creates a VF2 graph from a transformation pattern
  createVF2Graph(pattern: TransformationPattern): VF2Graph {
    transformationDebugService.debugGroup('GRAPH_CREATION', `Creating VF2 graph for pattern "${pattern.name}"`);
    
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
      
      transformationDebugService.debug('GRAPH_CREATION', `Added node: ${element.name} (${element.id}) of type ${element.type}`);
    }
    
    // Add edges for references
    transformationDebugService.debug('GRAPH_CREATION', `Processing references for ${pattern.elements.length} elements`);
    
    for (const element of pattern.elements) {
      const sourceId = element.id;
      
      if (!element.references) {
        transformationDebugService.debug('GRAPH_CREATION', `Element ${element.name} has no references`);
        continue;
      }
      
      transformationDebugService.debug('GRAPH_CREATION', `Element ${element.name} has references:`, element.references);
      
      for (const [refName, refValue] of Object.entries(element.references)) {
        // Skip special properties and null values
        if (refName.endsWith('_bendPoints') || refName.endsWith('_attributes') || refValue === null || refValue === undefined) {
          transformationDebugService.debug('GRAPH_CREATION', `Skipping special/null reference: ${refName}`);
          continue;
        }
        
        if (Array.isArray(refValue)) {
          // Multi-valued references
          transformationDebugService.debug('GRAPH_CREATION', `Processing multi-valued reference ${refName} with targets:`, refValue);
          for (const targetId of refValue) {
            let actualTargetId = targetId;
            
            if (graph.nodes.has(targetId)) {
              actualTargetId = targetId;
            } else {
              transformationDebugService.debug('GRAPH_CREATION', `Direct ID match failed for ${targetId}, trying to find by element matching`);
              
              let foundMatch = false;
              for (const potentialElement of pattern.elements) {
                if (potentialElement.id === targetId) {
                  actualTargetId = potentialElement.id;
                  foundMatch = true;
                  break;
                }
                
                if (potentialElement.name && targetId.includes(potentialElement.name)) {
                  actualTargetId = potentialElement.id;
                  foundMatch = true;
                  transformationDebugService.debug('GRAPH_CREATION', `Found target by name matching: ${targetId} -> ${potentialElement.id}`);
                  break;
                }
              }
              
              if (!foundMatch) {
                transformationDebugService.debug('GRAPH_CREATION', `❌ Could not resolve target ${targetId} for multi-valued reference ${refName} from ${element.name}`);
                continue;
              }
            }
            
            const edgeId = `${sourceId}:${refName}:${actualTargetId}`;
            const edge: VF2Edge = {
              source: sourceId,
              target: actualTargetId,
              referenceId: refName,
              isMultiValued: true
            };
            
            graph.edges.set(edgeId, edge);
            
            const outEdges = graph.outEdges.get(sourceId) || [];
            outEdges.push(edgeId);
            graph.outEdges.set(sourceId, outEdges);
            
            const inEdges = graph.inEdges.get(actualTargetId) || [];
            inEdges.push(edgeId);
            graph.inEdges.set(actualTargetId, inEdges);
            
            transformationDebugService.debug('GRAPH_CREATION', `✅ Created multi-valued edge: ${element.name} --[${refName}]--> ${actualTargetId}`);
          }
        } else {
          // Single-valued reference
          const targetId = refValue as string;
          transformationDebugService.debug('GRAPH_CREATION', `Processing single-valued reference ${refName} to target: ${targetId}`);
          
          let actualTargetId = targetId;
          
          if (graph.nodes.has(targetId)) {
            actualTargetId = targetId;
          } else {
            transformationDebugService.debug('GRAPH_CREATION', `Direct ID match failed for ${targetId}, trying to find by element matching`);
            
            let foundMatch = false;
            for (const potentialElement of pattern.elements) {
              if (potentialElement.id === targetId) {
                actualTargetId = potentialElement.id;
                foundMatch = true;
                break;
              }
              
              if (potentialElement.name && targetId.includes(potentialElement.name)) {
                actualTargetId = potentialElement.id;
                foundMatch = true;
                transformationDebugService.debug('GRAPH_CREATION', `Found target by name matching: ${targetId} -> ${potentialElement.id}`);
                break;
              }
            }
            
            if (!foundMatch) {
              transformationDebugService.debug('GRAPH_CREATION', `❌ Could not resolve target ${targetId} for reference ${refName} from ${element.name}`);
              transformationDebugService.debug('GRAPH_CREATION', `Available pattern elements:`, pattern.elements.map(e => ({id: e.id, name: e.name})));
              transformationDebugService.debug('GRAPH_CREATION', `Available graph nodes:`, Array.from(graph.nodes.keys()));
              continue;
            }
          }
          
          const edgeId = `${sourceId}:${refName}:${actualTargetId}`;
          const edge: VF2Edge = {
            source: sourceId,
            target: actualTargetId,
            referenceId: refName,
            isMultiValued: false
          };
          
          graph.edges.set(edgeId, edge);
          
          const outEdges = graph.outEdges.get(sourceId) || [];
          outEdges.push(edgeId);
          graph.outEdges.set(sourceId, outEdges);
          
          const inEdges = graph.inEdges.get(actualTargetId) || [];
          inEdges.push(edgeId);
          graph.inEdges.set(actualTargetId, inEdges);
          
          transformationDebugService.debug('GRAPH_CREATION', `✅ Created single-valued edge: ${element.name} --[${refName}]--> ${actualTargetId}`);
        }
      }
    }
    
    transformationDebugService.debug('GRAPH_CREATION', `Pattern graph complete: ${graph.nodes.size} nodes, ${graph.edges.size} edges`);
    transformationDebugService.debugGroupEnd('GRAPH_CREATION');
    
    return graph;
  }
  
  // Creates a VF2 graph from a model
  createVF2GraphFromModel(model: Model): VF2Graph {
    transformationDebugService.debugGroup('GRAPH_CREATION', `Creating VF2 graph for model "${model.name}"`);
    
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
      
      transformationDebugService.debug('GRAPH_CREATION', `Added model node: ${element.style?.name || 'Unnamed'} (${element.id}) of type ${element.modelElementId}`);
    }
    
    // Add edges for references
    transformationDebugService.debug('GRAPH_CREATION', `Processing model references for ${model.elements.length} elements`);
    
    for (const element of model.elements) {
      const sourceId = element.id;
      
      if (!element.references) {
        transformationDebugService.debug('GRAPH_CREATION', `Model element ${element.style?.name || element.id} has no references`);
        continue;
      }
      
      transformationDebugService.debug('GRAPH_CREATION', `Model element ${element.style?.name || element.id} has references:`, element.references);
      
      for (const [refName, refValue] of Object.entries(element.references)) {
        if (refValue === null || refValue === undefined) continue;
        
        if (Array.isArray(refValue)) {
          // Multi-valued references
          transformationDebugService.debug('GRAPH_CREATION', `Processing model multi-valued reference ${refName} with targets:`, refValue);
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
              
              const outEdges = graph.outEdges.get(sourceId) || [];
              outEdges.push(edgeId);
              graph.outEdges.set(sourceId, outEdges);
              
              const inEdges = graph.inEdges.get(targetId) || [];
              inEdges.push(edgeId);
              graph.inEdges.set(targetId, inEdges);
              
              transformationDebugService.debug('GRAPH_CREATION', `✅ Created model multi-valued edge: ${element.style?.name || sourceId} --[${refName}]--> ${targetId}`);
            } else {
              transformationDebugService.debug('GRAPH_CREATION', `❌ Model target node ${targetId} not found for reference ${refName}`);
            }
          }
        } else {
          // Single-valued reference
          const targetId = refValue as string;
          transformationDebugService.debug('GRAPH_CREATION', `Processing model single-valued reference ${refName} to target: ${targetId}`);
          
          if (graph.nodes.has(targetId)) {
            const edgeId = `${sourceId}:${refName}:${targetId}`;
            const edge: VF2Edge = {
              source: sourceId,
              target: targetId,
              referenceId: refName,
              isMultiValued: false
            };
            
            graph.edges.set(edgeId, edge);
            
            const outEdges = graph.outEdges.get(sourceId) || [];
            outEdges.push(edgeId);
            graph.outEdges.set(sourceId, outEdges);
            
            const inEdges = graph.inEdges.get(targetId) || [];
            inEdges.push(edgeId);
            graph.inEdges.set(targetId, inEdges);
            
            transformationDebugService.debug('GRAPH_CREATION', `✅ Created model single-valued edge: ${element.style?.name || sourceId} --[${refName}]--> ${targetId}`);
          } else {
            transformationDebugService.debug('GRAPH_CREATION', `❌ Model target node ${targetId} not found for reference ${refName}`);
            transformationDebugService.debug('GRAPH_CREATION', `Available model nodes:`, Array.from(graph.nodes.keys()));
          }
        }
      }
    }
    
    transformationDebugService.debug('GRAPH_CREATION', `Model graph complete: ${graph.nodes.size} nodes, ${graph.edges.size} edges`);
    transformationDebugService.debugGroupEnd('GRAPH_CREATION');
    
    return graph;
  }

  // Helper to get model ID from first node in graph (for reference mappings)
  getModelIdFromGraphFirstNode(modelGraph: VF2Graph): string | null {
    const nodeKeys: string[] = [];
    modelGraph.nodes.forEach((_: VF2Node, key: string) => {
      nodeKeys.push(key);
    });
    
    if (nodeKeys.length > 0) {
      const firstNode = modelGraph.nodes.get(nodeKeys[0]);
      if (firstNode && firstNode.modelElementId) {
        return firstNode.modelElementId;
      }
    }
    
    return null;
  }
}

export type { VF2Node, VF2Edge, VF2Graph };
export const transformationVF2GraphService = new TransformationVF2GraphService();
