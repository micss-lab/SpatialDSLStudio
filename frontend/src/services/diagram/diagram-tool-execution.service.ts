import {
  DiagramElement,
  MetaClass,
  MetaReference,
  Metamodel,
  ModelElement,
  ModelElementPresentation,
  ToolDefinition,
} from '../../models/types';
import { metamodelService } from '../metamodel';
import { modelInheritanceUtilsService, modelService } from '../model';
import { diagramService } from './diagram.service';
import {
  getExecutableToolType,
  getToolInitialAttributes,
} from './tool-definition.utils';

export interface ToolExecutionResult<T = undefined> {
  ok: boolean;
  message: string;
  value?: T;
}

const success = <T>(message: string, value?: T): ToolExecutionResult<T> => ({
  ok: true,
  message,
  ...(value !== undefined ? { value } : {}),
});

const failure = <T>(message: string): ToolExecutionResult<T> => ({ ok: false, message });

class DiagramToolExecutionService {
  private getLinkedModelElementId(element: DiagramElement): string {
    return element.style?.linkedModelElementId || element.style?.modelElementRefId || element.id;
  }

  private getContext(diagramId: string) {
    const diagram = diagramService.getDiagramById(diagramId);
    if (!diagram) return null;

    const model = modelService.getModelById(diagram.modelId);
    if (!model) return null;

    const metamodel = metamodelService.getMetamodelById(model.conformsTo || model.metamodelId);
    if (!metamodel) return null;

    return { diagram, model, metamodel };
  }

  private isMetaClassCompatible(metamodel: Metamodel, candidateId: string, expectedId: string): boolean {
    if (candidateId === expectedId) return true;

    const visited = new Set<string>();
    const visit = (metaClassId: string): boolean => {
      if (visited.has(metaClassId)) return false;
      visited.add(metaClassId);

      const metaClass = metamodel.classes.find(candidate => candidate.id === metaClassId);
      if (!metaClass) return false;
      return (metaClass.superTypes || []).some(superTypeId => (
        superTypeId === expectedId || visit(superTypeId)
      ));
    };

    return visit(candidateId);
  }

  private getAllReferences(metaClass: MetaClass, metamodel: Metamodel): MetaReference[] {
    return modelInheritanceUtilsService.getAllReferences(metaClass, metamodel);
  }

  private resolveReference(
    sourceElementId: string,
    referenceIdentifier: string | undefined,
    metamodel: Metamodel,
    modelElements: ModelElement[]
  ): MetaReference | undefined {
    if (!referenceIdentifier) return undefined;
    const sourceElement = modelElements.find(element => element.id === sourceElementId);
    const sourceClass = metamodel.classes.find(candidate => candidate.id === sourceElement?.modelElementId);
    if (!sourceClass) return undefined;

    return this.getAllReferences(sourceClass, metamodel)
      .find(reference => reference.id === referenceIdentifier || reference.name === referenceIdentifier);
  }

  async executeCreateNodeTool(
    diagramId: string,
    tool: ToolDefinition,
    presentation?: ModelElementPresentation
  ): Promise<ToolExecutionResult<DiagramElement>> {
    if (getExecutableToolType(tool) !== 'create-node') {
      return failure('The selected tool is not a create-node tool.');
    }

    const context = this.getContext(diagramId);
    if (!context) return failure('The view, model, or metamodel could not be loaded.');

    const metaClass = context.metamodel.classes.find(candidate => candidate.id === tool.metaClassId);
    if (!metaClass || metaClass.abstract) {
      return failure('The create-node tool does not target a concrete metaclass.');
    }

    const initialAttributes = getToolInitialAttributes(tool, metaClass, context.metamodel);
    const style = {
      ...(!Object.prototype.hasOwnProperty.call(initialAttributes, 'name')
        ? { name: `${metaClass.name} 1` }
        : {}),
      ...initialAttributes,
    };

    const created = await diagramService.createModelElementInView(
      diagramId,
      metaClass.id,
      presentation,
      style
    );

    return created
      ? success(`${tool.name} created an element.`, created)
      : failure(`${tool.name} could not create an element.`);
  }

  executeCreateEdgeTool(
    diagramId: string,
    tool: ToolDefinition,
    sourceDiagramElementId: string,
    targetDiagramElementId: string
  ): ToolExecutionResult {
    if (getExecutableToolType(tool) !== 'create-edge') {
      return failure('The selected tool is not a create-edge tool.');
    }

    const context = this.getContext(diagramId);
    if (!context) return failure('The view, model, or metamodel could not be loaded.');

    const sourceNode = context.diagram.elements.find(element => element.id === sourceDiagramElementId && element.type === 'node');
    const targetNode = context.diagram.elements.find(element => element.id === targetDiagramElementId && element.type === 'node');
    if (!sourceNode || !targetNode) return failure('Create-edge tools require a source node and a target node.');

    const sourceElementId = this.getLinkedModelElementId(sourceNode);
    const targetElementId = this.getLinkedModelElementId(targetNode);
    const reference = this.resolveReference(
      sourceElementId,
      tool.referenceId,
      context.metamodel,
      context.model.elements
    );
    if (!reference) return failure('The create-edge tool does not target a reference available on the source node.');

    const created = modelService.setModelElementReference(
      context.model.id,
      sourceElementId,
      reference.name,
      targetElementId
    );

    return created
      ? success(`${tool.name} created an edge.`)
      : failure(`${tool.name} could not create an edge between those nodes.`);
  }

  executeDeleteTool(
    diagramId: string,
    tool: ToolDefinition,
    diagramElement: DiagramElement
  ): ToolExecutionResult {
    if (getExecutableToolType(tool) !== 'delete') {
      return failure('The selected tool is not a delete tool.');
    }

    const context = this.getContext(diagramId);
    if (!context) return failure('The view, model, or metamodel could not be loaded.');

    if (diagramElement.type === 'node') {
      const modelElementId = this.getLinkedModelElementId(diagramElement);
      const deleted = modelService.deleteModelElement(context.model.id, modelElementId);
      if (deleted) diagramService.removeElementsForModelElement(context.model.id, modelElementId);
      return deleted
        ? success(`${tool.name} removed the model element.`)
        : failure(`${tool.name} could not remove the model element.`);
    }

    const connection = (context.model.connections || []).find(candidate => candidate.id === diagramElement.id);
    if (connection) {
      const updated = modelService.updateModel(context.model.id, {
        connections: (context.model.connections || []).filter(candidate => candidate.id !== connection.id),
      });
      return updated
        ? success(`${tool.name} removed the connection.`)
        : failure(`${tool.name} could not remove the connection.`);
    }

    if (!diagramElement.sourceId || !diagramElement.targetId) {
      return failure('The selected edge has no semantic endpoints.');
    }

    const sourceNode = context.diagram.elements.find(element => element.id === diagramElement.sourceId);
    const targetNode = context.diagram.elements.find(element => element.id === diagramElement.targetId);
    if (!sourceNode || !targetNode) return failure('The selected edge endpoints could not be resolved.');

    const sourceElementId = this.getLinkedModelElementId(sourceNode);
    const targetElementId = this.getLinkedModelElementId(targetNode);
    const reference = this.resolveReference(
      sourceElementId,
      diagramElement.modelElementId || diagramElement.style?.name,
      context.metamodel,
      context.model.elements
    ) || this.resolveReference(
      sourceElementId,
      diagramElement.style?.name,
      context.metamodel,
      context.model.elements
    );
    if (!reference) return failure('The selected edge reference could not be resolved.');

    const deleted = modelService.removeModelElementReference(
      context.model.id,
      sourceElementId,
      reference.name,
      targetElementId
    );
    return deleted
      ? success(`${tool.name} removed the reference edge.`)
      : failure(`${tool.name} could not remove the reference edge.`);
  }

  executeReconnectTool(
    diagramId: string,
    tool: ToolDefinition,
    edge: DiagramElement,
    newTargetDiagramElementId: string
  ): ToolExecutionResult {
    if (getExecutableToolType(tool) !== 'reconnect') {
      return failure('The selected tool is not a reconnect tool.');
    }

    const context = this.getContext(diagramId);
    if (!context) return failure('The view, model, or metamodel could not be loaded.');
    if (edge.type !== 'edge' || !edge.sourceId || !edge.targetId) {
      return failure('Select an edge before choosing its new target.');
    }

    const sourceNode = context.diagram.elements.find(element => element.id === edge.sourceId);
    const oldTargetNode = context.diagram.elements.find(element => element.id === edge.targetId);
    const newTargetNode = context.diagram.elements.find(element => (
      element.id === newTargetDiagramElementId && element.type === 'node'
    ));
    if (!sourceNode || !oldTargetNode || !newTargetNode) {
      return failure('The reconnect endpoints could not be resolved.');
    }

    const sourceElementId = this.getLinkedModelElementId(sourceNode);
    const oldTargetElementId = this.getLinkedModelElementId(oldTargetNode);
    const newTargetElementId = this.getLinkedModelElementId(newTargetNode);
    const connection = (context.model.connections || []).find(candidate => candidate.id === edge.id);
    const referenceIdentifier = tool.referenceId
      || connection?.referenceId
      || connection?.referenceName
      || edge.modelElementId
      || edge.style?.name;
    const reference = this.resolveReference(
      sourceElementId,
      referenceIdentifier,
      context.metamodel,
      context.model.elements
    );

    if (tool.referenceId && (!reference || (reference.id !== tool.referenceId && reference.name !== tool.referenceId))) {
      return failure('The reconnect tool does not apply to the selected edge.');
    }

    if (reference) {
      const newTarget = context.model.elements.find(element => element.id === newTargetElementId);
      if (!newTarget || !this.isMetaClassCompatible(context.metamodel, newTarget.modelElementId, reference.target)) {
        return failure('The new target does not conform to the edge reference.');
      }
    }

    if (connection) {
      const updated = modelService.updateModel(context.model.id, {
        connections: (context.model.connections || []).map(candidate => (
          candidate.id === connection.id
            ? { ...candidate, targetId: newTargetElementId }
            : candidate
        )),
      });
      return updated
        ? success(`${tool.name} reconnected the edge target.`)
        : failure(`${tool.name} could not reconnect the edge.`);
    }

    if (!reference) return failure('The selected edge reference could not be resolved.');
    const reconnected = modelService.reconnectModelElementReference(
      context.model.id,
      sourceElementId,
      reference.name,
      oldTargetElementId,
      newTargetElementId
    );
    return reconnected
      ? success(`${tool.name} reconnected the reference target.`)
      : failure(`${tool.name} could not reconnect the reference edge.`);
  }
}

export const diagramToolExecutionService = new DiagramToolExecutionService();
