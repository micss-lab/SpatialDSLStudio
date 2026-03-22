import { MetaClass, Metamodel } from '../../../models/types';

// Constants for class dimensions
export const CLASS_WIDTH = 200;
export const CLASS_HEADER_HEIGHT = 30;
export const ATTRIBUTE_HEIGHT = 20;
export const CLASS_PADDING = 10;

/**
 * Calculate the height of a metaclass based on its attributes
 */
export const getClassHeight = (metaClass: MetaClass): number => {
  return CLASS_HEADER_HEIGHT + (metaClass.attributes.length * ATTRIBUTE_HEIGHT) + CLASS_PADDING;
};

/**
 * Calculate connection point on class boundary for references
 * Determines which edge (top/bottom/left/right) to connect to based on angle
 */
export const calculateConnectionPoint = (
  fromClass: MetaClass, 
  toClass: MetaClass, 
  isSource: boolean
): { x: number; y: number } => {
  const fromPos = fromClass.position || { x: 0, y: 0 };
  const toPos = toClass.position || { x: 0, y: 0 };
  
  const classWidth = CLASS_WIDTH;
  const fromHeight = getClassHeight(fromClass);
  const toHeight = getClassHeight(toClass);
  
  // Calculate centers
  const fromCenterX = fromPos.x + classWidth / 2;
  const fromCenterY = fromPos.y + fromHeight / 2;
  const toCenterX = toPos.x + classWidth / 2;
  const toCenterY = toPos.y + toHeight / 2;
  
  // For the connection point calculation, use the appropriate class
  const classPos = isSource ? fromPos : toPos;
  const classHeight = isSource ? fromHeight : toHeight;
  const centerX = isSource ? fromCenterX : toCenterX;
  const centerY = isSource ? fromCenterY : toCenterY;
  const otherCenterX = isSource ? toCenterX : fromCenterX;
  const otherCenterY = isSource ? toCenterY : fromCenterY;
  
  // Calculate angle from this class center to the other class center
  const dx = otherCenterX - centerX;
  const dy = otherCenterY - centerY;
  const angle = Math.atan2(dy, dx);
  
  // Determine which edge to connect to based on angle
  let connectionX: number, connectionY: number;
  
  if (Math.abs(angle) < Math.PI / 4) {
    // Connect to right edge
    connectionX = classPos.x + classWidth;
    connectionY = centerY;
  } else if (Math.abs(angle) > 3 * Math.PI / 4) {
    // Connect to left edge
    connectionX = classPos.x;
    connectionY = centerY;
  } else if (angle > 0) {
    // Connect to bottom edge
    connectionX = centerX;
    connectionY = classPos.y + classHeight;
  } else {
    // Connect to top edge
    connectionX = centerX;
    connectionY = classPos.y;
  }
  
  return { x: connectionX, y: connectionY };
};

/**
 * Check if a point is inside a metaclass boundary
 */
export const isPointInClass = (x: number, y: number, metaClass: MetaClass): boolean => {
  const pos = metaClass.position || { x: 0, y: 0 };
  const width = CLASS_WIDTH;
  const height = getClassHeight(metaClass);
  
  return x >= pos.x && x <= pos.x + width && y >= pos.y && y <= pos.y + height;
};

/**
 * Find optimal label position for references that avoids overlapping classes
 * Tries midpoint first, then perpendicular offsets if midpoint overlaps
 */
export const findLabelPosition = (
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  sourceClass: MetaClass,
  targetClass: MetaClass,
  metamodel: Metamodel | null,
  isSelfReference: boolean = false,
  points: number[] = []
): { x: number; y: number } => {
  // Special handling for self-references
  if (isSelfReference && points.length >= 6) {
    // For self-references, place the label at the rightmost point of the curve
    // This is typically the second point in the self-reference curve
    const rightmostX = points[2]; // x coordinate of second point
    const rightmostY = points[3]; // y coordinate of second point
    
    return { 
      x: rightmostX + 20, // Offset right from the curve
      y: rightmostY - 10  // Offset up slightly
    };
  }
  
  // Try midpoint first for regular references
  let midX = (startX + endX) / 2;
  let midY = (startY + endY) / 2;
  
  // Check if midpoint overlaps with any class
  const allClasses = metamodel?.classes || [];
  const overlapsClass = allClasses.some(cls => isPointInClass(midX, midY, cls));
  
  if (!overlapsClass) {
    return { x: midX, y: midY };
  }
  
  // If midpoint overlaps, try offsetting perpendicular to the line
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length > 0) {
    // Normalize and get perpendicular vector
    const ndx = dx / length;
    const ndy = dy / length;
    const perpX = -ndy;
    const perpY = ndx;
    
    // Try offsets in both directions
    const offset = 30;
    const offset1X = midX + perpX * offset;
    const offset1Y = midY + perpY * offset;
    const offset2X = midX - perpX * offset;
    const offset2Y = midY - perpY * offset;
    
    // Check which offset doesn't overlap
    if (!allClasses.some(cls => isPointInClass(offset1X, offset1Y, cls))) {
      return { x: offset1X, y: offset1Y };
    } else if (!allClasses.some(cls => isPointInClass(offset2X, offset2Y, cls))) {
      return { x: offset2X, y: offset2Y };
    }
  }
  
  // Fallback to midpoint if we can't find a good position
  return { x: midX, y: midY };
};

/**
 * Get the position of a metaclass (stored or fallback to grid layout)
 */
export const getClassPosition = (metaClass: MetaClass, metamodel: Metamodel): { x: number; y: number } => {
  // Use the actual stored position if available, otherwise fall back to grid layout
  if (metaClass.position) {
    return metaClass.position;
  }
  
  // Fallback to grid layout if no position is stored
  const classIndex = metamodel.classes.indexOf(metaClass);
  const row = Math.floor(classIndex / 3);
  const col = classIndex % 3;
  return {
    x: col * 250 + 50,
    y: row * 200 + 50
  };
};

/**
 * Calculate the bounding box of all classes in the metamodel
 */
export const calculateMetamodelBounds = (metamodel: Metamodel): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  metamodel.classes.forEach(cls => {
    const pos = cls.position || { x: 0, y: 0 };
    const width = CLASS_WIDTH;
    const height = getClassHeight(cls);
    
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + width);
    maxY = Math.max(maxY, pos.y + height);
  });
  
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
};
