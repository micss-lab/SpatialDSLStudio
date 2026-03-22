import { useState, useCallback } from 'react';
import { transformationService } from '../../../../services/transformation';
import { Diagram, TransformationStep } from '../../../../models/types';

export interface ExecutionState {
  executions: any[];
  selectedExecutionId: string | null;
  currentExecution: any | null;
  executionSteps: TransformationStep[];
  currentStepIndex: number;
  statusMessage: string;
  statusType: 'success' | 'error' | 'info' | 'warning';
}

export interface UseRuleExecutionReturn extends ExecutionState {
  createExecution: (selectedRuleIds: string[], executionName: string) => void;
  executeSelectedConfiguration: (diagram: Diagram | null) => void;
  applyNextRuleApplication: (diagram: Diagram | null) => boolean;
  resetExecution: (onResetHighlight: () => void) => void;
  downloadExecutionAsJson: () => void;
  setCurrentStepIndex: React.Dispatch<React.SetStateAction<number>>;
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
  setStatusType: React.Dispatch<React.SetStateAction<'success' | 'error' | 'info' | 'warning'>>;
  setCurrentExecution: React.Dispatch<React.SetStateAction<any>>;
  setExecutionSteps: React.Dispatch<React.SetStateAction<TransformationStep[]>>;
}

export const useRuleExecution = (): UseRuleExecutionReturn => {
  const [executions, setExecutions] = useState<any[]>([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [currentExecution, setCurrentExecution] = useState<any>(null);
  const [executionSteps, setExecutionSteps] = useState<TransformationStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error' | 'info' | 'warning'>('info');

  const createExecution = useCallback((selectedRuleIds: string[], executionName: string) => {
    if (selectedRuleIds.length === 0) {
      setStatusMessage('Please select at least one rule to execute.');
      setStatusType('warning');
      return;
    }

    const execution = transformationService.createTransformationExecution(
      executionName,
      selectedRuleIds,
      '', // Source model ID (will be filled from diagram)
      undefined, // Target model ID 
      true, // In-place transformation
      100, // Max iterations
      'sequential' // Execution strategy
    );
    setSelectedExecutionId(execution.id);
    setCurrentExecution(execution);
    setExecutions([...transformationService.getAllExecutions()]);
    setStatusMessage(`Created execution: ${executionName}`);
    setStatusType('success');
  }, []);

  const executeSelectedConfiguration = useCallback((diagram: Diagram | null) => {
    if (!selectedExecutionId || !diagram) {
      setStatusMessage('No rule execution selected or no diagram available');
      setStatusType('warning');
      return;
    }

    setStatusMessage('Executing transformation...');
    setStatusType('info');

    setTimeout(() => {
      try {
        const modelId = diagram.modelId;
        const execution = transformationService.getExecutionById(selectedExecutionId);
        if (!execution) {
          setStatusMessage('Execution not found');
          setStatusType('error');
          return;
        }

        const ruleIds = execution.ruleIds;
        const stepResults: TransformationStep[] = [];

        for (const ruleId of ruleIds) {
          const rule = transformationService.getRuleById(ruleId);
          if (!rule || !rule.enabled) continue;

          const matches = transformationService.findPatternMatches(rule.lhs, modelId);
          if (matches.length === 0) continue;

          const result = transformationService.applyRuleToDiagram(ruleId, diagram.id, matches[0]);
          if (result.success && result.step) {
            stepResults.push(result.step);
          }
        }

        transformationService.updateExecution(selectedExecutionId, {
          stepResults: stepResults,
          status: 'completed',
          resultModelId: modelId
        });

        const updatedExecution = transformationService.getExecutionById(selectedExecutionId);
        if (updatedExecution) {
          setCurrentExecution(updatedExecution);
          setExecutionSteps(stepResults);

          if (stepResults.length > 0) {
            setCurrentStepIndex(0);
            setStatusMessage(`Applied ${stepResults.length} rule(s). Use Play to continue applying rules.`);
            setStatusType('success');
          } else {
            setStatusMessage('No rules could be applied to this diagram.');
            setStatusType('warning');
          }
        }
      } catch (error) {
        setStatusMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
        setStatusType('error');
        console.error('Error during transformation execution:', error);
      }
    }, 100);
  }, [selectedExecutionId]);

  const applyNextRuleApplication = useCallback((diagram: Diagram | null): boolean => {
    if (!selectedExecutionId || !diagram || !currentExecution) {
      return false;
    }

    const modelId = diagram.modelId;
    let appliedAny = false;

    for (const ruleId of currentExecution.ruleIds) {
      const rule = transformationService.getRuleById(ruleId);
      if (!rule || !rule.enabled) continue;

      const matches = transformationService.findPatternMatches(rule.lhs, modelId);
      if (matches.length === 0) continue;

      const result = transformationService.applyRuleToDiagram(ruleId, diagram.id, matches[0]);

      if (result.success && result.step) {
        const newSteps = [...executionSteps, result.step];

        transformationService.updateExecution(selectedExecutionId, {
          stepResults: newSteps,
          status: 'in_progress'
        });

        setExecutionSteps(newSteps);
        setCurrentStepIndex(newSteps.length - 1);
        appliedAny = true;
        setStatusMessage(`Applied rule: ${rule.name}`);
        break;
      }
    }

    if (!appliedAny) {
      setStatusMessage('No more rules can be applied.');
      setStatusType('info');
    }

    return appliedAny;
  }, [selectedExecutionId, currentExecution, executionSteps]);

  const resetExecution = useCallback((onResetHighlight: () => void) => {
    setCurrentStepIndex(-1);
    setStatusMessage('Execution reset');
    setStatusType('info');
    onResetHighlight();
  }, []);

  const downloadExecutionAsJson = useCallback(() => {
    if (!currentExecution) return;

    const filename = `${currentExecution.name.replace(/\s+/g, '_')}.json`;
    const result = transformationService.downloadExecutionAsJsonFile(currentExecution.id, filename);

    if (result) {
      setStatusMessage('Execution downloaded successfully');
      setStatusType('success');
    } else {
      setStatusMessage('Failed to download execution');
      setStatusType('error');
    }
  }, [currentExecution]);

  return {
    executions,
    selectedExecutionId,
    currentExecution,
    executionSteps,
    currentStepIndex,
    statusMessage,
    statusType,
    createExecution,
    executeSelectedConfiguration,
    applyNextRuleApplication,
    resetExecution,
    downloadExecutionAsJson,
    setCurrentStepIndex,
    setStatusMessage,
    setStatusType,
    setCurrentExecution,
    setExecutionSteps,
  };
};
