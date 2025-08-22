import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Rect, Text, Group, Line, Circle, Arrow } from 'react-konva';
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
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  FormControlLabel,
  Checkbox,
  Tooltip,
  FormHelperText,
  ListItemButton,
  CircularProgress
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import LinkIcon from '@mui/icons-material/Link';
import AddLinkIcon from '@mui/icons-material/AddLink';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Model, ModelElement, Metamodel, MetaClass, MetaReference, OCLValidationIssue, ValidationIssue } from '../../models/types';
import { modelService } from '../../services/model.service';
import { metamodelService } from '../../services/metamodel.service';
import ValidationErrorDialog from '../common/ValidationErrorDialog';
import ModelElementAppearanceSelector from './ModelElementAppearanceSelector';

interface VisualModelEditorProps {
  modelId: string;
}

const VisualModelEditor: React.FC<VisualModelEditorProps> = ({ modelId }) => {
  // Model and metamodel state
  const [model, setModel] = useState<Model | null>(null);
  const [metamodel, setMetamodel] = useState<Metamodel | null>(null);
  const hasLoggedLoadTimeRef = useRef(false);
  const loadStartRef = useRef<number>(performance.now());
  
  // Helper function to get all attributes including inherited ones
  const getAllAttributes = (metaClass: MetaClass, metamodel: Metamodel): any[] => {
    const allAttributes: any[] = [...metaClass.attributes];
    const processedClasses = new Set<string>([metaClass.id]); // Prevent infinite recursion
    
    // Function to recursively collect attributes from parent classes
    const collectInheritedAttributes = (currentClass: MetaClass) => {
      if (currentClass.superTypes && currentClass.superTypes.length > 0) {
        for (const superTypeId of currentClass.superTypes) {
          // Avoid circular inheritance
          if (processedClasses.has(superTypeId)) continue;
          processedClasses.add(superTypeId);
          
          const superClass = metamodel.classes.find(c => c.id === superTypeId);
          if (superClass) {
            // Add all attributes from the parent class
            allAttributes.push(...superClass.attributes);
            // Recursively collect from the parent's parents
            collectInheritedAttributes(superClass);
          }
        }
      }
    };
    
    collectInheritedAttributes(metaClass);
    
    // Remove duplicates based on attribute name (child class attributes override parent class attributes)
    const uniqueAttributes: any[] = [];
    const seenNames = new Set<string>();
    
    // Process in reverse order so child class attributes take precedence
    for (let i = allAttributes.length - 1; i >= 0; i--) {
      const attr = allAttributes[i];
      if (!seenNames.has(attr.name)) {
        seenNames.add(attr.name);
        uniqueAttributes.unshift(attr); // Add to beginning to maintain order
      }
    }
    
    return uniqueAttributes;
  };
  
  // Canvas state
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [selectedElement, setSelectedElement] = useState<ModelElement | null>(null);
  const [isDrawingReference, setIsDrawingReference] = useState(false);
  const [referenceStartElement, setReferenceStartElement] = useState<ModelElement | null>(null);
  const [referenceMetaReference, setReferenceMetaReference] = useState<MetaReference | null>(null);
  const [referenceTarget, setReferenceTarget] = useState('');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  // Zoom and scroll states
  const [scale, setScale] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastPointerPosition, setLastPointerPosition] = useState({ x: 0, y: 0 });
  
  // Refs
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);
  
  // Dialog states
  const [isElementDialogOpen, setIsElementDialogOpen] = useState(false);
  const [isReferenceDialogOpen, setIsReferenceDialogOpen] = useState(false);
  const [availableMetaClasses, setAvailableMetaClasses] = useState<MetaClass[]>([]);
  const [availableReferences, setAvailableReferences] = useState<MetaReference[]>([]);
  const [selectedMetaClassId, setSelectedMetaClassId] = useState('');
  const [selectedReferenceId, setSelectedReferenceId] = useState('');
  
  // Validation dialog state
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [isValidationDialogOpen, setIsValidationDialogOpen] = useState(false);
  
  // State for temporary bend points during edge creation
  const [tempEdgePoints, setTempEdgePoints] = useState<Array<{x: number, y: number}> | null>(null);

  // Add state for editor reference attributes
  const [referenceAttributes, setReferenceAttributes] = useState<Record<string, any>>({});
  
  // In the component state declarations, add a state for selected reference
  const [selectedModelReference, setSelectedModelReference] = useState<{
    sourceElement: ModelElement,
    targetElement: ModelElement,
    refName: string
  } | null>(null);
  
  // Load model and metamodel
  useEffect(() => {
    const loadData = () => {
      const modelData = modelService.getModelById(modelId);
      if (modelData) {
        // Add position to model elements if they don't have one
        const modelWithPositions = {
          ...modelData,
          elements: modelData.elements.map((element, index) => {
            if (!element.style.position) {
              return {
                ...element,
                style: {
                  ...element.style,
                  position: {
                    x: 50 + (index % 3) * 250,
                    y: 50 + Math.floor(index / 3) * 200
                  }
                }
              };
            }
            return element;
          })
        };
        
        // Don't reset model state if we're in the middle of reference creation
        if (!isReferenceDialogOpen && !isDrawingReference) {
        setModel(modelWithPositions);
        }
        
        // Load metamodel (only if not in reference dialog)
        if (!isReferenceDialogOpen) {
        const metamodelData = metamodelService.getMetamodelById(modelData.conformsTo);
        if (metamodelData) {
          setMetamodel(metamodelData);
          // Filter out abstract classes from available metaclasses for instantiation
          const concreteClasses = metamodelData.classes.filter(cls => !cls.abstract);
          setAvailableMetaClasses(concreteClasses);
          }
        }
      }
    };
    
    loadData();
    
    // Add an interval to periodically refresh the model from the service
    // This ensures UI stays in sync with the model service
    const refreshInterval = setInterval(() => {
      // Only refresh if we're not in the middle of creating a reference
      if (!isReferenceDialogOpen && !isDrawingReference) {
      loadData();
      }
    }, 5000); // Refresh every 5 seconds
    
    return () => {
      clearInterval(refreshInterval);
    };
  }, [modelId, isReferenceDialogOpen, isDrawingReference]);

  // Log load time once both model and metamodel are ready
  useEffect(() => {
    if (model && metamodel && !hasLoggedLoadTimeRef.current) {
      const durationMs = Math.max(1, Math.round(performance.now() - loadStartRef.current));
      console.log(`[Model Editor] Model loading time: ${durationMs} ms`);
      hasLoggedLoadTimeRef.current = true;
    }
  }, [model, metamodel]);
  
  // Center view on elements when the model loads or when stage size changes
  useEffect(() => {
    if (model && containerRef.current && stageSize.width > 0 && stageSize.height > 0) {
      // Small delay to ensure the stage is properly rendered
      const timerId = setTimeout(() => {
        if (isInitialLoad.current) {
          centerViewOnElements();
          isInitialLoad.current = false;
        }
      }, 100);
      
      return () => clearTimeout(timerId);
    }
  }, [model, stageSize]);
  
  // Stage size handler
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
  
  // Center view on elements
  const centerViewOnElements = () => {
    if (!model || !containerRef.current) return;
    
    if (model.elements.length === 0) {
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
    
    model.elements.forEach(element => {
      const pos = element.style.position || { x: 0, y: 0 };
      const width = 200;
      const height = 30 + (Object.keys(element.style).length * 20) + 10;
      
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + width);
      maxY = Math.max(maxY, pos.y + height);
    });
    
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
  
  // Save changes to model
  const saveChanges = () => {
    if (model) {
      // Save model with updated positions
      modelService.updateModel(model.id, model);
    }
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
    // Only enable panning if not clicking on a element or drawing a reference
    const clickedOnEmpty = e.target === e.target.getStage();
    if (clickedOnEmpty && !isDrawingReference) {
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

  // Handle stage click to deselect elements when clicking on empty space
  const handleStageClick = (e: any) => {
    // If drawing reference, handle reference creation
    if (isDrawingReference && referenceStartElement) {
      const { x, y } = e.target.getStage().getPointerPosition();
      
      // Check if we clicked on an element or on empty space
      const targetElement = findElementAtPosition(x, y);
      
      if (targetElement) {
        // If we have a meta reference selected, create the reference
        if (referenceMetaReference) {
          // Check if self-reference is allowed if target is the same as source
          if (targetElement.id === referenceStartElement.id) {
            if (!referenceMetaReference.allowSelfReference) {
              alert('Self-references are not allowed for this reference type.');
              return;
            }
            
            // Create self-reference with any accumulated bend points
            createReference(referenceStartElement.id, targetElement.id, referenceMetaReference);
          } else {
            // Check if target type is compatible with reference
            const targetMetaClass = getMetaClassForElement(targetElement);
            const targetMetaClassId = targetMetaClass?.id;
            
            if (targetMetaClassId && referenceMetaReference.target === targetMetaClassId) {
              // Create reference to other element
              createReference(referenceStartElement.id, targetElement.id, referenceMetaReference);
            } else {
              alert('Target element type is not compatible with this reference.');
            }
          }
          
          // Reset reference drawing state
          setIsDrawingReference(false);
          setReferenceStartElement(null);
          setReferenceMetaReference(null);
          setTempEdgePoints(null);
        } else {
          // We don't have a meta reference yet, show dialog to select one
          setIsReferenceDialogOpen(true);
          setReferenceTarget(targetElement.id);
        }
      } else if (e.target === e.target.getStage()) {
        // Clicked on empty space - add a bend point regardless of whether we have a meta reference
        // Convert the point to stage coordinates
        const stageCoords = {
          x: (x - stagePosition.x) / scale,
          y: (y - stagePosition.y) / scale
        };
        
        // Add the point to the temporary bend points
        if (!tempEdgePoints) {
          setTempEdgePoints([stageCoords]);
        } else {
          setTempEdgePoints([...tempEdgePoints, stageCoords]);
        }
        
        // Keep drawing the reference
        return; // Don't reset drawing state yet
      }
    } else {
      // If not drawing reference, handle element selection
    if (e.target === e.target.getStage()) {
      setSelectedElement(null);
        setSelectedModelReference(null); // Clear reference selection when clicking on empty space
      }
    }
  };

  // Helper function to get metaclass for an element
  const getMetaClassForElement = (element: ModelElement): MetaClass | undefined => {
    if (!metamodel) return undefined;
    return metamodel.classes.find(c => c.id === element.modelElementId);
  };

  // Helper function to find element at position
  const findElementAtPosition = (x: number, y: number): ModelElement | null => {
    if (!model) return null;
    
    // Check each element to see if position is inside it
    for (const element of model.elements) {
      const position = element.style.position || { x: 0, y: 0 };
      const width = 200;
      const height = 30 + (Object.keys(element.style).length * 20) + 10;
      
      if (
        x >= position.x && 
        x <= position.x + width && 
        y >= position.y && 
        y <= position.y + height
      ) {
        return element;
      }
    }
    
    return null;
  };

  // Update the createReference function to handle bend points and reference attributes
  const createReference = (sourceId: string, targetId: string, metaReference: MetaReference) => {
    if (!model) return;
    
    // Check if this is a self-reference
    const isSelfReference = sourceId === targetId;
    
    // Create or update the reference
    const updated = modelService.setModelElementReference(
      model.id,
      sourceId,
      metaReference.name,
      targetId,
      tempEdgePoints || undefined, // Store bend points for rendering
      referenceAttributes // Store reference attributes
    );
    
    if (updated) {
      // Reset states
      setIsDrawingReference(false);
      setReferenceStartElement(null);
      setReferenceMetaReference(null);
      setReferenceAttributes({});
      setTempEdgePoints(null);
      
      // Refresh the model
      const updatedModel = modelService.getModelById(model.id);
      if (updatedModel) {
        setModel(updatedModel);
      }
    }
  };

  // Handle mouse move
  const handleMouseMove = (e: any) => {
    // Get pointer position
    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    
    // Update mouse position for drawing references
    setMousePos(pointerPosition);
    
    // Handle stage dragging
    if (isDragging) {
      handleStageDragMove(e);
    }
  };
  
  // Render a model element on the canvas
  const renderElement = (element: ModelElement) => {
    const position = element.style.position || { x: 0, y: 0 };
    const isSelected = selectedElement?.id === element.id;
    
    // Get the metamodel class for this element
    const metaClass = metamodel?.classes.find(c => c.id === element.modelElementId);
    const name = metaClass?.name || 'Unknown Element';
    
    // Calculate element dimensions
    const width = 200;
    const headerHeight = 30;
    const attributeHeight = 20;
    
    // Calculate height based on number of properties
    const propertiesCount = Object.keys(element.style).filter(key => key !== 'position').length;
    const height = Math.max(headerHeight + (propertiesCount * attributeHeight) + 10, 50); // Ensure minimum height
    
    // Skip rendering if dimensions are invalid
    if (width <= 0 || height <= 0) {
      console.warn(`Element ${element.id} has invalid dimensions, skipping render`);
      return null;
    }
    
    return (
      <Group
        key={element.id}
        x={position.x}
        y={position.y}
        draggable
        onDragStart={() => {
          setSelectedElement(element);
        }}
        onDragEnd={(e) => {
          // Update element position in the model
          if (model) {
            const newPos = { x: e.target.x(), y: e.target.y() };
            
            // First update the element in our local state
            const updatedLocalModel = {
              ...model,
              elements: model.elements.map(el => 
                el.id === element.id 
                  ? {
                      ...el,
                      style: {
                        ...el.style,
                        position: newPos
                      }
                    }
                  : el
              )
            };
            
            setModel(updatedLocalModel);
            
            // If this is the selected element, also update selectedElement state
            if (selectedElement && selectedElement.id === element.id) {
              setSelectedElement({
                ...selectedElement,
                style: {
                  ...selectedElement.style,
                  position: newPos
                }
              });
            }
            
            // Update position in service
            modelService.updateElementPosition(model.id, element.id, newPos);
          }
        }}
        onClick={() => {
          if (isDrawingReference) {
            if (!referenceStartElement) {
              // Start drawing a reference from this element
              setReferenceStartElement(element);
            } else if (element.id !== referenceStartElement.id) {
              // Open reference dialog to select reference type before finishing
              setIsReferenceDialogOpen(true);
              setReferenceTarget(element.id);
            } else {
              // If clicking on same element, check if self-references are allowed
              // This will be handled when reference type is selected
              setIsReferenceDialogOpen(true);
              setReferenceTarget(element.id);
            }
          } else {
            // Clear reference selection when selecting an element
            setSelectedModelReference(null);
            
            // Always select the element when clicked (making sure editing works for newly created elements)
            if (model) {
              const currentElement = model.elements.find(e => e.id === element.id);
              if (currentElement) {
                setSelectedElement(currentElement);
              }
            }
          }
        }}
      >
        {/* Element background */}
        <Rect
          width={width}
          height={height}
          fill="#fff"
          stroke={isSelected ? "blue" : "#ccc"}
          strokeWidth={isSelected ? 2 : 1}
          cornerRadius={4}
          shadowColor="rgba(0,0,0,0.2)"
          shadowBlur={isSelected ? 10 : 5}
          shadowOffsetX={2}
          shadowOffsetY={2}
          shadowOpacity={0.5}
        />
        
        {/* Element header */}
        <Rect
          width={width}
          height={headerHeight}
          fill={isSelected ? "#e3f2fd" : "#f5f5f5"}
          stroke={isSelected ? "blue" : "#ccc"}
          strokeWidth={isSelected ? 2 : 1}
          cornerRadius={[4, 4, 0, 0]}
        />
        
        {/* Element name */}
        <Text
          x={10}
          y={10}
          text={name}
          fontSize={14}
          fontFamily="Arial"
          fontStyle="bold"
          fill="#333"
          width={width - 20}
          ellipsis
        />
        
        {/* Element properties */}
        {Object.entries(element.style)
          .filter(([key]) => key !== 'position')
          .map(([key, value], index) => (
            <Group key={`${element.id}-${key}`} y={headerHeight + (index * attributeHeight)}>
              <Rect
                width={width}
                height={attributeHeight}
                fill={index % 2 === 0 ? "#fafafa" : "#f0f0f0"}
              />
              <Text
                x={10}
                y={5}
                text={`${key}:`}
                fontSize={12}
                fontFamily="Arial"
                fill="#555"
                width={(width / 2) - 15}
                ellipsis
              />
              <Text
                x={(width / 2) + 5}
                y={5}
                text={value?.toString() || ''}
                fontSize={12}
                fontFamily="Arial"
                fill="#333"
                width={(width / 2) - 15}
                ellipsis
                wrap="none"
                overflow="hidden"
              />
              {/* Simple tooltip that appears on hover */}
              <Rect
                x={(width / 2) + 5}
                y={5}
                width={(width / 2) - 15}
                height={15}
                fill="transparent"
                onMouseEnter={(e) => {
                  const container = e.target.getStage()?.container();
                  if (container && value) {
                    container.title = value.toString();
                  }
                }}
                onMouseLeave={(e) => {
                  const container = e.target.getStage()?.container();
                  if (container) {
                    container.title = '';
                  }
                }}
              />
            </Group>
          ))
        }
      </Group>
    );
  };
  
  // Render references between elements with improved routing
  const renderReference = () => {
    if (!model || !metamodel) return null;
    
    const references = [];
    
    // For each model element
    for (const element of model.elements) {
      const sourceMetaClass = metamodel.classes.find(mc => mc.id === element.modelElementId);
      if (!sourceMetaClass) continue;
      
      // For each reference in the element
      for (const [refName, refValue] of Object.entries(element.references)) {
        // Skip null/undefined references
        if (refValue === null || refValue === undefined) continue;
        
        // Find the metamodel reference definition
        const metaReference = sourceMetaClass.references.find(r => r.name === refName);
        if (!metaReference) continue;
        
        // Handle both single references and reference arrays
        const targetIds = Array.isArray(refValue) ? refValue : [refValue];
        
        // Create a reference visualization for each target
        for (const targetId of targetIds) {
          const targetElement = model.elements.find(e => e.id === targetId);
          if (!targetElement) continue;
          
          const sourcePosition = element.style.position || { x: 0, y: 0 };
          const targetPosition = targetElement.style.position || { x: 0, y: 0 };
          
          // Calculate element dimensions
          const sourceWidth = 200;
          const sourceHeight = 30 + (Object.keys(element.style).length * 20) + 10;
          const targetWidth = 200;
          const targetHeight = 30 + (Object.keys(targetElement.style).length * 20) + 10;
          
          // Calculate source and target centers
          const sourceX = sourcePosition.x + sourceWidth / 2;
          const sourceY = sourcePosition.y + sourceHeight / 2;
          const targetX = targetPosition.x + targetWidth / 2;
          const targetY = targetPosition.y + targetHeight / 2;
          
          // Check if this is a self-reference
          const isSelfReference = element.id === targetElement.id;
          
          // Get any stored bend points for this reference
          const bendPoints = (element.references as any)[`${refName}_bendPoints`];
          
          // Check if there are reference attributes to display
          const refAttributes = (element.references as any)[`${refName}_attributes`] || {};
          const hasAttributes = Object.keys(refAttributes).length > 0;
          
          // Check if this reference is currently selected
          const isSelected = selectedModelReference && 
            selectedModelReference.sourceElement.id === element.id && 
            selectedModelReference.targetElement.id === targetElement.id && 
            selectedModelReference.refName === refName;
          
          // Determine the points for drawing the reference line
          let points: number[] = [];
          
          if (bendPoints && Array.isArray(bendPoints)) {
            // Use stored bend points
            points = [sourceX, sourceY];
            
            // Parse bendPoints safely
            try {
              // First convert to unknown, then process each point
              const unknownPoints = bendPoints as unknown;
              if (Array.isArray(unknownPoints)) {
                unknownPoints.forEach(point => {
                  // Check if point is an object with x and y properties
                  if (typeof point === 'object' && point !== null && 
                      'x' in point && 'y' in point && 
                      typeof point.x === 'number' && typeof point.y === 'number') {
                    points.push(point.x, point.y);
                  }
                  // If it's a string, try to parse it
                  else if (typeof point === 'string') {
                    try {
                      const parsed = JSON.parse(point);
                      if (parsed && typeof parsed === 'object' && 
                          'x' in parsed && 'y' in parsed) {
                        points.push(Number(parsed.x), Number(parsed.y));
                      }
                    } catch (e) {
                      console.error('Failed to parse point string:', point);
                    }
                  }
                });
              }
            } catch (error) {
              console.error('Error processing bend points:', error);
            }
            
            points.push(targetX, targetY);
          } else if (isSelfReference) {
            // Default points for self-reference with better spacing
            const offsetX = 60;
            const offsetY = 60;
            
            // For self-references, use a standard loop shape that's more visible
            points = [
              sourceX, sourceY,
              sourceX + offsetX, sourceY,
              sourceX + offsetX, sourceY + offsetY,
              sourceX, sourceY + offsetY,
              targetX, targetY
            ];
          } else {
            // Simple line for regular references
            points = [sourceX, sourceY, targetX, targetY];
          }
          
          // Calculate midpoint for the reference name
          const lastSegmentStartX = points.length > 2 ? points[points.length - 4] : points[0];
          const lastSegmentStartY = points.length > 2 ? points[points.length - 3] : points[1];
          const lastSegmentEndX = points[points.length - 2];
          const lastSegmentEndY = points[points.length - 1];
          
          const midX = (lastSegmentStartX + lastSegmentEndX) / 2;
          const midY = (lastSegmentStartY + lastSegmentEndY) / 2;
          
          // Create the reference visualization with improved styling similar to metamodel editor
          references.push(
            <Group
              key={`${element.id}-${refName}-${targetId}`}
              onClick={() => {
                setSelectedModelReference({
                  sourceElement: element,
                  targetElement: targetElement,
                  refName: refName
                });
                setSelectedElement(null);
              }}
            >
              <Arrow
                points={points}
                stroke={isSelected ? "blue" : "#1976d2"}
                strokeWidth={isSelected ? 2 : 1}
                fill={isSelected ? "blue" : "#1976d2"}
                pointerLength={10}
                pointerWidth={10}
              />
              
              {/* Reference name with improved background */}
              <Group>
                <Rect
                  x={midX - 30}
                  y={midY - 12}
                  width={60}
                  height={20}
                  fill="#ffffff"
                  stroke={isSelected ? "blue" : "#e0e0e0"}
                  strokeWidth={1}
                  cornerRadius={3}
                  opacity={0.9}
                />
                <Text
                  text={refName + (hasAttributes ? " *" : "")}
                  x={midX - 25}
                  y={midY - 8}
                  fontSize={12}
                  fill={isSelected ? "blue" : "#1976d2"}
                  padding={1}
                />
              </Group>
              
              {/* Containment indicator if applicable */}
              {metaReference.containment && (
                <Circle
                  x={midX - 40}
                  y={midY - 5}
                  radius={5}
                  fill={isSelected ? "blue" : "#1976d2"}
                />
              )}
            </Group>
          );
        }
      }
    }
    
    return <>{references}</>;
  };
  
  // Filter references that match the target type when the reference dialog is opened
  useEffect(() => {
    if (isReferenceDialogOpen && referenceStartElement && referenceTarget && model && metamodel) {
      // Get metaclass of the source element
      const sourceMetaClass = metamodel.classes.find(c => c.id === referenceStartElement.modelElementId);
      
      // Get target element and its metaclass
      const targetElement = model.elements.find(e => e.id === referenceTarget);
      const targetMetaClass = targetElement ? metamodel.classes.find(c => c.id === targetElement.modelElementId) : null;
      
      if (sourceMetaClass && targetMetaClass) {
        console.log(`Source: ${sourceMetaClass.name}, Target: ${targetMetaClass.name}`);
        
        // Find all references in the source metaclass that can target the target metaclass
        const validReferences = sourceMetaClass.references.filter(ref => {
          const directMatch = ref.target === targetMetaClass.id;
          const superTypeMatch = targetMetaClass.superTypes && 
                               targetMetaClass.superTypes.includes(ref.target);
          return directMatch || superTypeMatch;
        });
        
        setAvailableReferences(validReferences);
        
        // Auto-select the first one if there's only one
        if (validReferences.length === 1) {
          setSelectedReferenceId(validReferences[0].id);
        } else {
          setSelectedReferenceId('');
        }
      }
    }
  }, [isReferenceDialogOpen, referenceStartElement, referenceTarget, model, metamodel]);
  
  // Render the Add Element dialog
  const renderAddElementDialog = () => (
    <Dialog open={isElementDialogOpen} onClose={() => setIsElementDialogOpen(false)}>
      <DialogTitle>Add Model Element</DialogTitle>
      <DialogContent>
        <FormControl fullWidth margin="normal">
          <InputLabel>Element Type</InputLabel>
          <Select
            value={selectedMetaClassId}
            onChange={(e: SelectChangeEvent) => setSelectedMetaClassId(e.target.value)}
            label="Element Type"
          >
            {availableMetaClasses.map(metaClass => (
              <MenuItem key={metaClass.id} value={metaClass.id}>
                {metaClass.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setIsElementDialogOpen(false)}>Cancel</Button>
        <Button 
          onClick={() => {
            if (selectedMetaClassId && model) {
              // Calculate position in the center of the visible area
              // Get center of the current viewport in stage coordinates
              const viewportCenterX = stageSize.width / 2;
              const viewportCenterY = stageSize.height / 2;
              
              // Transform to world coordinates
              const centerX = (viewportCenterX - stagePosition.x) / scale;
              const centerY = (viewportCenterY - stagePosition.y) / scale;
              
              // Add slight randomness to avoid exact overlaps but stay close to center
              const randomOffsetX = (Math.random() - 0.5) * 100; // Less randomness
              const randomOffsetY = (Math.random() - 0.5) * 100; // Less randomness
              
              // Final position
              const position = {
                x: centerX + randomOffsetX,
                y: centerY + randomOffsetY
              };
              
              // Check for overlaps with existing elements and adjust if necessary
              const elements = model.elements;
              let hasOverlap = true;
              let attempts = 0;
              let finalPosition = position;
              
              // Try to find a position without overlaps
              while (hasOverlap && attempts < 10) {
                hasOverlap = elements.some(element => {
                  const elementPos = element.style.position || { x: 0, y: 0 };
                  const width = 200;
                  const height = 100; // Approximation
                  
                  // Check if rectangles overlap with some margin
                  return (
                    Math.abs(finalPosition.x - elementPos.x) < width * 0.8 &&
                    Math.abs(finalPosition.y - elementPos.y) < height * 0.8
                  );
                });
                
                if (hasOverlap) {
                  // Move it a bit to avoid overlap
                  finalPosition = {
                    x: position.x + Math.random() * 200 - 100,
                    y: position.y + Math.random() * 200 - 100
                  };
                }
                
                attempts++;
              }
              
              // Add element with the calculated position
              const newElement = modelService.addModelElement(
                model.id,
                selectedMetaClassId,
                {
                  position: finalPosition
                }
              );
              
              if (newElement) {
                // Get a fresh copy of the model after adding the element
                const updatedModel = modelService.getModelById(model.id);
                if (updatedModel) {
                  // Update the model state with the fresh model
                  setModel(updatedModel);
                  
                  // Find the newly added element in the fresh model
                  const addedElement = updatedModel.elements.find(e => e.id === newElement.id);
                  if (addedElement) {
                    // Auto-select the newly created element
                    setSelectedElement(addedElement);
                  }
                } else {
                  // Fallback in case updated model can't be retrieved
                  setModel({
                    ...model,
                    elements: [...model.elements, newElement]
                  });
                  setSelectedElement(newElement);
                }
                
                // Reset selection and close dialog
                setSelectedMetaClassId('');
                setIsElementDialogOpen(false);
              }
            }
          }}
          color="primary"
          disabled={!selectedMetaClassId}
        >
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
  
  // Render the Add Reference dialog
  const renderAddReferenceDialog = () => (
    <Dialog open={isReferenceDialogOpen} onClose={() => setIsReferenceDialogOpen(false)}>
      <DialogTitle>Add Reference</DialogTitle>
      <DialogContent>
        {referenceStartElement && referenceTarget && (() => {
          const sourceElement = model?.elements.find(e => e.id === referenceStartElement.id);
          const targetElement = model?.elements.find(e => e.id === referenceTarget);
          
          const sourceMetaClass = sourceElement && metamodel ? 
            metamodel.classes.find(c => c.id === sourceElement.modelElementId) : null;
            
          const targetMetaClass = targetElement && metamodel ? 
            metamodel.classes.find(c => c.id === targetElement.modelElementId) : null;
          
          return (
            <Typography variant="body2" sx={{ mb: 2 }}>
              Creating reference from {sourceMetaClass?.name || 'element'} to {targetMetaClass?.name || 'element'}
            </Typography>
          );
        })()}
        
        <FormControl fullWidth margin="normal">
          <InputLabel>Reference Type</InputLabel>
          <Select
            value={selectedReferenceId}
            onChange={(e: SelectChangeEvent) => {
              setSelectedReferenceId(e.target.value);
              
              // Check if the selected reference has attributes and set reference meta reference
              if (metamodel && referenceStartElement) {
                const sourceMetaClass = metamodel.classes.find(c => c.id === referenceStartElement.modelElementId);
                if (sourceMetaClass) {
                  const selectedRef = sourceMetaClass.references.find(r => r.id === e.target.value);
                  // Set the selected reference as the meta reference to use
                  if (selectedRef) {
                    setReferenceMetaReference(selectedRef);
                  }
                  // Reset reference attributes when reference type changes
                  setReferenceAttributes({});
                }
              }
            }}
            label="Reference Type"
          >
            {availableReferences.length > 0 ? (
              availableReferences.map(ref => (
                <MenuItem key={ref.id} value={ref.id}>
                  {ref.name}
                </MenuItem>
              ))
            ) : (
              <MenuItem disabled value="">
                No compatible references available
              </MenuItem>
            )}
          </Select>
        </FormControl>
        
        {/* Reference Attributes Section */}
        {selectedReferenceId && (() => {
          // Get the selected reference to see if it has attributes
          const sourceMetaClass = referenceStartElement && metamodel ? 
            metamodel.classes.find(c => c.id === referenceStartElement.modelElementId) : null;
            
          const selectedRef = sourceMetaClass ?
            sourceMetaClass.references.find(r => r.id === selectedReferenceId) : null;
            
          if (selectedRef && selectedRef.attributes && selectedRef.attributes.length > 0) {
            return (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Reference Attributes
                </Typography>
                <Divider sx={{ mb: 2 }} />
                
                {selectedRef.attributes.map(attr => (
                  <TextField
                    key={attr.id}
                    fullWidth
                    label={attr.name}
                    value={referenceAttributes[attr.name] || ''}
                    onChange={(e) => {
                      setReferenceAttributes(prev => ({
                        ...prev,
                        [attr.name]: e.target.value
                      }));
                    }}
                    margin="normal"
                    size="small"
                  />
                ))}
              </Box>
            );
          }
          return null;
        })()}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => {
          setIsReferenceDialogOpen(false);
          setIsDrawingReference(false);
          setReferenceStartElement(null);
          setTempEdgePoints(null);
        }}>Cancel</Button>
        <Button 
          onClick={() => {
            if (model && referenceStartElement && referenceTarget && selectedReferenceId) {
              console.log('Creating reference with:', {
                modelId: model.id,
                sourceElementId: referenceStartElement.id,
                referenceTarget,
                selectedReferenceId,
                referenceAttributes // Include attributes in logging
              });

              // Get a fresh copy of the model directly from service to ensure sync
              const freshModel = modelService.getModelById(model.id);
              if (!freshModel) {
                console.error("Could not retrieve fresh model data");
                return;
              }
              
              // Explicitly check that both source and target elements exist in the service's version of the model
              const sourceElementExists = freshModel.elements.some(e => e.id === referenceStartElement.id);
              const targetElementExists = freshModel.elements.some(e => e.id === referenceTarget);
              
              if (!sourceElementExists) {
                console.error("Source element does not exist in the model:", referenceStartElement.id);
                alert("Source element no longer exists in the model. Please refresh and try again.");
                setIsReferenceDialogOpen(false);
                setReferenceStartElement(null);
                setReferenceTarget('');
                setIsDrawingReference(false);
                setSelectedReferenceId('');
                // Force refresh the model
                const updatedModel = modelService.getModelById(model.id);
                if (updatedModel) setModel(updatedModel);
                return;
              }
              
              if (!targetElementExists) {
                console.error("Target element does not exist in the model:", referenceTarget);
                alert("Target element does not exist in the model. Please try again with a different element.");
                setReferenceTarget('');
                return;
              }
              
              // Get source and target elements from the fresh model
              const freshSourceElement = freshModel.elements.find(e => e.id === referenceStartElement.id)!;
              const freshTargetElement = freshModel.elements.find(e => e.id === referenceTarget)!;
              
              console.log('Verified elements in service model:', {
                sourceElement: freshSourceElement.id,
                targetElement: freshTargetElement.id
              });

              // Get reference definition from metamodel
              const metamodel = metamodelService.getMetamodelById(freshModel.conformsTo);
              if (!metamodel) {
                console.error("Metamodel not found for model:", freshModel.conformsTo);
                return;
              }

              const sourceMetaClass = metamodel.classes.find(c => c.id === freshSourceElement.modelElementId);
              if (!sourceMetaClass) {
                console.error("Source element's metaclass not found:", freshSourceElement.modelElementId);
                return;
              }
              
              const referenceDef = sourceMetaClass.references.find(r => r.id === selectedReferenceId);
              if (!referenceDef) {
                console.error("Reference definition not found:", selectedReferenceId);
                return;
              }

              console.log('Found reference definition:', referenceDef);
              
              // Create a deep clone of the fresh model to avoid unintended modifications
              const updatedModel = JSON.parse(JSON.stringify(freshModel)) as Model;
              
              // Find the source element in the updated model
              const sourceElementIndex = updatedModel.elements.findIndex(e => e.id === freshSourceElement.id);
              if (sourceElementIndex === -1) {
                console.error("Source element not found in model:", freshSourceElement.id);
                return;
              }
              
              const updatedSourceElement = updatedModel.elements[sourceElementIndex];
              console.log('Found source element:', updatedSourceElement);
              
              // Update the reference in the local model state
              if (referenceDef.cardinality.upperBound === '*' || referenceDef.cardinality.upperBound > 1) {
                // For multi-valued references, add to array
                const existingRefs = updatedSourceElement.references[referenceDef.name] || [];
                if (Array.isArray(existingRefs) && !existingRefs.includes(referenceTarget)) {
                  updatedSourceElement.references[referenceDef.name] = [...existingRefs, referenceTarget];
                }
              } else {
                // For single-valued references, replace
                updatedSourceElement.references[referenceDef.name] = referenceTarget;
              }

              console.log('Updated source element references:', updatedSourceElement.references);
              
              // Update the model in the service first with bend points and attributes
              const success = modelService.setModelElementReference(
                freshModel.id, 
                freshSourceElement.id,
                referenceDef.name,
                referenceDef.cardinality.upperBound === '*' || referenceDef.cardinality.upperBound > 1 
                  ? (updatedSourceElement.references[referenceDef.name] as string[])
                  : referenceTarget,
                tempEdgePoints || undefined, // Pass bend points
                referenceAttributes  // Pass reference attributes
              );
              
              if (success) {
                // If service update was successful, update the UI state
                setModel(updatedModel);
                console.log('Successfully created reference between', freshSourceElement.id, 'and', freshTargetElement.id);
              } else {
                console.error("Failed to create reference. Current model state:", {
                  modelId: freshModel.id,
                  sourceElement: updatedSourceElement,
                  targetElement: freshTargetElement,
                  referenceDef: referenceDef
                });
                alert("Failed to create reference. Please check the console for details.");
              }
              
              // Reset reference drawing state
              setIsReferenceDialogOpen(false);
              setReferenceStartElement(null);
              setReferenceTarget('');
              setIsDrawingReference(false);
              setSelectedReferenceId('');
              setReferenceAttributes({}); // Clear reference attributes
            }
          }}
          color="primary"
          disabled={!selectedReferenceId}
        >
          Add Reference
        </Button>
      </DialogActions>
    </Dialog>
  );
  
  // Update the renderTempReference function to support bend points
  const renderTempReference = () => {
    if (!isDrawingReference || !referenceStartElement) return null;
    
    const sourcePosition = referenceStartElement.style.position || { x: 0, y: 0 };
    const sourceWidth = 200;
    const headerHeight = 30;
    const propertiesCount = Object.keys(referenceStartElement.style).filter(key => key !== 'position').length;
    const sourceHeight = Math.max(headerHeight + (propertiesCount * 20) + 10, 50);
    
    // Calculate source center
    const sourceX = sourcePosition.x + sourceWidth / 2;
    const sourceY = sourcePosition.y + sourceHeight / 2;
    
    // Create points array starting with the source element
    let points = [sourceX, sourceY];
    
    // Add any temporary bend points
    if (tempEdgePoints && tempEdgePoints.length > 0) {
      tempEdgePoints.forEach(point => {
        points.push(point.x, point.y);
      });
    }
    
    // Calculate mouse position relative to stage
    // Default to a short distance from the start point if mouse position is invalid
    const adjustedMousePos = {
      x: mousePos.x ? (mousePos.x - stagePosition.x) / scale : sourceX + 100,
      y: mousePos.y ? (mousePos.y - stagePosition.y) / scale : sourceY
    };
    
    // Add the current mouse position to the points array
    points.push(adjustedMousePos.x, adjustedMousePos.y);
    
    // Only render if start and end points are valid
    if (isNaN(sourceX) || isNaN(sourceY) || isNaN(adjustedMousePos.x) || isNaN(adjustedMousePos.y)) {
      return null;
    }
    
    return (
      <Line
        points={points}
        stroke="gray"
        strokeWidth={1}
        dash={[5, 5]}
      />
    );
  };
  
  // Clean up Konva stage on unmount
  useEffect(() => {
    return () => {
      if (stageRef.current) {
        stageRef.current.destroyChildren();
        stageRef.current.destroy();
      }
    };
  }, []);

  // Update Stage component with useEffect to update selected references
  useEffect(() => {
    // When the model updates, check if our selected reference still exists
    if (model && selectedModelReference) {
      const { sourceElement, targetElement, refName } = selectedModelReference;
      
      // Find the source element in the updated model
      const updatedSourceElement = model.elements.find(e => e.id === sourceElement.id);
      
      // If source element no longer exists or the reference has been removed, clear selection
      if (!updatedSourceElement || 
          !(refName in updatedSourceElement.references) ||
          !updatedSourceElement.references[refName]) {
        setSelectedModelReference(null);
      }
    }
  }, [model, selectedModelReference]);

  if (!model || !metamodel) {
    return <Typography>Loading model...</Typography>;
  }
  
  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
      {/* Canvas */}
      <Box 
        ref={containerRef}
        sx={{ 
          flexGrow: 1, 
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#f5f5f5'
        }}
      >
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          onMouseMove={handleMouseMove}
          onMouseDown={handleStageDragStart}
          onMouseUp={handleStageDragEnd}
          onClick={handleStageClick}
          onWheel={handleWheel}
          scaleX={scale}
          scaleY={scale}
          x={stagePosition.x}
          y={stagePosition.y}
        >
          <Layer>
            {renderReference()}
            {model.elements.map(element => renderElement(element))}
            
            {/* Draw temporary reference line */}
            {renderTempReference()}
          </Layer>
        </Stage>
        
        {/* Add a visual indicator when in reference drawing mode */}
        {isDrawingReference && (
          <Box
            sx={{
              position: 'absolute',
              top: 80,
              left: '50%',
              transform: 'translateX(-50%)',
              p: 2,
              bgcolor: 'info.main',
              color: 'info.contrastText',
              borderRadius: 1,
              boxShadow: 3,
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}
          >
            <LinkIcon />
            <Typography variant="body2">
              {!referenceStartElement 
                ? 'Select source element to start creating reference' 
                : 'Now select target element to complete the reference'}
            </Typography>
          </Box>
        )}
        
        {/* Toolbar */}
        <Paper
          sx={{
            position: 'absolute',
            top: 16,
            left: 16,
            p: 1,
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            zIndex: 10
          }}
        >
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setIsElementDialogOpen(true)}
          >
            Add Element
          </Button>
          
          <Button
            variant={isDrawingReference ? "contained" : "outlined"}
            color={isDrawingReference ? "secondary" : "primary"}
            size="small"
            startIcon={<AddLinkIcon />}
            onClick={() => {
              setIsDrawingReference(!isDrawingReference);
              if (!isDrawingReference) {
                // Starting to draw a reference - reset all related state
                setReferenceStartElement(null);
                setReferenceTarget('');
                setTempEdgePoints(null);
                setReferenceMetaReference(null);
              } else {
                // Clear bend points when cancelling
                setReferenceStartElement(null);
                setReferenceTarget('');
                setTempEdgePoints(null);
                setReferenceMetaReference(null);
              }
            }}
          >
            {isDrawingReference ? "Cancel Reference" : "Add Reference"}
          </Button>
          
          <Button
            variant="contained"
            size="small"
            startIcon={<RefreshIcon />}
            color="info"
            onClick={() => {
              if (model) {
                const validationResult = modelService.validateModel(model.id);
                if (validationResult.issues.length > 0) {
                  // Format validation issues
                  setValidationIssues(validationResult.issues.map((issue: ValidationIssue) => ({
                    ...issue,
                    elementId: issue.elementId || '',
                    constraintId: issue.constraintId || ''
                  })));
                  
                  // Show validation dialog with issues
                  setIsValidationDialogOpen(true);
                } else {
                  // Show success message
                  setValidationIssues([{
                    severity: 'info',
                    message: 'Model conforms to all constraints.',
                    elementId: '',
                    constraintId: ''
                  }]);
                  setIsValidationDialogOpen(true);
                }
              }
            }}
          >
            Conformance Checking
          </Button>
        </Paper>
        
        {/* Zoom Controls */}
        <Paper
          sx={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            p: 1,
            display: 'flex',
            gap: 1,
            alignItems: 'center'
          }}
        >
          <Tooltip title="Zoom Out">
            <IconButton size="small" onClick={handleZoomOut}>
              <ZoomOutIcon />
            </IconButton>
          </Tooltip>
          
          <Typography variant="body2" sx={{ minWidth: '60px', textAlign: 'center' }}>
            {Math.round(scale * 100)}%
          </Typography>
          
          <Tooltip title="Zoom In">
            <IconButton size="small" onClick={handleZoomIn}>
              <ZoomInIcon />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Reset View">
            <IconButton size="small" onClick={handleResetZoom}>
              <RestartAltIcon />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Center Elements">
            <IconButton size="small" onClick={centerViewOnElements}>
              <CenterFocusStrongIcon />
            </IconButton>
          </Tooltip>
        </Paper>
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
        </Box>
        
        {selectedElement ? (
          <Box sx={{ p: 2, overflowY: 'auto' }}>
            <Typography variant="h6" gutterBottom>
              Element Properties
            </Typography>

            {/* Get metaclass for the element */}
            {(() => {
              const metaClass = metamodel.classes.find(c => c.id === selectedElement.modelElementId);
              return (
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Type: {metaClass?.name || 'Unknown'}
                </Typography>
              );
            })()}
            
            <Divider sx={{ my: 2 }} />
            
                        {/* Edit properties */}
            {(() => {
              const metaClass = metamodel.classes.find(c => c.id === selectedElement.modelElementId);
              if (!metaClass) return null;
              
              const allAttributes = getAllAttributes(metaClass, metamodel);
              
              return allAttributes.map(attr => {
                const rawValue = selectedElement.style[attr.name] !== undefined 
                  ? selectedElement.style[attr.name] 
                  : (attr.defaultValue !== undefined ? attr.defaultValue : (attr.type === 'boolean' ? false : ''));
                
                // Convert value to string for TextField (especially important for boolean selects)
                const displayValue = attr.type === 'boolean' 
                  ? String(rawValue) 
                  : String(rawValue);
                
                return (
                  <Box key={attr.id} sx={{ mb: 2 }}>
                    {attr.type === 'boolean' ? (
                      <FormControl fullWidth size="small" variant="outlined">
                        <InputLabel>{attr.name}</InputLabel>
                        <Select
                          value={displayValue}
                          label={attr.name}
                          onChange={(e) => {
                            const typedValue = e.target.value === 'true';
                            
                            // Update element
                            if (model) {
                              const updatedProperties = {
                                [attr.name]: typedValue
                              };
                              
                              // Instead of completely replacing the element state,
                              // only update the specific attribute value
                              setSelectedElement(prevElement => {
                                if (!prevElement) return null;
                                return {
                                  ...prevElement,
                                  style: {
                                    ...prevElement.style,
                                    [attr.name]: typedValue
                                  }
                                };
                              });
                              
                              // Update just this property in the model elements array
                              setModel(prevModel => {
                                if (!prevModel) return null;
                                return {
                                  ...prevModel,
                                  elements: prevModel.elements.map(el => 
                                    el.id === selectedElement.id 
                                    ? {
                                        ...el,
                                        style: {
                                          ...el.style,
                                          [attr.name]: typedValue
                                        }
                                      }
                                    : el
                                  )
                                };
                              });
                              
                              // Update the model element property in the service
                              const success = modelService.updateModelElementProperties(
                                model.id,
                                selectedElement.id,
                                updatedProperties
                              );
                              
                              if (!success) {
                                console.warn('Failed to update model element property');
                              }
                            }
                          }}
                          required={attr.required}
                        >
                          <MenuItem value="true">True</MenuItem>
                          <MenuItem value="false">False</MenuItem>
                        </Select>
                      </FormControl>
                    ) : (
                      <TextField
                        fullWidth
                        label={attr.name}
                        value={displayValue}
                        onChange={(e) => {
                          // Convert value based on type
                          let typedValue: any = e.target.value;
                          
                          if (attr.type === 'number') {
                            typedValue = Number(e.target.value);
                          }
                          
                          // Update element
                          if (model) {
                            const updatedProperties = {
                              [attr.name]: typedValue
                            };
                            
                            // Instead of completely replacing the element state,
                            // only update the specific attribute value
                            setSelectedElement(prevElement => {
                              if (!prevElement) return null;
                              return {
                                ...prevElement,
                                style: {
                                  ...prevElement.style,
                                  [attr.name]: typedValue
                                }
                              };
                            });
                            
                            // Update just this property in the model elements array
                            setModel(prevModel => {
                              if (!prevModel) return null;
                              return {
                                ...prevModel,
                                elements: prevModel.elements.map(el => 
                                  el.id === selectedElement.id 
                                  ? {
                                      ...el,
                                      style: {
                                        ...el.style,
                                        [attr.name]: typedValue
                                      }
                                    }
                                  : el
                                )
                              };
                            });
                            
                            // Update the model element property in the service
                            const success = modelService.updateModelElementProperties(
                              model.id,
                              selectedElement.id,
                              updatedProperties
                            );
                            
                            if (!success) {
                              console.warn('Failed to update model element property');
                            }
                          }
                        }}
                        type={attr.type === 'number' ? 'number' : 'text'}
                        required={attr.required}
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </Box>
                );
              });
            })()}
            
            {/* Add Appearance Selector */}
            <Divider sx={{ my: 2 }} />
            <ModelElementAppearanceSelector 
              element={selectedElement} 
              onUpdate={(propertyName, value) => {
                if (model) {
                  const updatedProperties = {
                    [propertyName]: value
                  };
                  
                  // Update UI state
                  setSelectedElement(prevElement => {
                    if (!prevElement) return null;
                    return {
                      ...prevElement,
                      style: {
                        ...prevElement.style,
                        [propertyName]: value
                      }
                    };
                  });
                  
                  // Update model in state
                  setModel(prevModel => {
                    if (!prevModel) return null;
                    return {
                      ...prevModel,
                      elements: prevModel.elements.map(el => 
                        el.id === selectedElement.id 
                        ? {
                            ...el,
                            style: {
                              ...el.style,
                              [propertyName]: value
                            }
                          }
                        : el
                      )
                    };
                  });
                  
                  // Update in service
                  modelService.updateModelElementProperties(
                    model.id,
                    selectedElement.id,
                    updatedProperties
                  );
                }
              }}
            />
            
            <Divider sx={{ my: 2 }} />
            
            {/* References view */}
            <Typography variant="subtitle1" gutterBottom>
              References
            </Typography>
            
            {Object.entries(selectedElement.references).map(([refName, refValue]) => {
              // Find the reference in the metamodel
              const metaClass = metamodel.classes.find(c => c.id === selectedElement.modelElementId);
              const metaRef = metaClass?.references.find(r => r.name === refName);
              
              if (!metaRef) return null;
              
              return (
                <Box key={refName} sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    {refName} ({metaRef.target})
                  </Typography>
                  {refValue === null ? (
                    <Typography variant="body2" color="text.secondary">
                      No reference set
                    </Typography>
                  ) : Array.isArray(refValue) ? (
                    refValue.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No references
                      </Typography>
                    ) : (
                      <List dense disablePadding>
                        {refValue.map(targetId => {
                          const targetElement = model.elements.find(e => e.id === targetId);
                          return (
                            <ListItem key={targetId} sx={{ py: 0 }}>
                              <ListItemText 
                                primary={targetElement ? (() => {
                                  // Find the metaclass for the target
                                  const targetMetaClass = metamodel.classes.find(
                                    c => c.id === targetElement.modelElementId
                                  );
                                  return `${targetMetaClass?.name || 'Unknown'}`;
                                })() : 'Missing Element'} 
                              />
                              <IconButton 
                                size="small" 
                                color="error"
                                onClick={() => {
                                  // Remove reference
                                  if (model && Array.isArray(refValue)) {
                                    const newRefs = refValue.filter(id => id !== targetId);
                                    
                                    modelService.setModelElementReference(
                                      model.id,
                                      selectedElement.id,
                                      refName,
                                      newRefs.length > 0 ? newRefs : null
                                    );
                                    
                                    // Refresh model
                                    const updatedModel = modelService.getModelById(model.id);
                                    if (updatedModel) {
                                      setModel(updatedModel);
                                      
                                      // Update selection
                                      const updatedElement = updatedModel.elements.find(
                                        e => e.id === selectedElement.id
                                      );
                                      if (updatedElement) {
                                        setSelectedElement(updatedElement);
                                      }
                                    }
                                  }
                                }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </ListItem>
                          );
                        })}
                      </List>
                    )
                  ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      {(() => {
                        const targetElement = model.elements.find(e => e.id === refValue);
                        return (
                          <Typography variant="body2">
                            {targetElement ? (() => {
                              // Find the metaclass for the target
                              const targetMetaClass = metamodel.classes.find(
                                c => c.id === targetElement.modelElementId
                              );
                              return `${targetMetaClass?.name || 'Unknown'}`;
                            })() : 'Missing Element'}
                          </Typography>
                        );
                      })()}
                      
                      <IconButton 
                        size="small" 
                        color="error" 
                        sx={{ ml: 1 }}
                        onClick={() => {
                          // Clear reference
                          if (model) {
                            modelService.setModelElementReference(
                              model.id,
                              selectedElement.id,
                              refName,
                              null
                            );
                            
                            // Refresh model
                            const updatedModel = modelService.getModelById(model.id);
                            if (updatedModel) {
                              setModel(updatedModel);
                              
                              // Update selection
                              const updatedElement = updatedModel.elements.find(
                                e => e.id === selectedElement.id
                              );
                              if (updatedElement) {
                                setSelectedElement(updatedElement);
                              }
                            }
                          }
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  )}
                </Box>
              );
            })}
            
            <Divider sx={{ my: 2 }} />
            
            {/* Reference attributes display */}
            {selectedModelReference && (() => {
              const { sourceElement, targetElement, refName } = selectedModelReference;
              const refAttributes = (sourceElement.references as any)[`${refName}_attributes`] || {};
              
              return Object.keys(refAttributes).length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2">Attributes</Typography>
                  <List dense>
                    {Object.entries(refAttributes).map(([key, value]) => (
                      <ListItem key={key}>
                        <ListItemText
                          primary={key}
                          secondary={
                            <TextField
                              fullWidth
                              size="small"
                              value={value?.toString() || ''}
                              onChange={(e) => {
                                // Get metaclass and reference
                                const sourceMetaClass = metamodel.classes.find(c => c.id === sourceElement.modelElementId);
                                const reference = sourceMetaClass?.references.find(r => r.name === refName);
                                const attribute = reference?.attributes?.find(a => a.name === key);
                                
                                // Determine type conversion
                                let convertedValue: any = e.target.value;
                                if (attribute) {
                                  if (attribute.type === 'number') {
                                    convertedValue = Number(e.target.value);
                                  } else if (attribute.type === 'boolean') {
                                    convertedValue = e.target.value === 'true';
                                  }
                                }
                                
                                // Update the reference attribute
                                const updatedAttributes = {
                                  ...refAttributes,
                                  [key]: convertedValue
                                };
                                
                                // Update the model
                                if (model) {
                                  // Get the original reference value
                                  const refValue = sourceElement.references[refName];
                                  
                                  // Use the model service to update with the new attributes
                                  modelService.setModelElementReference(
                                    model.id,
                                    sourceElement.id,
                                    refName,
                                    refValue,
                                    undefined, // don't change bend points
                                    updatedAttributes
                                  );
                                  
                                  // Refresh the model
                                  const updatedModel = modelService.getModelById(model.id);
                                  if (updatedModel) {
                                    setModel(updatedModel);
                                    
                                    // Update the selected reference
                                    const updatedSourceElement = updatedModel.elements.find(e => e.id === sourceElement.id);
                                    const updatedTargetElement = updatedModel.elements.find(e => e.id === targetElement.id);
                                    if (updatedSourceElement && updatedTargetElement) {
                                      setSelectedModelReference({
                                        sourceElement: updatedSourceElement,
                                        targetElement: updatedTargetElement,
                                        refName
                                      });
                                    }
                                  }
                                }
                              }}
                              variant="outlined"
                            />
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                </>
              );
            })()}
            
            <Divider sx={{ my: 2 }} />
            
            <Button
              variant="outlined"
              color="error"
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this element?')) {
                  if (model && selectedElement) {
                    // Delete the element
                    modelService.deleteModelElement(model.id, selectedElement.id);
                    
                    // Refresh model
                    const updatedModel = modelService.getModelById(model.id);
                    if (updatedModel) {
                      setModel(updatedModel);
                      setSelectedElement(null);
                    }
                  }
                }
              }}
              sx={{ mt: 2 }}
              startIcon={<DeleteIcon />}
            >
              Delete Element
            </Button>
          </Box>
        ) : selectedModelReference ? (
          <Box sx={{ p: 2, overflowY: 'auto' }}>
            <Typography variant="h6" gutterBottom>
              Reference Properties
            </Typography>
            
            {(() => {
              const { sourceElement, targetElement, refName } = selectedModelReference;
              const sourceMetaClass = metamodel.classes.find(c => c.id === sourceElement.modelElementId);
              const metaReference = sourceMetaClass?.references.find(r => r.name === refName);
              
              // Get reference attributes
              const refAttributes = (sourceElement.references as any)[`${refName}_attributes`] || {};
              
              return (
                <>
                  <Typography variant="subtitle2" gutterBottom>
                    {refName} {metaReference?.containment ? '(containment)' : ''}
                  </Typography>
                  
                  <List dense>
                    <ListItem>
                      <ListItemText 
                        primary="Source" 
                        secondary={sourceMetaClass?.name || 'Unknown'} 
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText 
                        primary="Target" 
                        secondary={metamodel.classes.find(c => c.id === targetElement.modelElementId)?.name || 'Unknown'} 
                      />
                    </ListItem>
                  </List>
                  
                  {/* Reference attributes display */}
                  {Object.keys(refAttributes).length > 0 && (
                    <>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="subtitle2">Attributes</Typography>
                      <List dense>
                        {Object.entries(refAttributes).map(([key, value]) => (
                          <ListItem key={key}>
                            <ListItemText
                              primary={key}
                              secondary={value?.toString() || ''}
                            />
                          </ListItem>
                        ))}
                      </List>
                    </>
                  )}
                  
                  <Divider sx={{ my: 2 }} />
                  
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to delete this reference?')) {
                        modelService.setModelElementReference(
                          model.id,
                          sourceElement.id,
                          refName,
                          null
                        );
                        
                        // Refresh the model
                        const updatedModel = modelService.getModelById(model.id);
                        if (updatedModel) {
                          setModel(updatedModel);
                          setSelectedModelReference(null);
                        }
                      }
                    }}
                    startIcon={<DeleteIcon />}
                  >
                    Delete Reference
                  </Button>
                </>
              );
            })()}
          </Box>
        ) : (
          <Box sx={{ p: 2 }}>
            <Typography color="textSecondary">
              Select an element or reference to view and edit its properties.
            </Typography>
          </Box>
        )}
      </Drawer>
      
      {/* Dialogs */}
      {renderAddElementDialog()}
      {renderAddReferenceDialog()}
      
      {/* Validation Error Dialog */}
      <ValidationErrorDialog
        open={isValidationDialogOpen}
        onClose={() => setIsValidationDialogOpen(false)}
        title="Constraint Validation Error"
        issues={validationIssues}
      />
    </Box>
  );
};

export default VisualModelEditor; 