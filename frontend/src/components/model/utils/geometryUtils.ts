// Geometry utility functions for canvas positioning and calculations
import { Model, ModelElement } from '../../../models/types';

/**
 * Find element at a specific position on the canvas
 * Extracted from VisualModelEditor.tsx
 */
export const findElementAtPosition = (
  x: number,
  y: number,
  model: Model | null
): ModelElement | null => {
  if (!model) return null;
  
  // Check each element to see if position is inside it
  for (const element of model.elements) {
    const position = element.style.position || { x: 0, y: 0 };
    const width = 200;
    const height = 30 + (Object.keys(element.style).length * 20) + 10;
    
    if (
      x >= position.x && 
      x <= position.x + width && 
      y >= position.y && 
      y <= position.y + height
    ) {
      return element;
    }
  }
  
  return null;
};

/**
 * Calculate bounding box for all elements
 * Extracted from VisualModelEditor.tsx
 */
export const calculateBoundingBox = (elements: ModelElement[]) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  elements.forEach(element => {
    const pos = element.style.position || { x: 0, y: 0 };
    const width = 200;
    const height = 30 + (Object.keys(element.style).length * 20) + 10;
    
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + width);
    maxY = Math.max(maxY, pos.y + height);
  });
  
  return { minX, minY, maxX, maxY };
};

/**
 * Calculate center position and scale for viewport
 * Extracted from VisualModelEditor.tsx
 */
export const calculateCenterPosition = (
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number },
  containerSize: { width: number; height: number },
  padding: number = 100
) => {
  // Add padding
  const minX = boundingBox.minX - padding;
  const minY = boundingBox.minY - padding;
  const maxX = boundingBox.maxX + padding;
  const maxY = boundingBox.maxY + padding;
  
  // Calculate center of elements
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  
  // Calculate required scale to fit all elements
  const elementWidth = maxX - minX;
  const elementHeight = maxY - minY;
  
  let scale = 1;
  if (elementWidth > 0 && elementHeight > 0) {
    const scaleX = containerSize.width / elementWidth;
    const scaleY = containerSize.height / elementHeight;
    scale = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 100%
    
    // Ensure scale is reasonable
    scale = Math.max(0.2, Math.min(scale, 1));
  }
  
  // Calculate position to center the view
  const position = {
    x: (containerSize.width / 2) - (centerX * scale),
    y: (containerSize.height / 2) - (centerY * scale)
  };
  
  return { position, scale };
};
