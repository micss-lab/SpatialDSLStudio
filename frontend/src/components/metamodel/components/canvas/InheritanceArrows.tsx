import React from 'react';
import { Group, Line } from 'react-konva';
import { Metamodel, MetaClass } from '../../../../models/types';
import { getClassPosition, CLASS_WIDTH, getClassHeight } from '../../utils';

interface InheritanceArrowsProps {
  metamodel: Metamodel;
  selectedInheritance: {
    childClass: MetaClass;
    parentClass: MetaClass;
    childConnectionX: number;
    childConnectionY: number;
    parentConnectionX: number;
    parentConnectionY: number;
  } | null;
  onInheritanceClick: (inheritance: {
    childClass: MetaClass;
    parentClass: MetaClass;
    childConnectionX: number;
    childConnectionY: number;
    parentConnectionX: number;
    parentConnectionY: number;
  }) => void;
}

/**
 * Renders inheritance arrows between classes and their supertypes
 * Shows hollow triangle arrow heads to indicate inheritance
 */
export const InheritanceArrows: React.FC<InheritanceArrowsProps> = ({
  metamodel,
  selectedInheritance,
  onInheritanceClick
}) => {
  const arrows: React.ReactElement[] = [];
  
  metamodel.classes.forEach((metaClass: MetaClass) => {
    if (metaClass.superTypes && metaClass.superTypes.length > 0) {
      metaClass.superTypes.forEach((supertypeId: string) => {
        const supertype = metamodel.classes.find(cls => cls.id === supertypeId);
        if (!supertype) return;
        
        // Get positions of both classes
        const childPos = getClassPosition(metaClass, metamodel);
        const parentPos = getClassPosition(supertype, metamodel);
        
        if (!childPos || !parentPos) return;
        
        // Skip if positions are the same (would create a zero-length arrow)
        if (childPos.x === parentPos.x && childPos.y === parentPos.y) return;
        
        // Calculate dimensions
        const childWidth = CLASS_WIDTH;
        const childHeight = getClassHeight(metaClass);
        const parentWidth = CLASS_WIDTH;
        const parentHeight = getClassHeight(supertype);
        
        // Calculate centers
        const childCenterX = childPos.x + childWidth / 2;
        const childCenterY = childPos.y + childHeight / 2;
        const parentCenterX = parentPos.x + parentWidth / 2;
        const parentCenterY = parentPos.y + parentHeight / 2;
        
        // Calculate the angle between the two centers
        const dx = parentCenterX - childCenterX;
        const dy = parentCenterY - childCenterY;
        const angle = Math.atan2(dy, dx);
        
        // Determine connection points based on the angle
        let childConnectionX: number, childConnectionY: number;
        let parentConnectionX: number, parentConnectionY: number;
        
        // Child connection point (where arrow starts)
        if (Math.abs(angle) < Math.PI / 4) {
          // Connect from child right
          childConnectionX = childPos.x + childWidth;
          childConnectionY = childCenterY;
        } else if (Math.abs(angle) > 3 * Math.PI / 4) {
          // Connect from child left
          childConnectionX = childPos.x;
          childConnectionY = childCenterY;
        } else if (angle > 0) {
          // Connect from child bottom
          childConnectionX = childCenterX;
          childConnectionY = childPos.y + childHeight;
        } else {
          // Connect from child top
          childConnectionX = childCenterX;
          childConnectionY = childPos.y;
        }
        
        // Parent connection point (where arrow ends)
        if (Math.abs(angle) < Math.PI / 4) {
          // Connect to parent left
          parentConnectionX = parentPos.x;
          parentConnectionY = parentCenterY;
        } else if (Math.abs(angle) > 3 * Math.PI / 4) {
          // Connect to parent right
          parentConnectionX = parentPos.x + parentWidth;
          parentConnectionY = parentCenterY;
        } else if (angle > 0) {
          // Connect to parent top
          parentConnectionX = parentCenterX;
          parentConnectionY = parentPos.y;
        } else {
          // Connect to parent bottom
          parentConnectionX = parentCenterX;
          parentConnectionY = parentPos.y + parentHeight;
        }
        
        // Create inheritance arrow (hollow triangle)
        const arrowKey = `inheritance-${metaClass.id}-${supertypeId}`;
        
        // Check if this inheritance is selected
        const isSelected = selectedInheritance &&
          selectedInheritance.childClass.id === metaClass.id &&
          selectedInheritance.parentClass.id === supertypeId;
        
        // Calculate arrow head angle
        const arrowAngle = Math.atan2(parentConnectionY - childConnectionY, parentConnectionX - childConnectionX);
        const arrowSize = 12;
        
        // Calculate triangle points for the arrow head
        const arrowHead1X = parentConnectionX - arrowSize * Math.cos(arrowAngle - Math.PI / 6);
        const arrowHead1Y = parentConnectionY - arrowSize * Math.sin(arrowAngle - Math.PI / 6);
        const arrowHead2X = parentConnectionX - arrowSize * Math.cos(arrowAngle + Math.PI / 6);
        const arrowHead2Y = parentConnectionY - arrowSize * Math.sin(arrowAngle + Math.PI / 6);
        
        arrows.push(
          <Group 
            key={arrowKey}
            onClick={() => {
              onInheritanceClick({
                childClass: metaClass,
                parentClass: supertype,
                childConnectionX,
                childConnectionY,
                parentConnectionX,
                parentConnectionY
              });
            }}
            onMouseEnter={(e) => {
              const stage = e.target.getStage();
              if (stage && stage.container()) {
                stage.container().style.cursor = 'pointer';
              }
            }}
            onMouseLeave={(e) => {
              const stage = e.target.getStage();
              if (stage && stage.container()) {
                stage.container().style.cursor = 'default';
              }
            }}
          >
            {/* Inheritance line */}
            <Line
              points={[childConnectionX, childConnectionY, parentConnectionX, parentConnectionY]}
              stroke={isSelected ? "#2196f3" : "#4caf50"}
              strokeWidth={isSelected ? 3 : 2}
            />
            
            {/* Hollow triangle arrow at parent end */}
            <Line
              points={[
                parentConnectionX, parentConnectionY,
                arrowHead1X, arrowHead1Y,
                arrowHead2X, arrowHead2Y,
                parentConnectionX, parentConnectionY
              ]}
              stroke={isSelected ? "#2196f3" : "#4caf50"}
              strokeWidth={isSelected ? 3 : 2}
              fill="white"
              closed={true}
            />
            
            {/* Invisible wider line for easier clicking */}
            <Line
              points={[childConnectionX, childConnectionY, parentConnectionX, parentConnectionY]}
              stroke="transparent"
              strokeWidth={10}
            />
          </Group>
        );
      });
    }
  });
  
  return <>{arrows}</>;
};
