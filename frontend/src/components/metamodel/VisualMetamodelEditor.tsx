import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Circle } from 'react-konva';
import { Box, Typography } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProject } from '../../contexts/ProjectContext';
import { Metamodel, MetaClass, MetaAttribute, MetaReference } from '../../models/types';
import { metamodelService } from '../../services/metamodel';
import { parseBendPoints, setupMetamodelExport } from './utils';
import {
  ClassNode,
  ReferenceEdge,
  ReferenceLabels,
  InheritanceArrows,
  TempReference
} from './components/canvas';
import {
  ClassDialog,
  AttributeDialog,
  ReferenceDialog,
  EditAttributeDialog,
  ReferenceAttributeDialog
} from './components/dialogs';
import {
  useMetamodelZoom,
  useMetamodelHighlight,
  useMetamodelSelection,
  useMetamodelSearch
} from './hooks';
import {
  MetamodelToolbar,
  MetamodelZoomControls
} from './components/toolbar';
import {
  MetamodelSidebar
} from './components/sidebar';

interface VisualMetamodelEditorProps {
  metamodelId: string;
  readOnly?: boolean;
}

// Interface for tab panel props
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

// Tab Panel component
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TabPanel = (props: TabPanelProps) => {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`metamodel-tabpanel-${index}`}
      aria-labelledby={`metamodel-tab-${index}`}
      style={{ height: 'calc(100% - 49px)', overflow: 'auto' }}
      {...other}
    >
      {value === index && children}
    </div>
  );
};

const VisualMetamodelEditor: React.FC<VisualMetamodelEditorProps> = ({ metamodelId, readOnly = false }) => {
  // Metamodel state
  const [metamodel, setMetamodel] = useState<Metamodel | null>(null);
  
  // Canvas state
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  
  // Custom hooks for state management
  const [selectionState, selectionHandlers] = useMetamodelSelection();
  const { selectedClass, selectedReference, selectedInheritance } = selectionState;
  const { setSelectedClass, setSelectedReference, setSelectedInheritance } = selectionHandlers;
  
  const [highlightState, highlightHandlers] = useMetamodelHighlight();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { highlightedClasses, highlightedAttributes, highlightedReferences, highlightedConstraints } = highlightState;
  const { 
    clearHighlights, 
    setHighlightedClasses, 
    setHighlightedAttributes, 
    setHighlightedReferences, 
    setHighlightedConstraints,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    isClassHighlighted,
    isAttributeHighlighted,
    isReferenceHighlighted
  } = highlightHandlers;
  
  const [zoomState, zoomHandlers] = useMetamodelZoom();
  const { scale, stagePosition } = zoomState;
  const { handleZoomIn, handleZoomOut, handleResetZoom, handleWheel, setScale, setStagePosition } = zoomHandlers;
  
  // Search hook (depends on other hooks)
  const [searchState, searchHandlers] = useMetamodelSearch({
    metamodel,
    scale,
    stageSize,
    setSelectedClass,
    setSelectedReference,
    setStagePosition,
    setHighlightedClasses,
    setHighlightedAttributes,
    setHighlightedReferences,
    setHighlightedConstraints
  });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { searchIndex, searchResults } = searchState;
  const { handleSearch, handleSelectSearchResult, handleHighlightAllResults } = searchHandlers;
  
  // Reference drawing state
  const [isDrawingReference, setIsDrawingReference] = useState(false);
  const [referenceStartClass, setReferenceStartClass] = useState<MetaClass | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  // Get location for URL query params
  const location = useLocation();
  const navigate = useNavigate();
  const { project } = useProject();
  
  // Dialog states
  const [isClassDialogOpen, setIsClassDialogOpen] = useState(false);
  const [isAttributeDialogOpen, setIsAttributeDialogOpen] = useState(false);
  const [isReferenceDialogOpen, setIsReferenceDialogOpen] = useState(false);
  const [isEditAttributeDialogOpen, setIsEditAttributeDialogOpen] = useState(false);
  const [editingAttribute, setEditingAttribute] = useState<MetaAttribute | null>(null);
  
  // Form states
  const [newClassName, setNewClassName] = useState('');
  const [newClassAbstract, setNewClassAbstract] = useState(false);
  const [newClassSuperTypes, setNewClassSuperTypes] = useState<string[]>([]);
  const [newAttributeName, setNewAttributeName] = useState('');
  const [newAttributeType, setNewAttributeType] = useState('string');
  const [newAttributeRequired, setNewAttributeRequired] = useState(false);
  const [newAttributeDefaultValue, setNewAttributeDefaultValue] = useState('');
  const [newReferenceName, setNewReferenceName] = useState('');
  const [newReferenceTarget, setNewReferenceTarget] = useState('');
  const [newReferenceContainment, setNewReferenceContainment] = useState(false);
  const [newReferenceLowerBound, setNewReferenceLowerBound] = useState('0');
  const [newReferenceUpperBound, setNewReferenceUpperBound] = useState('1');
  
  // Pan/drag states
  const [isDragging, setIsDragging] = useState(false);
  const [lastPointerPosition, setLastPointerPosition] = useState({ x: 0, y: 0 });
  
  // Tab state
  const [tabValue, setTabValue] = useState(0);
  
  // Refs
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);
  const hasLoggedLoadTimeRef = useRef(false);
  const loadStartRef = useRef<number>(performance.now());

  // --- PNG Export Logic ---
  // Setup global export function using utility
  useEffect(() => {
    return setupMetamodelExport(
      metamodel,
      stageRef,
      scale,
      stagePosition,
      setScale,
      setStagePosition,
      { pixelRatio: 2, padding: 100 }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metamodel, scale, stagePosition]);
  
  // State for temporary bend points during edge creation
  const [tempReferencePoints, setTempReferencePoints] = useState<Array<{x: number, y: number}> | null>(null);
  
  // State for dragging bend points
  const [draggingBendPoint, setDraggingBendPoint] = useState<{
    referenceId: string;
    sourceClassId: string;
    pointIndex: number;
  } | null>(null);
  
  // State to track if we're currently dragging a bend point (to disable class dragging)
  const [isDraggingBendPoint, setIsDraggingBendPoint] = useState(false);
  
  // Add state for reference attribute dialog
  const [isReferenceAttributeDialogOpen, setIsReferenceAttributeDialogOpen] = useState(false);
  const [newReferenceAttributeName, setNewReferenceAttributeName] = useState('');
  const [newReferenceAttributeType, setNewReferenceAttributeType] = useState('string');
  const [newReferenceAttributeRequired, setNewReferenceAttributeRequired] = useState(false);
  const [newReferenceAttributeDefaultValue, setNewReferenceAttributeDefaultValue] = useState('');

  const parseAttributeType = (type: string) => (
    type.startsWith('enum:') ? { enumId: type.slice('enum:'.length) } : type
  );

  const formatAttributeType = (type: any): string => (
    typeof type === 'object' && type?.enumId ? `enum:${type.enumId}` : type
  );
  
  // Change tab handler
  const handleChangeTab = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };
  
  // Load metamodel
  useEffect(() => {
    const loadMetamodel = () => {
      const metamodelData = metamodelService.getMetamodelById(metamodelId);
      if (metamodelData) {
        // Initialize class positions if they don't exist
        metamodelData.classes.forEach((metaClass, index) => {
          if (!metaClass.position) {
            metaClass.position = {
              x: 50 + (index % 3) * 250,
              y: 50 + Math.floor(index / 3) * 200
            };
          }
        });
        setMetamodel(metamodelData);
        
        // Always set flag to center on elements when loading a metamodel
        isInitialLoad.current = true;
      }
    };
    
    loadMetamodel();
    
    // No need to save view state anymore since we always center on load
  }, [metamodelId]);

  // Log load time once metamodel is available (post-mount)
  useEffect(() => {
    if (metamodel && !hasLoggedLoadTimeRef.current) {
      const durationMs = Math.max(1, Math.round(performance.now() - loadStartRef.current));
      console.log(`[Metamodel Editor] Model loading time: ${durationMs} ms`);
      hasLoggedLoadTimeRef.current = true;
    }
  }, [metamodel]);
  
  // Parse URL for highlighted elements
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const highlightParam = searchParams.get('highlight');
    
    if (highlightParam) {
      try {
        const highlightData = JSON.parse(decodeURIComponent(highlightParam));
        
        // Set highlighted elements from URL params
        if (highlightData.classes && Array.isArray(highlightData.classes)) {
          setHighlightedClasses(new Set(highlightData.classes));
        }
        
        if (highlightData.attrs && Array.isArray(highlightData.attrs)) {
          setHighlightedAttributes(new Set(highlightData.attrs));
        }
        
        if (highlightData.refs && Array.isArray(highlightData.refs)) {
          setHighlightedReferences(new Set(highlightData.refs));
        }
        
        if (highlightData.constraints && Array.isArray(highlightData.constraints)) {
          setHighlightedConstraints(new Set(highlightData.constraints));
        }
      } catch (error) {
        console.error('Error parsing highlight data:', error);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);
  
  // Center view on elements when the metamodel loads or when stage size changes
  useEffect(() => {
    if (metamodel && containerRef.current && stageSize.width > 0 && stageSize.height > 0) {
      // Small delay to ensure the stage is properly rendered
      const timerId = setTimeout(() => {
        if (isInitialLoad.current) {
          centerViewOnElements();
          isInitialLoad.current = false;
        }
      }, 100);
      
      return () => clearTimeout(timerId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metamodel, stageSize]);
  
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
    if (!metamodel || !containerRef.current) return;
    
    if (metamodel.classes.length === 0) {
      // If no classes, just reset to center
      setScale(1);
      setStagePosition({ x: 0, y: 0 });
      return;
    }
    
    // Calculate the bounding box of all elements
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    metamodel.classes.forEach(cls => {
      const pos = cls.position || { x: 0, y: 0 };
      const width = 200;
      const height = 30 + (cls.attributes.length * 20) + 10;
      
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
  
  // Save changes to metamodel
  const saveChanges = (updatedMetamodel?: Metamodel | null) => {
    const modelToSave = updatedMetamodel || metamodel;
    if (modelToSave) {
      console.log("Saving metamodel changes");
      metamodelService.updateMetamodel(modelToSave.id, modelToSave);
    }
  };
  
  // Handle class click
  const handleClassClick = (metaClass: MetaClass) => {
    // Clear bend point dragging state when clicking on classes
    setIsDraggingBendPoint(false);
    setDraggingBendPoint(null);
    // Clear highlights when clicking on a class
    clearHighlights();
    
    if (isDrawingReference) {
      if (!referenceStartClass) {
        // Start drawing a reference from this class
        setReferenceStartClass(metaClass);
      } else {
        // Allow self-references
        setIsReferenceDialogOpen(true);
        setNewReferenceTarget(metaClass.id);
      }
    } else {
      setSelectedClass(metaClass);
      setSelectedReference(null);
    }
  };
  
  // Handle reference click
  const handleReferenceClick = (sourceClass: MetaClass, reference: MetaReference) => {
    // Clear bend point dragging state when selecting a different reference
    setIsDraggingBendPoint(false);
    setDraggingBendPoint(null);
    // Clear highlights when clicking on a reference
    clearHighlights();
    
    setSelectedReference({ sourceClass, reference });
    setSelectedClass(null);
  };
  
  // Handle class drag
  const handleClassDrag = (metaClass: MetaClass, newPos: { x: number, y: number }) => {
    if (metamodel) {
      const oldPos = metaClass.position || { x: 0, y: 0 };
      const deltaX = newPos.x - oldPos.x;
      const deltaY = newPos.y - oldPos.y;
      
      const updatedClasses = metamodel.classes.map(cls => {
        if (cls.id === metaClass.id) {
          // Update class position
          const updatedClass = { 
            ...cls, 
            position: newPos
          };
          
          // Update bend points for self-references when class is moved
          const updatedReferences = cls.references.map(ref => {
            const isSelfReference = ref.target === cls.id;
            if (isSelfReference && (ref as any).bendPoints) {
              const bendPoints = parseBendPoints((ref as any).bendPoints);
              if (bendPoints && bendPoints.length > 0) {
                // Move bend points along with the class
                const adjustedBendPoints = bendPoints.map(point => ({
                  x: point.x + deltaX,
                  y: point.y + deltaY
                }));
                
                return {
                  ...ref,
                  bendPoints: JSON.stringify(adjustedBendPoints)
                } as any;
              }
            }
            return ref;
          });
          
          return {
            ...updatedClass,
            references: updatedReferences
          };
        }
        return cls;
      });
      
      const newMetamodel = { ...metamodel, classes: updatedClasses };
      setMetamodel(newMetamodel);
      saveChanges(newMetamodel);
    }
  };
  
  // Handle mouse move
  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    setMousePos(point);
    
    // Handle stage dragging
    if (isDragging) {
      handleStageDragMove(e);
    }
  };
  
  // Handle stage drag for panning when not dragging elements
  const handleStageDragStart = (e: any) => {
    // Only enable panning if not clicking on a class or drawing a reference
    const clickedOnEmpty = e.target === e.target.getStage();
    if (clickedOnEmpty && !isDrawingReference) {
      setIsDragging(true);
      setLastPointerPosition(e.target.getStage().getPointerPosition());
      // Clear highlights when clicking on empty space
      clearHighlights();
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
  
  // Add new class
  const handleAddClass = () => {
    if (metamodel && newClassName.trim()) {
      // Get center of the visible area
      const centerX = stageSize.width / 2;
      const centerY = stageSize.height / 2;
      
      // Convert to stage coordinates
      const stagePoint = {
        x: (centerX - stagePosition.x) / scale,
        y: (centerY - stagePosition.y) / scale
      };
      
      // Add some randomness to position classes
      const randomOffsetX = (Math.random() - 0.5) * 200;
      const randomOffsetY = (Math.random() - 0.5) * 200;
      
      // Use the service to add the class instead of creating it directly
      const newClass = metamodelService.addMetaClass(metamodel.id, newClassName, newClassAbstract);
      
      if (newClass) {
        // Update the position after creation
        newClass.position = {
          x: stagePoint.x + randomOffsetX,
          y: stagePoint.y + randomOffsetY
        };
        
        // Update the class with position and superTypes
        metamodelService.updateMetaClass(
          metamodel.id, 
          newClass.id, 
          {
            superTypes: newClassSuperTypes,
            position: newClass.position
          }
        );
        
        // Refresh the metamodel from the service to get the latest version with name attribute
        const updatedMetamodel = metamodelService.getMetamodelById(metamodel.id);
        if (updatedMetamodel) {
          setMetamodel(updatedMetamodel);
          console.log('Updated metamodel after adding class:', updatedMetamodel);
        }
      }
      
      setNewClassName('');
      setNewClassAbstract(false);
      setNewClassSuperTypes([]);
      setIsClassDialogOpen(false);
    }
  };
  
  // Add attribute to selected class
  const handleAddAttribute = () => {
    if (metamodel && selectedClass && newAttributeName.trim()) {
      const newAttribute: MetaAttribute = {
        id: `attr-${Date.now()}`,
        name: newAttributeName,
        type: parseAttributeType(newAttributeType) as any,
        required: newAttributeRequired,
        many: false,
        eClass: ''
      };
      
      if (newAttributeDefaultValue.trim()) {
        newAttribute.defaultValue = newAttributeDefaultValue;
      }
      
      const updatedClasses = metamodel.classes.map(cls => {
        if (cls.id === selectedClass.id) {
          return {
            ...cls,
            attributes: [...cls.attributes, newAttribute]
          };
        }
        return cls;
      });
      
      const newMetamodel = { ...metamodel, classes: updatedClasses };
      setMetamodel(newMetamodel);
      setNewAttributeName('');
      setNewAttributeType('string');
      setNewAttributeRequired(false);
      setNewAttributeDefaultValue('');
      setIsAttributeDialogOpen(false);
      saveChanges(newMetamodel);
    }
  };
  
  // Add reference between two classes
  const handleAddReference = () => {
    if (metamodel && referenceStartClass && newReferenceTarget && newReferenceName.trim()) {
      // Parse bounds
      const lowerBound = parseInt(newReferenceLowerBound) || 0;
      const upperBound = newReferenceUpperBound === '*' ? '*' : parseInt(newReferenceUpperBound) || 1;
      
      // Check if it's a self-reference
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const isSelfReference = referenceStartClass.id === newReferenceTarget;
      
      // Add the reference through the service
      const newReference = metamodelService.addMetaReference(
        metamodel.id,
        referenceStartClass.id,
        newReferenceName,
        newReferenceTarget,
        newReferenceContainment,
        lowerBound,
        upperBound,
        undefined, // opposite reference
        true // allow self-reference - set to true always
      );
      
      if (newReference && tempReferencePoints && tempReferencePoints.length > 0) {
        // Store bend points by extending the reference
        const bendPointsStr = JSON.stringify(tempReferencePoints);
        
        // Create update data with type assertion
        const updateData: any = {
          bendPoints: bendPointsStr
        };
        
        // Now pass the type-asserted data to the service
        metamodelService.updateMetaReference(
          metamodel.id,
          referenceStartClass.id,
          newReference.id,
          updateData
        );
      }
      
      // Refresh the metamodel from the service
      const updatedMetamodel = metamodelService.getMetamodelById(metamodel.id);
      if (updatedMetamodel) {
        setMetamodel(updatedMetamodel);
      }
      
      // Reset state
      setNewReferenceName('');
      setNewReferenceTarget('');
      setNewReferenceContainment(false);
      setNewReferenceLowerBound('0');
      setNewReferenceUpperBound('1');
      setIsReferenceDialogOpen(false);
      setIsDrawingReference(false);
      setReferenceStartClass(null);
      setTempReferencePoints(null);
    }
  };
  
  // Delete selected class
  const handleDeleteClass = () => {
    if (metamodel && selectedClass) {
      const updatedClasses = metamodel.classes.filter(cls => cls.id !== selectedClass.id);
      
      // Also remove any references pointing to this class
      updatedClasses.forEach(cls => {
        cls.references = cls.references.filter(ref => ref.target !== selectedClass.id);
      });
      
      const newMetamodel = { ...metamodel, classes: updatedClasses };
      setMetamodel(newMetamodel);
      setSelectedClass(null);
      saveChanges(newMetamodel);
    }
  };
  
  // Delete selected reference
  const handleDeleteReference = () => {
    if (metamodel && selectedReference) {
      const updatedClasses = metamodel.classes.map(cls => {
        if (cls.id === selectedReference.sourceClass.id) {
          return {
            ...cls,
            references: cls.references.filter(ref => ref.id !== selectedReference.reference.id)
          };
        }
        return cls;
      });
      
      const newMetamodel = { ...metamodel, classes: updatedClasses };
      setMetamodel(newMetamodel);
      setSelectedReference(null);
      saveChanges(newMetamodel);
    }
  };
  
  // Delete selected attribute
  const handleDeleteAttribute = (attributeId: string) => {
    if (metamodel && selectedClass) {
      const updatedClasses = metamodel.classes.map(cls => {
        if (cls.id === selectedClass.id) {
          return {
            ...cls,
            attributes: cls.attributes.filter(attr => attr.id !== attributeId)
          };
        }
        return cls;
      });
      
      const newMetamodel = { ...metamodel, classes: updatedClasses };
      setMetamodel(newMetamodel);
      saveChanges(newMetamodel);
    }
  };
  
  // Handle edit attribute
  const handleEditAttribute = (attribute: MetaAttribute) => {
    setEditingAttribute(attribute);
    setNewAttributeName(attribute.name);
    setNewAttributeType(formatAttributeType(attribute.type));
    setNewAttributeRequired(attribute.required || false);
    setNewAttributeDefaultValue(attribute.defaultValue || '');
    setIsEditAttributeDialogOpen(true);
  };

  // Save edited attribute
  const handleSaveEditedAttribute = () => {
    if (metamodel && selectedClass && editingAttribute && newAttributeName.trim()) {
      const updatedClasses = metamodel.classes.map(cls => {
        if (cls.id === selectedClass.id) {
          return {
            ...cls,
            attributes: cls.attributes.map(attr => {
              if (attr.id === editingAttribute.id) {
                return {
                  ...attr,
                  name: newAttributeName,
                  type: parseAttributeType(newAttributeType) as any,
                  required: newAttributeRequired,
                  defaultValue: newAttributeDefaultValue.trim() ? newAttributeDefaultValue : undefined
                };
              }
              return attr;
            })
          };
        }
        return cls;
      });
      
      const newMetamodel = { ...metamodel, classes: updatedClasses };
      setMetamodel(newMetamodel);
      setIsEditAttributeDialogOpen(false);
      setEditingAttribute(null);
      saveChanges(newMetamodel);
    }
  };
  
  // Add reference attribute
  const handleAddReferenceAttribute = () => {
    if (metamodel && selectedReference && newReferenceAttributeName.trim()) {
      // Add reference attribute
      const success = metamodelService.addReferenceAttribute(
        metamodel.id,
        selectedReference.sourceClass.id,
        selectedReference.reference.id,
        newReferenceAttributeName,
        parseAttributeType(newReferenceAttributeType) as any,
        newReferenceAttributeDefaultValue || undefined,
        newReferenceAttributeRequired,
        false // not many-valued
      );
      
      if (success) {
        // Refresh metamodel
        const updatedMetamodel = metamodelService.getMetamodelById(metamodel.id);
        if (updatedMetamodel) {
          setMetamodel(updatedMetamodel);
          
          // Update selected reference
          const updatedSourceClass = updatedMetamodel.classes.find(c => c.id === selectedReference.sourceClass.id);
          if (updatedSourceClass) {
            const updatedReference = updatedSourceClass.references.find(r => r.id === selectedReference.reference.id);
            if (updatedReference) {
              setSelectedReference({
                sourceClass: updatedSourceClass,
                reference: updatedReference
              });
            }
          }
        }
      }
      
      // Reset form
      setNewReferenceAttributeName('');
      setNewReferenceAttributeType('string');
      setNewReferenceAttributeRequired(false);
      setNewReferenceAttributeDefaultValue('');
      setIsReferenceAttributeDialogOpen(false);
    }
  };
  
  // Wrapper functions using hook's highlight checkers
  const isClassHighlightedWrapper = (metaClass: MetaClass): boolean => {
    return highlightHandlers.isClassHighlighted(metaClass.name) || highlightHandlers.isClassHighlighted(metaClass.id);
  };
  
  // Check if a constraint is highlighted
  const isConstraintHighlighted = (className: string, constraintName: string): boolean => {
    return highlightedConstraints.has(`${className}.${constraintName}`);
  };
  
  // Get highlight color
  const getHighlightColor = (): string => {
    return '#8aff8a'; // Light green color for highlighting
  };
  
  // Render draggable bend points for self-references
  const renderSelfReferenceBendPoints = () => {
    if (!metamodel || !selectedReference) return null;
    
    const bendPointElements: React.ReactElement[] = [];
    
    metamodel.classes.forEach(sourceClass => {
      sourceClass.references.forEach(reference => {
        // Only show bend points for the currently selected self-reference
        const isSelfReference = sourceClass.id === reference.target;
        const isSelected = selectedReference && 
                          selectedReference.sourceClass.id === sourceClass.id && 
                          selectedReference.reference.id === reference.id;
        
        if (!isSelfReference || !isSelected) return;
        
        const bendPoints = parseBendPoints((reference as any).bendPoints);
        if (!bendPoints || bendPoints.length === 0) return;
        
        // Create draggable circles for each bend point
        bendPoints.forEach((point, index) => {
          bendPointElements.push(
            <Circle
              key={`bendpoint-${reference.id}-${index}`}
              x={point.x}
              y={point.y}
              radius={6}
              fill={isSelected ? "#2196f3" : "#ff9800"}
              stroke={isSelected ? "#1976d2" : "#f57c00"}
              strokeWidth={2}
              draggable={true}
                             onDragStart={(e) => {
                 // Stop event propagation to prevent class from also being dragged
                 e.evt.stopPropagation();
                 setIsDraggingBendPoint(true);
                 setDraggingBendPoint({
                   referenceId: reference.id,
                   sourceClassId: sourceClass.id,
                   pointIndex: index
                 });
               }}
               onDragMove={(e) => {
                 // Stop event propagation to prevent class drag
                 e.evt.stopPropagation();
                 
                 if (draggingBendPoint && 
                     draggingBendPoint.referenceId === reference.id && 
                     draggingBendPoint.pointIndex === index) {
                   
                   const newX = e.target.x();
                   const newY = e.target.y();
                   
                   setMetamodel(currentMetamodel => {
                     if (!currentMetamodel) return null;
                     
                     // Find the correct class and reference from the latest state
                     const sourceCls = currentMetamodel.classes.find(c => c.id === sourceClass.id);
                     if (!sourceCls) return currentMetamodel;

                     const refToUpdate = sourceCls.references.find(r => r.id === reference.id);
                     if (!refToUpdate) return currentMetamodel;

                     const currentBendPoints = parseBendPoints((refToUpdate as any).bendPoints);
                     if (!currentBendPoints) return currentMetamodel;

                     const updatedBendPoints = [...currentBendPoints];
                     updatedBendPoints[draggingBendPoint.pointIndex] = { x: newX, y: newY };

                     const updatedClasses = currentMetamodel.classes.map(cls => {
                       if (cls.id === sourceClass.id) {
                         return {
                           ...cls,
                           references: cls.references.map(ref => {
                             if (ref.id === reference.id) {
                               return {
                                 ...ref,
                                 bendPoints: JSON.stringify(updatedBendPoints)
                               } as any;
                             }
                             return ref;
                           })
                         };
                       }
                       return cls;
                     });

                     return { ...currentMetamodel, classes: updatedClasses };
                   });
                 }
               }}
               onDragEnd={(e) => {
                 // Stop event propagation to prevent class drag
                 e.evt.stopPropagation();
                 
                 if (draggingBendPoint && 
                     draggingBendPoint.referenceId === reference.id && 
                     draggingBendPoint.pointIndex === index) {
                   
                   const newX = e.target.x();
                   const newY = e.target.y();
                   
                   // Update the bend points array
                   const updatedBendPoints = [...bendPoints];
                   updatedBendPoints[index] = { x: newX, y: newY };
                   
                   // Save the changes to the service
                   const bendPointsStr = JSON.stringify(updatedBendPoints);
                   const updateData: any = { bendPoints: bendPointsStr };
                   
                   metamodelService.updateMetaReference(
                     metamodel!.id,
                     sourceClass.id,
                     reference.id,
                     updateData
                   );
                   
                   // Refresh the metamodel from the service
                   const updatedMetamodel = metamodelService.getMetamodelById(metamodel!.id);
                   if (updatedMetamodel) {
                     setMetamodel(updatedMetamodel);
                   }
                   
                   setDraggingBendPoint(null);
                   setIsDraggingBendPoint(false);
                 }
               }}
                             onClick={(e) => {
                 // Stop event propagation to prevent class selection
                 e.evt.stopPropagation();
               }}
               onMouseDown={(e) => {
                 // Stop event propagation to prevent class drag initiation
                 e.evt.stopPropagation();
                 // Ensure we're in bend point dragging mode
                 setIsDraggingBendPoint(true);
               }}
               onMouseEnter={(e) => {
                 const stage = e.target.getStage();
                 if (stage && stage.container()) {
                   stage.container().style.cursor = 'grab';
                 }
               }}
               onMouseLeave={(e) => {
                 const stage = e.target.getStage();
                 if (stage && stage.container()) {
                   stage.container().style.cursor = 'default';
                 }
               }}
            />
          );
        });
      });
    });
    
    return bendPointElements;
  };
  
  // Clean up Konva stage on unmount
  useEffect(() => {
    return () => {
      if (stageRef.current) {
        stageRef.current.destroyChildren();
        // eslint-disable-next-line react-hooks/exhaustive-deps
        stageRef.current.destroy();
      }
    };
  }, []);
  
  // Navigate to testing dashboard with the current metamodel
  const handleTestMetamodel = () => {
    navigate(`/projects/${project.id}/testing/${metamodelId}`);
  };
  
  // Handle stage click - add bend points for references
  const handleStageClick = (e: any) => {
    // Clear selections when clicking on empty space
    if (e.target === e.target.getStage()) {
      setSelectedInheritance(null);
      // Clear bend point dragging state when clicking elsewhere
      setIsDraggingBendPoint(false);
      setDraggingBendPoint(null);
    }
    
    // If drawing reference and click on empty space, add a bend point
    if (isDrawingReference && referenceStartClass) {
      const { x, y } = e.target.getStage().getPointerPosition();
      
      // Check if we clicked on empty space (stage)
      if (e.target === e.target.getStage()) {
        // Convert the point to stage coordinates
        const stageCoords = {
          x: (x - stagePosition.x) / scale,
          y: (y - stagePosition.y) / scale
        };
        
        // Add the point to the temporary bend points
        if (!tempReferencePoints) {
          setTempReferencePoints([stageCoords]);
        } else {
          setTempReferencePoints([...tempReferencePoints, stageCoords]);
        }
      }
    }
  };
  
  // Render stage with zoom and pan
  if (!metamodel) {
    return <Typography>Loading metamodel...</Typography>;
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
          onWheel={handleWheel}
          scaleX={scale}
          scaleY={scale}
          x={stagePosition.x}
          y={stagePosition.y}
          onClick={handleStageClick}
        >
          <Layer>
            {/* Draw reference lines first so they appear under classes */}
            {metamodel.classes.map(sourceClass => 
              sourceClass.references.map(reference => {
                const targetClass = metamodel.classes.find(c => c.id === reference.target);
                if (!targetClass) return null;
                
                const isSelected = !!(selectedReference && 
                                  selectedReference.sourceClass.id === sourceClass.id && 
                                  selectedReference.reference.id === reference.id);
                const isHighlighted = isReferenceHighlighted(sourceClass.name, reference.name);
                
                return (
                  <ReferenceEdge
                    key={`${sourceClass.id}-${reference.id}-line`}
                    sourceClass={sourceClass}
                    targetClass={targetClass}
                    reference={reference}
                    metamodel={metamodel}
                    isSelected={isSelected}
                    isHighlighted={isHighlighted}
                    onReferenceClick={handleReferenceClick}
                  />
                );
              })
            )}
            
            {/* Draw classes */}
            {metamodel.classes.map(metaClass => (
              <ClassNode
                key={metaClass.id}
                metaClass={metaClass}
                isSelected={selectedClass?.id === metaClass.id}
                isHighlighted={isClassHighlightedWrapper(metaClass)}
                highlightColor={getHighlightColor()}
                isDraggingBendPoint={isDraggingBendPoint}
                isAttributeHighlighted={isAttributeHighlighted}
                onClassClick={handleClassClick}
                onClassDrag={handleClassDrag}
              />
            ))}
            
            {/* Draw reference labels with intelligent positioning to avoid overlap */}
            {metamodel.classes.map(sourceClass => 
              sourceClass.references.map(reference => {
                const targetClass = metamodel.classes.find(c => c.id === reference.target);
                if (!targetClass) return null;
                
                const isSelected = !!(selectedReference && 
                                  selectedReference.sourceClass.id === sourceClass.id && 
                                  selectedReference.reference.id === reference.id);
                const isHighlighted = isReferenceHighlighted(sourceClass.name, reference.name);
                
                return (
                  <ReferenceLabels
                    key={`${sourceClass.id}-${reference.id}-labels`}
                    sourceClass={sourceClass}
                    targetClass={targetClass}
                    reference={reference}
                    metamodel={metamodel}
                    isSelected={isSelected}
                    isHighlighted={isHighlighted}
                    highlightColor={getHighlightColor()}
                    onReferenceClick={handleReferenceClick}
                  />
                );
              })
            )}
            
            {/* Draw inheritance arrows on top */}
            <InheritanceArrows
              metamodel={metamodel}
              selectedInheritance={selectedInheritance}
              onInheritanceClick={(inheritance) => {
                setSelectedInheritance(inheritance);
                setSelectedClass(null);
                setSelectedReference(null);
              }}
            />
            
            {/* Draw draggable bend points for self-references */}
            {renderSelfReferenceBendPoints()}
            
            {/* Draw temporary reference line on top */}
            <TempReference
              isDrawing={isDrawingReference}
              sourceClass={referenceStartClass}
              mousePos={mousePos}
              stagePosition={stagePosition}
              scale={scale}
              tempPoints={tempReferencePoints}
            />
          </Layer>
        </Stage>
        
        {/* Toolbar */}
        <MetamodelToolbar
          isDrawingReference={isDrawingReference}
          readOnly={readOnly}
          searchResults={searchResults}
          onAddClass={() => setIsClassDialogOpen(true)}
          onToggleDrawReference={() => {
            setIsDrawingReference(!isDrawingReference);
            if (!isDrawingReference) {
              setReferenceStartClass(null);
            } else {
              // Clear bend points and reference start class when canceling
              setReferenceStartClass(null);
              setTempReferencePoints(null);
            }
          }}
          onSaveChanges={() => saveChanges()}
          onTestMetamodel={handleTestMetamodel}
          onSearch={handleSearch}
          onSelectSearchResult={handleSelectSearchResult}
          onHighlightAllResults={handleHighlightAllResults}
        />
        
        {/* Zoom Controls */}
        <MetamodelZoomControls
          scale={scale}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetZoom={handleResetZoom}
          onCenterView={centerViewOnElements}
        />
      </Box>
      
      {/* Properties Panel */}
      <MetamodelSidebar
        metamodel={metamodel}
        tabValue={tabValue}
        selectedClass={selectedClass}
        selectedInheritance={selectedInheritance}
        selectedReference={selectedReference}
        highlightedConstraints={highlightedConstraints}
        readOnly={readOnly}
        onChangeTab={handleChangeTab}
        onUpdateMetamodel={setMetamodel}
        onUpdateSelectedClass={setSelectedClass}
        onUpdateSelectedReference={setSelectedReference}
        onUpdateSelectedInheritance={setSelectedInheritance}
        onAddAttribute={() => setIsAttributeDialogOpen(true)}
        onEditAttribute={handleEditAttribute}
        onDeleteAttribute={handleDeleteAttribute}
        onDeleteClass={handleDeleteClass}
        onDeleteReference={handleDeleteReference}
        onAddReferenceAttribute={() => setIsReferenceAttributeDialogOpen(true)}
        isConstraintHighlighted={isConstraintHighlighted}
        getHighlightColor={getHighlightColor}
      />
      
      {/* Dialogs */}
      <ClassDialog
        open={isClassDialogOpen}
        className={newClassName}
        isAbstract={newClassAbstract}
        superTypes={newClassSuperTypes}
        metamodel={metamodel}
        onClose={() => setIsClassDialogOpen(false)}
        onClassNameChange={setNewClassName}
        onAbstractChange={setNewClassAbstract}
        onSuperTypesChange={setNewClassSuperTypes}
        onAdd={handleAddClass}
      />
      <AttributeDialog
        open={isAttributeDialogOpen}
        attributeName={newAttributeName}
        attributeType={newAttributeType}
        defaultValue={newAttributeDefaultValue}
        required={newAttributeRequired}
        onClose={() => setIsAttributeDialogOpen(false)}
        onAttributeNameChange={setNewAttributeName}
        onAttributeTypeChange={setNewAttributeType}
        onDefaultValueChange={setNewAttributeDefaultValue}
        onRequiredChange={setNewAttributeRequired}
        onAdd={handleAddAttribute}
        enums={metamodel.enums || []}
      />
      <ReferenceDialog
        open={isReferenceDialogOpen}
        referenceName={newReferenceName}
        lowerBound={newReferenceLowerBound}
        upperBound={newReferenceUpperBound}
        containment={newReferenceContainment}
        onClose={() => setIsReferenceDialogOpen(false)}
        onReferenceNameChange={setNewReferenceName}
        onLowerBoundChange={setNewReferenceLowerBound}
        onUpperBoundChange={setNewReferenceUpperBound}
        onContainmentChange={setNewReferenceContainment}
        onAdd={handleAddReference}
        onCancel={() => {
          setIsReferenceDialogOpen(false);
          setIsDrawingReference(false);
          setReferenceStartClass(null);
          setTempReferencePoints(null);
        }}
      />
      <ReferenceAttributeDialog
        open={isReferenceAttributeDialogOpen}
        attributeName={newReferenceAttributeName}
        attributeType={newReferenceAttributeType}
        defaultValue={newReferenceAttributeDefaultValue}
        required={newReferenceAttributeRequired}
        onClose={() => setIsReferenceAttributeDialogOpen(false)}
        onAttributeNameChange={setNewReferenceAttributeName}
        onAttributeTypeChange={setNewReferenceAttributeType}
        onDefaultValueChange={setNewReferenceAttributeDefaultValue}
        onRequiredChange={setNewReferenceAttributeRequired}
        onAdd={handleAddReferenceAttribute}
        enums={metamodel.enums || []}
      />
      <EditAttributeDialog
        open={isEditAttributeDialogOpen}
        attributeName={newAttributeName}
        attributeType={newAttributeType}
        defaultValue={newAttributeDefaultValue}
        required={newAttributeRequired}
        onClose={() => setIsEditAttributeDialogOpen(false)}
        onAttributeNameChange={setNewAttributeName}
        onAttributeTypeChange={setNewAttributeType}
        onDefaultValueChange={setNewAttributeDefaultValue}
        onRequiredChange={setNewAttributeRequired}
        onSave={handleSaveEditedAttribute}
        enums={metamodel.enums || []}
      />
    </Box>
  );
};

export default VisualMetamodelEditor;
