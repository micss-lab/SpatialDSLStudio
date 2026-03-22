// Hook for managing zoom and pan controls
import { useState } from 'react';
import { Model } from '../../../models/types';
import { calculateBoundingBox, calculateCenterPosition } from '../utils/geometryUtils';

/**
 * Custom hook for managing zoom, pan, and viewport controls
 * Handles zoom in/out, reset, center view, and pan/drag functionality
 */
export const useModelZoom = (
  model: Model | null,
  containerRef: React.RefObject<HTMLDivElement | null>,
  stageRef: React.RefObject<any>
) => {
  const [scale, setScale] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastPointerPosition, setLastPointerPosition] = useState({ x: 0, y: 0 });

  // Handle zoom controls
  const handleZoomIn = () => {
    const newScale = Math.min(scale * 1.2, 3);
    setScale(newScale);
  };

  const handleZoomOut = () => {
    const newScale = Math.max(scale / 1.2, 0.1);
    setScale(newScale);
  };

  const handleResetZoom = () => {
    setScale(1);
    setStagePosition({ x: 0, y: 0 });
  };

  // Center view on elements
  const centerViewOnElements = () => {
    if (!model || !containerRef.current) return;
    
    if (model.elements.length === 0) {
      // If no elements, just reset to center
      setScale(1);
      setStagePosition({ x: 0, y: 0 });
      return;
    }
    
    // Calculate the bounding box and center position using utilities
    const boundingBox = calculateBoundingBox(model.elements);
    const containerSize = {
      width: containerRef.current.offsetWidth,
      height: containerRef.current.offsetHeight
    };
    const { position: newPos, scale: newScale } = calculateCenterPosition(boundingBox, containerSize);
    
    // Apply the changes
    setScale(newScale);
    setStagePosition(newPos);
    
    // Force a redraw of the stage
    if (stageRef.current) {
      stageRef.current.batchDraw();
    }
  };

  // Handle stage drag for panning
  const handleStageDragStart = (e: any) => {
    // Only enable panning if not clicking on an element
    const clickedOnEmpty = e.target === e.target.getStage();
    if (clickedOnEmpty) {
      setIsDragging(true);
      setLastPointerPosition(e.target.getStage().getPointerPosition());
    }
  };

  const handleStageDragMove = (e: any) => {
    if (!isDragging) return;
    
    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    
    const dx = pointerPosition.x - lastPointerPosition.x;
    const dy = pointerPosition.y - lastPointerPosition.y;
    
    setStagePosition({
      x: stagePosition.x + dx,
      y: stagePosition.y + dy
    });
    
    setLastPointerPosition(pointerPosition);
  };

  const handleStageDragEnd = () => {
    setIsDragging(false);
  };

  return {
    scale,
    stagePosition,
    setStagePosition,
    isDragging,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
    centerViewOnElements,
    handleStageDragStart,
    handleStageDragMove,
    handleStageDragEnd,
  };
};
