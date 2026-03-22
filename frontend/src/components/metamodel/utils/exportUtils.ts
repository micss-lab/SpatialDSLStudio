import { Metamodel } from '../../../models/types';
import { calculateMetamodelBounds } from './geometryUtils';

export interface ExportOptions {
  pixelRatio?: number;
  padding?: number;
  format?: 'png' | 'jpeg';
  quality?: number;
}

/**
 * Calculate the export dimensions and position for the metamodel diagram
 */
export const calculateExportBounds = (
  metamodel: Metamodel,
  padding: number = 100
): {
  minX: number;
  minY: number;
  exportWidth: number;
  exportHeight: number;
} => {
  const bounds = calculateMetamodelBounds(metamodel);
  
  // Add padding
  const minX = bounds.minX - padding;
  const minY = bounds.minY - padding;
  const maxX = bounds.maxX + padding;
  const maxY = bounds.maxY + padding;
  
  const exportWidth = Math.ceil(maxX - minX);
  const exportHeight = Math.ceil(maxY - minY);
  
  return {
    minX,
    minY,
    exportWidth,
    exportHeight
  };
};

/**
 * Create and trigger a download link for the exported image
 */
export const downloadImage = (dataUrl: string, filename: string): void => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Setup the global PNG export function for metamodel diagrams
 * Returns a cleanup function
 */
export const setupMetamodelExport = (
  metamodel: Metamodel | null,
  stageRef: React.RefObject<any>,
  scale: number,
  stagePosition: { x: number; y: number },
  setScale: (scale: number) => void,
  setStagePosition: (position: { x: number; y: number }) => void,
  options: ExportOptions = {}
): (() => void) => {
  const {
    pixelRatio = 2,
    padding = 100,
    format = 'png'
  } = options;
  
  // Expose the export function globally
  (window as any).exportMetamodelAsPng = async (id: string) => {
    if (!metamodel || id !== metamodel.id) {
      alert('Metamodel not loaded.');
      return;
    }
    
    if (!stageRef.current || !stageRef.current.toDataURL) {
      alert('PNG export is not available in this context.');
      return;
    }
    
    // Calculate export bounds
    const bounds = calculateExportBounds(metamodel, padding);
    
    // Temporarily move and scale the stage to fit all content
    const prevScale = scale;
    const prevStagePosition = { ...stagePosition };
    
    setScale(1);
    setStagePosition({ x: -bounds.minX, y: -bounds.minY });
    
    // Wait for React to re-render
    await new Promise(r => setTimeout(r, 100));
    
    // Export at specified quality
    const dataUrl = stageRef.current.toDataURL({
      x: 0,
      y: 0,
      width: bounds.exportWidth,
      height: bounds.exportHeight,
      pixelRatio
    });
    
    // Restore view
    setScale(prevScale);
    setStagePosition(prevStagePosition);
    
    // Download
    const filename = `${metamodel.name || 'metamodel'}.${format}`;
    downloadImage(dataUrl, filename);
  };
  
  // Return cleanup function
  return () => {
    if ((window as any).exportMetamodelAsPng) {
      delete (window as any).exportMetamodelAsPng;
    }
  };
};
