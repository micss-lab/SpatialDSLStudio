import { useCallback, useEffect, useRef, useState } from 'react';
import { Diagram, ValidationIssue } from '../../../../models/types';
import { diagramService, viewValidationService } from '../../../../services/diagram';

const EDIT_DELAY_MS = 300;

export function useViewValidation(diagram: Diagram | null, paused: boolean) {
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef(false);
  const diagramId = diagram?.id;
  const modelId = diagram?.modelId;
  const representationId = diagram?.representationDescriptionId;
  const viewpointId = diagram?.viewpointId;

  const validate = useCallback(() => {
    window.clearTimeout(timer.current);
    pending.current = false;
    const current = diagramId ? diagramService.getDiagramById(diagramId) : undefined;
    setIssues(current ? viewValidationService.validateDiagram(current).issues : []);
  }, [diagramId]);

  useEffect(() => {
    validate();
  }, [validate, modelId, representationId, viewpointId]);

  useEffect(() => {
    if (!diagramId || !modelId) return;

    const schedule = () => {
      pending.current = true;
      window.clearTimeout(timer.current);
      if (!paused) timer.current = window.setTimeout(validate, EDIT_DELAY_MS);
    };
    const onModelChange = (event: Event) => {
      if ((event as CustomEvent<{ modelId: string }>).detail?.modelId === modelId) schedule();
    };
    const onViewChange = (event: Event) => {
      if ((event as CustomEvent<{ diagramId: string }>).detail?.diagramId === diagramId) schedule();
    };

    if (pending.current) schedule();
    window.addEventListener('model:changed', onModelChange);
    window.addEventListener('view:changed', onViewChange);
    return () => {
      window.clearTimeout(timer.current);
      window.removeEventListener('model:changed', onModelChange);
      window.removeEventListener('view:changed', onViewChange);
    };
  }, [diagramId, modelId, paused, validate]);

  return { issues, validate };
}
