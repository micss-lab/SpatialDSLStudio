// Hook for managing search functionality
import { useState } from 'react';
import { SearchEntry, SearchResult, searchService } from '../../../services/common';
import { Model, ModelElement } from '../../../models/types';

/**
 * Custom hook for managing model search and filtering
 */
export const useModelSearch = (
  searchIndex: SearchEntry[],
  model: Model | null,
  scale: number,
  stageSize: { width: number; height: number },
  setStagePosition: (pos: { x: number; y: number }) => void,
  setSelectedElement: (element: ModelElement | null) => void,
  setHighlightedElements: (elements: Set<string>) => void,
  clearHighlights: () => void
) => {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  // Handle search
  const handleSearch = (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      clearHighlights();
      return;
    }
    
    const results = searchService.searchModel(query, searchIndex);
    setSearchResults(results);
  };

  // Handle search result selection
  const handleSelectSearchResult = (result: SearchResult) => {
    if (!model) return;
    
    // Clear previous highlights
    const newHighlightedElements = new Set<string>();
    
    // Handle instance, attribute, and reference types (for model search)
    if (result.type === 'instance' || result.type === 'attribute' || result.type === 'reference') {
      // For attributes and references, get the parent element ID
      const elementId = result.type === 'instance' ? result.id : result.metadata.parentId;
      
      // Ensure elementId exists
      if (elementId) {
        // Find and select the element
        const element = model.elements.find(e => e.id === elementId);
        if (element) {
          setSelectedElement(element);
          newHighlightedElements.add(elementId);
          
          // Zoom to the element
          if (element.style?.position) {
            const centerX = element.style.position.x + 75;
            const centerY = element.style.position.y + 50;
            const newPos = {
              x: (stageSize.width / 2) - (centerX * scale),
              y: (stageSize.height / 2) - (centerY * scale)
            };
            setStagePosition(newPos);
          }
        }
      }
    }
    // Legacy support for 'element' type
    else if (result.type === 'element') {
      // Find and select the element
      const element = model.elements.find(e => e.id === result.id);
      if (element) {
        setSelectedElement(element);
        newHighlightedElements.add(result.id);
        
        // Zoom to the element
        if (element.style?.position) {
          const centerX = element.style.position.x + 75;
          const centerY = element.style.position.y + 50;
          const newPos = {
            x: (stageSize.width / 2) - (centerX * scale),
            y: (stageSize.height / 2) - (centerY * scale)
          };
          setStagePosition(newPos);
        }
      }
    }
    
    // Apply highlights (only for the selected item)
    setHighlightedElements(newHighlightedElements);
  };

  return {
    searchResults,
    setSearchResults,
    handleSearch,
    handleSelectSearchResult,
  };
};
