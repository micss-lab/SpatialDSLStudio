import { useEffect } from 'react';
import { Diagram, TransformationStep } from '../../../../models/types';

export interface UseElementHighlightingProps {
  currentStepIndex: number;
  executionSteps: TransformationStep[];
  diagram: Diagram | null;
  onHighlightElements: (ids: string[]) => void;
  onResetHighlight: () => void;
}

export const useElementHighlighting = ({
  currentStepIndex,
  executionSteps,
  diagram,
  onHighlightElements,
  onResetHighlight,
}: UseElementHighlightingProps) => {
  const highlightElementsForStep = (step: TransformationStep) => {
    if (!step || !diagram) {
      console.log('Cannot highlight step: missing step or diagram');
      return;
    }

    console.log('Highlighting elements for step:', {
      ruleId: step.ruleId,
      appliedElements: (step.appliedElements || []).length,
      resultElements: (step.resultElements || []).length,
      diagramElements: (step.diagramElements || []).length
    });

    const elementIdsToHighlight: string[] = [];

    // First, directly use diagram elements from the step if available
    if (step.diagramElements && step.diagramElements.length > 0) {
      console.log(`Found ${step.diagramElements.length} diagram elements to highlight`);

      step.diagramElements.forEach((diagramElementId: string) => {
        const element = diagram.elements.find((e: any) => e.id === diagramElementId);
        if (element) {
          elementIdsToHighlight.push(diagramElementId);
        }
      });

      if (elementIdsToHighlight.length > 0) {
        console.log(`Highlighting ${elementIdsToHighlight.length} diagram elements`);
        onHighlightElements(elementIdsToHighlight);
        return;
      } else {
        console.log(`None of the ${step.diagramElements.length} diagram elements exist in this diagram`);
      }
    }

    // If no valid diagram elements found, try to map from model elements
    console.log('Attempting to map model elements to diagram elements');

    const findDiagramElementsForModelElement = (modelElementId: string): string[] => {
      let matchingElements = diagram.elements.filter((element: any) =>
        element.modelElementId === modelElementId
      );

      if (matchingElements.length === 0) {
        matchingElements = diagram.elements.filter((element: any) =>
          element.style?.linkedModelElementId === modelElementId
        );
      }

      if (matchingElements.length === 0) {
        matchingElements = diagram.elements.filter((element: any) =>
          element.style?.linkModelID === modelElementId
        );
      }

      return matchingElements.map((e: any) => e.id);
    };

    // Get diagram elements from applied elements (LHS)
    if (step.appliedElements && step.appliedElements.length > 0) {
      console.log(`Mapping ${step.appliedElements.length} applied model elements to diagram elements`);

      step.appliedElements.forEach((modelElementId: string) => {
        const diagramElementIds = findDiagramElementsForModelElement(modelElementId);
        diagramElementIds.forEach(id => {
          if (!elementIdsToHighlight.includes(id)) {
            elementIdsToHighlight.push(id);
          }
        });
      });
    }

    // Get diagram elements from result elements (RHS)
    if (step.resultElements && step.resultElements.length > 0) {
      console.log(`Mapping ${step.resultElements.length} result model elements to diagram elements`);

      step.resultElements.forEach((modelElementId: string) => {
        const diagramElementIds = findDiagramElementsForModelElement(modelElementId);
        diagramElementIds.forEach(id => {
          if (!elementIdsToHighlight.includes(id)) {
            elementIdsToHighlight.push(id);
          }
        });
      });
    }

    // Highlight the elements or reset if none found
    if (elementIdsToHighlight.length > 0) {
      console.log(`Highlighting ${elementIdsToHighlight.length} mapped diagram elements`);
      onHighlightElements(elementIdsToHighlight);
    } else {
      console.log('No diagram elements to highlight found');
      onResetHighlight();
    }
  };

  // Effect to highlight elements when step changes
  useEffect(() => {
    if (currentStepIndex >= 0 && currentStepIndex < executionSteps.length) {
      const step = executionSteps[currentStepIndex];
      highlightElementsForStep(step);
    } else {
      onResetHighlight();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStepIndex, executionSteps, diagram]);

  return {
    highlightElementsForStep,
  };
};
