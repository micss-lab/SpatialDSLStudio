// Model element canvas component
import React from 'react';
import { ModelElement as ModelElementType, Metamodel } from '../../../../models/types';

interface ModelElementProps {
  element: ModelElementType;
  metamodel: Metamodel;
  isSelected: boolean;
  isHighlighted: boolean;
  onSelect: (element: ModelElementType) => void;
  onDragEnd: (element: ModelElementType, newPos: { x: number; y: number }) => void;
}

/**
 * Renders a single model element on the canvas
 * TODO: Extract from VisualModelEditor.tsx renderElement function (Phase 4)
 */
export const ModelElement: React.FC<ModelElementProps> = ({
  element,
  metamodel,
  isSelected,
  isHighlighted,
  onSelect,
  onDragEnd,
}) => {
  // To be implemented in Phase 4
  return <></>;
};
