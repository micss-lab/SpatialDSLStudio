// Hook for loading and managing model and metamodel data
import { useState, useEffect, useRef } from 'react';
import { Model, Metamodel, MetaClass } from '../../../models/types';
import { modelService } from '../../../services/model';
import { metamodelService } from '../../../services/metamodel';
import { searchService, SearchEntry } from '../../../services/common';

/**
 * Custom hook for managing model and metamodel data
 * Handles loading, periodic refresh, and search index building
 */
export const useModelData = (
  modelId: string,
  isReferenceDialogOpen: boolean,
  isDrawingReference: boolean
) => {
  const [model, setModel] = useState<Model | null>(null);
  const [metamodel, setMetamodel] = useState<Metamodel | null>(null);
  const [availableMetaClasses, setAvailableMetaClasses] = useState<MetaClass[]>([]);
  const [searchIndex, setSearchIndex] = useState<SearchEntry[]>([]);
  const hasLoggedLoadTimeRef = useRef(false);
  const loadStartRef = useRef<number>(performance.now());

  // Load model and metamodel
  useEffect(() => {
    const loadData = () => {
      const modelData = modelService.getModelById(modelId);
      if (modelData) {
        // Add position to model elements if they don't have one
        const modelWithPositions = {
          ...modelData,
          elements: modelData.elements.map((element, index) => {
            if (!element.style.position) {
              return {
                ...element,
                style: {
                  ...element.style,
                  position: {
                    x: 50 + (index % 3) * 250,
                    y: 50 + Math.floor(index / 3) * 200
                  }
                }
              };
            }
            return element;
          })
        };
        
        // Don't reset model state if we're in the middle of reference creation
        if (!isReferenceDialogOpen && !isDrawingReference) {
          setModel(modelWithPositions);
        }
        
        // Load metamodel (only if not in reference dialog)
        if (!isReferenceDialogOpen) {
          const metamodelData = metamodelService.getMetamodelById(modelData.conformsTo);
          if (metamodelData) {
            setMetamodel(metamodelData);
            // Filter out abstract classes from available metaclasses for instantiation
            const concreteClasses = metamodelData.classes.filter(cls => !cls.abstract);
            setAvailableMetaClasses(concreteClasses);
          }
        }
      }
    };
    
    loadData();
    
    // Add an interval to periodically refresh the model from the service
    // This ensures UI stays in sync with the model service
    const refreshInterval = setInterval(() => {
      // Only refresh if we're not in the middle of creating a reference
      if (!isReferenceDialogOpen && !isDrawingReference) {
        loadData();
      }
    }, 5000); // Refresh every 5 seconds
    
    return () => {
      clearInterval(refreshInterval);
    };
  }, [modelId, isReferenceDialogOpen, isDrawingReference]);

  // Log load time once both model and metamodel are ready
  useEffect(() => {
    if (model && metamodel) {
      // Log load time only once
      if (!hasLoggedLoadTimeRef.current) {
        const durationMs = Math.max(1, Math.round(performance.now() - loadStartRef.current));
        console.log(`[Model Editor] Model loading time: ${durationMs} ms`);
        hasLoggedLoadTimeRef.current = true;
      }
      
      // Always rebuild search index when model or metamodel changes
      const index = searchService.buildModelIndex(model, metamodel);
      setSearchIndex(index);
    }
  }, [model, metamodel]);

  return {
    model,
    setModel,
    metamodel,
    setMetamodel,
    availableMetaClasses,
    setAvailableMetaClasses,
    searchIndex,
    setSearchIndex,
    hasLoggedLoadTimeRef,
    loadStartRef,
  };
};
