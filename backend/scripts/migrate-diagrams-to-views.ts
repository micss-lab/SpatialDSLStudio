import { PrismaClient } from '@prisma/client';
import { v5 as uuidv5 } from 'uuid';

const prisma = new PrismaClient();
const UUID_NAMESPACE = '8d9dfb35-57a7-4b2f-86f1-596f6dd3f4a3';

type JsonObject = Record<string, any>;

interface Summary {
  diagramsSeen: number;
  diagramsMigrated: number;
  reusedNodes: number;
  createdNodes: number;
  convertedEdges: number;
  warnings: number;
}

const summary: Summary = {
  diagramsSeen: 0,
  diagramsMigrated: 0,
  reusedNodes: 0,
  createdNodes: 0,
  convertedEdges: 0,
  warnings: 0,
};

interface DiagramPriority {
  diagramId: string;
  nodeCount: number;
  createdAt: Date;
}

const asArray = <T = any>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

const isBetterPresentationSource = (candidate: DiagramPriority, current: DiagramPriority): boolean => {
  if (candidate.nodeCount !== current.nodeCount) {
    return candidate.nodeCount > current.nodeCount;
  }

  const candidateTime = candidate.createdAt.getTime();
  const currentTime = current.createdAt.getTime();
  if (candidateTime !== currentTime) {
    return candidateTime < currentTime;
  }

  return candidate.diagramId < current.diagramId;
};

const modelElementName = (element: JsonObject): string => {
  return element.style?.name || element.name || element.id;
};

const cloneName = (source: JsonObject, ordinal: number): string => {
  const base = modelElementName(source);
  return `${base}_copy_${ordinal}`;
};

const presentationFromNode = (node: JsonObject) => {
  const presentation: JsonObject = {};
  const style = node.style || {};

  if (typeof node.x === 'number' || typeof node.y === 'number') {
    presentation.position2D = {
      x: typeof node.x === 'number' ? node.x : 0,
      y: typeof node.y === 'number' ? node.y : 0,
    };
  }

  if (typeof node.width === 'number' || typeof node.height === 'number') {
    presentation.size2D = {
      width: typeof node.width === 'number' ? node.width : 120,
      height: typeof node.height === 'number' ? node.height : 80,
    };
  }

  if (style.position3D && typeof style.position3D === 'object') {
    presentation.position3D = style.position3D;
  }

  if (['widthMm', 'heightMm', 'depthMm'].some(key => typeof style[key] === 'number')) {
    presentation.size3D = {
      widthMm: typeof style.widthMm === 'number' ? style.widthMm : 500,
      heightMm: typeof style.heightMm === 'number' ? style.heightMm : 800,
      depthMm: typeof style.depthMm === 'number' ? style.depthMm : 200,
    };
  }

  if (typeof style.rotationZ === 'number') {
    presentation.rotationZ = style.rotationZ;
  }

  if (style.appearance !== undefined) {
    if (typeof style.appearance === 'string') {
      try {
        presentation.appearance = JSON.parse(style.appearance);
      } catch {
        presentation.appearance = { value: style.appearance };
      }
    } else if (typeof style.appearance === 'object') {
      presentation.appearance = style.appearance;
    }
  }

  return presentation;
};

const mergePresentation = (element: JsonObject, presentation: JsonObject) => ({
  ...(element.presentation || {}),
  ...presentation,
  position2D: presentation.position2D || element.presentation?.position2D,
  position3D: presentation.position3D || element.presentation?.position3D,
  size2D: presentation.size2D || element.presentation?.size2D,
  size3D: presentation.size3D || element.presentation?.size3D,
  appearance: presentation.appearance || element.presentation?.appearance,
});

const stripPresentationStyle = (style: JsonObject = {}) => {
  const {
    linkedModelElementId,
    modelElementRefId,
    position,
    position3D,
    widthMm,
    heightMm,
    depthMm,
    rotationZ,
    appearance,
    ...modelStyle
  } = style;
  return modelStyle;
};

const findReference = (metamodel: JsonObject | null, edge: JsonObject, source: JsonObject) => {
  const classes = asArray<JsonObject>(metamodel?.classes);
  const sourceClass = classes.find(cls => cls.id === source.modelElementId);
  return asArray<JsonObject>(sourceClass?.references).find(ref =>
    ref.id === edge.modelElementId || ref.name === edge.style?.name
  );
};

async function migrate() {
  const diagrams = await prisma.diagram.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  summary.diagramsSeen = diagrams.length;
  const diagramPriorities = new Map<string, DiagramPriority>(
    diagrams.map(diagram => {
      const legacyElements = asArray<JsonObject>(diagram.elements);
      return [
        diagram.id,
        {
          diagramId: diagram.id,
          nodeCount: legacyElements.filter(element => element.type === 'node').length,
          createdAt: diagram.createdAt,
        },
      ];
    })
  );
  const presentationSources = new Map<string, DiagramPriority>();

  for (const diagram of diagrams) {
    const legacyElements = asArray<JsonObject>(diagram.elements);
    const existingIncluded = asArray<string>((diagram as any).includedElementIds);
    const alreadyMigrated = existingIncluded.length > 0 || legacyElements.length === 0;
    if ((diagram as any).schemaVersion === 2 && alreadyMigrated) continue;

    const model = await prisma.model.findUnique({ where: { id: diagram.modelId } });
    if (!model) continue;

    const metamodel = await prisma.metamodel.findUnique({ where: { id: model.conformsToId } });
    const modelElements = asArray<JsonObject>(model.elements).map(element => ({ ...element }));
    const modelElementById = new Map(modelElements.map(element => [element.id, element]));
    const connections = asArray<JsonObject>(model.connections).map(connection => ({ ...connection }));
    const nodeToModelElementId = new Map<string, string>();
    const consumedInDiagram = new Set<string>();
    const includedElementIds: string[] = [];
    const migrationWarnings: string[] = [];
    const nodes = legacyElements.filter(element => element.type === 'node');
    const edges = legacyElements.filter(element => element.type === 'edge');

    const createdCopyCounts = new Map<string, number>();

    for (const node of nodes) {
      const linkedId = node.style?.linkedModelElementId || node.style?.modelElementRefId;
      const linked = linkedId ? modelElementById.get(linkedId) : undefined;
      const candidates = modelElements.filter(element =>
        element.modelElementId === node.modelElementId && !consumedInDiagram.has(element.id)
      );

      let resolved = linked && !consumedInDiagram.has(linked.id) ? linked : undefined;
      let createdForNode = false;
      if (!resolved && candidates.length === 1) {
        resolved = candidates[0];
      }

      if (!resolved) {
        const source = linked || candidates[0] || { modelElementId: node.modelElementId, style: {}, references: {} };
        const copyOrdinal = (createdCopyCounts.get(source.id || node.modelElementId) || 1) + 1;
        createdCopyCounts.set(source.id || node.modelElementId, copyOrdinal);

        resolved = {
          ...source,
          id: uuidv5(`${diagram.id}:${node.id}:${copyOrdinal}`, UUID_NAMESPACE),
          style: {
            ...(source.style || {}),
            ...stripPresentationStyle(node.style),
          },
          references: { ...(source.references || {}) },
          presentation: undefined,
        };
        if (source.style?.name || source.name) {
          resolved.style.name = cloneName(source, copyOrdinal);
        }
        modelElements.push(resolved);
        modelElementById.set(resolved.id, resolved);
        summary.createdNodes++;
        createdForNode = true;
      } else {
        summary.reusedNodes++;
        resolved.style = {
          ...(resolved.style || {}),
          ...stripPresentationStyle(node.style),
        };
      }

      const nodePresentation = presentationFromNode(node);
      const currentPriority = presentationSources.get(resolved.id);
      const diagramPriority = diagramPriorities.get(diagram.id);
      if (createdForNode || !currentPriority || (diagramPriority && isBetterPresentationSource(diagramPriority, currentPriority))) {
        resolved.presentation = mergePresentation(resolved, nodePresentation);
        if (diagramPriority) {
          presentationSources.set(resolved.id, diagramPriority);
        }
      }

      consumedInDiagram.add(resolved.id);
      includedElementIds.push(resolved.id);
      nodeToModelElementId.set(node.id, resolved.id);
    }

    for (const edge of edges) {
      const sourceId = edge.sourceId ? nodeToModelElementId.get(edge.sourceId) : undefined;
      const targetId = edge.targetId ? nodeToModelElementId.get(edge.targetId) : undefined;
      if (!sourceId || !targetId) {
        migrationWarnings.push(`Skipped edge ${edge.id}: source or target node was not migrated`);
        continue;
      }

      const source = modelElementById.get(sourceId);
      if (!source) continue;

      const reference = findReference(metamodel as JsonObject | null, edge, source);
      const referenceName = reference?.name || edge.style?.name || edge.modelElementId;
      source.references = source.references || {};

      const current = source.references[referenceName];
      if (Array.isArray(current)) {
        if (!current.includes(targetId)) current.push(targetId);
      } else if (current && current !== targetId) {
        source.references[referenceName] = [current, targetId];
      } else {
        source.references[referenceName] = targetId;
      }

      if (edge.points) source.references[`${referenceName}_bendPoints`] = edge.points;
      if (edge.referenceAttributes) source.references[`${referenceName}_attributes`] = edge.referenceAttributes;

      const connectionKey = `${sourceId}:${reference?.id || edge.modelElementId}:${targetId}`;
      const existingConnection = connections.find(connection =>
        `${connection.sourceId}:${connection.referenceId || connection.type}:${connection.targetId}` === connectionKey
      );

      if (existingConnection) {
        existingConnection.referenceName = referenceName;
        existingConnection.attributes = {
          ...(existingConnection.attributes || {}),
          ...(edge.referenceAttributes || {}),
        };
        existingConnection.bendPoints2D = edge.points || existingConnection.bendPoints2D;
      } else {
        connections.push({
          id: uuidv5(`${diagram.id}:${edge.id}`, UUID_NAMESPACE),
          sourceId,
          targetId,
          referenceId: reference?.id || edge.modelElementId,
          referenceName,
          type: referenceName,
          attributes: edge.referenceAttributes || {},
          bendPoints2D: edge.points,
        });
      }
      summary.convertedEdges++;
    }

    await prisma.model.update({
      where: { id: model.id },
      data: {
        elements: modelElements as any,
        connections: connections as any,
      },
    });

    await prisma.diagram.update({
      where: { id: diagram.id },
      data: {
        includedElementIds: includedElementIds as any,
        schemaVersion: 2,
        migrationWarnings: migrationWarnings as any,
      } as any,
    });

    summary.diagramsMigrated++;
    summary.warnings += migrationWarnings.length;
  }

  console.log(JSON.stringify(summary, null, 2));
}

migrate()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
