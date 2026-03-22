// Temporary reference visualization during creation
import React from 'react';
import { Line, Circle } from 'react-konva';
import { ModelElement } from '../../../../models/types';

interface TempReferenceProps {
  isDrawing: boolean;
  startElement: ModelElement | null;
  mousePos: { x: number; y: number };
  bendPoints: Array<{ x: number; y: number }> | null;
  scale: number;
  stagePosition: { x: number; y: number };
}

/**
 * Renders temporary reference line during creation
 * TODO: Extract from VisualModelEditor.tsx renderTempReference function (Phase 4)
 */
export const TempReference: React.FC<TempReferenceProps> = ({
  isDrawing,
  startElement,
  mousePos,
  bendPoints,
  scale,
  stagePosition,
}) => {
  // To be implemented in Phase 4
  if (!isDrawing || !startElement) return null;
  return <></>;
};
