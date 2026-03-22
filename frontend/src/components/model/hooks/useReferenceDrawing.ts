// Hook for managing reference drawing and creation
import { useState } from 'react';
import { ModelElement, MetaReference } from '../../../models/types';

/**
 * Custom hook for managing reference drawing state and creation
 * Handles temporary reference drawing, bend points, and reference attributes
 */
export const useReferenceDrawing = () => {
  const [isDrawingReference, setIsDrawingReference] = useState(false);
  const [referenceStartElement, setReferenceStartElement] = useState<ModelElement | null>(null);
  const [referenceMetaReference, setReferenceMetaReference] = useState<MetaReference | null>(null);
  const [referenceTarget, setReferenceTarget] = useState('');
  const [tempEdgePoints, setTempEdgePoints] = useState<Array<{ x: number; y: number }> | null>(null);
  const [referenceAttributes, setReferenceAttributes] = useState<Record<string, any>>({});

  return {
    isDrawingReference,
    setIsDrawingReference,
    referenceStartElement,
    setReferenceStartElement,
    referenceMetaReference,
    setReferenceMetaReference,
    referenceTarget,
    setReferenceTarget,
    tempEdgePoints,
    setTempEdgePoints,
    referenceAttributes,
    setReferenceAttributes,
  };
};
