/**
 * Coordinate conversion utilities for 3D diagram
 * Currently uses 1:1 scale for consistency
 */

// Constants for unit conversion (now using 1:1 scale for consistency)
export const PIXEL_TO_MM = 1; // 1 pixel = 1 mm (1:1 scale)
export const MM_TO_PIXEL = 1; // 1 mm = 1 pixel (1:1 scale)

/**
 * Convert pixel coordinates to millimeters
 * @param pixels - Value in pixels
 * @returns Value in millimeters
 */
export const pixelToMm = (pixels: number): number => {
  return pixels * PIXEL_TO_MM;
};

/**
 * Convert millimeters to pixel coordinates
 * @param mm - Value in millimeters
 * @returns Value in pixels
 */
export const mmToPixel = (mm: number): number => {
  return mm * MM_TO_PIXEL;
};
