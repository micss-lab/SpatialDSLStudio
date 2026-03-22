import { useState, useCallback, useEffect } from 'react';
import { Metamodel, MetaClass } from '../../../models/types';
import { searchService, SearchEntry, SearchResult } from '../../../services/common';

export interface SearchState {
  searchIndex: SearchEntry[];
  searchResults: SearchResult[];
}

export interface SearchHandlers {
  handleSearch: (query: string) => void;
  handleSelectSearchResult: (result: SearchResult) => void;
  handleHighlightAllResults: (query: string) => void;
}

interface SearchHookProps {
  metamodel: Metamodel | null;
  scale: number;
  stageSize: { width: number; height: number };
  setSelectedClass: (metaClass: MetaClass | null) => void;
  setSelectedReference: (ref: any) => void;
  setStagePosition: (pos: { x: number; y: number }) => void;
  setHighlightedClasses: (classes: Set<string>) => void;
  setHighlightedAttributes: (attributes: Set<string>) => void;
  setHighlightedReferences: (references: Set<string>) => void;
  setHighlightedConstraints: (constraints: Set<string>) => void;
}

/**
 * Custom hook for managing search functionality in the metamodel editor
 * Integrates with highlighting to show search results
 */
export const useMetamodelSearch = ({
  metamodel,
  scale,
  stageSize,
  setSelectedClass,
  setSelectedReference,
  setStagePosition,
  setHighlightedClasses,
  setHighlightedAttributes,
  setHighlightedReferences,
  setHighlightedConstraints
}: SearchHookProps): [SearchState, SearchHandlers] => {
  const [searchIndex, setSearchIndex] = useState<SearchEntry[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  // Build search index when metamodel changes
  useEffect(() => {
    if (metamodel) {
      const index = searchService.buildMetamodelIndex(metamodel);
      setSearchIndex(index);
    }
  }, [metamodel]);

  const handleSearch = useCallback((query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      // Clear highlights when search is cleared
      setHighlightedClasses(new Set());
      setHighlightedAttributes(new Set());
      setHighlightedReferences(new Set());
      setHighlightedConstraints(new Set());
      return;
    }
    
    const results = searchService.searchMetamodel(query, searchIndex);
    setSearchResults(results);
  }, [searchIndex, setHighlightedClasses, setHighlightedAttributes, setHighlightedReferences, setHighlightedConstraints]);

  const handleHighlightAllResults = useCallback((query: string) => {
    if (!query.trim()) return;
    
    const results = searchService.searchMetamodel(query, searchIndex);
    
    const newHighlightedClasses = new Set<string>();
    const newHighlightedAttributes = new Set<string>();
    const newHighlightedReferences = new Set<string>();
    const newHighlightedConstraints = new Set<string>();
    
    results.forEach(result => {
      if (result.type === 'class') {
        newHighlightedClasses.add(result.id);
      } else if (result.type === 'attribute') {
        const className = metamodel?.classes.find(c => c.id === result.metadata.classId)?.name;
        if (className) {
          newHighlightedAttributes.add(`${className}.${result.label}`);
        }
        // Also highlight the parent class
        if (result.metadata.classId) {
          newHighlightedClasses.add(result.metadata.classId);
        }
      } else if (result.type === 'reference') {
        const className = metamodel?.classes.find(c => c.id === result.metadata.classId)?.name;
        if (className) {
          newHighlightedReferences.add(`${className}.${result.label}`);
        }
        // Also highlight the parent class
        if (result.metadata.classId) {
          newHighlightedClasses.add(result.metadata.classId);
        }
      } else if (result.type === 'constraint') {
        const className = metamodel?.classes.find(c => c.id === result.metadata.classId)?.name;
        if (className) {
          newHighlightedConstraints.add(`${className}.${result.label}`);
        }
        // Also highlight the parent class
        if (result.metadata.classId) {
          newHighlightedClasses.add(result.metadata.classId);
        }
      }
    });
    
    setHighlightedClasses(newHighlightedClasses);
    setHighlightedAttributes(newHighlightedAttributes);
    setHighlightedReferences(newHighlightedReferences);
    setHighlightedConstraints(newHighlightedConstraints);
  }, [searchIndex, metamodel, setHighlightedClasses, setHighlightedAttributes, setHighlightedReferences, setHighlightedConstraints]);

  const handleSelectSearchResult = useCallback((result: SearchResult) => {
    if (!metamodel) return;
    
    // Clear previous highlights
    const newHighlightedClasses = new Set<string>();
    const newHighlightedAttributes = new Set<string>();
    const newHighlightedReferences = new Set<string>();
    const newHighlightedConstraints = new Set<string>();
    
    if (result.type === 'class') {
      // Find and select the class
      const metaClass = metamodel.classes.find(c => c.id === result.id);
      if (metaClass) {
        setSelectedClass(metaClass);
        setSelectedReference(null);
        newHighlightedClasses.add(result.id);
        
        // Zoom to the class
        if (metaClass.position) {
          const centerX = metaClass.position.x + 100; // Offset to center
          const centerY = metaClass.position.y + 75;
          const newPos = {
            x: (stageSize.width / 2) - (centerX * scale),
            y: (stageSize.height / 2) - (centerY * scale)
          };
          setStagePosition(newPos);
        }
      }
    } else if (result.type === 'attribute' || result.type === 'reference' || result.type === 'constraint') {
      // Find parent class and highlight the item
      const parentClass = metamodel.classes.find(c => c.id === result.metadata.classId);
      if (parentClass) {
        setSelectedClass(parentClass);
        setSelectedReference(null);
        newHighlightedClasses.add(parentClass.id);
        
        // Highlight the specific item
        if (result.type === 'attribute') {
          newHighlightedAttributes.add(`${result.metadata.parentName}.${result.label.split('.')[1]}`);
        } else if (result.type === 'reference') {
          newHighlightedReferences.add(`${result.metadata.parentName}.${result.label.split('.')[1]}`);
        } else if (result.type === 'constraint') {
          newHighlightedConstraints.add(`${result.metadata.parentName}.${result.label.split('.').pop()}`);
        }
        
        // Zoom to the class
        if (parentClass.position) {
          const centerX = parentClass.position.x + 100;
          const centerY = parentClass.position.y + 75;
          const newPos = {
            x: (stageSize.width / 2) - (centerX * scale),
            y: (stageSize.height / 2) - (centerY * scale)
          };
          setStagePosition(newPos);
        }
      }
    }
    
    // Apply highlights (only for the selected item)
    setHighlightedClasses(newHighlightedClasses);
    setHighlightedAttributes(newHighlightedAttributes);
    setHighlightedReferences(newHighlightedReferences);
    setHighlightedConstraints(newHighlightedConstraints);
  }, [
    metamodel,
    scale,
    stageSize,
    setSelectedClass,
    setSelectedReference,
    setStagePosition,
    setHighlightedClasses,
    setHighlightedAttributes,
    setHighlightedReferences,
    setHighlightedConstraints
  ]);

  return [
    { searchIndex, searchResults },
    {
      handleSearch,
      handleSelectSearchResult,
      handleHighlightAllResults
    }
  ];
};
