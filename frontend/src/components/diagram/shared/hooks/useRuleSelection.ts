import { useState, useEffect, useCallback } from 'react';
import { transformationService } from '../../../../services/transformation';

export interface UseRuleSelectionReturn {
  availableRules: any[];
  selectedRuleIds: string[];
  isRuleSelectionOpen: boolean;
  loadRules: () => void;
  handleRuleUpload: (ruleIds: string[]) => void;
  toggleRuleSelection: (ruleId: string) => void;
  setIsRuleSelectionOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const useRuleSelection = (): UseRuleSelectionReturn => {
  const [availableRules, setAvailableRules] = useState<any[]>([]);
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
  const [isRuleSelectionOpen, setIsRuleSelectionOpen] = useState(false);

  const loadRules = useCallback(() => {
    const rules = transformationService.getAllRules();
    setAvailableRules(rules);
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleRuleUpload = useCallback((ruleIds: string[]) => {
    if (ruleIds && ruleIds.length > 0) {
      loadRules();
      setSelectedRuleIds(prev => {
        const newIds = [...prev];
        ruleIds.forEach(ruleId => {
          if (!newIds.includes(ruleId)) {
            newIds.push(ruleId);
          }
        });
        return newIds;
      });
    }
  }, [loadRules]);

  const toggleRuleSelection = useCallback((ruleId: string) => {
    setSelectedRuleIds(prev => {
      if (prev.includes(ruleId)) {
        return prev.filter(id => id !== ruleId);
      } else {
        return [...prev, ruleId];
      }
    });
  }, []);

  return {
    availableRules,
    selectedRuleIds,
    isRuleSelectionOpen,
    loadRules,
    handleRuleUpload,
    toggleRuleSelection,
    setIsRuleSelectionOpen,
  };
};
