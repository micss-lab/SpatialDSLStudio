import { useState, useRef, useEffect, useCallback } from 'react';
import { transformationService } from '../../../../services/transformation';
import { Diagram, TransformationStep } from '../../../../models/types';

export interface UsePlaybackControlsProps {
  currentExecution: any | null;
  executionSteps: TransformationStep[];
  currentStepIndex: number;
  setCurrentStepIndex: React.Dispatch<React.SetStateAction<number>>;
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
  setStatusType: React.Dispatch<React.SetStateAction<'success' | 'error' | 'info' | 'warning'>>;
  executeSelectedConfiguration: (diagram: Diagram | null) => void;
  applyNextRuleApplication: (diagram: Diagram | null) => boolean;
  diagram: Diagram | null;
}

export interface UsePlaybackControlsReturn {
  isPlaying: boolean;
  executionSpeed: number;
  startPlayback: () => void;
  pausePlayback: () => void;
  advanceToNextStep: () => void;
  handleSpeedChange: (_: Event, newValue: number | number[]) => void;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
}

export const usePlaybackControls = ({
  currentExecution,
  executionSteps,
  currentStepIndex,
  setCurrentStepIndex,
  setStatusMessage,
  setStatusType,
  executeSelectedConfiguration,
  applyNextRuleApplication,
  diagram,
}: UsePlaybackControlsProps): UsePlaybackControlsReturn => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [executionSpeed, setExecutionSpeed] = useState(1);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Playback timer effect
  useEffect(() => {
    if (isPlaying && currentExecution) {
      timerRef.current = setInterval(() => {
        advanceToNextStep();
      }, executionSpeed * 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPlaying, executionSpeed, currentStepIndex, executionSteps]);

  const startPlayback = useCallback(() => {
    if (!currentExecution) return;

    // If no steps have been executed yet, run the transformation first
    if (!executionSteps || executionSteps.length === 0) {
      executeSelectedConfiguration(diagram);
      return;
    }

    // If at the end of current steps, try to apply more rules
    if (currentStepIndex >= executionSteps.length - 1) {
      const couldApplyMore = applyNextRuleApplication(diagram);

      // If we couldn't apply more, just restart playback from the beginning
      if (!couldApplyMore && executionSteps.length > 0) {
        setCurrentStepIndex(0);
      }
    } else {
      // Otherwise just proceed with normal playback of existing steps
      setCurrentStepIndex(currentStepIndex + 1);
    }

    setIsPlaying(true);
    setStatusMessage(`Playing transformation rules with ${executionSpeed}s interval`);
    setStatusType('info');
  }, [currentExecution, executionSteps, currentStepIndex, executionSpeed, diagram, executeSelectedConfiguration, applyNextRuleApplication, setCurrentStepIndex, setStatusMessage, setStatusType]);

  const pausePlayback = useCallback(() => {
    setIsPlaying(false);
    setStatusMessage('Playback paused');
    setStatusType('info');
  }, [setStatusMessage, setStatusType]);

  const advanceToNextStep = useCallback(() => {
    if (!currentExecution || !executionSteps) {
      setIsPlaying(false);
      return;
    }

    // Check if we're at the end of recorded steps
    if (currentStepIndex >= executionSteps.length - 1) {
      const couldApplyMore = applyNextRuleApplication(diagram);

      if (!couldApplyMore) {
        setIsPlaying(false);
        setStatusMessage('Transformation execution complete - no more rules can be applied');
        setStatusType('success');
      }
      return;
    }

    // Not at the end, so advance to the next step
    setCurrentStepIndex(prevIndex => prevIndex + 1);

    // Update status with current rule name
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < executionSteps.length) {
      const nextStep = executionSteps[nextIndex];
      const rule = transformationService.getRuleById(nextStep.ruleId);
      if (rule) {
        setStatusMessage(`Showing rule: ${rule.name}`);
      }
    }
  }, [currentExecution, executionSteps, currentStepIndex, diagram, applyNextRuleApplication, setCurrentStepIndex, setStatusMessage, setStatusType]);

  const handleSpeedChange = useCallback((_: Event, newValue: number | number[]) => {
    setExecutionSpeed(newValue as number);
  }, []);

  return {
    isPlaying,
    executionSpeed,
    startPlayback,
    pausePlayback,
    advanceToNextStep,
    handleSpeedChange,
    setIsPlaying,
  };
};
