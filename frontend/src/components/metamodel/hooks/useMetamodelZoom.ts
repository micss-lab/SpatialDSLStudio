import { useState, useCallback } from 'react';

export interface ZoomState {
  scale: number;
  stagePosition: { x: number; y: number };
}

export interface ZoomHandlers {
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleResetZoom: () => void;
  handleWheel: (e: any) => void;
  setScale: (scale: number) => void;
  setStagePosition: (position: { x: number; y: number }) => void;
}

/**
 * Custom hook for managing zoom and pan state in the metamodel editor
 */
export const useMetamodelZoom = (): [ZoomState, ZoomHandlers] => {
  const [scale, setScale] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });

  const handleWheel = useCallback((e: any) => {
    // Prevent default to disable zooming on wheel
    e.evt.preventDefault();
  }, []);

  const handleZoomIn = useCallback(() => {
    setScale(prevScale => Math.min(prevScale * 1.2, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale(prevScale => Math.max(prevScale / 1.2, 0.1));
  }, []);

  const handleResetZoom = useCallback(() => {
    setScale(1);
    setStagePosition({ x: 0, y: 0 });
  }, []);

  return [
    { scale, stagePosition },
    {
      handleZoomIn,
      handleZoomOut,
      handleResetZoom,
      handleWheel,
      setScale,
      setStagePosition
    }
  ];
};
