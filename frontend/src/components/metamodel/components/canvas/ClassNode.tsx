import React from 'react';
import { Group, Rect, Text, Line, Circle } from 'react-konva';
import { MetaClass, MetaAttribute } from '../../../../models/types';
import {
  CLASS_WIDTH,
  CLASS_HEADER_HEIGHT,
  ATTRIBUTE_HEIGHT,
  CLASS_PADDING,
  getClassHeight
} from '../../utils';

interface ClassNodeProps {
  metaClass: MetaClass;
  isSelected: boolean;
  isHighlighted: boolean;
  highlightColor: string;
  isDraggingBendPoint: boolean;
  isAttributeHighlighted: (className: string, attrName: string) => boolean;
  onClassClick: (metaClass: MetaClass) => void;
  onClassDrag: (metaClass: MetaClass, pos: { x: number; y: number }) => void;
}

/**
 * Renders a single metaclass node with its attributes
 */
export const ClassNode: React.FC<ClassNodeProps> = ({
  metaClass,
  isSelected,
  isHighlighted,
  highlightColor,
  isDraggingBendPoint,
  isAttributeHighlighted,
  onClassClick,
  onClassDrag
}) => {
  const width = CLASS_WIDTH;
  const headerHeight = CLASS_HEADER_HEIGHT;
  const attributeHeight = ATTRIBUTE_HEIGHT;
  const padding = CLASS_PADDING / 2; // Using half for visual spacing
  
  const totalHeight = getClassHeight(metaClass);
  
  // Use the stored class position
  const classPosition = metaClass.position || { x: 0, y: 0 };
  
  return (
    <Group
      key={metaClass.id}
      x={classPosition.x}
      y={classPosition.y}
      draggable={!isDraggingBendPoint}
      onClick={() => onClassClick(metaClass)}
      onDragEnd={(e) => {
        // Only handle drag if not dragging bend points
        if (!isDraggingBendPoint) {
          // Get the position directly
          const pos = {
            x: e.target.x(),
            y: e.target.y()
          };
          
          onClassDrag(metaClass, pos);
        }
      }}
    >
      {/* Class box */}
      <Rect
        width={width}
        height={totalHeight}
        fill="white"
        stroke={isSelected ? "blue" : isHighlighted ? "green" : "black"}
        strokeWidth={isSelected ? 2 : isHighlighted ? 2 : 1}
        cornerRadius={4}
      />
      
      {/* Class name header */}
      <Rect
        width={width}
        height={headerHeight}
        fill={isSelected ? "#d4e6f7" : isHighlighted ? highlightColor : "#e5e5e5"}
        stroke={isSelected ? "blue" : isHighlighted ? "green" : "black"}
        strokeWidth={1}
        cornerRadius={[4, 4, 0, 0]}
      />
      
      <Text
        text={metaClass.abstract ? `<<abstract>>\n${metaClass.name}` : metaClass.name}
        x={10}
        y={metaClass.abstract ? headerHeight / 2 - 12 : headerHeight / 2 - 7}
        fontSize={metaClass.abstract ? 10 : 14}
        fontStyle={metaClass.abstract ? "italic" : "bold"}
        width={width - 20}
        align="center"
      />
      
      {/* Divider line */}
      {metaClass.attributes.length > 0 && (
        <Line
          points={[0, headerHeight, width, headerHeight]}
          stroke="black"
          strokeWidth={1}
        />
      )}
      
      {/* Attributes */}
      {metaClass.attributes.map((attr: MetaAttribute, index: number) => {
        const isAttrHighlighted = isAttributeHighlighted(metaClass.name, attr.name);
        
        return (
          <Group key={attr.id}>
            {isAttrHighlighted && (
              <Rect
                x={5}
                y={headerHeight + padding + index * attributeHeight - 2}
                width={width - 10}
                height={attributeHeight}
                fill={highlightColor}
                cornerRadius={2}
              />
            )}
            <Text
              text={`${attr.name}: ${attr.type}${attr.required ? ' *' : ''}`}
              x={10}
              y={headerHeight + padding + index * attributeHeight}
              fontSize={12}
              width={width - 20}
              fill={isAttrHighlighted ? "green" : "black"}
            />
          </Group>
        );
      })}
      
      {/* Connection points */}
      {isSelected && (
        <>
          <Circle x={0} y={totalHeight / 2} radius={4} fill="blue" />
          <Circle x={width} y={totalHeight / 2} radius={4} fill="blue" />
          <Circle x={width / 2} y={0} radius={4} fill="blue" />
          <Circle x={width / 2} y={totalHeight} radius={4} fill="blue" />
        </>
      )}
    </Group>
  );
};
