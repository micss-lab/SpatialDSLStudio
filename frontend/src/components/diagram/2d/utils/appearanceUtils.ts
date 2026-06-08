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

export const getEdgeEndpointPair = (
  sourceElement: DiagramElement,
  targetElement: DiagramElement,
  sourceUsesCenter: boolean = false,
  targetUsesCenter: boolean = false
): { source: Point2D; target: Point2D } => {
  const sourceBounds = getElementBounds(sourceElement);
  const targetBounds = getElementBounds(targetElement);
  const sourceCenter = getElementCenter(sourceElement);
  const targetCenter = getElementCenter(targetElement);
  const angle = Math.atan2(targetCenter.y - sourceCenter.y, targetCenter.x - sourceCenter.x);

  const sourceRadius = Math.min(sourceBounds.width, sourceBounds.height) / 2;
  const targetRadius = Math.min(targetBounds.width, targetBounds.height) / 2;

  return {
    source: sourceUsesCenter
      ? sourceCenter
      : {
        x: sourceCenter.x + Math.cos(angle) * sourceRadius,
        y: sourceCenter.y + Math.sin(angle) * sourceRadius,
      },
    target: targetUsesCenter
      ? targetCenter
      : {
        x: targetCenter.x - Math.cos(angle) * targetRadius,
        y: targetCenter.y - Math.sin(angle) * targetRadius,
      },
  };
};
