import { useState, useCallback } from 'react';
import { DiagramElement } from '../../../../models/types';

interface UseElementSelectionResult<T extends DiagramElement = DiagramElement> {
  selectedElement: T | null;
  setSelectedElement: (element: T | null) => void;
  clearSelection: () => void;
  isSelected: (elementId: string) => boolean;
}

/**
 * Hook to manage element selection state
 * @returns Selection state and helper functions
 */
export const useElementSelection = <T extends DiagramElement = DiagramElement>(): UseElementSelectionResult<T> => {
  const [selectedElement, setSelectedElement] = useState<T | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedElement(null);
  }, []);

  const isSelected = useCallback((elementId: string): boolean => {
    return selectedElement?.id === elementId;
  }, [selectedElement]);

  return {
    selectedElement,
    setSelectedElement,
    clearSelection,
    isSelected
  };
};
