import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Stage, Layer, Rect, Text, Group, Line, Circle, Image, Label, Tag, Arrow } from 'react-konva';
import { 
  Box, 
  Paper, 
  Typography, 
  Drawer, 
  Divider,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Tooltip
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import { diagramService } from '../../services/diagram';
import { metamodelService } from '../../services/metamodel';
import { modelService } from '../../services/model';
import { DiagramElement, Diagram, MetaClass, Metamodel, Model } from '../../models/types';
import DiagramPalette from '../palette/DiagramPalette';
import DiagramElementProperties from './DiagramElementProperties';
import RuleVisualizationPanel from './RuleVisualizationPanel';
import { useDiagramData, useElementSelection } from './shared/hooks';
import { 
  getAppearanceSettings, 
  getElementDisplayName,
  getFillColor,
  getStrokeColor,
  getStrokeWidth
} from './2d/utils/appearanceUtils';
import { ToolBar2D, ReferenceSelectionDialog } from './2d/components';

interface DiagramEditorProps {
  diagramId: string;
}

const DiagramEditor: React.FC<DiagramEditorProps> = ({ diagramId }) => {
  // Load diagram data using shared hook
  const { diagram, setDiagram, metamodel, model } = useDiagramData(diagramId);
  
  // Element selection using shared hook
  const { selectedElement, setSelectedElement } = useElementSelection<DiagramElement>();
  
  // Component state
  const [isDrawingEdge, setIsDrawingEdge] = useState(false);
  const [edgeStartElement, setEdgeStartElement] = useState<DiagramElement | null>(null);
  const [draggingElement, setDraggingElement] = useState<DiagramElement | null>(null);
  const [draggingMetaClass, setDraggingMetaClass] = useState<MetaClass | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [isDraggingPaletteItem, setIsDraggingPaletteItem] = useState(false);
  const [tempEdgePoints, setTempEdgePoints] = useState<Array<{x: number, y: number}> | null>(null);
  const [availableReferences, setAvailableReferences] = useState<any[]>([]);
  const [showReferenceDialog, setShowReferenceDialog] = useState(false);
  const [pendingEdgeData, setPendingEdgeData] = useState<{sourceId: string, targetId: string} | null>(null);
  const [highlightedElements, setHighlightedElements] = useState<string[]>([]);

  // Zoom and pan states
  const [scale, setScale] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [isDraggingStage, setIsDraggingStage] = useState(false);
  const [lastPointerPosition, setLastPointerPosition] = useState({ x: 0, y: 0 });

  // Refs
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cache for loaded images to prevent flickering
  const imageCache = useMemo(() => new Map<string, HTMLImageElement>(), []);

  // Stage size handler
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const containerHeight = containerRef.current.offsetHeight || window.innerHeight - 64;
        
        console.log('Updating stage size:', { containerWidth, containerHeight });
        
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

  // Save changes when diagram or elements change
  const saveChanges = () => {
    if (diagram) {
      // Get the latest version from the service
      const updatedDiagram = diagramService.getDiagramById(diagramId);
      
      if (updatedDiagram) {
        // Update local state with the refreshed diagram
        setDiagram(updatedDiagram);
        
        // If an element was selected, update it with the latest data
        if (selectedElement) {
          const updatedElement = updatedDiagram.elements.find(
            e => e.id === selectedElement.id
          );
          if (updatedElement) {
            setSelectedElement(updatedElement);
          }
        }
        
        // Force redraw the stage
        if (stageRef.current) {
          stageRef.current.batchDraw();
        }
        
        console.log('Diagram updated:', updatedDiagram);
      }
    }
  };

  const handleStageClick = (e: any) => {
    // If we're drawing an edge and already have a start element
    if (isDrawingEdge && edgeStartElement && metamodel) {
      const { x, y } = e.target.getStage().getPointerPosition();
      
      // Check if we clicked on an empty area (to create a bend point) or on another element
      const targetElement = findElementAtPosition(x, y);
      
      if (targetElement && targetElement.type === 'node') {
        // Case 1: Clicked on another node - create regular edge or self-reference
        const sourceMetaClass = metamodel.classes.find(c => c.id === edgeStartElement.modelElementId);
        const targetMetaClass = metamodel.classes.find(c => c.id === targetElement.modelElementId);
        
        if (sourceMetaClass && targetMetaClass) {
          // Find a valid reference in the metamodel
          const validReferences = sourceMetaClass.references.filter(ref => {
            // If target is the same as source, check if self-references are allowed
            if (targetElement.id === edgeStartElement.id) {
              return ref.target === targetMetaClass.id && ref.allowSelfReference === true;
            }
            // Regular reference check
            return ref.target === targetMetaClass.id;
          });
          
          if (validReferences.length > 0) {
            // Check if we need to show dialog or can create edge directly
            if (validReferences.length === 1) {
              // Only one reference, create it directly
              const reference = validReferences[0];
              
              // Create edge with bend points if it's a self-reference
              if (targetElement.id === edgeStartElement.id) {
                // For self-references, we'll add default bend points to make it visually clear
                const offsetX = 40; // Horizontal offset for the bend point
                const offsetY = 40; // Vertical offset for the bend point
                
                // Calculate bend points based on element's position and size
                const bendPoints = [
                  { x: edgeStartElement.x! + edgeStartElement.width! / 2 + offsetX, y: edgeStartElement.y! }, 
                  { x: edgeStartElement.x! + edgeStartElement.width! / 2 + offsetX, y: edgeStartElement.y! + edgeStartElement.height! + offsetY },
                  { x: edgeStartElement.x! + edgeStartElement.width! / 2, y: edgeStartElement.y! + edgeStartElement.height! + offsetY }
                ];
                
                // Create the self-reference edge
                diagramService.addElement(
                  diagramId,
                  reference.id, // Use the reference as the metaclass ID for the edge
                  'edge',
                  undefined,
                  undefined,
                  undefined,
                  undefined,
                  edgeStartElement.id,
                  targetElement.id,
                  { name: reference.name },
                  undefined, // referenceAttributes will be initialized empty
                  bendPoints // Add the bend points for self-reference
                );
              } else {
                // Regular edge
            diagramService.addElement(
              diagramId,
              reference.id, // Use the reference as the metaclass ID for the edge
              'edge',
              undefined,
              undefined,
              undefined,
              undefined,
              edgeStartElement.id,
              targetElement.id,
              { name: reference.name }
            );
              }
            } else {
              // Multiple references, show dialog
              setAvailableReferences(validReferences);
              setPendingEdgeData({sourceId: edgeStartElement.id, targetId: targetElement.id});
              setShowReferenceDialog(true);
            }
            
            // Note: saveChanges() is called within diagramService.addElement, so no need to call it here
          }
        }
      } else if (e.target === e.currentTarget) {
        // Case 2: Clicked on empty space - add a bend point
        if (!tempEdgePoints) {
          setTempEdgePoints([]);
        }
        
        // Add new point to temporary points
        const newPoints = [...(tempEdgePoints || []), { x, y }];
        setTempEdgePoints(newPoints);
        
        // Keep drawing the edge
        return; // Don't reset drawing state yet
      }
      
      // Reset edge drawing state
      setIsDrawingEdge(false);
      setEdgeStartElement(null);
      setTempEdgePoints(null);
    } else {
      // If we clicked on the stage (not an element), deselect
      if (e.target === e.currentTarget) {
        setSelectedElement(null);
      }
    }
  };

  const handleCreateEdge = (sourceId: string, targetId: string, referenceTypeId: string) => {
    if (!metamodel) return;
    
    // Find the reference in the metamodel
    let referenceMetaClass = null;
    let reference = null;
    
    for (const metaClass of metamodel.classes) {
      reference = metaClass.references.find(ref => ref.id === referenceTypeId);
      if (reference) {
        referenceMetaClass = metaClass;
        break;
      }
    }
    
    if (!referenceMetaClass || !reference) {
      console.error('Reference type not found:', referenceTypeId);
      return;
    }
    
    // Determine if this is a self-reference
    const isSelfReference = sourceId === targetId;
    
    // For self-references, we need to add bend points
    let bendPoints = undefined;
    
    if (isSelfReference) {
      // Get source element to calculate bend points
      const sourceElement = diagram?.elements.find(e => e.id === sourceId);
      if (sourceElement) {
        const offsetX = 40; // Horizontal offset for the bend point
        const offsetY = 40; // Vertical offset for the bend point
        
        // Calculate bend points based on element's position and size
        bendPoints = [
          { x: sourceElement.x! + sourceElement.width! / 2 + offsetX, y: sourceElement.y! }, 
          { x: sourceElement.x! + sourceElement.width! / 2 + offsetX, y: sourceElement.y! + sourceElement.height! + offsetY },
          { x: sourceElement.x! + sourceElement.width! / 2, y: sourceElement.y! + sourceElement.height! + offsetY }
        ];
      }
    }
    
    // Create the edge
    const newEdge = diagramService.addElement(
      diagramId,
      referenceTypeId,
      'edge',
      undefined,
      undefined,
      undefined,
      undefined,
      sourceId,
      targetId,
      { name: reference.name },
      {}, // Initialize empty reference attributes
      bendPoints // Add bend points for self-references
    );
    
    if (newEdge) {
      saveChanges();
    }
  };

  const handleElementClick = (element: DiagramElement, e?: any) => {
    if (isDrawingEdge) {
      // Prevent event bubbling to stage when drawing edges
      if (e) {
        e.cancelBubble = true;
      }
      
      if (!edgeStartElement) {
        // Start drawing an edge from this element
        setEdgeStartElement(element);
      } else if (element.id !== edgeStartElement.id) {
        // We now have source and target
        const sourceElement = edgeStartElement;
        const targetElement = element;
        
        // Find valid references between these elements
        if (metamodel) {
          const sourceMetaClass = metamodel.classes.find(c => c.id === sourceElement.modelElementId);
          const targetMetaClass = metamodel.classes.find(c => c.id === targetElement.modelElementId);
          
          if (sourceMetaClass && targetMetaClass) {
            // Find all valid references from source to target
            const validReferences = sourceMetaClass.references.filter(ref => 
              ref.target === targetMetaClass.id
            );
            
            if (validReferences.length > 0) {
              if (validReferences.length === 1) {
                // Only one option, use it directly
              const referenceToUse = validReferences[0];
              handleCreateEdge(sourceElement.id, targetElement.id, referenceToUse.id);
              } else {
                // Multiple options, show a dialog to select the reference
                setAvailableReferences(validReferences);
                setPendingEdgeData({sourceId: sourceElement.id, targetId: targetElement.id});
                setShowReferenceDialog(true);
              }
            } else {
              console.warn('No valid references found from', sourceMetaClass.name, 'to', targetMetaClass.name);
              // Fallback to using a generic reference type
              handleCreateEdge(sourceElement.id, targetElement.id, 'relationship-source');
            }
          }
        }
        
        // Reset edge drawing state
        setIsDrawingEdge(false);
        setEdgeStartElement(null);
      }
    } else {
      // Regular selection
      setSelectedElement(element);
    }
  };

  const handleDragStart = (e: any, element: DiagramElement) => {
    setDraggingElement(element);
  };

  const handleDragEnd = (e: any, element: DiagramElement) => {
    if (diagram && element.id) {
      // Get the current position from the dragged shape
      const { x, y } = e.target.position();
      
      // Allow elements to be placed anywhere on the canvas without constraints
      // This enables placing elements outside the current viewport
      diagramService.updateElement(diagramId, element.id, {
        x: x,
        y: y
      });
      
      saveChanges();
    }
    
    setDraggingElement(null);
  };

  const handlePaletteItemDragStart = (metaClass: MetaClass) => {
    setIsDraggingPaletteItem(true);
    setDraggingMetaClass(metaClass);
  };

  const handlePaletteItemDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // Prevent default to ensure drop is handled

    // Log to help with debugging
    console.log('Palette item dropped', {
      isDraggingPaletteItem,
      draggingMetaClass: draggingMetaClass?.name,
      diagramId,
      clientX: e.clientX,
      clientY: e.clientY
    });

    if (isDraggingPaletteItem && draggingMetaClass && stageRef.current && diagram) {
      try {
        // Get stage coordinates
        const stageRect = stageRef.current.container().getBoundingClientRect();
        console.log('Stage rect:', stageRect);
        
        // Calculate position relative to the stage
        let x = Math.max(0, e.clientX - stageRect.left);
        let y = Math.max(0, e.clientY - stageRect.top);
        
        // Default dimensions for new elements
        const width = 120;
        const height = 80;
        
        // Allow elements to be placed anywhere on the canvas
        // Remove boundary constraints to enable placing elements outside viewport
        
        console.log('Calculated position for new element:', { x, y });
        
        // Create a default name based on metaclass
        const defaultName = `New ${draggingMetaClass.name}`;
        
        // Add new element to diagram with explicit dimensions
        const newElement = diagramService.addElement(
          diagramId,
          draggingMetaClass.id,
          'node',
          x,
          y,
          width,
          height,
          undefined,
          undefined,
          { name: defaultName }
        );
        
        console.log('New element created:', newElement);
        
        if (newElement) {
          // Force immediate update of the diagram state
          const updatedDiagram = diagramService.getDiagramById(diagramId);
          if (updatedDiagram) {
            console.log('Updated diagram elements:', updatedDiagram.elements);
            setDiagram(updatedDiagram);
          }
        } else {
          console.error('Failed to create new element');
        }
      } catch (error) {
        console.error('Error creating element:', error);
      }
    } else {
      console.warn('Drop failed - missing required data', { 
        isDraggingPaletteItem, 
        hasDraggingMetaClass: !!draggingMetaClass,
        hasStageRef: !!stageRef.current,
        hasDiagram: !!diagram
      });
    }
    
    setIsDraggingPaletteItem(false);
    setDraggingMetaClass(null);
  };

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    setMousePos(point);
    
    // Handle stage dragging
    if (isDraggingStage) {
      handleStageDragMove(e);
    }
  };

  const handlePropertyChange = (propertyName: string, value: any) => {
    if (selectedElement && diagram) {
      // Special case for modelElementId - needs to update the element directly
      if (propertyName === '_modelElementId') {
        diagramService.updateElement(diagramId, selectedElement.id, {
          modelElementId: value
        });
        saveChanges();
        return;
      }
      
      // Special case for linkedModelElementId - update reference to a model element and force refresh
      if (propertyName === 'linkedModelElementId') {
        diagramService.updateElement(diagramId, selectedElement.id, {
          style: {
            ...selectedElement.style,
            linkedModelElementId: value
          }
        });
        
        // Force refresh the stage to update the element's display name
        const updatedDiagram = diagramService.getDiagramById(diagramId);
        if (updatedDiagram) {
          setDiagram(updatedDiagram);
          setSelectedElement(updatedDiagram.elements.find(e => e.id === selectedElement.id) || null);
        }
        saveChanges();
        return;
      }
      
      // Special case for referenceType - update the element's modelElementId
      if (propertyName === 'referenceType' && value) {
        diagramService.updateElement(diagramId, selectedElement.id, {
          modelElementId: value
        });
        
        // Force refresh to update the visuals
        const updatedDiagram = diagramService.getDiagramById(diagramId);
        if (updatedDiagram) {
          setDiagram(updatedDiagram);
          setSelectedElement(updatedDiagram.elements.find(e => e.id === selectedElement.id) || null);
          }
        saveChanges();
        return;
      }
      
      // Special case for referenceAttributes
      if (propertyName === 'referenceAttributes') {
        diagramService.updateElement(diagramId, selectedElement.id, {
          referenceAttributes: value
        });
        saveChanges();
        return;
      }
      
      // Regular style property update
      diagramService.updateElement(diagramId, selectedElement.id, {
        style: {
        ...selectedElement.style,
        [propertyName]: value
        }
      });
      
      saveChanges();
    }
  };

  const handleDeleteElement = () => {
    if (selectedElement && diagram) {
      diagramService.deleteElement(diagramId, selectedElement.id);
      setSelectedElement(null);
      saveChanges();
    }
  };

  // Helper function to find an element at a specific position
  const findElementAtPosition = (x: number, y: number): DiagramElement | null => {
    if (!diagram) return null;
    
    // Check if point is inside any node
    return diagram.elements.find(element => {
      if (element.type === 'node' && element.x !== undefined && element.y !== undefined && 
          element.width !== undefined && element.height !== undefined) {
        return x >= element.x && 
               x <= element.x + element.width && 
               y >= element.y && 
               y <= element.y + element.height;
      }
      return false;
    }) || null;
  };

  // Handle stage wheel for zooming (disabled, only use zoom buttons)
  const handleWheel = (e: any) => {
    // Prevent default to disable zooming on wheel
    e.evt.preventDefault();
  };
  
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
  
  // Handle stage drag for panning when not dragging elements
  const handleStageDragStart = (e: any) => {
    // Only enable panning if not clicking on a element or drawing an edge
    const clickedOnEmpty = e.target === e.target.getStage();
    if (clickedOnEmpty && !isDrawingEdge) {
      setIsDraggingStage(true);
      setLastPointerPosition(e.target.getStage().getPointerPosition());
    }
  };
  
  const handleStageDragMove = (e: any) => {
    if (!isDraggingStage) return;
    
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
    setIsDraggingStage(false);
  };

  // Center view on elements
  const centerViewOnElements = () => {
    if (!diagram || !containerRef.current) return;
    
    if (diagram.elements.length === 0) {
      // If no elements, just reset to center
      setScale(1);
      setStagePosition({ x: 0, y: 0 });
      return;
    }
    
    // Calculate the bounding box of all elements
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    diagram.elements.forEach(element => {
      if (element.type === 'node' && element.x !== undefined && element.y !== undefined && 
          element.width !== undefined && element.height !== undefined) {
        minX = Math.min(minX, element.x);
        minY = Math.min(minY, element.y);
        maxX = Math.max(maxX, element.x + element.width);
        maxY = Math.max(maxY, element.y + element.height);
      }
    });
    
    // If no valid elements found, return
    if (minX === Infinity) {
      setScale(1);
      setStagePosition({ x: 0, y: 0 });
      return;
    }
    
    // Add some padding
    const padding = 100;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    
    // Calculate center of elements
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // Calculate required scale to fit all elements
    const containerWidth = containerRef.current.offsetWidth;
    const containerHeight = containerRef.current.offsetHeight;
    
    const elementWidth = maxX - minX;
    const elementHeight = maxY - minY;
    
    let newScale = 1;
    if (elementWidth > 0 && elementHeight > 0) {
      const scaleX = containerWidth / elementWidth;
      const scaleY = containerHeight / elementHeight;
      newScale = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 100%
      
      // Ensure scale is reasonable
      newScale = Math.max(0.2, Math.min(newScale, 1));
    }
    
    // Calculate position to center the view
    const newPos = {
      x: (containerWidth / 2) - (centerX * newScale),
      y: (containerHeight / 2) - (centerY * newScale)
    };
    
    // Apply the changes
    setScale(newScale);
    setStagePosition(newPos);
    
    // Force a redraw of the stage
    if (stageRef.current) {
      stageRef.current.batchDraw();
    }
  };

  // Force diagram refresh when elements are added or changed
  useEffect(() => {
    if (diagram && stageRef.current) {
      console.log('Diagram updated, rendering elements:', diagram.elements);
      // Force Konva stage to redraw
      stageRef.current.batchDraw();
    }
  }, [diagram?.elements.length]);

  // Allow free movement during drag operation without boundary constraints
  const handleDragMove = (e: any) => {
    // Remove boundary checking to allow elements to be dragged anywhere
    // This enables placing elements outside the current viewport
  };

  // Render custom shapes based on appearance type
  const renderCustomShape = (
    element: DiagramElement, 
    width: number, 
    height: number, 
    isSelected: boolean,
    isHighlighted: boolean = false
  ) => {
    const appearance = getAppearanceSettings(element, model);
    
    // Get colors and stroke width using utility functions
    const fillColor = getFillColor(appearance, isHighlighted);
    const strokeColor = getStrokeColor(appearance, isSelected, isHighlighted);
    const strokeWidth = getStrokeWidth(appearance, isSelected, isHighlighted);
    
    // Get the shape type - always use the shape property if available
    const shapeType = appearance.shape || 'rectangle';
    
    switch (shapeType) {
      case 'square':
        return (
          <Rect
            width={width}
            height={width} // Make it square by using width for both dimensions
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            cornerRadius={0}
          />
        );
        
      case 'rectangle':
        return (
          <Rect
            width={width}
            height={height}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            cornerRadius={0}
          />
        );
        
      case 'circle':
        const radius = Math.min(width, height) / 2;
        return (
          <Circle
            radius={radius}
            x={width / 2}
            y={height / 2}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
          />
        );
      
      case 'triangle':
        return (
          <Line
            points={[width / 2, 0, width, height, 0, height]}
            closed
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
          />
        );
        
      case 'star':
        // Create a 5-point star
        const centerX = width / 2;
        const centerY = height / 2;
        const outerRadius = Math.min(width, height) / 2;
        const innerRadius = outerRadius * 0.4;
        const points = [];
        
        for (let i = 0; i < 10; i++) {
          const radius = i % 2 === 0 ? outerRadius : innerRadius;
          const angle = Math.PI * 2 * i / 10 - Math.PI / 2;
          points.push(centerX + radius * Math.cos(angle));
          points.push(centerY + radius * Math.sin(angle));
        }
        
        return (
          <Line
            points={points}
            closed
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
          />
        );
        
      case 'custom-image':
        // Use an image object instead of a rectangle
        return (
          <React.Fragment>
            {/* Add a background rectangle for selection visibility */}
            <Rect
              width={width}
              height={height}
              fill={fillColor} // Changed from transparent to fillColor
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
            
            {/* Render the image */}
            {appearance.imageSrc && (
              <KonvaImage
                width={width}
                height={height}
                imageSrc={appearance.imageSrc}
                imageUrl={undefined}
              />
            )}
            
            {appearance.imageUrl && !appearance.imageSrc && (
              <KonvaImage
                width={width}
                height={height}
                imageSrc={undefined}
                imageUrl={appearance.imageUrl}
              />
            )}
          </React.Fragment>
        );
        
      case 'default':
      default:
        return (
          <React.Fragment>
            <Rect
              width={width}
              height={height}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              cornerRadius={4}
            />
            
            {/* Title bar */}
            <Rect
              width={width}
              height={24}
              fill={isSelected ? '#d4e6f7' : '#e5e5e5'}
              stroke={strokeColor}
              strokeWidth={1}
              cornerRadius={[4, 4, 0, 0]}
            />
          </React.Fragment>
        );
    }
  };

  // Component to render an image using Konva
  const KonvaImage = ({ width, height, imageSrc, imageUrl }: { 
    width: number, 
    height: number, 
    imageSrc?: string, 
    imageUrl?: string 
  }) => {
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const imageKey = imageSrc || imageUrl || '';
    
    useEffect(() => {
      if (!imageKey) return;
      
      // Check if image is already in cache
      if (imageCache.has(imageKey)) {
        setImage(imageCache.get(imageKey) || null);
        return;
      }
      
      const img = new window.Image();
      img.crossOrigin = 'Anonymous';
      
      img.onload = () => {
        // Store in cache
        imageCache.set(imageKey, img);
        setImage(img);
      };
      
      img.onerror = () => {
        console.error('Error loading image');
        setImage(null);
      };
      
      if (imageSrc) {
        img.src = imageSrc;
      } else if (imageUrl) {
        img.src = imageUrl;
      }
    }, [imageKey]);
    
    if (!image) return null;
    
    return (
      <React.Fragment>
        <Rect
          width={width}
          height={height}
          fill="white"
          cornerRadius={4}
          perfectDrawEnabled={false}
          listening={false}
        />
        <Image
          image={image}
          width={width}
          height={height}
          cornerRadius={4}
          perfectDrawEnabled={false}
          listening={true}
          imageSmoothingEnabled={true}
        />
      </React.Fragment>
    );
  };

  // Render a node element
  const renderNode = (element: DiagramElement) => {
    const isSelected = selectedElement?.id === element.id;
    const isHighlighted = highlightedElements.includes(element.id);
    
    // Get position and size
    const x = element.x || 0;
    const y = element.y || 0;
    const width = element.width || 100;
    const height = element.height || 50;
    
    // Get appearance settings
    const appearance = getAppearanceSettings(element);
    
    // Create highlight effect styles
    const highlightStyles = isHighlighted ? {
      shadowColor: '#FFA500',
      shadowBlur: 10,
      shadowOffset: { x: 0, y: 0 },
      shadowOpacity: 0.8,
      stroke: '#FFA500',
      strokeWidth: 2,
    } : {};
    
    return (
      <Group 
        key={element.id}
        x={x}
        y={y}
        width={width}
        height={height}
        draggable={!isDrawingEdge}
        onDragStart={(e) => handleDragStart(e, element)}
        onDragEnd={(e) => handleDragEnd(e, element)}
        onDragMove={handleDragMove}
        onClick={(e) => handleElementClick(element, e)}
        onTap={(e) => handleElementClick(element, e)}
      >
        {renderCustomShape(element, width, height, isSelected, isHighlighted)}
        
        {/* Add selection indicator */}
        {isSelected && (
          <Rect
            width={width}
            height={height}
            stroke="#3f51b5"
            strokeWidth={2}
            dash={[5, 5]}
            fill="transparent"
          />
        )}
        
        {/* Add label */}
        <Text
          width={width}
          align="center"
          text={getElementDisplayName(element, model)}
          fontSize={appearance.fontSize || 12}
          fontFamily={appearance.fontFamily || 'Arial'}
          fill={appearance.fontColor || 'black'}
          y={height + 5}
          padding={2}
        />
      </Group>
    );
  };

  // Render an edge element
  const renderEdge = (element: DiagramElement) => {
    // Check if this edge has required data
    if (!element.sourceId || !element.targetId) {
      return null;
    }
    
    const isSelected = selectedElement?.id === element.id;
    const isHighlighted = highlightedElements.includes(element.id);
    
    // Get source and target elements
    const sourceElement = diagram?.elements.find(e => e.id === element.sourceId);
    const targetElement = diagram?.elements.find(e => e.id === element.targetId);
    
    if (!sourceElement || !targetElement) {
      return null;
    }
    
    // Get source and target positions
    const sourceX = (sourceElement.x || 0) + (sourceElement.width || 100) / 2;
    const sourceY = (sourceElement.y || 0) + (sourceElement.height || 50) / 2;
    const targetX = (targetElement.x || 0) + (targetElement.width || 100) / 2;
    const targetY = (targetElement.y || 0) + (targetElement.height || 50) / 2;
    
    // Add slight offset to source/target points to avoid overlap with element borders
    const angle = Math.atan2(targetY - sourceY, targetX - sourceX);
    const sourceRadius = Math.min(sourceElement.width || 100, sourceElement.height || 50) / 2;
    const targetRadius = Math.min(targetElement.width || 100, targetElement.height || 50) / 2;
    
    const correctedSourceX = sourceX + Math.cos(angle) * sourceRadius;
    const correctedSourceY = sourceY + Math.sin(angle) * sourceRadius;
    const correctedTargetX = targetX - Math.cos(angle) * targetRadius;
    const correctedTargetY = targetY - Math.sin(angle) * targetRadius;
    
    // Use provided edge points or calculate defaults
    const points = element.points || [
      { x: correctedSourceX, y: correctedSourceY },
      { x: correctedTargetX, y: correctedTargetY }
    ];
    
    // Flatten points for Konva Line
    const flattenedPoints = points.flatMap(point => [point.x, point.y]);
    
    // Get appearance settings
    const appearance = getAppearanceSettings(element);
    const lineWidth = isSelected ? 3 : (appearance.lineWidth || 2);
    const lineColor = isHighlighted ? '#FFA500' : (appearance.lineColor || 'black');
    
    return (
      <Group
        key={element.id}
        onClick={(e) => handleElementClick(element, e)}
        onTap={(e) => handleElementClick(element, e)}
      >
        <Line
          points={flattenedPoints}
          stroke={lineColor}
          strokeWidth={lineWidth}
          tension={0.5}
          dash={appearance.lineDash}
        />
        
        {/* Arrow head at the target end */}
        <Arrow
          points={[
            points[points.length - 2].x,
            points[points.length - 2].y,
            points[points.length - 1].x,
            points[points.length - 1].y
          ]}
          pointerLength={10}
          pointerWidth={10}
          fill={lineColor}
          stroke={lineColor}
          strokeWidth={lineWidth}
        />
        
        {/* Edge label if there's a name to display */}
        {element.style?.name && (
          <Label
            x={(points[0].x + points[points.length-1].x) / 2 - 30}
            y={(points[0].y + points[points.length-1].y) / 2 - 10}
          >
            <Tag
              fill="white"
              opacity={0.8}
              cornerRadius={3}
              shadowColor="black"
              shadowBlur={2}
              shadowOpacity={0.3}
            />
            <Text
              text={element.style.name}
              padding={2}
              fontSize={11}
              fontFamily="Arial"
            />
          </Label>
        )}
      </Group>
    );
  };

  // Render the temporary line when drawing an edge
  const renderTempEdge = () => {
    if (!isDrawingEdge || !edgeStartElement) return null;
    
    const startX = edgeStartElement.x! + (edgeStartElement.width! / 2);
    const startY = edgeStartElement.y! + (edgeStartElement.height! / 2);
    
    // Create points array starting with the source element
    const points = [startX, startY];
    
    // Add any temporary bend points
    if (tempEdgePoints && tempEdgePoints.length > 0) {
      tempEdgePoints.forEach(point => {
        points.push(point.x, point.y);
      });
    }
    
    // Add the current mouse position
    points.push(mousePos.x, mousePos.y);
    
    return (
      <Line
        points={points}
        stroke="#666"
        strokeWidth={2}
        dash={[5, 5]}
      />
    );
  };

  // Function to highlight elements (used by RuleVisualizationPanel)
  const handleHighlightElements = useCallback((elementIds: string[]) => {
    setHighlightedElements(elementIds);
  }, []);
  
  // Function to reset highlight
  const handleResetHighlight = useCallback(() => {
    setHighlightedElements([]);
  }, []);

  if (!diagram || !metamodel) {
    return <Typography>Loading diagram...</Typography>;
  }

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
      {/* Palette */}
      <DiagramPalette 
        metamodel={metamodel} 
        onDragStart={handlePaletteItemDragStart}
      />
      
      {/* Drawing Area */}
      <Box 
        ref={containerRef}
        sx={{ 
          flexGrow: 1, 
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#f5f5f5',
          minHeight: 'calc(100vh - 64px)',
          display: 'flex',
          flexDirection: 'column'
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={handlePaletteItemDrop}
      >
        {/* Toolbar with edge creation and zoom controls */}
        <ToolBar2D
          isDrawingEdge={isDrawingEdge}
          edgeStartElement={edgeStartElement}
          onToggleDrawingEdge={() => {
            setIsDrawingEdge(!isDrawingEdge);
            if (!isDrawingEdge) {
              setEdgeStartElement(null);
            }
          }}
          onRefresh={() => {
            const updatedDiagram = diagramService.getDiagramById(diagramId);
            if (updatedDiagram) {
              setDiagram(updatedDiagram);
              if (stageRef.current) {
                stageRef.current.batchDraw();
              }
            }
          }}
          scale={scale}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetZoom={handleResetZoom}
          onCenterView={centerViewOnElements}
        />

        {/* Add Rule Visualization Panel - moved to bottom right */}
        {diagram && (
          <Box sx={{ position: 'absolute', bottom: 16, right: 16, zIndex: 10 }}>
            <RuleVisualizationPanel
              diagram={diagram}
              onHighlightElements={handleHighlightElements}
              onResetHighlight={handleResetHighlight}
            />
          </Box>
        )}

        <Stage
          ref={stageRef}
          width={stageSize.width || 100}
          height={stageSize.height || 100}
          onClick={handleStageClick}
          onMouseMove={handleMouseMove}
          onMouseDown={handleStageDragStart}
          onMouseUp={handleStageDragEnd}
          onWheel={handleWheel}
          scaleX={scale}
          scaleY={scale}
          x={stagePosition.x}
          y={stagePosition.y}
        >
          <Layer>
            {diagram.elements.map(element => 
              element.type === 'node' ? renderNode(element) : renderEdge(element)
            )}
            {renderTempEdge()}
          </Layer>
        </Stage>
        
        {/* Reference Selection Dialog */}
        <ReferenceSelectionDialog
          open={showReferenceDialog}
          onClose={() => {
            setShowReferenceDialog(false);
            setPendingEdgeData(null);
          }}
          availableReferences={availableReferences}
          metamodel={metamodel}
          onSelectReference={(referenceId) => {
            if (pendingEdgeData) {
              handleCreateEdge(pendingEdgeData.sourceId, pendingEdgeData.targetId, referenceId);
              setShowReferenceDialog(false);
              setPendingEdgeData(null);
            }
          }}
        />
      </Box>
      
      {/* Properties Panel */}
      <Drawer
        variant="permanent"
        anchor="right"
        sx={{
          width: 300,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: 300,
            position: 'relative',
            height: '100%'
          },
        }}
      >
        <Box sx={{ p: 2, borderBottom: '1px solid #eee' }}>
          <Typography variant="h6">Properties</Typography>
          {model && (
            <Typography variant="caption" color="textSecondary">
              Model: {model.name}
            </Typography>
          )}
        </Box>
        
        {selectedElement ? (
          <Box sx={{ p: 2 }}>
            <DiagramElementProperties
              element={selectedElement}
              metamodel={metamodel}
              onChange={handlePropertyChange}
              diagramId={diagramId}
            />
            
            <Button
              variant="outlined"
              color="error"
              onClick={handleDeleteElement}
              sx={{ mt: 2 }}
              startIcon={<DeleteIcon />}
            >
              Delete Element
            </Button>
          </Box>
        ) : (
          <Box sx={{ p: 2 }}>
            <Typography color="textSecondary">
              Select an element to view and edit its properties
            </Typography>
          </Box>
        )}
      </Drawer>
    </Box>
  );
};

export default DiagramEditor; 