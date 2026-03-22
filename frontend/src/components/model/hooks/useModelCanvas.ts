// Hook for managing canvas size, refs, and positioning
import { useState, useEffect, useRef } from 'react';

/**
 * Custom hook for managing canvas stage and container
 * Handles stage size, resize events, and refs for stage and container
 */
export const useModelCanvas = () => {
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);

  // Stage size handler - updates on mount and window resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const containerHeight = containerRef.current.offsetHeight || window.innerHeight - 64;
        
        setStageSize({
          width: containerWidth,
          height: containerHeight
        });
        
        // Force redraw of stage with new dimensions
        if (stageRef.current) {
          stageRef.current.width(containerWidth);
          stageRef.current.height(containerHeight);
          stageRef.current.batchDraw();
        }
      }
    };
    
    // Initial update
    updateSize();
    
    // Add resize listener
    window.addEventListener('resize', updateSize);
    
    // Also run after a small delay to ensure container has fully rendered
    const timerId = setTimeout(updateSize, 500);
    
    return () => {
      window.removeEventListener('resize', updateSize);
      clearTimeout(timerId);
    };
  }, []);

  return {
    stageSize,
    setStageSize,
    stageRef,
    containerRef,
    isInitialLoad,
  };
};
