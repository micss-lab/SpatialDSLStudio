// Model reference (edge) canvas component
import React from 'react';
import { Model, Metamodel, ModelElement } from '../../../../models/types';

interface ModelReferenceProps {
  model: Model;
  metamodel: Metamodel;
  selectedModelReference: {
    sourceElement: ModelElement;
    targetElement: ModelElement;
    refName: string;
  } | null;
  onSelectReference: (ref: {
    sourceElement: ModelElement;
    targetElement: ModelElement;
    refName: string;
  }) => void;
}

/**
 * Renders all references between model elements
 * TODO: Extract from VisualModelEditor.tsx renderReference function (Phase 4)
 */
export const ModelReference: React.FC<ModelReferenceProps> = ({
  model,
  metamodel,
  selectedModelReference,
  onSelectReference,
}) => {
  // To be implemented in Phase 4
  return <></>;
};
