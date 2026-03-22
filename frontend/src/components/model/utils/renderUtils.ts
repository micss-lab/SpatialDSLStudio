// Rendering utility functions for visual styling and calculations

/**
 * Get fill color based on selection and highlight state
 * TODO: Extract from VisualModelEditor.tsx (Phase 2)
 */
export const getFillColor = (isSelected: boolean, isHighlighted: boolean): string => {
  // To be implemented in Phase 2
  if (isHighlighted) return '#fffacd';
  return '#fff';
};

/**
 * Get stroke color based on selection and highlight state
 * TODO: Extract from VisualModelEditor.tsx (Phase 2)
 */
export const getStrokeColor = (isSelected: boolean, isHighlighted: boolean): string => {
  // To be implemented in Phase 2
  if (isSelected) return 'blue';
  if (isHighlighted) return '#ffa500';
  return '#ccc';
};

/**
 * Get stroke width based on selection and highlight state
 * TODO: Extract from VisualModelEditor.tsx (Phase 2)
 */
export const getStrokeWidth = (isSelected: boolean, isHighlighted: boolean): number => {
  // To be implemented in Phase 2
  return isSelected || isHighlighted ? 2 : 1;
};
