/**
 * Parse bend points from a JSON string
 * Returns null if parsing fails or string is undefined
 */
export const parseBendPoints = (bendPointsStr: string | undefined): Array<{x: number, y: number}> | null => {
  if (!bendPointsStr) return null;
  
  try {
    const points = JSON.parse(bendPointsStr);
    if (Array.isArray(points)) {
      return points;
    }
  } catch (e) {
    console.error('Failed to parse bend points:', e);
  }
  
  return null;
};

/**
 * Serialize bend points to a JSON string
 */
export const serializeBendPoints = (points: Array<{x: number, y: number}> | null): string | undefined => {
  if (!points || points.length === 0) return undefined;
  
  try {
    return JSON.stringify(points);
  } catch (e) {
    console.error('Failed to serialize bend points:', e);
    return undefined;
  }
};

/**
 * Convert bend points to Konva points array format [x1, y1, x2, y2, ...]
 */
export const bendPointsToKonvaPoints = (bendPoints: Array<{x: number, y: number}>): number[] => {
  return bendPoints.flatMap(point => [point.x, point.y]);
};

/**
 * Convert Konva points array to bend points array
 */
export const konvaPointsToBendPoints = (konvaPoints: number[]): Array<{x: number, y: number}> => {
  const bendPoints: Array<{x: number, y: number}> = [];
  
  for (let i = 0; i < konvaPoints.length; i += 2) {
    if (i + 1 < konvaPoints.length) {
      bendPoints.push({
        x: konvaPoints[i],
        y: konvaPoints[i + 1]
      });
    }
  }
  
  return bendPoints;
};
