import {
  Diagram,
  DiagramElement,
  MetaReference,
  Metamodel,
  Model,
  ModelElement,
  RepresentationDescription,
  Viewpoint,
} from '../../models/types';
import { metamodelService } from '../metamodel';
import { modelService } from '../model';
import { viewpointService } from '../viewpoint.service';
import { concreteSyntaxResolver } from './concrete-syntax.resolver';

const DEFAULT_SIZE_2D = { width: 120, height: 80 };

const stringifyAppearance = (appearance: unknown): string | undefined => {
  if (!appearance) return undefined;
  if (typeof appearance === 'string') return appearance;

  try {
    return JSON.stringify(appearance);
  } catch {
    return undefined;
  }
};

const getReferenceDefinition = (
  metamodel: Metamodel | undefined,
  source: ModelElement,
  referenceName: string
): MetaReference | undefined => {
  const sourceClass = metamodel?.classes.find(cls => cls.id === source.modelElementId);
  return sourceClass?.references.find(ref => ref.name === referenceName || ref.id === referenceName);
};

export class ViewProjectionService {
  materializeDiagram(diagram: Diagram): Diagram {
    const model = modelService.getModelById(diagram.modelId);
    const hasLegacyElements = Array.isArray(diagram.elements) && diagram.elements.length > 0;
    const hasMembership = Array.isArray(diagram.includedElementIds) && diagram.includedElementIds.length > 0;
    const isEmptyProjectionView = Array.isArray(diagram.includedElementIds) && !hasLegacyElements;
    const isProjectionView = hasMembership || isEmptyProjectionView || (diagram.schemaVersion === 2 && !hasLegacyElements);

    if (!model || !isProjectionView) {
      return {
        ...diagram,
        includedElementIds: diagram.includedElementIds || this.inferIncludedElementIds(diagram),
      };
    }

    const metamodel = metamodelService.getMetamodelById(model.conformsTo);
    const { viewpoint, representationDescription } = viewpointService.resolveRepresentationDescription(diagram);
    const includedElementIds = this.getIncludedElementIds(diagram);
    const includedSet = new Set(includedElementIds);
    const nodes = model.elements
      .filter(element => includedSet.has(element.id))
      .filter(element => this.isMetaClassVisible(element.modelElementId, representationDescription))
      .map(element => this.materializeNode(element, metamodel, representationDescription, viewpoint));

    const positionedNodes = this.positionAttachedNodes(nodes, model, metamodel, representationDescription);

    const nodeIds = new Set(positionedNodes.map(node => node.id));
    const edges = [
      ...this.materializeConnectionEdges(model, nodeIds, metamodel, representationDescription),
      ...this.materializeReferenceEdges(model, nodeIds, metamodel, representationDescription),
    ];

    return {
      ...diagram,
      includedElementIds,
      elements: [...positionedNodes, ...edges],
      schemaVersion: 2,
    };
  }

  getIncludedElementIds(diagram: Diagram): string[] {
    const ids = Array.isArray(diagram.includedElementIds)
      ? diagram.includedElementIds
      : this.inferIncludedElementIds(diagram);

    return Array.from(new Set(ids.filter(Boolean)));
  }

  private inferIncludedElementIds(diagram: Diagram): string[] {
    return diagram.elements
      .filter(element => element.type === 'node')
      .map(element => element.style?.linkedModelElementId || element.style?.modelElementRefId || element.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
  }

  private materializeNode(
    element: ModelElement,
    metamodel?: Metamodel,
    representationDescription?: RepresentationDescription,
    viewpoint?: Viewpoint
  ): DiagramElement {
    const presentation = element.presentation || {};
    const position2D = presentation.position2D || element.style?.position || { x: 0, y: 0 };
    const resolvedAppearance = concreteSyntaxResolver.resolve2D(element, metamodel, representationDescription, viewpoint);
    const size2D = presentation.size2D || resolvedAppearance.defaultSize || DEFAULT_SIZE_2D;
    const size3D = presentation.size3D;
    const appearance = stringifyAppearance(resolvedAppearance);

    return {
      id: element.id,
      type: 'node',
      modelElementId: element.modelElementId,
      x: position2D.x,
      y: position2D.y,
      width: size2D.width,
      height: size2D.height,
      style: {
        ...element.style,
        linkedModelElementId: element.id,
        name: element.style?.name || element.name,
        ...(presentation.position3D ? { position3D: presentation.position3D } : {}),
        ...(typeof presentation.rotationZ === 'number' ? { rotationZ: presentation.rotationZ } : {}),
        ...(size3D ? size3D : {}),
        ...(appearance ? { appearance } : {}),
      },
    };
  }

  private materializeConnectionEdges(
    model: Model,
    nodeIds: Set<string>,
    metamodel: Metamodel | undefined,
    representationDescription?: RepresentationDescription
  ): DiagramElement[] {
    return (model.connections || [])
      .filter(connection => nodeIds.has(connection.sourceId) && nodeIds.has(connection.targetId))
      .filter(connection => this.isEdgeVisible(
        connection.referenceId,
        connection.referenceName || connection.type,
        connection.sourceId,
        connection.targetId,
        model,
        metamodel,
        representationDescription
      ))
      .map(connection => ({
        id: connection.id,
        type: 'edge' as const,
        modelElementId: connection.referenceId || connection.type || connection.referenceName || 'connection',
        sourceId: connection.sourceId,
        targetId: connection.targetId,
        style: {
          name: connection.referenceName || connection.type || 'connection',
        },
        referenceAttributes: connection.attributes || {},
        ...(connection.bendPoints2D && connection.bendPoints2D.length >= 2
          ? { points: connection.bendPoints2D }
          : {}),
      }));
  }

  private materializeReferenceEdges(
    model: Model,
    nodeIds: Set<string>,
    metamodel: Metamodel | undefined,
    representationDescription?: RepresentationDescription
  ): DiagramElement[] {
    const edges: DiagramElement[] = [];
    const connectionKeys = new Set(
      (model.connections || []).map(connection => (
        `${connection.sourceId}:${connection.referenceName || connection.type || connection.referenceId}:${connection.targetId}`
      ))
    );

    for (const source of model.elements) {
      if (!nodeIds.has(source.id)) continue;

      for (const [referenceName, value] of Object.entries(source.references || {})) {
        if (referenceName.endsWith('_bendPoints') || referenceName.endsWith('_attributes')) continue;

        const targetIds = Array.isArray(value) ? value : value ? [value] : [];
        const reference = getReferenceDefinition(metamodel, source, referenceName);
        const bendPoints = source.references?.[`${referenceName}_bendPoints`] as unknown as Array<{ x: number; y: number }> | undefined;
        const attributes = source.references?.[`${referenceName}_attributes`] as unknown as Record<string, any> | undefined;

        targetIds.forEach((targetId, index) => {
          if (!nodeIds.has(targetId)) return;
          if (!this.isEdgeVisible(reference?.id, reference?.name || referenceName, source.id, targetId, model, metamodel, representationDescription)) return;

          const connectionKey = `${source.id}:${referenceName}:${targetId}`;
          if (connectionKeys.has(connectionKey)) return;

          edges.push({
            id: `ref-${source.id}-${referenceName}-${targetId}-${index}`,
            type: 'edge',
            modelElementId: reference?.id || referenceName,
            sourceId: source.id,
            targetId,
            style: {
              name: reference?.name || referenceName,
            },
            referenceAttributes: attributes || {},
            ...(bendPoints && bendPoints.length >= 2 ? { points: bendPoints } : {}),
          });
        });
      }
    }

    return edges;
  }

  private isMetaClassVisible(metaClassId: string, representationDescription?: RepresentationDescription): boolean {
    return !representationDescription?.visibleMetaClassIds?.length
      || representationDescription.visibleMetaClassIds.includes(metaClassId);
  }

  private isEdgeVisible(
    referenceId: string | undefined,
    referenceName: string | undefined,
    sourceId: string,
    targetId: string,
    model: Model,
    metamodel: Metamodel | undefined,
    representationDescription?: RepresentationDescription
  ): boolean {
    const mappings = representationDescription?.edgeMappings || [];
    if (mappings.length === 0) return true;

    const source = model.elements.find(element => element.id === sourceId);
    const target = model.elements.find(element => element.id === targetId);
    if (!source || !target) return true;

    return mappings.some(mapping => {
      const referenceMatches = !mapping.referenceId && !mapping.referenceName
        ? true
        : mapping.referenceId === referenceId || mapping.referenceName === referenceName;
      const sourceMatches = !mapping.sourceMetaClassIds?.length || mapping.sourceMetaClassIds.includes(source.modelElementId);
      const targetMatches = !mapping.targetMetaClassIds?.length || mapping.targetMetaClassIds.includes(target.modelElementId);
      return referenceMatches && sourceMatches && targetMatches;
    });
  }

  private positionAttachedNodes(
    nodes: DiagramElement[],
    model: Model,
    metamodel?: Metamodel,
    representationDescription?: RepresentationDescription
  ): DiagramElement[] {
    const nodesById = new Map(nodes.map(node => [node.id, node]));

    return nodes.map(node => {
      const modelElement = model.elements.find(element => element.id === node.id);
      const presentation = modelElement?.presentation;
      const pinMapping = modelElement
        ? representationDescription?.pinMappings?.find(mapping => mapping.pinMetaClassIds.includes(modelElement.modelElementId))
          || representationDescription?.pinMappings?.find(mapping => (
            this.isMetaClassCompatible(modelElement.modelElementId, mapping.pinMetaClassIds, metamodel)
          ))
        : undefined;
      const ownerId = presentation?.attachedToElementId || this.findSemanticOwnerId(modelElement, pinMapping);
      if (!ownerId) return node;

      const owner = nodesById.get(ownerId);
      if (!owner || typeof owner.x !== 'number' || typeof owner.y !== 'number') return node;

      const side = presentation?.attachmentSide || pinMapping?.defaultSide || 'left';
      const offsetRatio = Math.max(0, Math.min(1, presentation?.attachmentOffsetRatio ?? pinMapping?.defaultOffsetRatio ?? 0.5));
      const width = node.width || 16;
      const height = node.height || 16;
      const ownerWidth = owner.width || DEFAULT_SIZE_2D.width;
      const ownerHeight = owner.height || DEFAULT_SIZE_2D.height;

      const next = { ...node, width, height };
      if (side === 'top') {
        next.x = owner.x + ownerWidth * offsetRatio - width / 2;
        next.y = owner.y - height / 2;
      } else if (side === 'right') {
        next.x = owner.x + ownerWidth - width / 2;
        next.y = owner.y + ownerHeight * offsetRatio - height / 2;
      } else if (side === 'bottom') {
        next.x = owner.x + ownerWidth * offsetRatio - width / 2;
        next.y = owner.y + ownerHeight - height / 2;
      } else {
        next.x = owner.x - width / 2;
        next.y = owner.y + ownerHeight * offsetRatio - height / 2;
      }

      return next;
    });
  }

  private findSemanticOwnerId(
    modelElement: ModelElement | undefined,
    pinMapping?: { attachmentReferenceName?: string }
  ): string | undefined {
    if (!modelElement) return undefined;
    const referenceNames = [
      pinMapping?.attachmentReferenceName,
      'owner',
      'action',
      'node',
      'parent',
    ].filter((name): name is string => Boolean(name));

    for (const referenceName of referenceNames) {
      const value = modelElement.references?.[referenceName];
      if (typeof value === 'string') return value;
      if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    }

    return undefined;
  }

  private isMetaClassCompatible(
    metaClassId: string,
    allowedMetaClassIds: string[] | undefined,
    metamodel?: Metamodel
  ): boolean {
    if (!allowedMetaClassIds?.length) return true;
    if (allowedMetaClassIds.includes(metaClassId)) return true;
    if (!metamodel) return false;

    const visited = new Set<string>();
    const visit = (candidateId: string): boolean => {
      if (visited.has(candidateId)) return false;
      visited.add(candidateId);

      const metaClass = metamodel.classes.find(cls => cls.id === candidateId);
      if (!metaClass) return false;

      return (metaClass.superTypes || []).some(superTypeId => (
        allowedMetaClassIds.includes(superTypeId) || visit(superTypeId)
      ));
    };

    return visit(metaClassId);
  }
}

export const viewProjectionService = new ViewProjectionService();
