import React from 'react';
import { Group, Rect, Text, Circle } from 'react-konva';
import { MetaClass, MetaReference, Metamodel } from '../../../../models/types';
import { calculateConnectionPoint, parseBendPoints, findLabelPosition } from '../../utils';

interface ReferenceLabelsProps {
  sourceClass: MetaClass;
  targetClass: MetaClass;
  reference: MetaReference;
  metamodel: Metamodel | null;
  isSelected: boolean;
  isHighlighted: boolean;
  highlightColor: string;
  onReferenceClick: (sourceClass: MetaClass, reference: MetaReference) => void;
}

/**
 * Renders labels for a reference edge (name, cardinality, containment indicator)
 * Positions labels intelligently to avoid overlapping with classes
 */
export const ReferenceLabels: React.FC<ReferenceLabelsProps> = ({
  sourceClass,
  targetClass,
  reference,
  metamodel,
  isSelected,
  isHighlighted,
  highlightColor,
  onReferenceClick
}) => {
  // Check if this is a self-reference
  const isSelfReference = sourceClass.id === targetClass.id;
  
  // Check if there are bend points
  const bendPoints = parseBendPoints((reference as any).bendPoints);
  
  // Calculate proper connection points (same as lines)
  const sourceConnection = calculateConnectionPoint(sourceClass, targetClass, true);
  const targetConnection = calculateConnectionPoint(sourceClass, targetClass, false);
  
  // Determine the arrow points (same logic as lines)
  let points = [];
  
  if (bendPoints && bendPoints.length > 0) {
    points = [sourceConnection.x, sourceConnection.y];
    bendPoints.forEach((point: {x: number, y: number}) => {
      points.push(point.x, point.y);
    });
    points.push(targetConnection.x, targetConnection.y);
  } else if (isSelfReference) {
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
    points = [
      sourceConnection.x, sourceConnection.y,
      targetConnection.x, targetConnection.y
    ];
  }

  // Apply bidirectional offset if needed (same logic as lines)
  const isBidirectional = metamodel?.classes.some((c: MetaClass) => 
    c.id === reference.target && c.references.some((r: MetaReference) => r.target === sourceClass.id)
  ) || false;
  
  if (isBidirectional) {
    const dx = points[points.length - 2] - points[0];
    const dy = points[points.length - 1] - points[1];
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length > 0) {
      const ndx = dx / length;
      const ndy = dy / length;
      const px = -ndy;
      const py = ndx;
      const nx = px * 15;
      const ny = py * 15;
      
      for (let i = 0; i < points.length; i += 2) {
        points[i] += nx;
        points[i+1] += ny;
      }
    }
  }
  
  // Find intelligent position for reference name (avoid overlapping classes)
  const labelPos = findLabelPosition(
    points[0], 
    points[1], 
    points[points.length - 2], 
    points[points.length - 1], 
    sourceClass, 
    targetClass, 
    metamodel,
    isSelfReference, 
    points
  );
  
  // Position cardinality - special handling for self-references
  let cardinalityX: number, cardinalityY: number;
  
  if (isSelfReference && points.length >= 6) {
    // For self-references, place cardinality at the bottom of the curve
    cardinalityX = points[6]; // x coordinate of fourth point (bottom of curve)
    cardinalityY = points[7] + 15; // y coordinate of fourth point, offset down
  } else {
    // Regular reference cardinality positioning
    cardinalityX = targetConnection.x;
    cardinalityY = targetConnection.y;
    
    // Offset cardinality based on the connection edge
    const targetPos = targetClass.position || { x: 0, y: 0 };
    const targetWidth = 200;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const targetHeight = 30 + targetClass.attributes.length * 20 + 10;
    
    if (cardinalityX === targetPos.x) {
      // Left edge - offset left
      cardinalityX -= 25;
    } else if (cardinalityX === targetPos.x + targetWidth) {
      // Right edge - offset right
      cardinalityX += 25;
    } else if (cardinalityY === targetPos.y) {
      // Top edge - offset up
      cardinalityY -= 15;
    } else {
      // Bottom edge - offset down
      cardinalityY += 15;
    }
  }
  
  return (
    <Group
      key={`${reference.id}-labels`}
      onClick={() => onReferenceClick(sourceClass, reference)}
    >
      {/* Reference name with improved background */}
      <Group>
        <Rect
          x={labelPos.x - 30}
          y={labelPos.y - 12}
          width={60}
          height={20}
          fill="#ffffff"
          stroke={isSelected ? "blue" : isHighlighted ? "green" : "#e0e0e0"}
          strokeWidth={1}
          cornerRadius={3}
          opacity={0.95}
          shadowColor="rgba(0,0,0,0.2)"
          shadowBlur={3}
          shadowOffset={{ x: 1, y: 1 }}
        />
        {isHighlighted && (
          <Rect
            x={labelPos.x - 28}
            y={labelPos.y - 10}
            width={56}
            height={16}
            fill={highlightColor}
            cornerRadius={2}
            opacity={0.7}
          />
        )}
        <Text
          text={reference.name}
          x={labelPos.x - 25}
          y={labelPos.y - 8}
          fontSize={12}
          fill={isSelected ? "blue" : isHighlighted ? "green" : "black"}
          fontStyle="bold"
          padding={1}
        />
      </Group>
      
      {/* Cardinality with improved positioning and styling */}
      <Group>
        <Rect
          x={cardinalityX - 17}
          y={cardinalityY - 10}
          width={34}
          height={16}
          fill="#ffffff"
          stroke={isSelected ? "blue" : isHighlighted ? "green" : "#e0e0e0"}
          strokeWidth={1}
          cornerRadius={3}
          opacity={0.95}
          shadowColor="rgba(0,0,0,0.2)"
          shadowBlur={3}
          shadowOffset={{ x: 1, y: 1 }}
        />
        <Text
          text={`${reference.cardinality.lowerBound}..${reference.cardinality.upperBound}`}
          x={cardinalityX - 14}
          y={cardinalityY - 8}
          fontSize={10}
          fill={isSelected ? "blue" : isHighlighted ? "green" : "black"}
          fontStyle="bold"
          padding={1}
        />
      </Group>
      
      {/* Containment indicator */}
      {reference.containment && (
        <Circle
          x={labelPos.x - 40}
          y={labelPos.y - 5}
          radius={5}
          fill={isSelected ? "blue" : isHighlighted ? "green" : "black"}
          shadowColor="rgba(0,0,0,0.3)"
          shadowBlur={2}
          shadowOffset={{ x: 1, y: 1 }}
        />
      )}
    </Group>
  );
};
