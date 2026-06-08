import { useState, useEffect, useRef } from 'react';
import { Diagram, Metamodel, Model } from '../../../../models/types';
import { diagramService } from '../../../../services/diagram';
import { metamodelService } from '../../../../services/metamodel';
import { modelService } from '../../../../services/model';

interface UseDiagramDataResult {
  diagram: Diagram | null;
  setDiagram: (diagram: Diagram | null) => void;
  metamodel: Metamodel | null;
  model: Model | null;
  isLoading: boolean;
}

/**
 * Hook to load and manage diagram data, including its model and metamodel
 * @param diagramId - The ID of the diagram to load
 * @returns Diagram data and related metadata
 */
export const useDiagramData = (diagramId: string): UseDiagramDataResult => {
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [metamodel, setMetamodel] = useState<Metamodel | null>(null);
  const [model, setModel] = useState<Model | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoggedLoadTimeRef = useRef(false);
  const loadStartRef = useRef<number>(performance.now());

  useEffect(() => {
    const loadDiagram = () => {
      setIsLoading(true);
      
      // Load the diagram
      const diagramData = diagramService.getDiagramById(diagramId);
      if (diagramData) {
        setDiagram(diagramData);
        
        // Load the model that this diagram is based on
        const modelData = modelService.getModelById(diagramData.modelId);
        if (modelData) {
          setModel(modelData);
          
          // Load the metamodel that the model conforms to
          const metamodelData = metamodelService.getMetamodelById(modelData.conformsTo);
          if (metamodelData) {
            setMetamodel(metamodelData);
          }
        }
      }
      
      setIsLoading(false);
    };
    
    loadDiagram();
    
    // Add storage event listener to refresh when linked elements change
    const handleDataChanged = () => {
      console.log("Data change detected, refreshing view");
      loadDiagram();
    };
    
    window.addEventListener('storage', handleDataChanged);
    window.addEventListener('model:changed', handleDataChanged);
    window.addEventListener('view:changed', handleDataChanged);
    
    return () => {
      window.removeEventListener('storage', handleDataChanged);
      window.removeEventListener('model:changed', handleDataChanged);
      window.removeEventListener('view:changed', handleDataChanged);
    };
  }, [diagramId]);

  // Log load time once diagram and metamodel are ready
  useEffect(() => {
    if (diagram && metamodel && !hasLoggedLoadTimeRef.current) {
      const durationMs = Math.max(1, Math.round(performance.now() - loadStartRef.current));
      console.log(`[Diagram Editor] Model loading time: ${durationMs} ms`);
      hasLoggedLoadTimeRef.current = true;
    }
  }, [diagram, metamodel]);

  return {
    diagram,
    setDiagram,
    metamodel,
    model,
    isLoading
  };
};
