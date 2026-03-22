import { useState, useCallback } from 'react';
import { MetaClass, MetaReference } from '../../../models/types';

export interface SelectionState {
  selectedClass: MetaClass | null;
  selectedReference: { sourceClass: MetaClass; reference: MetaReference } | null;
  selectedInheritance: {
    childClass: MetaClass;
    parentClass: MetaClass;
    childConnectionX: number;
    childConnectionY: number;
    parentConnectionX: number;
    parentConnectionY: number;
  } | null;
}

export interface SelectionHandlers {
  setSelectedClass: (metaClass: MetaClass | null) => void;
  setSelectedReference: (ref: { sourceClass: MetaClass; reference: MetaReference } | null) => void;
  setSelectedInheritance: (inheritance: SelectionState['selectedInheritance']) => void;
  clearSelection: () => void;
}

/**
 * Custom hook for managing selection state in the metamodel editor
 */
export const useMetamodelSelection = (): [SelectionState, SelectionHandlers] => {
  const [selectedClass, setSelectedClass] = useState<MetaClass | null>(null);
  const [selectedReference, setSelectedReference] = useState<{ sourceClass: MetaClass; reference: MetaReference } | null>(null);
  const [selectedInheritance, setSelectedInheritance] = useState<SelectionState['selectedInheritance']>(null);

  const clearSelection = useCallback(() => {
    setSelectedClass(null);
    setSelectedReference(null);
    setSelectedInheritance(null);
  }, []);

  return [
    {
      selectedClass,
      selectedReference,
      selectedInheritance
    },
    {
      setSelectedClass,
      setSelectedReference,
      setSelectedInheritance,
      clearSelection
    }
  ];
};
