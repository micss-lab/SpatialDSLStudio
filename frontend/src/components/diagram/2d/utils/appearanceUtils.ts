import { DiagramElement, Model } from '../../../../models/types';
import { concreteSyntaxResolver, defaultResolvedAppearance2D } from '../../../../services/diagram/concrete-syntax.resolver';
import { metamodelService } from '../../../../services/metamodel';

/**
 * Default appearance settings for diagram elements
 */
export interface AppearanceSettings {
  type: string;
  shape: string;
  color: string;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  imageSrc?: string;
  imageUrl?: string;
  imageFileId?: string;
  modelUrl?: string;
  modelSrc?: string;
  modelFileId?: string;
  fontSize?: number;
  fontFamily?: string;
  fontColor?: string;
  labelPosition?: 'below' | 'inside' | 'hidden';
  lineWidth?: number;
  lineColor?: string;
  lineDash?: number[];
}

export type AttachmentSide = 'top' | 'right' | 'bottom' | 'left';

export interface Point2D {
  x: number;
  y: number;
}

export interface Bounds2D extends Point2D {
  width: number;
  height: number;
}

export const defaultAppearance = defaultResolvedAppearance2D;

/**
 * Parse appearance settings from element style
 * @param element - The diagram element
 * @param model - The model (optional, for linked element lookup)
 * @returns Parsed appearance settings with defaults
 */
export const getAppearanceSettings = (
  element: DiagramElement,
  model?: Model | null
): AppearanceSettings => {
  const metamodel = model ? metamodelService.getMetamodelById(model.conformsTo || model.metamodelId) : undefined;
  return concreteSyntaxResolver.resolveDiagramElementAppearance(element, model, metamodel) as AppearanceSettings;
};

/**
 * Get the display name for an element, checking linked model elements
 * @param element - The diagram element
 * @param model - The model (optional, for linked element lookup)
 * @returns Display name for the element
 */
export const getElementDisplayName = (
  element: DiagramElement,
  model?: Model | null
): string => {
  // Check if this element is linked to a model element
  if (element.style.linkedModelElementId && model) {
    // Find the linked model element
    const linkedElement = model.elements.find(e => e.id === element.style.linkedModelElementId);

    // If found, use its name
    if (linkedElement && linkedElement.style.name) {
      return linkedElement.style.name;
    }
  }

  // Fallback to element's own name or default
  return element.style.name || 'Unnamed';
};

/**
 * Get fill color with highlight support
 * @param appearance - Appearance settings
 * @param isHighlighted - Whether the element is highlighted
 * @returns Fill color string
 */
export const getFillColor = (appearance: AppearanceSettings, isHighlighted: boolean): string => {
  return isHighlighted
    ? 'rgba(255, 165, 0, 0.2)' // Light orange background for highlight
    : (appearance.fillColor || appearance.color || '#4287f5');
};

/**
 * Get stroke color with selection and highlight support
 * @param appearance - Appearance settings
 * @param isSelected - Whether the element is selected
 * @param isHighlighted - Whether the element is highlighted
 * @returns Stroke color string
 */
export const getStrokeColor = (
  appearance: AppearanceSettings,
  isSelected: boolean,
  isHighlighted: boolean
): string => {
  if (isHighlighted) {
    return '#FFA500'; // Orange outline for highlight
  }
  return isSelected ? '#3f51b5' : (appearance.strokeColor || 'black');
};

/**
 * Get stroke width with selection and highlight support
 * @param appearance - Appearance settings
 * @param isSelected - Whether the element is selected
 * @param isHighlighted - Whether the element is highlighted
 * @returns Stroke width number
 */
export const getStrokeWidth = (
  appearance: AppearanceSettings,
  isSelected: boolean,
  isHighlighted: boolean
): number => {
  const baseWidth = appearance.strokeWidth || 1;
  return (isHighlighted || isSelected) ? baseWidth + 1 : baseWidth;
};

export const getElementBounds = (element: DiagramElement): Bounds2D => ({
  x: element.x || 0,
  y: element.y || 0,
  width: element.width || 100,
  height: element.height || 50,
});

export const getElementCenter = (element: DiagramElement): Point2D => {
  const bounds = getElementBounds(element);
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const normalizeAllowedSides = (allowedSides?: AttachmentSide[]): AttachmentSide[] => {
  const uniqueSides = Array.from(new Set(allowedSides || []));
  return uniqueSides.length > 0 ? uniqueSides : ['top', 'right', 'bottom', 'left'];
};

export const getNearestAttachmentOnBoundary = (
  ownerBounds: Bounds2D,
  point: Point2D,
  allowedSides?: AttachmentSide[]
): { side: AttachmentSide; attachmentOffsetRatio: number } => {
  const candidates = normalizeAllowedSides(allowedSides).map(side => {
    const distance = side === 'top'
      ? Math.abs(point.y - ownerBounds.y)
      : side === 'right'
        ? Math.abs(point.x - (ownerBounds.x + ownerBounds.width))
        : side === 'bottom'
          ? Math.abs(point.y - (ownerBounds.y + ownerBounds.height))
          : Math.abs(point.x - ownerBounds.x);

    const attachmentOffsetRatio = side === 'top' || side === 'bottom'
      ? clamp01((point.x - ownerBounds.x) / ownerBounds.width)
      : clamp01((point.y - ownerBounds.y) / ownerBounds.height);

    return { side, distance, attachmentOffsetRatio };
  });

  const closest = candidates.reduce((best, candidate) => (
    candidate.distance < best.distance ? candidate : best
  ));

  return {
    side: closest.side,
    attachmentOffsetRatio: closest.attachmentOffsetRatio,
  };
};

export const getAttachedNodePosition = (
  ownerBounds: Bounds2D,
  nodeSize: { width: number; height: number },
  side: AttachmentSide,
  attachmentOffsetRatio: number
): Point2D => {
  const offsetRatio = clamp01(attachmentOffsetRatio);

  if (side === 'top') {
    return {
      x: ownerBounds.x + ownerBounds.width * offsetRatio - nodeSize.width / 2,
      y: ownerBounds.y - nodeSize.height / 2,
    };
  }

  if (side === 'right') {
    return {
      x: ownerBounds.x + ownerBounds.width - nodeSize.width / 2,
      y: ownerBounds.y + ownerBounds.height * offsetRatio - nodeSize.height / 2,
    };
  }

  if (side === 'bottom') {
    return {
      x: ownerBounds.x + ownerBounds.width * offsetRatio - nodeSize.width / 2,
      y: ownerBounds.y + ownerBounds.height - nodeSize.height / 2,
    };
  }

  return {
    x: ownerBounds.x - nodeSize.width / 2,
    y: ownerBounds.y + ownerBounds.height * offsetRatio - nodeSize.height / 2,
  };
};

type BoundaryKind = 'box' | 'ellipse' | 'diamond';

export interface ShapeGeometry2D {
  kind: BoundaryKind;
  center: Point2D;
  halfWidth: number;
  halfHeight: number;
}

/**
 * Outline the 2D renderer draws for a node shape, in diagram coordinates.
 * Squares are drawn width x width from the top-left corner and circles use
 * the smaller side as diameter; unknown shapes fall back to the bounding box.
 */
export const getShapeGeometry = (element: DiagramElement, shape?: string): ShapeGeometry2D => {
  const bounds = getElementBounds(element);
  if (shape === 'square') {
    const half = bounds.width / 2;
    return { kind: 'box', center: { x: bounds.x + half, y: bounds.y + half }, halfWidth: half, halfHeight: half };
  }
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  if (shape === 'circle') {
    const radius = Math.min(bounds.width, bounds.height) / 2;
    return { kind: 'ellipse', center, halfWidth: radius, halfHeight: radius };
  }
  if (shape === 'ellipse') {
    return { kind: 'ellipse', center, halfWidth: bounds.width / 2, halfHeight: bounds.height / 2 };
  }
  if (shape === 'diamond') {
    return { kind: 'diamond', center, halfWidth: bounds.width / 2, halfHeight: bounds.height / 2 };
  }
  return { kind: 'box', center, halfWidth: bounds.width / 2, halfHeight: bounds.height / 2 };
};

/**
 * Point where the ray from the shape's centre towards `toward` leaves the
 * shape outline (ray-box, ray-ellipse, or ray-rhombus intersection).
 */
export const getShapeBoundaryPoint = (geometry: ShapeGeometry2D, toward: Point2D): Point2D => {
  const dx = toward.x - geometry.center.x;
  const dy = toward.y - geometry.center.y;
  if ((dx === 0 && dy === 0) || geometry.halfWidth <= 0 || geometry.halfHeight <= 0) return geometry.center;
  const rx = Math.abs(dx) / geometry.halfWidth;
  const ry = Math.abs(dy) / geometry.halfHeight;
  const scale = geometry.kind === 'ellipse'
    ? 1 / Math.sqrt(rx * rx + ry * ry)
    : geometry.kind === 'diamond'
      ? 1 / (rx + ry)
      : 1 / Math.max(rx, ry);
  return { x: geometry.center.x + dx * scale, y: geometry.center.y + dy * scale };
};

export interface EdgeEndpointOptions {
  /** Resolved node shapes; endpoints are clipped to these outlines. */
  sourceShape?: string;
  targetShape?: string;
  /** Point the source end heads towards, normally the first bend point. */
  sourceToward?: Point2D;
  /** Point the target end comes from, normally the last bend point. */
  targetToward?: Point2D;
}

/**
 * Edge endpoints on the node outlines. Each end is clipped along the segment
 * towards its adjacent point: the first or last bend point when the edge has
 * bends, otherwise the other node's centre. The `*UsesCenter` flags keep the
 * older behaviour of anchoring an end at the node centre.
 */
export const getEdgeEndpointPair = (
  sourceElement: DiagramElement,
  targetElement: DiagramElement,
  sourceUsesCenter: boolean = false,
  targetUsesCenter: boolean = false,
  options: EdgeEndpointOptions = {}
): { source: Point2D; target: Point2D } => {
  const sourceGeometry = getShapeGeometry(sourceElement, options.sourceShape);
  const targetGeometry = getShapeGeometry(targetElement, options.targetShape);
  const sourceToward = options.sourceToward || targetGeometry.center;
  const targetToward = options.targetToward || sourceGeometry.center;

  return {
    source: sourceUsesCenter ? sourceGeometry.center : getShapeBoundaryPoint(sourceGeometry, sourceToward),
    target: targetUsesCenter ? targetGeometry.center : getShapeBoundaryPoint(targetGeometry, targetToward),
  };
};

/**
 * Edge label text. A notation `labelFormat` is a template: `{name}` is the
 * edge name and `{key}` a reference attribute such as `{guard}`. A template
 * whose placeholders all resolve to empty values yields no label. Without a
 * format, the edge name is shown.
 */
export const formatEdgeLabel = (
  labelFormat: string | undefined,
  name: string | undefined,
  attributes: Record<string, unknown> = {}
): string | undefined => {
  if (labelFormat === undefined) return name || undefined;
  let placeholders = 0;
  let resolved = 0;
  const text = labelFormat.replace(/\{([^{}]+)\}/g, (_match, key: string) => {
    placeholders += 1;
    const value = key === 'name' ? name : attributes[key];
    const textValue = value === undefined || value === null ? '' : String(value);
    if (textValue) resolved += 1;
    return textValue;
  });
  if (placeholders > 0 && resolved === 0) return undefined;
  return text.trim() || undefined;
};

/** Midpoint along a polyline, measured by length. */
export const getPolylineMidpoint = (points: Point2D[]): Point2D => {
  if (points.length === 0) return { x: 0, y: 0 };
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index] && lengths[index] > 0) {
      const ratio = remaining / lengths[index];
      return {
        x: points[index].x + (points[index + 1].x - points[index].x) * ratio,
        y: points[index].y + (points[index + 1].y - points[index].y) * ratio,
      };
    }
    remaining -= lengths[index];
  }
  return points[points.length - 1];
};
