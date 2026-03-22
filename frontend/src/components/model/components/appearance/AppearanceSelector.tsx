// Appearance Selector Component (refactored from ModelElementAppearanceSelector)
import React from 'react';
import { ModelElement } from '../../../../models/types';

interface AppearanceSelectorProps {
  element: ModelElement;
  onUpdate: (propertyName: string, value: any) => void;
}

/**
 * Component for selecting and configuring element appearance
 * TODO: Refactor ModelElementAppearanceSelector.tsx into smaller components (Phase 4)
 * This will be broken down into:
 * - AppearanceTypeSelector
 * - ImageUploadSection
 * - ModelUploadSection
 * - ColorSelector
 */
export const AppearanceSelector: React.FC<AppearanceSelectorProps> = ({
  element,
  onUpdate,
}) => {
  // To be implemented in Phase 4
  // For now, this is a placeholder that will be implemented later
  return <></>;
};
