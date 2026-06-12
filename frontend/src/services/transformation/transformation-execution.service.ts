
import {
  TransformationExecution,
  TransformationStep,
  PatternMatch,
  Model,
  DiagramElement
} from '../../models/types';
import { modelService } from '../model';
import { transformationCrudService } from './transformation-crud.service';
import { transformationCoreService } from './transformation-core.service';

/**
 * Transformation execution engine and diagram transformations
 * Handles running transformations and syncing with diagrams
 */
class TransformationExecutionService {

  // Execute transformation workflow
  executeTransformation(executionId: string): boolean {
    const execution = transformationCrudService.getExecutionById(executionId);
    if (!execution) return false;

    const sourceModel = modelService.getModelById(execution.sourceModelId);
    if (!sourceModel) {
      console.error(`[Transformation] Source model ${execution.sourceModelId} not found`);
      return false;
    }

    transformationCrudService.updateExecution(executionId, { status: 'in_progress', stepResults: [] });

    try {
      // Prepare target model
      let targetModelId: string;
      const isInPlace = execution.inPlace;
      
      if (isInPlace) {
        console.log(`[Transformation] Using in-place transformation on model ${sourceModel.id}`);
        targetModelId = execution.sourceModelId;
      } else {
        console.log(`[Transformation] Creating new model as copy of ${sourceModel.id}`);
        const targetModel = this.createTargetModel(sourceModel);
        targetModelId = targetModel.id;
        transformationCrudService.updateExecution(executionId, { resultModelId: targetModelId });
      }

      // Execute rules based on strategy
      let iterations = 0;
      let ruleApplied = true;
      const appliedRuleIndices = new Set<number>();

      while (ruleApplied && iterations < execution.maxIterations) {
        ruleApplied = false;
        iterations++;

        const ruleIds = this.prepareRuleExecutionOrder(execution);

        for (let i = 0; i < ruleIds.length; i++) {
          if (appliedRuleIndices.has(i)) continue;
          
          const ruleId = ruleIds[i];
          const rule = transformationCrudService.getRuleById(ruleId);
          if (!rule || !rule.enabled) continue;

          console.log(`[Transformation] Applying rule ${rule.name} to model ${targetModelId}`);
          
          const matches = transformationCoreService.findPatternMatches(rule.lhs, targetModelId);
          console.log(`[Transformation] Found ${matches.length} matches for rule ${rule.name}`);
          
          let anyMatchApplied = false;
          
          for (const match of matches) {
            const result = transformationCoreService.applyRule(ruleId, targetModelId, match);
          
            if (result.success && result.step) {
              anyMatchApplied = true;
              targetModelId = result.resultModelId;
              
              const currentExecution = transformationCrudService.getExecutionById(executionId);
              if (currentExecution && currentExecution.stepResults) {
                currentExecution.stepResults.push(result.step);
                transformationCrudService.updateExecution(executionId, { stepResults: currentExecution.stepResults });
              }
              
              console.log(`[Transformation] Rule ${rule.name} applied successfully`);
              break;
            }
          }
          
          if (anyMatchApplied) {
            ruleApplied = true;
            appliedRuleIndices.add(i);
            
            if (execution.strategy === 'interactive') {
              break;
            }
          }
        }

        if ((execution.strategy === 'sequential' || execution.strategy === 'priority') && appliedRuleIndices.size === ruleIds.length) {
          appliedRuleIndices.clear();
        }
        
        if ((execution.strategy === 'sequential' || execution.strategy === 'priority') && !ruleApplied) {
          break;
        }
      }

      transformationCrudService.updateExecution(executionId, { 
        status: 'completed',
        resultModelId: targetModelId
      });
      
      return true;
    } catch (error) {
      console.error('Transformation execution failed:', error);
      transformationCrudService.updateExecution(executionId, { status: 'failed' });
      return false;
    }
  }

  private createTargetModel(sourceModel: Model): Model {
    console.log(`[CreateTargetModel] Creating transformed model from source model ${sourceModel.id}`);
    
    const targetModel = modelService.createModel(
      `${sourceModel.name}_transformed`,
      sourceModel.conformsTo
    );
    console.log(`[CreateTargetModel] Created target model ${targetModel.id}`);
    
    const idMapping: Record<string, string> = {};
    
    // Step 1: Create all elements
    console.log(`[CreateTargetModel] Step 1: Creating all elements`);
    for (const element of sourceModel.elements) {
      const styleCopy = JSON.parse(JSON.stringify(element.style));
      
      if (element.style.position) {
        styleCopy.position = { ...element.style.position };
      }
      
      const newElement = modelService.addModelElement(
        targetModel.id,
        element.modelElementId,
        styleCopy
      );
      
      if (newElement) {
        idMapping[element.id] = newElement.id;
        console.log(`[CreateTargetModel] Created element ${newElement.id} -> mapped from ${element.id}`);
      }
    }
    
    // Step 2: Set up all references
    console.log(`[CreateTargetModel] Step 2: Setting up all references`);
    for (const element of sourceModel.elements) {
      const newElementId = idMapping[element.id];
      
      if (!newElementId || !element.references || Object.keys(element.references).length === 0) {
        continue;
      }
      
      for (const [refName, refValue] of Object.entries(element.references)) {
        if (refValue === null || refValue === undefined) {
          modelService.setModelElementReference(targetModel.id, newElementId, refName, null);
          continue;
        }
        
        if (Array.isArray(refValue)) {
          if (refValue.length === 0) {
            modelService.setModelElementReference(targetModel.id, newElementId, refName, []);
            continue;
          }
          
          const newRefValues: string[] = [];
          for (const oldId of refValue) {
            const newId = idMapping[oldId];
            if (newId) {
              newRefValues.push(newId);
            }
          }
          
          modelService.setModelElementReference(targetModel.id, newElementId, refName, newRefValues);
        } else {
          const newRefValue = idMapping[refValue as string];
          
          if (newRefValue) {
            modelService.setModelElementReference(targetModel.id, newElementId, refName, newRefValue);
          } else {
            modelService.setModelElementReference(targetModel.id, newElementId, refName, null);
          }
        }
      }
    }
    
    return targetModel;
  }

  private prepareRuleExecutionOrder(execution: TransformationExecution): string[] {
    if (execution.strategy === 'priority') {
      return [...execution.ruleIds].sort((a, b) => {
        const ruleA = transformationCrudService.getRuleById(a);
        const ruleB = transformationCrudService.getRuleById(b);
        const priorityA = ruleA?.priority || 0;
        const priorityB = ruleB?.priority || 0;
        return priorityB - priorityA;
      });
    }
    
    return [...execution.ruleIds];
  }

  // Apply rule to a diagram instead of a model
  applyRuleToDiagram(
    ruleId: string,
    diagramId: string,
    match?: PatternMatch
  ): { success: boolean, resultDiagramId: string, step?: TransformationStep } {
    const { diagramService } = require('../diagram');
    
    const diagram = diagramService.getDiagramById(diagramId);
    if (!diagram) {
      console.error(`[RuleApplication] Diagram ${diagramId} not found`);
      return { success: false, resultDiagramId: diagramId };
    }
    
    const modelId = diagram.modelId;
    const rule = transformationCrudService.getRuleById(ruleId);
    if (!rule) {
      console.error(`[RuleApplication] Rule ${ruleId} not found`);
      return { success: false, resultDiagramId: diagramId };
    }
    
    if (!match) {
      const matches = transformationCoreService.findPatternMatches(rule.lhs, modelId);
      if (matches.length === 0) {
        console.error(`[RuleApplication] No matches found for rule ${rule.name}`);
        return { success: false, resultDiagramId: diagramId };
      }
      match = matches[0];
    }
    
    const modelResult = transformationCoreService.applyRule(ruleId, modelId, match);
    if (!modelResult.success || !modelResult.step) {
      return { success: false, resultDiagramId: diagramId };
    }
    
    const diagramElementsToUpdate: string[] = [];
    
    if (modelResult.step.resultElements) {
      modelResult.step.resultElements.forEach(modelElementId => {
        const existingDiagramElements = diagramService.getDiagramElementsByModelElement(diagramId, modelElementId);
        
        if (existingDiagramElements.length === 0) {
          console.log(`[DiagramTransformation] New model element ${modelElementId} has no diagram representation`);
        } else {
          existingDiagramElements.forEach((element: DiagramElement) => {
            diagramElementsToUpdate.push(element.id);
          });
        }
      });
    }
    
    const stepWithDiagram: TransformationStep = {
      ...modelResult.step,
      diagramElements: diagramElementsToUpdate
    };
    
    return {
      success: modelResult.success,
      resultDiagramId: diagramId,
      step: stepWithDiagram
    };
  }
  
  // Execute transformation on a diagram
  executeDiagramTransformation(executionId: string, diagramId: string): boolean {
    console.log(`[DiagramTransformation] Starting execution of ${executionId} on diagram ${diagramId}`);
    const execution = transformationCrudService.getExecutionById(executionId);
    if (!execution) {
      console.error(`[DiagramTransformation] Execution ${executionId} not found`);
      return false;
    }
    
    const diagramService = require('../diagram').diagramService;
    
    const diagram = diagramService.getDiagramById(diagramId);
    if (!diagram) {
      console.error(`[DiagramTransformation] Diagram ${diagramId} not found`);
      return false;
    }
    
    const modelId = diagram.modelId;
    console.log(`[DiagramTransformation] Using model ${modelId} from diagram ${diagramId}`);
    
    transformationCrudService.updateExecution(executionId, { sourceModelId: modelId });
    
    const modelTransformationSuccess = this.executeTransformation(executionId);
    if (!modelTransformationSuccess) {
      console.error(`[DiagramTransformation] Model transformation failed`);
      return false;
    }
    
    const updatedExecution = transformationCrudService.getExecutionById(executionId);
    if (!updatedExecution || !updatedExecution.stepResults) {
      console.error(`[DiagramTransformation] No step results after model transformation`);
      return false;
    }
    
    console.log(`[DiagramTransformation] Found ${updatedExecution.stepResults.length} steps to map to diagram elements`);
    
    const updatedModel = modelService.getModelById(modelId);
    if (!updatedModel) {
      console.error(`[DiagramTransformation] Could not retrieve updated model ${modelId}`);
      return false;
    }
    
    const diagramElementsToSync = new Set<string>();
    
    const stepsWithDiagramElements = updatedExecution.stepResults.map(step => {
      const diagramElements: string[] = [];
      
      if (step.appliedElements && step.appliedElements.length > 0) {
        step.appliedElements.forEach(modelElementId => {
          let elements = diagramService.getDiagramElementsByModelElement(diagramId, modelElementId);
          
          if (elements.length === 0) {
            const diagram = diagramService.getDiagramById(diagramId);
            if (diagram) {
              elements = diagram.elements.filter((element: DiagramElement) => 
                element.style && element.style.linkedModelElementId === modelElementId
              );
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
      
      if (step.resultElements && step.resultElements.length > 0) {
        step.resultElements.forEach(modelElementId => {
          let elements = diagramService.getDiagramElementsByModelElement(diagramId, modelElementId);
          
          if (elements.length === 0) {
            const diagram = diagramService.getDiagramById(diagramId);
            if (diagram) {
              elements = diagram.elements.filter((element: DiagramElement) => 
                element.style && element.style.linkedModelElementId === modelElementId
              );
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
      
      return {
        ...step,
        diagramElements
      };
    });
    
    const syncedElements = Array.from(diagramElementsToSync);
    console.log(`[DiagramTransformation] Syncing ${syncedElements.length} diagram elements with their model elements`);
    
    syncedElements.forEach(diagramElementId => {
      const diagramElement = diagram.elements.find((e: DiagramElement) => e.id === diagramElementId);
      if (!diagramElement) return;
      
      let modelElementId = diagramElement.modelElementId;
      if (!modelElementId && diagramElement.style && diagramElement.style.linkedModelElementId) {
        modelElementId = diagramElement.style.linkedModelElementId;
      }
      
      if (!modelElementId) return;
      
      const modelElement = updatedModel.elements.find((e: any) => e.id === modelElementId);
      if (!modelElement || !modelElement.style) return;
      
      const newStyle = {
        ...diagramElement.style,
        ...modelElement.style
      };
      
      console.log(`[DiagramTransformation] Syncing diagram element ${diagramElementId} with model element ${modelElementId}`);
      diagramService.updateElement(diagramId, diagramElementId, { style: newStyle });
    });
    
    transformationCrudService.updateExecution(executionId, { stepResults: stepsWithDiagramElements });
    
    console.log(`[DiagramTransformation] Completed execution with ${stepsWithDiagramElements.length} steps`);
    return true;
  }
}

export const transformationExecutionService = new TransformationExecutionService();
