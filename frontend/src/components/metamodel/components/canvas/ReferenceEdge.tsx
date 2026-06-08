import React from 'react';
import { Arrow } from 'react-konva';
import { MetaClass, MetaReference, Metamodel } from '../../../../models/types';
import { calculateConnectionPoint, parseBendPoints } from '../../utils';

interface ReferenceEdgeProps {
  sourceClass: MetaClass;
  targetClass: MetaClass;
  reference: MetaReference;
  metamodel: Metamodel | null;
  isSelected: boolean;
  isHighlighted: boolean;
  onReferenceClick: (sourceClass: MetaClass, reference: MetaReference) => void;
}

/**
 * Renders a reference edge (arrow) between two classes
 * Handles bend points, self-references, and bidirectional references
 */
export const ReferenceEdge: React.FC<ReferenceEdgeProps> = ({
  sourceClass,
  targetClass,
  reference,
  metamodel,
  isSelected,
  isHighlighted,
  onReferenceClick
}) => {
  // Check if this is a self-reference
  const isSelfReference = sourceClass.id === targetClass.id;
  
  // Check if there are bend points
  const bendPoints = parseBendPoints((reference as any).bendPoints);
  
  // Calculate proper connection points
  const sourceConnection = calculateConnectionPoint(sourceClass, targetClass, true);
  const targetConnection = calculateConnectionPoint(sourceClass, targetClass, false);
  
  // Determine the arrow points
  let points = [];
  
  if (bendPoints && bendPoints.length > 0) {
    // Use stored bend points
    points = [sourceConnection.x, sourceConnection.y];
    bendPoints.forEach((point: {x: number, y: number}) => {
      points.push(point.x, point.y);
    });
    points.push(targetConnection.x, targetConnection.y);
  } else if (isSelfReference) {
    // Default self-reference curve if no bend points
    const sourcePos = sourceClass.position || { x: 0, y: 0 };
    const offsetX = 60;
    const offsetY = 60;
    
    points = [
      sourceConnection.x, sourceConnection.y,
      sourcePos.x + 200 + offsetX, sourceConnection.y,
      sourcePos.x + 200 + offsetX, sourcePos.y + offsetY,
      sourcePos.x + 100, sourcePos.y + offsetY,
      targetConnection.x, targetConnection.y
    ];
  } else {
    // Regular straight line with proper connection points
    points = [
      sourceConnection.x, sourceConnection.y,
      targetConnection.x, targetConnection.y
    ];
  }

  // Determine arrow properties - check for bidirectional references
  const isBidirectional = metamodel?.classes.some((c: MetaClass) => 
    c.id === reference.target && c.references.some((r: MetaReference) => r.target === sourceClass.id)
  ) || false;
  
  if (isBidirectional) {
    // Calculate a perpendicular offset based on the line direction
    const dx = points[points.length - 2] - points[0];
    const dy = points[points.length - 1] - points[1];
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length > 0) {
      // Normalize direction vector
      const ndx = dx / length;
      const ndy = dy / length;
      
      // Create a perpendicular vector
      const px = -ndy;
      const py = ndx;
      
      // Scale to a reasonable offset (about 15 pixels)
      const nx = px * 15;
      const ny = py * 15;
      
      // Apply the offset to all points
      for (let i = 0; i < points.length; i += 2) {
        points[i] += nx;
        points[i+1] += ny;
      }
    }
  }
  
  const notation = reference.concreteSyntax || {};
  const strokeColor = isSelected ? 'blue' : isHighlighted ? 'green' : (notation.lineColor || 'black');
  const strokeWidth = isSelected ? 2 : isHighlighted ? 2 : (notation.lineWidth || 1);
  const showArrow = notation.arrowHead !== 'none';

  return (
    <Arrow
      key={`${reference.id}-line`}
      points={points}
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      fill={strokeColor}
      dash={notation.lineDash}
      pointerLength={showArrow ? 10 : 0}
      pointerWidth={showArrow ? 10 : 0}
      onClick={() => onReferenceClick(sourceClass, reference)}
    />
  );
};
