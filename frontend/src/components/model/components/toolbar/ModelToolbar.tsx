// Model Toolbar Component
import React from 'react';
import { SearchResult } from '../../../../services/common';

interface ModelToolbarProps {
  isDrawingReference: boolean;
  onAddElement: () => void;
  onToggleReferenceDrawing: () => void;
  onValidate: () => void;
  onSearch: (query: string) => void;
  onSelectSearchResult: (result: SearchResult) => void;
  onHighlightAll: (query: string) => void;
  searchResults: SearchResult[];
  availableAttributes: Array<{ name: string; type: string }>;
}

/**
 * Main toolbar for model editor actions
 * TODO: Extract from VisualModelEditor.tsx top toolbar (Phase 4)
 */
export const ModelToolbar: React.FC<ModelToolbarProps> = ({
  isDrawingReference,
  onAddElement,
  onToggleReferenceDrawing,
  onValidate,
  onSearch,
  onSelectSearchResult,
  onHighlightAll,
  searchResults,
  availableAttributes,
}) => {
  // To be implemented in Phase 4
  return <></>;
};
