import { DiagramElement, Model } from '../../../../models/types';

/**
 * Default appearance settings for diagram elements
 */
export const defaultAppearance = {
  type: 'rectangle',
  shape: 'rectangle',
  color: '#4287f5',
  fillColor: '#4287f5',
  strokeColor: 'black',
  strokeWidth: 1
};

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
  // Try to parse the appearance from the element
  if (element.style.appearance) {
    try {
      const parsedAppearance = JSON.parse(element.style.appearance);
      // Ensure shape property is set, default to type if missing
      if (!parsedAppearance.shape && parsedAppearance.type) {
        parsedAppearance.shape = parsedAppearance.type;
      }
      return { ...defaultAppearance, ...parsedAppearance };
    } catch (e) {
      console.error('Error parsing appearance JSON:', e);
    }
  }

  // Check if this element is linked to a model element
  if (element.style.linkedModelElementId && model) {
    const linkedElement = model.elements.find(e => e.id === element.style.linkedModelElementId);
    if (linkedElement && linkedElement.style.appearance) {
      try {
        const parsedAppearance = JSON.parse(linkedElement.style.appearance);
        // Ensure shape property is set, default to type if missing
        if (!parsedAppearance.shape && parsedAppearance.type) {
          parsedAppearance.shape = parsedAppearance.type;
        }
        return { ...defaultAppearance, ...parsedAppearance };
      } catch (e) {
        console.error('Error parsing linked element appearance JSON:', e);
      }
    }
  }

  // If we get here, no valid appearance was found, so use defaults
  return defaultAppearance;
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
