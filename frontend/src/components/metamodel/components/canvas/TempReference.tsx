import React from 'react';
import { Line } from 'react-konva';
import { MetaClass } from '../../../../models/types';
import { calculateConnectionPoint } from '../../utils';

interface TempReferenceProps {
  isDrawing: boolean;
  sourceClass: MetaClass | null;
  mousePos: { x: number; y: number };
  stagePosition: { x: number; y: number };
  scale: number;
  tempPoints: Array<{x: number, y: number}> | null;
}

/**
 * Renders a temporary dashed line when drawing a new reference
 * Shows preview of reference creation with bend points
 */
export const TempReference: React.FC<TempReferenceProps> = ({
  isDrawing,
  sourceClass,
  mousePos,
  stagePosition,
  scale,
  tempPoints
}) => {
  if (!isDrawing || !sourceClass) return null;
  
  // Calculate mouse position relative to stage
  const adjustedMousePos = {
    x: (mousePos.x - stagePosition.x) / scale,
    y: (mousePos.y - stagePosition.y) / scale
  };
  
  // Create a temporary target class for connection point calculation
  const tempTargetClass = {
    id: 'temp',
    name: 'temp',
    attributes: [],
    references: [],
    constraints: [],
    abstract: false,
    superTypes: [],
    eClass: 'temp',
    position: { x: adjustedMousePos.x - 100, y: adjustedMousePos.y - 25 }
  } as MetaClass;
  
  // Calculate proper connection point from source
  const sourceConnection = calculateConnectionPoint(sourceClass, tempTargetClass, true);
  
  // Create the points array starting with the proper connection point
  let points = [sourceConnection.x, sourceConnection.y];
  
  // Add any temporary bend points
  if (tempPoints && tempPoints.length > 0) {
    tempPoints.forEach(point => {
      points.push(point.x, point.y);
    });
  }
  
  // Add the current mouse position
  points.push(adjustedMousePos.x, adjustedMousePos.y);
  
  return (
    <Line
      points={points}
      stroke="gray"
      strokeWidth={1}
      dash={[5, 5]}
    />
  );
};
