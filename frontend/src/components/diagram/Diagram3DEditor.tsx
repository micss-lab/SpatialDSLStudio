import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, TransformControls } from '@react-three/drei';
import { Box, Typography, Drawer, Button, TextField, Alert, Switch, FormControlLabel } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import GridOnIcon from '@mui/icons-material/GridOn';
import * as THREE from 'three';
import { Diagram, DiagramElement, Metamodel, Model, ModelElement, ValidationIssue } from '../../models/types';
import { concreteSyntaxResolver, diagramService, diagramToolExecutionService, viewValidationService } from '../../services/diagram';
import { metamodelService } from '../../services/metamodel';
import viewpointService from '../../services/viewpoint.service';
import DiagramPalette, { DiagramPaletteDragItem } from '../palette/DiagramPalette';
import DiagramElementProperties from './DiagramElementProperties';
import ViewValidationPanel from './ViewValidationPanel';
import { modelInheritanceUtilsService, modelService } from '../../services/model';
import Node3D, { Element3D } from './Node3D';
import { useElementSelection } from './shared/hooks';
import { StatusOverlay3D, GridControls } from './3d/components';
import { useProject } from '../../contexts/ProjectContext';
import { normalizePosition3D, renderToDomainPosition } from '../../services/spatial';

interface Diagram3DEditorProps {
  diagramId: string;
}

const canonicalElementPosition3D = (element: DiagramElement): { x: number; y: number; z: number } => (
  normalizePosition3D(
    element.style?.position3D || (element as Element3D).position3D || {
      x: element.x ?? 0,
      y: element.y ?? 0,
    }
  ) || { x: 0, y: 0, z: 0 }
);

const asElement3D = (element: DiagramElement): Element3D => ({
  ...element,
  rotationZ: element.style.rotationZ ?? 0,
  position3D: canonicalElementPosition3D(element),
  widthMm: element.style.widthMm,
  heightMm: element.style.heightMm,
  depthMm: element.style.depthMm,
});

// Controls and scene setup
const SceneSetup = React.memo(({ onPlaneClick, gridSizeX, gridSizeY, controlsEnabled, sceneElevation }: {
  onPlaneClick: (position: THREE.Vector3) => void,
  gridSizeX: number,
  gridSizeY: number,
  controlsEnabled: boolean,
  sceneElevation: number,
}) => {
  const { camera } = useThree();
  
  // Set initial camera position - stadium-style broadcast perspective
  useEffect(() => {
    // Position camera like in a football stadium, high up in the stands at midfield
    // Looking down at the center of the pitch with a broadcast-style angle
    const stadiumHeight = Math.max(8000, sceneElevation * 1.5 + 4000);
    const midfield = 0; // At midfield (center of the field)
    const sidelineDistance = 12000; // Very far back from the sideline (12m back from field)
    
    camera.position.set(midfield, stadiumHeight, sidelineDistance);
    
    // Look down at the center of the field with a 35-degree downward angle
    const targetPoint = new THREE.Vector3(0, sceneElevation / 2, 0);
    camera.lookAt(targetPoint);
    
    // Fine-tune the angle to achieve the broadcast perspective
    const lookDirection = new THREE.Vector3();
    lookDirection.subVectors(targetPoint, camera.position).normalize();
    
    // Calculate the proper rotation for a 35-degree downward angle
    const downwardAngle = -35 * (Math.PI / 180); // Convert to radians
    const horizontalDistance = Math.sqrt(
      Math.pow(targetPoint.x - camera.position.x, 2) + 
      Math.pow(targetPoint.z - camera.position.z, 2)
    );
    const adjustedY = camera.position.y + Math.tan(downwardAngle) * horizontalDistance;
    
    camera.lookAt(targetPoint.x, adjustedY, targetPoint.z);
  }, [camera, sceneElevation]);
  
  // Handle clicks on the plane with camera-angle-aware detection
  const handlePlaneClick = (event: { stopPropagation: () => void; point: THREE.Vector3; intersections?: any[]; object?: any }) => {
    console.log('Plane click event:', event.object?.type, event.object?.geometry?.type, event.object?.parent?.type);
    
    if (event.object) {
      const clickedObject = event.object;
      
      // If this object has a parent Group, it's definitely an element, not the plane
      if (clickedObject.parent && clickedObject.parent.type === 'Group') {
        console.log('Rejecting click - object has Group parent (element mesh)');
        return;
      }
      
      // Allow PlaneGeometry clicks to proceed as plane clicks
      if (clickedObject.geometry && clickedObject.geometry.type.includes('Plane')) {
        console.log('Processing plane click - PlaneGeometry detected');
      } else {
        // For non-plane geometry, be more permissive - only reject if it's clearly an element
        console.log('Non-plane geometry:', clickedObject.geometry?.type, 'proceeding with plane click');
      }
    }
    
    console.log('Processing plane click');
    event.stopPropagation();
    
    // Get intersection point in world coordinates
    const intersectionPoint = new THREE.Vector3();
    intersectionPoint.copy(event.point);
    
    const domainPosition = renderToDomainPosition(intersectionPoint);
    const standardCoords = new THREE.Vector3(
      domainPosition.x,
      domainPosition.y,
      domainPosition.z
    );
    
    // Pass the position to the parent component
    onPlaneClick(standardCoords);
  };
  
  return (
    <>
      <OrbitControls 
        enabled={controlsEnabled}
        enableDamping 
        dampingFactor={0.25} 
        rotateSpeed={0.5}
        makeDefault
      />
      {/* Use lower intensity lighting for better performance */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[10000, Math.max(10000, sceneElevation + 5000), 10000]} intensity={0.5} />
      
      {/* Enhanced grid floor - properly positioned on XZ plane (horizontal floor) */}
      <group>
        {/* Main grid on XZ plane (Y is up) with no fading to prevent disappearing */}
        <Grid 
          infiniteGrid={false} // Use finite grid to prevent fading issues
          cellSize={100} // 100mm (10cm) grid cells - the small cells
          cellThickness={0.3} // Restored original thickness
          cellColor="#c0c0c0" // Restored original color for small cells
          sectionSize={1000} // 1000mm (1m) sections - the big cells
          sectionThickness={0.45} // Restored original thickness for section lines
          sectionColor="#808080" // Restored original darker color for section lines
          fadeDistance={Math.max(gridSizeX, gridSizeY) * 10} // Much larger fade distance to prevent disappearing
          fadeStrength={0.1} // Very weak fade strength to maintain visibility
          followCamera={false}
          position={[0, -2, 0]} // Moved closer: only 2mm below elements (minimal separation)
          rotation={[0, 0, 0]}
          // Keep the render order to ensure grid renders behind elements
          renderOrder={-1000}
          // Set explicit size to prevent infinite grid fading
          args={[Math.max(gridSizeX, gridSizeY) * 2, Math.max(gridSizeX, gridSizeY) * 2]}
        />
      </group>
      
      {/* Enhanced clickable plane with better separation from elements */}
      <group>
        {/* Primary clickable plane - positioned further below elements to reduce conflicts */}
        <mesh position={[0, -1.0, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={handlePlaneClick}>
          <planeGeometry args={[Math.max(gridSizeX, gridSizeY) * 4, Math.max(gridSizeX, gridSizeY) * 4]} /> {/* Larger clickable area */}
          <meshBasicMaterial visible={false} />
        </mesh>
        
        {/* Secondary clickable plane for better coverage - even further below */}
        <mesh position={[0, -2.0, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={handlePlaneClick}>
          <planeGeometry args={[Math.max(gridSizeX, gridSizeY) * 6, Math.max(gridSizeX, gridSizeY) * 6]} /> {/* Even larger backup plane */}
          <meshBasicMaterial visible={false} />
        </mesh>
      </group>
    </>
  );
});

// Custom hook for direct drag-based element movement (replaces transform controls)
const useElementMovement = (diagramId: string, element: Element3D | null, onTransform: () => void) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartMousePos, setDragStartMousePos] = useState<{ x: number, y: number } | null>(null);
  const [dragStartElementPosition, setDragStartElementPosition] = useState<{ x: number, y: number, z: number } | null>(null);
  const [movementMode, setMovementMode] = useState<'translate' | 'rotate'>('translate');
  const cameraRef = useRef<THREE.Camera | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Store camera and canvas references when available
  const setCameraRef = useCallback((camera: THREE.Camera) => {
    cameraRef.current = camera;
  }, []);
  
  const setCanvasRef = useCallback((canvas: HTMLCanvasElement) => {
    canvasRef.current = canvas;
  }, []);
  
  // Convert mouse coordinates to world position on the XZ plane
  const getWorldPositionFromMouse = useCallback((mouseX: number, mouseY: number) => {
    if (!cameraRef.current || !canvasRef.current) return new THREE.Vector3(0, 0, 0);
    
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    
    // Convert mouse coordinates to normalized device coordinates (-1 to +1)
    const mouse = new THREE.Vector2();
    mouse.x = (mouseX / canvas.clientWidth) * 2 - 1;
    mouse.y = -(mouseY / canvas.clientHeight) * 2 + 1;
    
    // Create raycaster
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    
    // Create drag plane (XZ plane at Y=0)
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    
    // Find intersection with the drag plane
    const intersectionPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane, intersectionPoint);
    
    return intersectionPoint;
  }, []);
  
  // Handle mouse move during drag
  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!isDragging || !element || !dragStartMousePos || !dragStartElementPosition || !canvasRef.current) return;
    
    // Get current mouse position relative to canvas
    const rect = canvasRef.current.getBoundingClientRect();
    const currentMouseX = event.clientX - rect.left;
    const currentMouseY = event.clientY - rect.top;
    
    // Get world positions for start and current mouse positions
    const startWorldPos = getWorldPositionFromMouse(dragStartMousePos.x, dragStartMousePos.y);
    const currentWorldPos = getWorldPositionFromMouse(currentMouseX, currentMouseY);
    
    // Calculate the delta in world space
    const deltaX = currentWorldPos.x - startWorldPos.x;
    const deltaZ = currentWorldPos.z - startWorldPos.z;
    
    const newPosition = {
      x: dragStartElementPosition.x + deltaX,
      y: dragStartElementPosition.y - deltaZ,
      z: dragStartElementPosition.z,
    };
    
    console.log('Dragging element to:', newPosition, 'delta:', { deltaX, deltaZ });
    
    // Update element position in real-time
    diagramService.updateElement(diagramId, element.id, {
      style: {
        ...element.style,
        position3D: newPosition
      }
    });
    
    // Trigger transform callback for UI updates
    onTransform();
  }, [isDragging, element, dragStartMousePos, dragStartElementPosition, diagramId, onTransform, getWorldPositionFromMouse]);
  
  // Handle mouse up during drag
  const handleMouseUp = useCallback((event: MouseEvent) => {
    if (isDragging && element) {
      console.log('Ending drag for element:', element.id);
      setIsDragging(false);
      setDragStartMousePos(null);
      setDragStartElementPosition(null);
      
      // Reset cursor
      document.body.style.cursor = 'auto';
      
      // Final save
      onTransform();
    }
  }, [isDragging, element, onTransform]);
  
  // Add/remove global mouse event listeners when dragging state changes
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);
  
  // Handle drag start
  const handleDragStart = useCallback((event: any) => {
    if (!element || !canvasRef.current) return;
    
    console.log('Starting drag for element:', element.id);
    
    // Get mouse position relative to canvas
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    setIsDragging(true);
    setDragStartMousePos({ x: mouseX, y: mouseY });
    
    const currentPos = normalizePosition3D(
      element.style.position3D || element.position3D || { x: element.x || 0, y: element.y || 0 }
    ) || { x: 0, y: 0, z: 0 };
    setDragStartElementPosition(currentPos);
    
    // Set cursor to indicate dragging
    document.body.style.cursor = 'grabbing';
    
    // Prevent default to avoid any browser drag behavior
    event.preventDefault();
    event.stopPropagation();
  }, [element]);
  
  // Handle drag movement (not needed with global mouse tracking, but kept for compatibility)
  const handleDragMove = useCallback((event: any) => {
    // This is now handled by the global mouse move listener
  }, []);
  
  // Handle drag end (not needed with global mouse tracking, but kept for compatibility)
  const handleDragEnd = useCallback(() => {
    // This is now handled by the global mouse up listener
  }, []);
  
  return { 
    isDragging,
    movementMode,
    setMovementMode,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    setCameraRef,
    setCanvasRef
  };
};

// Error boundary for WebGL errors
class WebGLErrorBoundary extends React.Component<
  { children: React.ReactNode, onError: (error: Error) => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode, onError: (error: Error) => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("WebGL Error:", error);
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}

// Main 3D diagram editor
const Diagram3DEditor: React.FC<Diagram3DEditorProps> = ({ diagramId }) => {
  const { project } = useProject();
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [metamodel, setMetamodel] = useState<Metamodel | null>(null);
  const [model, setModel] = useState<Model | null>(null);
  
  // Element selection using shared hook
  const { selectedElement, setSelectedElement } = useElementSelection<Element3D>();
  
  const [isDraggingPaletteItem, setIsDraggingPaletteItem] = useState(false);
  const [draggingPaletteItem, setDraggingPaletteItem] = useState<DiagramPaletteDragItem | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [webGLError, setWebGLError] = useState<string | null>(null);
  const [lowPerformanceMode, setLowPerformanceMode] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [gridSize, setGridSize] = useState(20000); // Initial grid size in mm (9m) - increased to show more cells
  const defaultGridSize = 20000; // Store the default grid size
  const [gridSizeX, setGridSizeX] = useState(20000); // X-axis specific grid size
  const [gridSizeY, setGridSizeY] = useState(20000); // Y-axis specific grid size
  const [gridControlAnchor, setGridControlAnchor] = useState<HTMLElement | null>(null);
  const [selectedAxes, setSelectedAxes] = useState({ x: true, y: true }); // Track which axes are selected
  const [elementZIndexes, setElementZIndexes] = useState<Record<string, number>>({});
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [isElevationDragging, setIsElevationDragging] = useState(false);
  const [elevationFeedback, setElevationFeedback] = useState<string | null>(null);
  const nextZIndexRef = useRef<number>(1);
  // Simplified ref management - single ref for selected element
  const selectedElementRef = useRef<THREE.Group>(null);
  // Track when an element was recently clicked to avoid deselection
  const elementClickedRef = useRef<boolean>(false);
  const hasLoggedLoadTimeRef = useRef(false);
  const loadStartRef = useRef<number>(performance.now());
  
  // Handle WebGL errors from the error boundary
  const handleWebGLError = useCallback((error: Error) => {
    setWebGLError(`WebGL error: ${error.message}. Try using low performance mode or switch to 2D view.`);
  }, []);
  
  // Function to check and expand grid if needed
  const checkAndExpandGrid = useCallback((x: number, y: number) => {
    // Calculate distance from center for both axes
    const distanceX = Math.abs(x);
    const distanceY = Math.abs(y);
    const buffer = 1000; // Buffer distance in mm before we expand (1m)
    
    let needsUpdate = false;
    let newSizeX = gridSizeX;
    let newSizeY = gridSizeY;
    
    // Check X axis
    if (distanceX > gridSizeX - buffer) {
      newSizeX = Math.max(gridSizeX * 1.5, distanceX + buffer * 2);
      needsUpdate = true;
    }
    
    // Check Y axis  
    if (distanceY > gridSizeY - buffer) {
      newSizeY = Math.max(gridSizeY * 1.5, distanceY + buffer * 2);
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      setGridSizeX(newSizeX);
      setGridSizeY(newSizeY);
      // Update the overall grid size to be the maximum of both axes
      setGridSize(Math.max(newSizeX, newSizeY));
      
      // Save the updated grid settings to diagram
      if (diagram) {
        diagramService.updateGridSettings(diagramId, {
          sizeX: newSizeX,
          sizeY: newSizeY
        });
      }
    }
  }, [gridSizeX, gridSizeY, diagram, diagramId]);
  
  // Function to save changes when diagram or elements change
  const saveChanges = useCallback(() => {
    if (diagram) {
      // Get the latest version from the service
      const updatedDiagram = diagramService.getDiagramById(diagramId);
      
      // Update local state with the refreshed diagram
      if (updatedDiagram) {
        // Convert to 3D elements - use position3D from style if available
        const elements3D = updatedDiagram.elements.map(asElement3D);
        
        setDiagram({
          ...updatedDiagram,
          elements: elements3D
        });
      } else {
        setDiagram(null);
      }
      
      // If an element was selected, update it with the latest data
      if (selectedElement && updatedDiagram) {
        const updatedElement = updatedDiagram.elements.find(
          e => e.id === selectedElement.id
        );
        
        if (updatedElement) {
          setSelectedElement(asElement3D(updatedElement));
        } else {
          setSelectedElement(null);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagram, diagramId, selectedElement]);
  
  // Listen for element-moved events from direct dragging
  useEffect(() => {
    const handleElementMoved = (event: CustomEvent) => {
      const { id, x, y } = event.detail;
      
      if (id && diagram) {
        // Store 3D position in style rather than affecting the actual x,y coordinates
        const updatedElement = diagram.elements.find(e => e.id === id);
        if (updatedElement) {
          const currentPosition = canonicalElementPosition3D(updatedElement);
          const nextPosition = { x, y, z: currentPosition.z };
          diagramService.updateElement(diagramId, id, { 
            style: {
              ...updatedElement.style,
              position3D: nextPosition,
            }
          });
        
          // Update the selected element if it's the one that was moved
          if (selectedElement && selectedElement.id === id) {
            setSelectedElement({
              ...selectedElement,
              style: {
                ...selectedElement.style,
                position3D: nextPosition,
              },
              position3D: nextPosition,
            });
          }
        
          // Check if grid needs to be expanded
          checkAndExpandGrid(x, y);
        }
      }
    };
    
    // Add event listener
    document.addEventListener('element-moved', handleElementMoved as EventListener);
    
    // Cleanup listener
    return () => {
      document.removeEventListener('element-moved', handleElementMoved as EventListener);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagram, diagramId, selectedElement, checkAndExpandGrid]);
  
  // Use our custom element movement hook (replaces transform controls)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { isDragging, movementMode, setMovementMode, handleDragStart, handleDragMove, handleDragEnd, setCameraRef, setCanvasRef } = 
    useElementMovement(diagramId, selectedElement, saveChanges);
  
  // Initialize and load diagram data
  useEffect(() => {
    const loadDiagram = () => {
      const diagramData = diagramService.getDiagramById(diagramId);
      
      if (diagramData) {
        // Convert the 2D diagram data to include 3D properties
        const elements3D = diagramData.elements.map(asElement3D);
        
        setDiagram({
          ...diagramData,
          elements: elements3D
        });
        
        // Load grid settings from diagram data if available
        if (diagramData.gridSettings) {
          setGridSizeX(diagramData.gridSettings.sizeX);
          setGridSizeY(diagramData.gridSettings.sizeY);
          setGridSize(Math.max(diagramData.gridSettings.sizeX, diagramData.gridSettings.sizeY));
        } else {
          // Set default grid sizes if no saved settings
          setGridSizeX(defaultGridSize);
          setGridSizeY(defaultGridSize);
          setGridSize(defaultGridSize);
        }
        
        // Get the model and then get its metamodel
        const model = modelService.getModelById(diagramData.modelId);
        if (model) {
          setModel(model);
          const metamodelData = metamodelService.getMetamodelById(model.conformsTo);
          if (metamodelData) {
            setMetamodel(metamodelData);
          }
        }
      }
    };
    
    loadDiagram();
    // Only refresh if not currently dragging to avoid disrupting the user interaction
    const refreshInterval = !isDragging ? setInterval(loadDiagram, 5000) : null;
    
    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
    };
  }, [diagramId, isDragging, defaultGridSize]);

  // Log load time once diagram and metamodel are ready
  useEffect(() => {
    if (diagram && metamodel && !hasLoggedLoadTimeRef.current) {
      const durationMs = Math.max(1, Math.round(performance.now() - loadStartRef.current));
      console.log(`[3D Diagram Editor] Model loading time: ${durationMs} ms`);
      hasLoggedLoadTimeRef.current = true;
    }
  }, [diagram, metamodel]);
  
  // Catch WebGL context errors
  useEffect(() => {
    const handleContextLost = () => {
      setWebGLError('WebGL context lost. This may be due to graphics limitations. Try reducing the number of elements or refreshing the page.');
    };
    
    window.addEventListener('webglcontextlost', handleContextLost);
    
    return () => {
      window.removeEventListener('webglcontextlost', handleContextLost);
    };
  }, []);

  // Maintain z-index ordering for elements
  useEffect(() => {
    if (diagram) {
      // Start with a clean mapping of element IDs to z-indexes
      const newZIndexes: Record<string, number> = {};
      
      // Assign z-indexes to elements that don't have one yet
      diagram.elements.forEach(element => {
        if (!elementZIndexes[element.id]) {
          // New element gets the next available z-index
          newZIndexes[element.id] = nextZIndexRef.current;
          nextZIndexRef.current += 1;
        } else {
          // Existing element keeps its z-index
          newZIndexes[element.id] = elementZIndexes[element.id];
        }
      });
      
      setElementZIndexes(newZIndexes);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagram?.elements.length]);

  // Function to bring an element to the front
  const bringToFront = useCallback((elementId: string) => {
    if (!elementId) return;
    
    // Update the z-index for this element
    setElementZIndexes(prev => ({
      ...prev,
      [elementId]: nextZIndexRef.current
    }));
    
    // Increment the counter for the next element
    nextZIndexRef.current += 1;
  }, []);

  // Bring selected elements to front
  useEffect(() => {
    if (selectedElement?.id) {
      bringToFront(selectedElement.id);
    }
  }, [selectedElement?.id, bringToFront]);

  // Remove transform controls attachment - using direct drag now
  // No longer needed since we're using direct element dragging

  // Enhanced element click handler with camera-angle-aware timing
  const handleElementClick = useCallback((element: Element3D) => {
    console.log('Element clicked:', element.id);
    
    // Mark that an element was clicked to prevent plane deselection
    elementClickedRef.current = true;
    
    // Reset the flag after a reasonable delay
    setTimeout(() => {
      console.log('Resetting elementClickedRef flag');
      elementClickedRef.current = false;
    }, 150); // Balanced timeout - not too short, not too long
    
    // If the same element is clicked, keep it selected
    if (selectedElement?.id === element.id) {
      console.log('Same element clicked, keeping selection');
      return;
    }
    
    // Bring element to front when selected
    bringToFront(element.id);
    
    // Set the selected element directly
    setSelectedElement(element);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bringToFront, selectedElement]);
  
  // Sort elements by z-index for rendering so elements with higher z-index appear "on top"
  const getSortedElements = useCallback(() => {
    if (!diagram?.elements) return [];
    
    return [...diagram.elements]
      .filter(element => element.type === 'node')
      .map(element => ({
        element,
        zIndex: elementZIndexes[element.id] || 0
      }))
      .sort((a, b) => a.zIndex - b.zIndex)
      .map(item => item.element);
  }, [diagram?.elements, elementZIndexes]);

  const viewContext = React.useMemo(
    () => diagram ? viewpointService.resolveRepresentationDescription(diagram) : {},
    [diagram]
  );
  const maxSceneElevation = React.useMemo(() => (
    Math.max(0, ...(diagram?.elements || []).map(element => {
      const position = canonicalElementPosition3D(element);
      const height = element.style.depthMm ?? (element as Element3D).depthMm ?? 0;
      return position.z + height;
    }))
  ), [diagram]);
  const selectedSemanticElement = React.useMemo(() => {
    if (!selectedElement || !model) return undefined;
    const semanticId = selectedElement.style?.linkedModelElementId
      || selectedElement.style?.modelElementRefId
      || selectedElement.id;
    return model.elements.find(candidate => candidate.id === semanticId);
  }, [model, selectedElement]);
  const selected3DAppearance = React.useMemo(() => (
    selectedSemanticElement
      ? concreteSyntaxResolver.resolve3D(
        selectedSemanticElement,
        metamodel,
        viewContext.representationDescription,
        viewContext.viewpoint
      )
      : undefined
  ), [metamodel, selectedSemanticElement, viewContext.representationDescription, viewContext.viewpoint]);
  const verticalPlacement = selected3DAppearance?.verticalPlacement || { mode: 'grounded' as const };
  const selectedBaseZ = selectedElement ? canonicalElementPosition3D(selectedElement).z : 0;
  const validationContextKey = diagram
    ? `${diagram.id}:${diagram.modelId}:${diagram.representationDescriptionId || ''}`
    : '';
  const validateView = useCallback(() => {
    const currentDiagram = diagramService.getDiagramById(diagramId);
    setValidationIssues(currentDiagram ? viewValidationService.validateDiagram(currentDiagram).issues : []);
  }, [diagramId]);
  useEffect(() => {
    if (validationContextKey) validateView();
  }, [validateView, validationContextKey]);
  const handleValidationIssueSelect = useCallback((issue: ValidationIssue) => {
    const currentDiagram = diagramService.getDiagramById(diagramId);
    if (!currentDiagram) return;
    const element = viewValidationService.findElementForIssue(currentDiagram, issue);
    if (!element) return;
    bringToFront(element.id);
    setSelectedElement(asElement3D(element));
  }, [bringToFront, diagramId, setSelectedElement]);

  // If we have a WebGL error, show fallback UI
  if (webGLError) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {webGLError}
        </Alert>
        <Button 
          variant="contained" 
          onClick={() => setWebGLError(null)}
          sx={{ mr: 1 }}
        >
          Retry 3D View
        </Button>
        <Button 
          variant="outlined"
          component="a"
          href={`/projects/${project.id}/views/${diagramId}`}
        >
          Switch to 2D Mode
        </Button>
      </Box>
    );
  }

  const handlePlaneClick = (position: THREE.Vector3) => {
    console.log('Main handlePlaneClick called with position:', position);
    
    // Enhanced plane click handling with camera-angle-aware delays
    // At certain camera angles, element and plane clicks can interfere
    
    const processPlaneClick = () => {
      console.log('processPlaneClick - elementClickedRef:', elementClickedRef.current, 'isDraggingPaletteItem:', isDraggingPaletteItem, 'isDragging:', isDragging);
      
      // Only deselect if an element wasn't just clicked and we're not doing other operations
      if (!elementClickedRef.current && !isDraggingPaletteItem && !isDragging) {
        console.log('Deselecting element due to plane click');
        setSelectedElement(null);
      } else {
        console.log('Plane click blocked - recent element click or operation in progress');
      }
    };
    
    // Wait for element clicks to be processed first
    setTimeout(processPlaneClick, 100);
    
    // If dragging a palette item, create a new element at this position
    if (isDraggingPaletteItem && draggingPaletteItem && diagram) {
      const createOrAddElement = async () => {
        try {
          let newElement = null;
          let resolved3D = { widthMm: 500, heightMm: 800, depthMm: 200 };
          let baseZ = 0;

          if (draggingPaletteItem.kind === 'existing-model-element') {
            const modelElement = draggingPaletteItem.modelElement;
            const resolvedAppearance = concreteSyntaxResolver.resolve3D(
              modelElement,
              metamodel,
              viewContext.representationDescription,
              viewContext.viewpoint
            );
            resolved3D = resolvedAppearance;
            baseZ = normalizePosition3D(modelElement.presentation?.position3D)?.z
              ?? (resolvedAppearance.verticalPlacement.mode === 'adjustable'
                ? resolvedAppearance.verticalPlacement.defaultBaseZMm ?? 0
                : 0);
            newElement = diagramService.addElement(
              diagramId,
              modelElement.id,
              'node',
              position.x,
              position.y,
              modelElement.presentation?.size2D?.width || 80,
              modelElement.presentation?.size2D?.height || 50,
              undefined,
              undefined,
              {
                ...(modelElement.style || {}),
                rotationZ: 0,
                widthMm: resolved3D.widthMm,
                heightMm: resolved3D.heightMm,
                depthMm: resolved3D.depthMm,
                position3D: { x: position.x, y: position.y, z: baseZ },
              }
            );
          } else {
            const previewElement: ModelElement = {
              id: 'preview',
              modelElementId: draggingPaletteItem.metaClass.id,
              style: {},
              references: {},
            };
            const resolved2D = concreteSyntaxResolver.resolve2D(previewElement, metamodel);
            const resolvedAppearance = concreteSyntaxResolver.resolve3D(
              previewElement,
              metamodel,
              viewContext.representationDescription,
              viewContext.viewpoint
            );
            resolved3D = resolvedAppearance;
            baseZ = resolvedAppearance.verticalPlacement.mode === 'adjustable'
              ? resolvedAppearance.verticalPlacement.defaultBaseZMm ?? 0
              : 0;
            const presentation = {
              position2D: { x: position.x, y: position.y },
              size2D: resolved2D.defaultSize || { width: 120, height: 80 },
              position3D: { x: position.x, y: position.y, z: baseZ },
              size3D: {
                widthMm: resolved3D.widthMm,
                heightMm: resolved3D.heightMm,
                depthMm: resolved3D.depthMm,
              },
              rotationZ: 0,
            };
            if (draggingPaletteItem.tool) {
              const result = await diagramToolExecutionService.executeCreateNodeTool(
                diagramId,
                draggingPaletteItem.tool,
                presentation
              );
              newElement = result.value || null;
            } else {
              newElement = await diagramService.createModelElementInView(
                diagramId,
                draggingPaletteItem.metaClass.id,
                presentation,
                { name: `${draggingPaletteItem.metaClass.name} 1` }
              );
            }
          }

          if (newElement) {
            setSelectedElement({
              ...newElement,
              rotationZ: 0,
              widthMm: resolved3D.widthMm,
              heightMm: resolved3D.heightMm,
              depthMm: resolved3D.depthMm,
              position3D: { x: position.x, y: position.y, z: baseZ },
            });

            checkAndExpandGrid(position.x, position.y);
            saveChanges();
          }
        } finally {
          setIsDraggingPaletteItem(false);
          setDraggingPaletteItem(null);
        }
      };

      createOrAddElement();
    }
  };
  
  const handlePropertyChange = (propertyName: string, value: any) => {
    if (!selectedElement || !diagram) return;
    const semanticElementId = selectedElement.style?.linkedModelElementId
      || model?.elements.find(candidate => candidate.id === selectedElement.id)?.id;
    const semanticElement = semanticElementId
      ? model?.elements.find(candidate => candidate.id === semanticElementId)
      : undefined;
    const semanticMetaClass = semanticElement && metamodel
      ? metamodel.classes.find(candidate => candidate.id === semanticElement.modelElementId)
      : undefined;
    const isSemanticAttribute = Boolean(
      semanticMetaClass
      && metamodel
      && modelInheritanceUtilsService
        .getAllAttributes(semanticMetaClass, metamodel)
        .some(attribute => attribute.name === propertyName)
    );

    if (model && semanticElementId && isSemanticAttribute) {
      modelService.updateModelElementProperties(model.id, semanticElementId, { [propertyName]: value });
      setModel({ ...model, elements: [...model.elements] });
      setSelectedElement({
        ...selectedElement,
        style: { ...selectedElement.style, [propertyName]: value },
      });
      saveChanges();
      return;
    }
    
    // Special handling for rotationZ property - save it as a property in the stored style
    if (propertyName === 'rotationZ') {
      diagramService.updateElement(diagramId, selectedElement.id, {
        style: {
          ...selectedElement.style,
          rotationZ: value
        }
      });
      
      // Update local state
      setSelectedElement({
        ...selectedElement,
        style: {
          ...selectedElement.style,
          rotationZ: value
        }
      });
    } else if (propertyName === 'x' || propertyName === 'y' || propertyName === 'z') {
      if (propertyName === 'z' && verticalPlacement.mode !== 'adjustable') return;
      const position3D = canonicalElementPosition3D(selectedElement);
      const updatedPosition = {
        ...position3D,
        [propertyName]: value
      };

      if (propertyName === 'z') {
        if (verticalPlacement.minBaseZMm !== undefined && value < verticalPlacement.minBaseZMm) {
          setElevationFeedback(`Base elevation is below the configured minimum of ${verticalPlacement.minBaseZMm} mm.`);
        } else if (verticalPlacement.maxBaseZMm !== undefined && value > verticalPlacement.maxBaseZMm) {
          setElevationFeedback(`Base elevation is above the configured maximum of ${verticalPlacement.maxBaseZMm} mm.`);
        } else {
          setElevationFeedback(null);
        }
      }
      
      diagramService.updateElement(diagramId, selectedElement.id, {
        style: {
          ...selectedElement.style,
          position3D: updatedPosition
        },
      });
      
      // Update local state
      setSelectedElement({
        ...selectedElement,
        style: {
          ...selectedElement.style,
          position3D: updatedPosition
        },
        position3D: updatedPosition,
      });
      
      // Check if grid needs to be expanded
      if (propertyName === 'x') {
        checkAndExpandGrid(value, updatedPosition.y);
      } else if (propertyName === 'y') {
        checkAndExpandGrid(updatedPosition.x, value);
      }
    } else {
      // Handle regular properties
      diagramService.updateElement(diagramId, selectedElement.id, {
        style: {
          ...selectedElement.style,
          [propertyName]: value
        }
      });
      
      // Update local state
      setSelectedElement({
        ...selectedElement,
        style: {
          ...selectedElement.style,
          [propertyName]: value
        }
      });
    }
    
    saveChanges();
  };

  const handleSnapToGround = () => {
    if (verticalPlacement.mode !== 'adjustable') return;
    handlePropertyChange('z', 0);
  };

  const snapSelectedElevationToStep = () => {
    if (verticalPlacement.mode !== 'adjustable') return;
    const step = verticalPlacement.stepMm;
    if (step === undefined || !Number.isFinite(step) || step <= 0) return;
    handlePropertyChange('z', Math.round(selectedBaseZ / step) * step);
  };

  const handleElevationTransformChange = () => {
    if (!selectedElementRef.current || verticalPlacement.mode !== 'adjustable') return;
    handlePropertyChange('z', selectedElementRef.current.position.y);
  };
  
  const handleDeleteElement = () => {
    if (!selectedElement || !diagram) return;
    
    diagramService.deleteElement(diagramId, selectedElement.id);
    setSelectedElement(null);
    saveChanges();
  };

  const handleDeleteFromModel = () => {
    if (!selectedElement || !diagram) return;

    const confirmed = window.confirm(
      'Delete this element from the model? It will disappear from every view and references to it may be removed.'
    );
    if (!confirmed) return;

    modelService.deleteModelElement(diagram.modelId, selectedElement.id);
    diagramService.removeElementsForModelElement(diagram.modelId, selectedElement.id);
    setSelectedElement(null);
    saveChanges();
  };
  
  // Grid control functions
  const handleGridControlOpen = (event: React.MouseEvent<HTMLElement>) => {
    setGridControlAnchor(event.currentTarget);
  };
  
  const handleGridControlClose = () => {
    setGridControlAnchor(null);
  };
  
  const handleGridSizeChange = (newSize: number) => {
    // Ensure minimum size is the default
    const size = Math.max(newSize, defaultGridSize);
    
    let newSizeX = gridSizeX;
    let newSizeY = gridSizeY;
    
    if (selectedAxes.x && selectedAxes.y) {
      // Both axes selected - apply to both
      newSizeX = size;
      newSizeY = size;
      setGridSizeX(size);
      setGridSizeY(size);
      setGridSize(size);
    } else if (selectedAxes.x) {
      // Only X axis
      newSizeX = size;
      setGridSizeX(size);
      setGridSize(Math.max(size, gridSizeY));
    } else if (selectedAxes.y) {
      // Only Y axis
      newSizeY = size;
      setGridSizeY(size);
      setGridSize(Math.max(gridSizeX, size));
    }
    
    // Save grid settings to diagram
    if (diagram) {
      diagramService.updateGridSettings(diagramId, {
        sizeX: newSizeX,
        sizeY: newSizeY
      });
    }
  };
  
  const handleSliderChange = (_: Event, newValue: number | number[]) => {
    const value = Array.isArray(newValue) ? newValue[0] : newValue;
    const sizeInMm = value * 1000; // Convert from meters to millimeters
    handleGridSizeChange(sizeInMm);
  };
  
  const handleAxisToggle = (axis: 'x' | 'y') => {
    setSelectedAxes(prev => ({
      ...prev,
      [axis]: !prev[axis]
    }));
  };
  
  const handlePaletteItemDragStart = (item: DiagramPaletteDragItem) => {
    setIsDraggingPaletteItem(true);
    setDraggingPaletteItem(item);
  };
  
  if (!diagram || !metamodel) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Typography variant="h6">Loading view...</Typography>
      </Box>
    );
  }

  return (
    <Box 
      ref={containerRef} 
      sx={{ 
        display: 'flex', 
        width: '100%', 
        height: '100%',
        overflow: 'hidden'
      }}
    >
      {/* Palette */}
      {model && (
        <DiagramPalette
          metamodel={metamodel}
          model={model}
          diagram={diagram}
          onDragStart={handlePaletteItemDragStart}
          onAddAll={() => {
            diagramService.addAllModelElementsToView(diagramId);
            saveChanges();
          }}
        />
      )}
      
      {/* 3D Canvas */}
      <Box 
        sx={{ 
          flex: 1, 
          position: 'relative',
          backgroundColor: '#f0f0f0'
        }}
        onClick={(e) => {
          // Enhanced fallback click handler for empty space clicks
          console.log('Container clicked, target:', e.target);
          
          // Only process if we clicked on the canvas or container, not on UI elements
          const target = e.target as HTMLElement;
          if (target.tagName === 'CANVAS' || target === e.currentTarget) {
            console.log('Canvas container click detected');
            
            // Use a shorter delay but still ensure element clicks are processed
            setTimeout(() => {
              // Additional check: only deselect if we're not currently dragging
              // and no element interaction happened very recently
              if (!elementClickedRef.current && 
                  !isDraggingPaletteItem && 
                  !isDragging) {
                console.log('Deselecting element via container click');
                setSelectedElement(null);
              } else {
                console.log('Container click blocked - interaction flags:', {
                  elementClicked: elementClickedRef.current,
                  draggingPalette: isDraggingPaletteItem,
                  draggingElement: isDragging
                });
              }
            }, 100); // Reduced from 200ms for more responsive interaction
          }
        }}
      >
        {/* Performance mode toggle and Grid Size control */}
        <Box 
          sx={{ 
            position: 'absolute', 
            top: 10, 
            right: 10, 
            zIndex: 10, 
            backgroundColor: 'rgba(255,255,255,0.7)',
            p: 1,
            borderRadius: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 1
          }}
        >
          <FormControlLabel
            control={
              <Switch
                checked={lowPerformanceMode}
                onChange={(e) => setLowPerformanceMode(e.target.checked)}
                name="lowPerformanceMode"
                color="primary"
              />
            }
            label="Low Performance Mode"
          />
          {lowPerformanceMode && (
            <Button 
              variant="outlined" 
              size="small" 
              sx={{ ml: 1 }}
              onClick={() => {
                // Force a render update
                const canvas = document.querySelector('canvas');
                if (canvas) {
                  const event = new Event('update');
                  canvas.dispatchEvent(event);
                }
              }}
            >
              Update View
            </Button>
          )}
          
          {/* Grid Size Control Button */}
          <Button
            variant="outlined"
            size="small"
            startIcon={<GridOnIcon />}
            onClick={handleGridControlOpen}
            sx={{ 
              backgroundColor: 'rgba(255,255,255,0.9)',
              '&:hover': {
                backgroundColor: 'rgba(255,255,255,1)'
              }
            }}
          >
            Grid Size
          </Button>
        </Box>

        {/* Grid Control Popover */}
        <GridControls
          anchorEl={gridControlAnchor}
          onClose={handleGridControlClose}
          gridSizeX={gridSizeX}
          gridSizeY={gridSizeY}
          defaultGridSize={defaultGridSize}
          selectedAxes={selectedAxes}
          onAxisToggle={handleAxisToggle}
          onSliderChange={handleSliderChange}
        />

        <Box sx={{ position: 'absolute', top: 10, left: 10, zIndex: 10 }}>
          <ViewValidationPanel
            issues={validationIssues}
            onRefresh={validateView}
            onSelectIssue={handleValidationIssueSelect}
          />
        </Box>

        <WebGLErrorBoundary onError={handleWebGLError}>
          <Canvas 
            style={{ width: '100%', height: '100%' }}
            gl={{ 
              powerPreference: lowPerformanceMode ? 'low-power' : 'high-performance',
              antialias: !lowPerformanceMode, 
              alpha: true, // Enable alpha to prevent white background issues
              stencil: false, 
              depth: true,
              // Enhanced depth buffer settings to prevent z-fighting
              logarithmicDepthBuffer: true, // Better depth precision for large scenes
              precision: 'highp' // High precision for better depth calculations
            }}
            dpr={lowPerformanceMode ? [0.5, 1] : [1, 1.5]} 
            camera={{ 
              position: [0, 8000, 12000], // Extremely zoomed out: midfield, helicopter-height, very far back
              fov: 50, // Broadcast-style field of view (reduced from 90 for more natural perspective)
              far: Math.max(gridSizeX, gridSizeY, maxSceneElevation + 10000) * 4,
              near: 1 // Increased near plane to improve depth buffer precision
            }}
            // Enhanced raycaster configuration for better camera angle reliability
            raycaster={{
              // Improved threshold settings for better object detection
              params: {
                Mesh: { threshold: 0 },
                Points: { threshold: 1 },
                Line: { threshold: 1 },
                LOD: {},
                Sprite: {}
              },
              // Ensure consistent raycasting behavior
              layers: undefined
            }}
            frameloop={lowPerformanceMode ? 'demand' : 'always'}
            // Enhanced onPointerMissed with better event filtering
            onPointerMissed={(event) => {
              console.log('Canvas onPointerMissed triggered');
              
              // Use shorter delay for more responsive interaction
              setTimeout(() => {
                if (!elementClickedRef.current && !isDraggingPaletteItem && !isDragging) {
                  console.log('Deselecting via onPointerMissed');
                  setSelectedElement(null);
                } else {
                  console.log('onPointerMissed blocked - interaction in progress');
                }
              }, 50);
            }}
            onCreated={({ gl, scene, camera }) => {
              // Set scene background to a gradient sky color instead of solid white
              scene.background = new THREE.Color('#e6f0ff');
              
              // Enhanced WebGL settings for better depth precision
              gl.setPixelRatio(Math.min(window.devicePixelRatio, lowPerformanceMode ? 1 : 1.5));
              
              // Access the WebGL context for better depth testing configuration
              const webglContext = gl.getContext();
              if (webglContext) {
                // Enable depth testing and configure for better z-fighting prevention
                webglContext.enable(webglContext.DEPTH_TEST);
                webglContext.depthFunc(webglContext.LEQUAL); // Use less-than-or-equal for better depth precision
                webglContext.clearDepth(1.0);
              }
              
              // Store camera and canvas references for drag calculations
              setCameraRef(camera);
              setCanvasRef(gl.domElement);
              
              // Add context restoration handler
              const canvas = gl.domElement;
              canvas.addEventListener('webglcontextrestored', () => {
                setWebGLError(null);
                console.log('WebGL context restored');
              });
            }}
          >
            <SceneSetup
              onPlaneClick={handlePlaneClick}
              gridSizeX={gridSizeX}
              gridSizeY={gridSizeY}
              controlsEnabled={!isDragging && !isElevationDragging}
              sceneElevation={maxSceneElevation}
            />
            
            {/* Add fog to prevent whitening at distance */}
            {/*<fog attach="fog" args={['#e6f0ff', gridSize/2, gridSize*2]} />*/}
            
            {/* Render elements sorted by z-index so later elements appear on top */}
            {getSortedElements()
              // Limit the number of rendered elements to prevent WebGL overload
              .slice(0, lowPerformanceMode ? 20 : 50) // Reduce limit further in low performance mode
              .map((element, index, array) => {
                const metaClass = metamodel?.classes.find(c => c.id === element.modelElementId);
                if (!metaClass) return null;
                
                // Prioritize position3D from style, then from element property, then fall back to x,y
                const position3D = canonicalElementPosition3D(element);
                
                // Calculate render order based on index in the sorted array
                // Later elements (higher in the array) should have higher render order
                // Ensure all elements render in front of the grid (which has renderOrder -1000)
                const renderOrder = index + 100; // Start at 100 to ensure elements are always above grid
                const isSelected = selectedElement?.id === element.id;
                
                return (
                  <Node3D
                    key={element.id}
                    ref={isSelected ? selectedElementRef : undefined}
                    element={{
                      ...element as Element3D,
                      position3D: position3D
                    }}
                    model={model}
                    metamodel={metamodel}
                    representationDescription={viewContext.representationDescription}
                    viewpoint={viewContext.viewpoint}
                    onClick={() => handleElementClick(element as Element3D)}
                    onDragStart={(e) => {
                      if (selectedElement?.id === element.id && !isDragging && !isElevationDragging) {
                        handleDragStart(e);
                      }
                    }}
                    selected={isSelected}
                    metaClass={metaClass}
                    lowPerformance={lowPerformanceMode}
                    renderOrder={renderOrder}
                    isDragging={isDragging && selectedElement?.id === element.id}
                    validationSeverity={viewValidationService.getElementSeverity(diagram, element, validationIssues)}
                  />
                );
              })}
            {selectedElement && verticalPlacement.mode === 'adjustable' && (
              <TransformControls
                object={selectedElementRef as unknown as React.RefObject<THREE.Object3D>}
                mode="translate"
                space="world"
                showX={false}
                showY
                showZ={false}
                size={0.8}
                translationSnap={
                  verticalPlacement.stepMm !== undefined && verticalPlacement.stepMm > 0
                    ? verticalPlacement.stepMm
                    : null
                }
                onMouseDown={() => setIsElevationDragging(true)}
                onObjectChange={handleElevationTransformChange}
                onMouseUp={() => {
                  setIsElevationDragging(false);
                  handleElevationTransformChange();
                }}
              />
            )}
          </Canvas>
        </WebGLErrorBoundary>
        
        {/* Status info overlay */}
        <StatusOverlay3D
          diagram={diagram}
          isDraggingPaletteItem={isDraggingPaletteItem}
          isDragging={isDragging}
          selectedElement={selectedElement}
          movementMode={movementMode}
          gridSizeX={gridSizeX}
          gridSizeY={gridSizeY}
        />
      </Box>
      
      {/* Properties drawer */}
      <Drawer
        variant="permanent"
        anchor="right"
        sx={{
          width: 300,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: 300,
            boxSizing: 'border-box',
            position: 'relative',
            height: '100%',
            border: 'none',
            boxShadow: '-2px 0 5px rgba(0, 0, 0, 0.1)'
          },
        }}
      >
        {selectedElement && metamodel ? (
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Properties</Typography>
            <DiagramElementProperties
              element={selectedElement}
              metamodel={metamodel}
              onChange={handlePropertyChange}
              is3D={true}
              diagramId={diagramId}
              propertySections={viewContext.representationDescription?.propertySections}
              onReferenceChange={(referenceName, value) => {
                const semanticElementId = selectedElement.style?.linkedModelElementId
                  || model?.elements.find(candidate => candidate.id === selectedElement.id)?.id;
                if (!model || !semanticElementId) return;
                if (modelService.setModelElementReference(model.id, semanticElementId, referenceName, value)) {
                  setModel({ ...model, elements: [...model.elements] });
                  saveChanges();
                }
              }}
            />
            
            {/* Additional 3D-specific properties */}
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>3D Properties</Typography>
              
              <Box sx={{ 
                p: 2, 
                border: '1px solid #e0e0e0', 
                borderRadius: 1, 
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                mb: 2
              }}>
                <Typography variant="subtitle2" fontWeight="bold">Position & Rotation</Typography>
                
                {/* Explanatory note about 3D vs 2D coordinates */}
                <Typography variant="caption" color="textSecondary" sx={{ mb: 1 }}>
                  X/Y placement is synchronized with an aligned 2D view. Base elevation Z is independent.
                </Typography>
                {verticalPlacement.mode === 'grounded' && selectedBaseZ !== 0 && (
                  <Alert severity="warning">
                    This representation is grounded, but the stored base elevation is {Math.round(selectedBaseZ)} mm. The value is preserved.
                  </Alert>
                )}
                
                {/* Transform Mode Controls */}
                <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                  <Button 
                    variant={movementMode === 'translate' ? 'contained' : 'outlined'} 
                    size="small"
                    onClick={() => setMovementMode('translate')}
                  >
                    Move
                  </Button>
                  <Button 
                    variant={movementMode === 'rotate' ? 'contained' : 'outlined'}
                    size="small" 
                    onClick={() => setMovementMode('rotate')}
                  >
                    Rotate
                  </Button>
                </Box>
                
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="X (3D)"
                    type="number"
                    value={Math.round(canonicalElementPosition3D(selectedElement).x)}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      handlePropertyChange('x', value);
                    }}
                    size="small"
                    InputProps={{ 
                      endAdornment: <Typography variant="caption">mm</Typography> 
                    }}
                  />
                  
                  <TextField
                    label="Y (3D)"
                    type="number"
                    value={Math.round(canonicalElementPosition3D(selectedElement).y)}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      handlePropertyChange('y', value);
                    }}
                    size="small"
                    InputProps={{ 
                      endAdornment: <Typography variant="caption">mm</Typography> 
                    }}
                  />
                </Box>

                <TextField
                  label="Base elevation Z"
                  type="number"
                  value={Math.round(selectedBaseZ)}
                  disabled={verticalPlacement.mode !== 'adjustable'}
                  error={Boolean(elevationFeedback)}
                  helperText={elevationFeedback || (
                    verticalPlacement.mode === 'adjustable'
                      ? 'Base elevation above the project datum.'
                      : 'Grounded by this representation.'
                  )}
                  onChange={(e) => handlePropertyChange('z', Number(e.target.value))}
                  onBlur={snapSelectedElevationToStep}
                  fullWidth
                  margin="dense"
                  size="small"
                  inputProps={{
                    step: verticalPlacement.stepMm ?? 100,
                  }}
                  InputProps={{
                    endAdornment: <Typography variant="caption">mm</Typography>
                  }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  disabled={verticalPlacement.mode !== 'adjustable' || selectedBaseZ === 0}
                  onClick={handleSnapToGround}
                >
                  Snap to ground
                </Button>
                
                <TextField
                  label="Rotation Z (degrees)"
                  type="number"
                  value={selectedElement.style.rotationZ ?? 0}
                  onChange={(e) => handlePropertyChange('rotationZ', Number(e.target.value))}
                  fullWidth
                  margin="dense"
                  size="small"
                  inputProps={{ step: 15 }}
                  InputProps={{ 
                    endAdornment: <Typography variant="caption">°</Typography> 
                  }}
                />
              </Box>
              
              {/* Dimensions controls */}
              <Box sx={{ 
                p: 2, 
                border: '1px solid #e0e0e0', 
                borderRadius: 1, 
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                mb: 2
              }}>
                <Typography variant="subtitle2" fontWeight="bold">Dimensions</Typography>
                
                <TextField
                  label="Length X"
                  type="number"
                  value={selectedElement.style.widthMm ?? selectedElement.widthMm ?? 500}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (value > 0) {
                      handlePropertyChange('widthMm', value);
                    }
                  }}
                  fullWidth
                  margin="dense"
                  size="small"
                  inputProps={{ min: 1, step: 10 }}
                  InputProps={{ 
                    endAdornment: <Typography variant="caption">mm</Typography> 
                  }}
                />
                
                <TextField
                  label="Width Y"
                  type="number"
                  value={selectedElement.style.heightMm ?? selectedElement.heightMm ?? 800}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (value > 0) {
                      handlePropertyChange('heightMm', value);
                    }
                  }}
                  fullWidth
                  margin="dense"
                  size="small"
                  inputProps={{ min: 1, step: 10 }}
                  InputProps={{ 
                    endAdornment: <Typography variant="caption">mm</Typography> 
                  }}
                />
                
                <TextField
                  label="Height Z"
                  type="number"
                  value={selectedElement.style.depthMm ?? selectedElement.depthMm ?? 200}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (value > 0) {
                      handlePropertyChange('depthMm', value);
                    }
                  }}
                  fullWidth
                  margin="dense"
                  size="small"
                  inputProps={{ min: 1, step: 10 }}
                  InputProps={{ 
                    endAdornment: <Typography variant="caption">mm</Typography> 
                  }}
                />
              </Box>
              
              <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                Drag elements or use the controls to position them in the 3D space.
              </Typography>
            </Box>
            
            <Button
              variant="outlined"
              color="error"
              onClick={handleDeleteElement}
              sx={{ mt: 2 }}
              startIcon={<DeleteIcon />}
              size="small"
            >
              Remove from view
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleDeleteFromModel}
              sx={{ mt: 1 }}
              startIcon={<DeleteIcon />}
              size="small"
              fullWidth
            >
              Delete from model
            </Button>
          </Box>
        ) : (
          <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Typography variant="body2" color="textSecondary" align="center">
              Select an element to edit its properties
            </Typography>
          </Box>
        )}
      </Drawer>
    </Box>
  );
};

export default Diagram3DEditor;
