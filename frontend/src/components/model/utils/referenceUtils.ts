// Reference utility functions for handling references between model elements
import { ModelElement } from '../../../models/types';

/**
 * Parse and validate bend points from reference data
 * Extracted from VisualModelEditor.tsx
 */
export const parseBendPoints = (bendPoints: any): Array<{ x: number; y: number }> => {
  const points: Array<{ x: number; y: number }> = [];
  
  if (!bendPoints || !Array.isArray(bendPoints)) {
    return points;
  }
  
  try {
    const unknownPoints = bendPoints as unknown;
    if (Array.isArray(unknownPoints)) {
      unknownPoints.forEach(point => {
        // Check if point is an object with x and y properties
        if (typeof point === 'object' && point !== null && 
            'x' in point && 'y' in point && 
            typeof point.x === 'number' && typeof point.y === 'number') {
          points.push({ x: point.x, y: point.y });
        }
        // If it's a string, try to parse it
        else if (typeof point === 'string') {
          try {
            const parsed = JSON.parse(point);
            if (parsed && typeof parsed === 'object' && 
                'x' in parsed && 'y' in parsed) {
              points.push({ x: Number(parsed.x), y: Number(parsed.y) });
            }
          } catch (e) {
            console.error('Failed to parse point string:', point);
          }
        }
      });
    }
  } catch (error) {
    console.error('Error processing bend points:', error);
  }
  
  return points;
};

/**
 * Calculate reference path points including bend points
 * Extracted from VisualModelEditor.tsx
 */
export const calculateReferencePath = (
  sourceElement: ModelElement,
  targetElement: ModelElement,
  bendPoints?: Array<{ x: number; y: number }>,
  isSelfReference?: boolean
): number[] => {
  const sourcePosition = sourceElement.style.position || { x: 0, y: 0 };
  const targetPosition = targetElement.style.position || { x: 0, y: 0 };
  
  const sourceWidth = 200;
  const sourceHeight = 30 + (Object.keys(sourceElement.style).length * 20) + 10;
  const targetWidth = 200;
  const targetHeight = 30 + (Object.keys(targetElement.style).length * 20) + 10;
  
  const sourceX = sourcePosition.x + sourceWidth / 2;
  const sourceY = sourcePosition.y + sourceHeight / 2;
  const targetX = targetPosition.x + targetWidth / 2;
  const targetY = targetPosition.y + targetHeight / 2;
  
  let points: number[] = [];
  
  if (bendPoints && bendPoints.length > 0) {
    // Use provided bend points
    points = [sourceX, sourceY];
    bendPoints.forEach(point => {
      points.push(point.x, point.y);
    });
    points.push(targetX, targetY);
  } else if (isSelfReference) {
    // Use self-reference path
    const offsetX = 60;
    const offsetY = 60;
    points = [
      sourceX, sourceY,
      sourceX + offsetX, sourceY,
      sourceX + offsetX, sourceY + offsetY,
      sourceX, sourceY + offsetY,
      targetX, targetY
    ];
  } else {
    // Simple line for regular references
    points = [sourceX, sourceY, targetX, targetY];
  }
  
  return points;
};

/**
 * Generate default self-reference path
 * Extracted from VisualModelEditor.tsx
 */
export const generateSelfReferencePath = (
  element: ModelElement,
  offsetX: number = 60,
  offsetY: number = 60
): number[] => {
  const position = element.style.position || { x: 0, y: 0 };
  const width = 200;
  const height = 30 + (Object.keys(element.style).length * 20) + 10;
  
  const centerX = position.x + width / 2;
  const centerY = position.y + height / 2;
  
  return [
    centerX, centerY,
    centerX + offsetX, centerY,
    centerX + offsetX, centerY + offsetY,
    centerX, centerY + offsetY,
    centerX, centerY
  ];
};
