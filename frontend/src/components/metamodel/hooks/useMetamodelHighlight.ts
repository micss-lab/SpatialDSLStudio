import { useState, useCallback } from 'react';

export interface HighlightState {
  highlightedClasses: Set<string>;
  highlightedAttributes: Set<string>;
  highlightedReferences: Set<string>;
  highlightedConstraints: Set<string>;
}

export interface HighlightHandlers {
  clearHighlights: () => void;
  setHighlightedClasses: (classes: Set<string>) => void;
  setHighlightedAttributes: (attributes: Set<string>) => void;
  setHighlightedReferences: (references: Set<string>) => void;
  setHighlightedConstraints: (constraints: Set<string>) => void;
  isClassHighlighted: (classNameOrId: string) => boolean;
  isAttributeHighlighted: (className: string, attrName: string) => boolean;
  isReferenceHighlighted: (className: string, refName: string) => boolean;
}

/**
 * Custom hook for managing highlight state in the metamodel editor
 * Highlights are used for AI-generated elements and search results
 */
export const useMetamodelHighlight = (): [HighlightState, HighlightHandlers] => {
  const [highlightedClasses, setHighlightedClasses] = useState<Set<string>>(new Set());
  const [highlightedAttributes, setHighlightedAttributes] = useState<Set<string>>(new Set());
  const [highlightedReferences, setHighlightedReferences] = useState<Set<string>>(new Set());
  const [highlightedConstraints, setHighlightedConstraints] = useState<Set<string>>(new Set());

  const clearHighlights = useCallback(() => {
    setHighlightedClasses(new Set());
    setHighlightedAttributes(new Set());
    setHighlightedReferences(new Set());
    setHighlightedConstraints(new Set());
  }, []);

  const isClassHighlighted = useCallback((classNameOrId: string) => {
    return highlightedClasses.has(classNameOrId);
  }, [highlightedClasses]);

  const isAttributeHighlighted = useCallback((className: string, attrName: string) => {
    return highlightedAttributes.has(`${className}.${attrName}`);
  }, [highlightedAttributes]);

  const isReferenceHighlighted = useCallback((className: string, refName: string) => {
    return highlightedReferences.has(`${className}.${refName}`);
  }, [highlightedReferences]);

  return [
    {
      highlightedClasses,
      highlightedAttributes,
      highlightedReferences,
      highlightedConstraints
    },
    {
      clearHighlights,
      setHighlightedClasses,
      setHighlightedAttributes,
      setHighlightedReferences,
      setHighlightedConstraints,
      isClassHighlighted,
      isAttributeHighlighted,
      isReferenceHighlighted
    }
  ];
};
