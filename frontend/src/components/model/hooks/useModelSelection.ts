// Hook for managing element and reference selection
import { useState } from 'react';
import { ModelElement } from '../../../models/types';

/**
 * Custom hook for managing model element and reference selection
 */
export const useModelSelection = () => {
  const [selectedElement, setSelectedElement] = useState<ModelElement | null>(null);
  const [selectedModelReference, setSelectedModelReference] = useState<{
    sourceElement: ModelElement;
    targetElement: ModelElement;
    refName: string;
  } | null>(null);

  return {
    selectedElement,
    setSelectedElement,
    selectedModelReference,
    setSelectedModelReference,
  };
};
