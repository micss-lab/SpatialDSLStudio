// Hook for managing element highlighting
import { useState } from 'react';
import { SearchEntry, searchService } from '../../../services/common';

/**
 * Custom hook for managing element highlighting based on search
 * Handles highlighting elements when searching
 */
export const useModelHighlight = (searchIndex: SearchEntry[]) => {
  const [highlightedElements, setHighlightedElements] = useState<Set<string>>(new Set());

  // Handle highlighting all search results (when Enter is pressed without selection)
  const handleHighlightAllResults = (query: string) => {
    if (!query.trim()) return;
    
    const results = searchService.searchModel(query, searchIndex);
    
    const newHighlightedElements = new Set<string>();
    
    results.forEach(result => {
      // Handle instance, attribute, and reference types
      if (result.type === 'instance') {
        newHighlightedElements.add(result.id);
      } else if (result.type === 'attribute' || result.type === 'reference') {
        // For attributes and references, highlight the parent element
        if (result.metadata.parentId) {
          newHighlightedElements.add(result.metadata.parentId);
        }
      }
      // Legacy support for 'element' type
      else if (result.type === 'element') {
        newHighlightedElements.add(result.id);
      }
    });
    
    setHighlightedElements(newHighlightedElements);
  };

  // Clear all highlights
  const clearHighlights = () => {
    setHighlightedElements(new Set());
  };

  return {
    highlightedElements,
    setHighlightedElements,
    handleHighlightAllResults,
    clearHighlights,
  };
};
