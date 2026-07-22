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
import { modelInheritanceUtilsService, modelService } from '../model';
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
  return sourceClass && metamodel
    ? modelInheritanceUtilsService
      .getAllReferences(sourceClass, metamodel)
      .find(ref => ref.name === referenceName || ref.id === referenceName)
    : undefined;
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
    const nestedNodes = this.applyContainerMappings(
      positionedNodes,
      model,
      metamodel,
      representationDescription
    );

    const nodeIds = new Set(nestedNodes.map(node => node.id));
    const edges = [
      ...this.materializeConnectionEdges(model, nodeIds, metamodel, representationDescription),
      ...this.materializeReferenceEdges(model, nodeIds, metamodel, representationDescription),
    ];

    return {
      ...diagram,
      includedElementIds,
      elements: [...nestedNodes, ...edges],
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
    const containerMapping = representationDescription?.containerMappings?.find(mapping => (
      this.isMetaClassCompatible(element.modelElementId, [mapping.containerMetaClassId], metamodel)
    ));
    const containerAppearance = containerMapping?.concreteSyntax?.two_d;
    const effectiveAppearance = containerAppearance
      ? {
          ...resolvedAppearance,
          ...containerAppearance,
          defaultSize: containerAppearance.defaultSize || resolvedAppearance.defaultSize,
        }
      : resolvedAppearance;
    const size2D = presentation.size2D || effectiveAppearance.defaultSize || DEFAULT_SIZE_2D;
    const size3D = presentation.size3D;
    const appearance = stringifyAppearance(effectiveAppearance);

    return {
      id: element.id,
      type: 'node',
      modelElementId: element.modelElementId,
      x: position2D.x,
      y: position2D.y,
      width: size2D.width,
      height: size2D.height,
      ...(containerMapping && { containerMappingId: containerMapping.id }),
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
      .filter(connection => {
        const source = model.elements.find(element => element.id === connection.sourceId);
        const reference = source
          ? getReferenceDefinition(
              metamodel,
              source,
              connection.referenceId || connection.referenceName || connection.type || ''
            )
          : undefined;
        return !reference || !this.isContainerReference(
          source!.modelElementId,
          reference,
          representationDescription,
          metamodel
        );
      })
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
        if (reference && this.isContainerReference(
          source.modelElementId,
          reference,
          representationDescription,
          metamodel
        )) continue;
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

  private isContainerReference(
    sourceMetaClassId: string,
    reference: MetaReference,
    representationDescription: RepresentationDescription | undefined,
    metamodel: Metamodel | undefined
  ): boolean {
    return Boolean(representationDescription?.containerMappings?.some(mapping => (
      this.isMetaClassCompatible(sourceMetaClassId, [mapping.containerMetaClassId], metamodel)
      && (
        mapping.containmentReferenceId === reference.id
        || mapping.containmentReferenceId === reference.name
      )
    )));
  }

  private applyContainerMappings(
    nodes: DiagramElement[],
    model: Model,
    metamodel?: Metamodel,
    representationDescription?: RepresentationDescription
  ): DiagramElement[] {
    const mappings = representationDescription?.containerMappings || [];
    if (!metamodel || mappings.length === 0) return nodes;

    const nextNodes = nodes.map(node => ({ ...node }));
    const nodesById = new Map(nextNodes.map(node => [node.id, node]));
    const modelElementsById = new Map(model.elements.map(element => [element.id, element]));
    const assignedParents = new Set<string>();

    for (const mapping of mappings) {
      for (const containerElement of model.elements) {
        if (!this.isMetaClassCompatible(
          containerElement.modelElementId,
          [mapping.containerMetaClassId],
          metamodel
        )) continue;

        const containerNode = nodesById.get(containerElement.id);
        if (!containerNode) continue;

        const containerClass = metamodel.classes.find(candidate => candidate.id === containerElement.modelElementId);
        if (!containerClass) continue;
        const reference = modelInheritanceUtilsService
          .getAllReferences(containerClass, metamodel)
          .find(candidate => (
            candidate.containment
            && (
              candidate.id === mapping.containmentReferenceId
              || candidate.name === mapping.containmentReferenceId
            )
          ));
        if (!reference) continue;

        containerNode.containerMappingId = mapping.id;
        const rawTargets = containerElement.references?.[reference.name]
          ?? containerElement.references?.[reference.id];
        const targetIds = Array.isArray(rawTargets) ? rawTargets : rawTargets ? [rawTargets] : [];

        for (const targetId of targetIds) {
          if (targetId === containerNode.id || assignedParents.has(targetId)) continue;
          const childNode = nodesById.get(targetId);
          const childElement = modelElementsById.get(targetId);
          if (!childNode || !childElement) continue;

          const allowedChildIds = mapping.childMetaClassIds?.length
            ? mapping.childMetaClassIds
            : [reference.target];
          if (!this.isMetaClassCompatible(childElement.modelElementId, allowedChildIds, metamodel)) continue;

          const isPin = representationDescription?.pinMappings?.some(pinMapping => (
            this.isMetaClassCompatible(childElement.modelElementId, pinMapping.pinMetaClassIds, metamodel)
          ));
          if (isPin) continue;

          childNode.parentId = containerNode.id;
          assignedParents.add(childNode.id);
        }
      }
    }

    this.keepChildrenInsideContainers(nextNodes);
    return this.sortNodesByContainment(nextNodes);
  }

  private keepChildrenInsideContainers(nodes: DiagramElement[]): void {
    const nodesById = new Map(nodes.map(node => [node.id, node]));
    const childrenByParent = new Map<string, DiagramElement[]>();
    nodes.forEach(node => {
      if (!node.parentId || !nodesById.has(node.parentId)) return;
      const children = childrenByParent.get(node.parentId) || [];
      children.push(node);
      childrenByParent.set(node.parentId, children);
    });

    const visited = new Set<string>();
    const positionChildren = (parent: DiagramElement) => {
      if (visited.has(parent.id)) return;
      visited.add(parent.id);

      const parentX = parent.x ?? 0;
      const parentY = parent.y ?? 0;
      const parentWidth = Math.max(parent.width ?? DEFAULT_SIZE_2D.width, 1);
      const parentHeight = Math.max(parent.height ?? DEFAULT_SIZE_2D.height, 1);
      const padding = 12;
      const header = 28;

      for (const child of childrenByParent.get(parent.id) || []) {
        const childWidth = Math.min(child.width ?? DEFAULT_SIZE_2D.width, Math.max(1, parentWidth - padding * 2));
        const childHeight = Math.min(child.height ?? DEFAULT_SIZE_2D.height, Math.max(1, parentHeight - header - padding));
        const minX = parentX + padding;
        const maxX = Math.max(minX, parentX + parentWidth - childWidth - padding);
        const minY = parentY + header;
        const maxY = Math.max(minY, parentY + parentHeight - childHeight - padding);

        child.width = childWidth;
        child.height = childHeight;
        child.x = Math.min(maxX, Math.max(minX, child.x ?? minX));
        child.y = Math.min(maxY, Math.max(minY, child.y ?? minY));
        positionChildren(child);
      }
    };

    nodes.filter(node => !node.parentId || !nodesById.has(node.parentId)).forEach(positionChildren);
  }

  private sortNodesByContainment(nodes: DiagramElement[]): DiagramElement[] {
    const nodesById = new Map(nodes.map(node => [node.id, node]));
    const depthById = new Map<string, number>();
    const getDepth = (node: DiagramElement, path = new Set<string>()): number => {
      const cached = depthById.get(node.id);
      if (cached !== undefined) return cached;
      if (!node.parentId || path.has(node.id)) return 0;
      const parent = nodesById.get(node.parentId);
      if (!parent) return 0;
      const nextPath = new Set(path);
      nextPath.add(node.id);
      const depth = 1 + getDepth(parent, nextPath);
      depthById.set(node.id, depth);
      return depth;
    };

    return nodes
      .map((node, index) => ({ node, index, depth: getDepth(node) }))
      .sort((left, right) => left.depth - right.depth || left.index - right.index)
      .map(entry => entry.node);
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
