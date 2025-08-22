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
  Slider,
  Tooltip,
  Tabs,
  Tab,
  Chip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import SaveIcon from '@mui/icons-material/Save';
import BugReportIcon from '@mui/icons-material/BugReport';
import { useLocation, useNavigate } from 'react-router-dom';
import { Metamodel, MetaClass, MetaAttribute, MetaReference } from '../../models/types';
import { metamodelService } from '../../services/metamodel.service';
import OCLConstraintEditor from './OCLConstraintEditor';
import ConstraintTypeSelector from './ConstraintTypeSelector';

interface VisualMetamodelEditorProps {
  metamodelId: string;
}

// Interface for tab panel props
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

// Tab Panel component
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

const VisualMetamodelEditor: React.FC<VisualMetamodelEditorProps> = ({ metamodelId }) => {
  // Metamodel state
  const [metamodel, setMetamodel] = useState<Metamodel | null>(null);
  
  // Canvas state
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [selectedClass, setSelectedClass] = useState<MetaClass | null>(null);
  const [selectedReference, setSelectedReference] = useState<{ sourceClass: MetaClass, reference: MetaReference } | null>(null);
  const [selectedInheritance, setSelectedInheritance] = useState<{
    childClass: MetaClass;
    parentClass: MetaClass;
    childConnectionX: number;
    childConnectionY: number;
    parentConnectionX: number;
    parentConnectionY: number;
  } | null>(null);
  const [isDrawingReference, setIsDrawingReference] = useState(false);
  const [referenceStartClass, setReferenceStartClass] = useState<MetaClass | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  // Highlight state for AI-generated/modified elements
  const [highlightedClasses, setHighlightedClasses] = useState<Set<string>>(new Set());
  const [highlightedAttributes, setHighlightedAttributes] = useState<Set<string>>(new Set()); // format: "className.attrName"
  const [highlightedReferences, setHighlightedReferences] = useState<Set<string>>(new Set()); // format: "className.refName"
  const [highlightedConstraints, setHighlightedConstraints] = useState<Set<string>>(new Set()); // format: "className.constraintName"
  
  // Get location for URL query params
  const location = useLocation();
  const navigate = useNavigate();
  
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
  
  // Zoom and scroll states
  const [scale, setScale] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
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
  
  // Disable wheel zooming - only use zoom buttons
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
    // Only enable panning if not clicking on a class or drawing a reference
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
        type: newAttributeType as any,
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
    setNewAttributeType(attribute.type);
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
                  type: newAttributeType as any,
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
  
  // Check if a class is highlighted
  const isClassHighlighted = (metaClass: MetaClass): boolean => {
    return highlightedClasses.has(metaClass.name);
  };
  
  // Check if an attribute is highlighted
  const isAttributeHighlighted = (className: string, attrName: string): boolean => {
    return highlightedAttributes.has(`${className}.${attrName}`);
  };
  
  // Check if a reference is highlighted
  const isReferenceHighlighted = (className: string, refName: string): boolean => {
    return highlightedReferences.has(`${className}.${refName}`);
  };
  
  // Check if a constraint is highlighted
  const isConstraintHighlighted = (className: string, constraintName: string): boolean => {
    return highlightedConstraints.has(`${className}.${constraintName}`);
  };
  
  // Get highlight color
  const getHighlightColor = (): string => {
    return '#8aff8a'; // Light green color for highlighting
  };
  
  // Add helper function to parse bend points
  const parseBendPoints = (bendPointsStr: string | undefined): Array<{x: number, y: number}> | null => {
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
  
  // Render a class
  const renderClass = (metaClass: MetaClass) => {
    const isSelected = selectedClass?.id === metaClass.id;
    const isHighlighted = isClassHighlighted(metaClass);
    const width = 200;
    const headerHeight = 30;
    const attributeHeight = 20;
    const padding = 5;
    
    const totalHeight = headerHeight + 
      (metaClass.attributes.length > 0 ? padding + metaClass.attributes.length * attributeHeight : 0) +
      padding * 2;
    
    // Use the stored class position
    const classPosition = metaClass.position || { x: 0, y: 0 };
    
    return (
      <Group
        key={metaClass.id}
        x={classPosition.x}
        y={classPosition.y}
        draggable={!isDraggingBendPoint}
        onClick={() => handleClassClick(metaClass)}
        onDragEnd={(e) => {
          // Only handle drag if not dragging bend points
          if (!isDraggingBendPoint) {
            // Get the position directly
            const pos = {
              x: e.target.x(),
              y: e.target.y()
            };
            
            handleClassDrag(metaClass, pos);
          }
        }}
      >
        {/* Class box */}
        <Rect
          width={width}
          height={totalHeight}
          fill="white"
          stroke={isSelected ? "blue" : isHighlighted ? "green" : "black"}
          strokeWidth={isSelected ? 2 : isHighlighted ? 2 : 1}
          cornerRadius={4}
        />
        
        {/* Class name */}
        <Rect
          width={width}
          height={headerHeight}
          fill={isSelected ? "#d4e6f7" : isHighlighted ? getHighlightColor() : "#e5e5e5"}
          stroke={isSelected ? "blue" : isHighlighted ? "green" : "black"}
          strokeWidth={1}
          cornerRadius={[4, 4, 0, 0]}
        />
        
        <Text
          text={metaClass.abstract ? `<<abstract>>\n${metaClass.name}` : metaClass.name}
          x={10}
          y={metaClass.abstract ? headerHeight / 2 - 12 : headerHeight / 2 - 7}
          fontSize={metaClass.abstract ? 10 : 14}
          fontStyle={metaClass.abstract ? "italic" : "bold"}
          width={width - 20}
          align="center"
        />
        
        {/* Divider line */}
        {metaClass.attributes.length > 0 && (
          <Line
            points={[0, headerHeight, width, headerHeight]}
            stroke="black"
            strokeWidth={1}
          />
        )}
        
        {/* Attributes */}
        {metaClass.attributes.map((attr, index) => {
          const isAttrHighlighted = isAttributeHighlighted(metaClass.name, attr.name);
          
          return (
            <Group key={attr.id}>
              {isAttrHighlighted && (
                <Rect
                  x={5}
                  y={headerHeight + padding + index * attributeHeight - 2}
                  width={width - 10}
                  height={attributeHeight}
                  fill={getHighlightColor()}
                  cornerRadius={2}
                />
              )}
              <Text
                text={`${attr.name}: ${attr.type}${attr.required ? ' *' : ''}`}
                x={10}
                y={headerHeight + padding + index * attributeHeight}
                fontSize={12}
                width={width - 20}
                fill={isAttrHighlighted ? "green" : "black"}
              />
            </Group>
          );
        })}
        
        {/* Connection points */}
        {isSelected && (
          <>
            <Circle x={0} y={totalHeight / 2} radius={4} fill="blue" />
            <Circle x={width} y={totalHeight / 2} radius={4} fill="blue" />
            <Circle x={width / 2} y={0} radius={4} fill="blue" />
            <Circle x={width / 2} y={totalHeight} radius={4} fill="blue" />
          </>
        )}
      </Group>
    );
  };
  
  // Helper function to calculate connection point on class boundary
  const calculateConnectionPoint = (fromClass: MetaClass, toClass: MetaClass, isSource: boolean) => {
    const fromPos = fromClass.position || { x: 0, y: 0 };
    const toPos = toClass.position || { x: 0, y: 0 };
    
    const classWidth = 200;
    const fromHeight = 30 + fromClass.attributes.length * 20 + 10;
    const toHeight = 30 + toClass.attributes.length * 20 + 10;
    
    // Calculate centers
    const fromCenterX = fromPos.x + classWidth / 2;
    const fromCenterY = fromPos.y + fromHeight / 2;
    const toCenterX = toPos.x + classWidth / 2;
    const toCenterY = toPos.y + toHeight / 2;
    
    // For the connection point calculation, use the appropriate class
    const classPos = isSource ? fromPos : toPos;
    const classHeight = isSource ? fromHeight : toHeight;
    const centerX = isSource ? fromCenterX : toCenterX;
    const centerY = isSource ? fromCenterY : toCenterY;
    const otherCenterX = isSource ? toCenterX : fromCenterX;
    const otherCenterY = isSource ? toCenterY : fromCenterY;
    
    // Calculate angle from this class center to the other class center
    const dx = otherCenterX - centerX;
    const dy = otherCenterY - centerY;
    const angle = Math.atan2(dy, dx);
    
    // Determine which edge to connect to based on angle
    let connectionX: number, connectionY: number;
    
    if (Math.abs(angle) < Math.PI / 4) {
      // Connect to right edge
      connectionX = classPos.x + classWidth;
      connectionY = centerY;
    } else if (Math.abs(angle) > 3 * Math.PI / 4) {
      // Connect to left edge
      connectionX = classPos.x;
      connectionY = centerY;
    } else if (angle > 0) {
      // Connect to bottom edge
      connectionX = centerX;
      connectionY = classPos.y + classHeight;
    } else {
      // Connect to top edge
      connectionX = centerX;
      connectionY = classPos.y;
    }
    
    return { x: connectionX, y: connectionY };
  };

  // Render a reference line only (without labels)
  const renderReferenceLines = (sourceClass: MetaClass, reference: MetaReference) => {
    const targetClass = metamodel?.classes.find(c => c.id === reference.target);
    if (!targetClass) return null;
    
    const isSelected = selectedReference && 
                      selectedReference.sourceClass.id === sourceClass.id && 
                      selectedReference.reference.id === reference.id;
    
    const isHighlighted = isReferenceHighlighted(sourceClass.name, reference.name);
    
    // Check if this is a self-reference
    const isSelfReference = sourceClass.id === targetClass.id;
    
    // Check if there are bend points
    const bendPoints = parseBendPoints((reference as any).bendPoints);
    
    // Calculate proper connection points
    const sourceConnection = calculateConnectionPoint(sourceClass, targetClass, true);
    const targetConnection = calculateConnectionPoint(sourceClass, targetClass, false);
    
    // Determine the arrow points
    let points = [];
    
    if (bendPoints && bendPoints.length > 0) {
      // Use stored bend points
      points = [sourceConnection.x, sourceConnection.y];
      bendPoints.forEach(point => {
        points.push(point.x, point.y);
      });
      points.push(targetConnection.x, targetConnection.y);
    } else if (isSelfReference) {
      // Default self-reference curve if no bend points
      const sourcePos = sourceClass.position || { x: 0, y: 0 };
      const offsetX = 60;
      const offsetY = 60;
      
      points = [
        sourceConnection.x, sourceConnection.y,
        sourcePos.x + 200 + offsetX, sourceConnection.y,
        sourcePos.x + 200 + offsetX, sourcePos.y + offsetY,
        sourcePos.x + 100, sourcePos.y + offsetY,
        targetConnection.x, targetConnection.y
      ];
    } else {
      // Regular straight line with proper connection points
      points = [
        sourceConnection.x, sourceConnection.y,
        targetConnection.x, targetConnection.y
      ];
    }

    // Determine arrow properties
    const isBidirectional = metamodel?.classes.some(c => 
      c.id === reference.target && c.references.some(r => r.target === sourceClass.id)
    ) || false;
    
    if (isBidirectional) {
      // Calculate a perpendicular offset based on the line direction
      const dx = points[points.length - 2] - points[0];
      const dy = points[points.length - 1] - points[1];
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length > 0) {
        // Normalize direction vector
        const ndx = dx / length;
        const ndy = dy / length;
        
        // Create a perpendicular vector
        const px = -ndy;
        const py = ndx;
        
        // Scale to a reasonable offset (about 15 pixels)
        const nx = px * 15;
        const ny = py * 15;
        
        // Apply the offset to all points
        for (let i = 0; i < points.length; i += 2) {
          points[i] += nx;
          points[i+1] += ny;
        }
      }
    }
    
    return (
      <Arrow
        key={`${reference.id}-line`}
        points={points}
        stroke={isSelected ? "blue" : isHighlighted ? "green" : "black"}
        strokeWidth={isSelected ? 2 : isHighlighted ? 2 : 1}
        fill={isSelected ? "blue" : isHighlighted ? "green" : "black"}
        pointerLength={10}
        pointerWidth={10}
        onClick={() => handleReferenceClick(sourceClass, reference)}
      />
    );
  };

  // Helper function to check if a point is inside a class rectangle
  const isPointInClass = (x: number, y: number, metaClass: MetaClass) => {
    const pos = metaClass.position || { x: 0, y: 0 };
    const width = 200;
    const height = 30 + metaClass.attributes.length * 20 + 10;
    
    return x >= pos.x && x <= pos.x + width && y >= pos.y && y <= pos.y + height;
  };

  // Helper function to find a good position for labels that doesn't overlap classes
  const findLabelPosition = (startX: number, startY: number, endX: number, endY: number, sourceClass: MetaClass, targetClass: MetaClass, isSelfReference: boolean = false, points: number[] = []) => {
    // Special handling for self-references
    if (isSelfReference && points.length >= 6) {
      // For self-references, place the label at the rightmost point of the curve
      // This is typically the second point in the self-reference curve
      const rightmostX = points[2]; // x coordinate of second point
      const rightmostY = points[3]; // y coordinate of second point
      
      return { 
        x: rightmostX + 20, // Offset right from the curve
        y: rightmostY - 10  // Offset up slightly
      };
    }
    
    // Try midpoint first for regular references
    let midX = (startX + endX) / 2;
    let midY = (startY + endY) / 2;
    
    // Check if midpoint overlaps with any class
    const allClasses = metamodel?.classes || [];
    const overlapsClass = allClasses.some(cls => isPointInClass(midX, midY, cls));
    
    if (!overlapsClass) {
      return { x: midX, y: midY };
    }
    
    // If midpoint overlaps, try offsetting perpendicular to the line
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length > 0) {
      // Normalize and get perpendicular vector
      const ndx = dx / length;
      const ndy = dy / length;
      const perpX = -ndy;
      const perpY = ndx;
      
      // Try offsets in both directions
      const offset = 30;
      const offset1X = midX + perpX * offset;
      const offset1Y = midY + perpY * offset;
      const offset2X = midX - perpX * offset;
      const offset2Y = midY - perpY * offset;
      
      // Check which offset doesn't overlap
      if (!allClasses.some(cls => isPointInClass(offset1X, offset1Y, cls))) {
        return { x: offset1X, y: offset1Y };
      } else if (!allClasses.some(cls => isPointInClass(offset2X, offset2Y, cls))) {
        return { x: offset2X, y: offset2Y };
      }
    }
    
    // Fallback to midpoint if we can't find a good position
    return { x: midX, y: midY };
  };

  // Render reference labels only (name, cardinality, containment indicator)
  const renderReferenceLabels = (sourceClass: MetaClass, reference: MetaReference) => {
    const targetClass = metamodel?.classes.find(c => c.id === reference.target);
    if (!targetClass) return null;
    
    const isSelected = selectedReference && 
                      selectedReference.sourceClass.id === sourceClass.id && 
                      selectedReference.reference.id === reference.id;
    
    const isHighlighted = isReferenceHighlighted(sourceClass.name, reference.name);
    
    // Check if this is a self-reference
    const isSelfReference = sourceClass.id === targetClass.id;
    
    // Check if there are bend points
    const bendPoints = parseBendPoints((reference as any).bendPoints);
    
    // Calculate proper connection points (same as lines)
    const sourceConnection = calculateConnectionPoint(sourceClass, targetClass, true);
    const targetConnection = calculateConnectionPoint(sourceClass, targetClass, false);
    
    // Determine the arrow points (same logic as lines)
    let points = [];
    
    if (bendPoints && bendPoints.length > 0) {
      points = [sourceConnection.x, sourceConnection.y];
      bendPoints.forEach(point => {
        points.push(point.x, point.y);
      });
      points.push(targetConnection.x, targetConnection.y);
    } else if (isSelfReference) {
      const sourcePos = sourceClass.position || { x: 0, y: 0 };
      const offsetX = 60;
      const offsetY = 60;
      
      points = [
        sourceConnection.x, sourceConnection.y,
        sourcePos.x + 200 + offsetX, sourceConnection.y,
        sourcePos.x + 200 + offsetX, sourcePos.y + offsetY,
        sourcePos.x + 100, sourcePos.y + offsetY,
        targetConnection.x, targetConnection.y
      ];
    } else {
      points = [
        sourceConnection.x, sourceConnection.y,
        targetConnection.x, targetConnection.y
      ];
    }

    // Apply bidirectional offset if needed (same logic as lines)
    const isBidirectional = metamodel?.classes.some(c => 
      c.id === reference.target && c.references.some(r => r.target === sourceClass.id)
    ) || false;
    
    if (isBidirectional) {
      const dx = points[points.length - 2] - points[0];
      const dy = points[points.length - 1] - points[1];
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length > 0) {
        const ndx = dx / length;
        const ndy = dy / length;
        const px = -ndy;
        const py = ndx;
        const nx = px * 15;
        const ny = py * 15;
        
        for (let i = 0; i < points.length; i += 2) {
          points[i] += nx;
          points[i+1] += ny;
        }
      }
    }
    
    // Find intelligent position for reference name (avoid overlapping classes)
    const labelPos = findLabelPosition(
      points[0], 
      points[1], 
      points[points.length - 2], 
      points[points.length - 1], 
      sourceClass, 
      targetClass, 
      isSelfReference, 
      points
    );
    
    // Position cardinality - special handling for self-references
    let cardinalityX: number, cardinalityY: number;
    
    if (isSelfReference && points.length >= 6) {
      // For self-references, place cardinality at the bottom of the curve
      cardinalityX = points[6]; // x coordinate of fourth point (bottom of curve)
      cardinalityY = points[7] + 15; // y coordinate of fourth point, offset down
    } else {
      // Regular reference cardinality positioning
      cardinalityX = targetConnection.x;
      cardinalityY = targetConnection.y;
      
      // Offset cardinality based on the connection edge
      const targetPos = targetClass.position || { x: 0, y: 0 };
      const targetWidth = 200;
      const targetHeight = 30 + targetClass.attributes.length * 20 + 10;
      
      if (cardinalityX === targetPos.x) {
        // Left edge - offset left
        cardinalityX -= 25;
      } else if (cardinalityX === targetPos.x + targetWidth) {
        // Right edge - offset right
        cardinalityX += 25;
      } else if (cardinalityY === targetPos.y) {
        // Top edge - offset up
        cardinalityY -= 15;
      } else {
        // Bottom edge - offset down
        cardinalityY += 15;
      }
    }
    
    return (
      <Group
        key={`${reference.id}-labels`}
        onClick={() => handleReferenceClick(sourceClass, reference)}
      >
        {/* Reference name with improved background */}
        <Group>
          <Rect
            x={labelPos.x - 30}
            y={labelPos.y - 12}
            width={60}
            height={20}
            fill="#ffffff"
            stroke={isSelected ? "blue" : isHighlighted ? "green" : "#e0e0e0"}
            strokeWidth={1}
            cornerRadius={3}
            opacity={0.95}
            shadowColor="rgba(0,0,0,0.2)"
            shadowBlur={3}
            shadowOffset={{ x: 1, y: 1 }}
          />
          {isHighlighted && (
            <Rect
              x={labelPos.x - 28}
              y={labelPos.y - 10}
              width={56}
              height={16}
              fill={getHighlightColor()}
              cornerRadius={2}
              opacity={0.7}
            />
          )}
          <Text
            text={reference.name}
            x={labelPos.x - 25}
            y={labelPos.y - 8}
            fontSize={12}
            fill={isSelected ? "blue" : isHighlighted ? "green" : "black"}
            fontStyle="bold"
            padding={1}
          />
        </Group>
        
        {/* Cardinality with improved positioning and styling */}
        <Group>
          <Rect
            x={cardinalityX - 17}
            y={cardinalityY - 10}
            width={34}
            height={16}
            fill="#ffffff"
            stroke={isSelected ? "blue" : isHighlighted ? "green" : "#e0e0e0"}
            strokeWidth={1}
            cornerRadius={3}
            opacity={0.95}
            shadowColor="rgba(0,0,0,0.2)"
            shadowBlur={3}
            shadowOffset={{ x: 1, y: 1 }}
          />
          <Text
            text={`${reference.cardinality.lowerBound}..${reference.cardinality.upperBound}`}
            x={cardinalityX - 14}
            y={cardinalityY - 8}
            fontSize={10}
            fill={isSelected ? "blue" : isHighlighted ? "green" : "black"}
            fontStyle="bold"
            padding={1}
          />
        </Group>
        
        {/* Containment indicator */}
        {reference.containment && (
          <Circle
            x={labelPos.x - 40}
            y={labelPos.y - 5}
            radius={5}
            fill={isSelected ? "blue" : isHighlighted ? "green" : "black"}
            shadowColor="rgba(0,0,0,0.3)"
            shadowBlur={2}
            shadowOffset={{ x: 1, y: 1 }}
          />
        )}
      </Group>
    );
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
  
  // Render the temporary line when drawing a reference
  const renderTempReference = () => {
    if (!isDrawingReference || !referenceStartClass) return null;
    
    // Calculate mouse position relative to stage
    const adjustedMousePos = {
      x: (mousePos.x - stagePosition.x) / scale,
      y: (mousePos.y - stagePosition.y) / scale
    };
    
    // Create a temporary target class for connection point calculation
    const tempTargetClass = {
      id: 'temp',
      name: 'temp',
      attributes: [],
      references: [],
      constraints: [],
      abstract: false,
      superTypes: [],
      eClass: 'temp',
      position: { x: adjustedMousePos.x - 100, y: adjustedMousePos.y - 25 }
    } as MetaClass;
    
    // Calculate proper connection point from source
    const sourceConnection = calculateConnectionPoint(referenceStartClass, tempTargetClass, true);
    
    // Create the points array starting with the proper connection point
    let points = [sourceConnection.x, sourceConnection.y];
    
    // Add any temporary bend points
    if (tempReferencePoints && tempReferencePoints.length > 0) {
      tempReferencePoints.forEach(point => {
        points.push(point.x, point.y);
      });
    }
    
    // Add the current mouse position
    points.push(adjustedMousePos.x, adjustedMousePos.y);
    
    return (
      <Line
        points={points}
        stroke="gray"
        strokeWidth={1}
        dash={[5, 5]}
      />
    );
  };
  
  // Render inheritance arrows
  const renderInheritanceArrows = () => {
    if (!metamodel) return null;
    
    const arrows: React.ReactElement[] = [];
    
    metamodel.classes.forEach(metaClass => {
      if (metaClass.superTypes && metaClass.superTypes.length > 0) {
        metaClass.superTypes.forEach(supertypeId => {
          const supertype = metamodel.classes.find(cls => cls.id === supertypeId);
          if (!supertype) return;
          
          // Get positions of both classes
          const childPos = getClassPosition(metaClass);
          const parentPos = getClassPosition(supertype);
          
          if (!childPos || !parentPos) return;
          
          // Skip if positions are the same (would create a zero-length arrow)
          if (childPos.x === parentPos.x && childPos.y === parentPos.y) return;
          
          // Calculate connection points
          const childWidth = 200;
          const childHeight = 30 + (metaClass.attributes.length > 0 ? 5 + metaClass.attributes.length * 20 : 0) + 10;
          const parentWidth = 200;
          const parentHeight = 30 + (supertype.attributes.length > 0 ? 5 + supertype.attributes.length * 20 : 0) + 10;
          
          // Calculate centers
          const childCenterX = childPos.x + childWidth / 2;
          const childCenterY = childPos.y + childHeight / 2;
          const parentCenterX = parentPos.x + parentWidth / 2;
          const parentCenterY = parentPos.y + parentHeight / 2;
          
          // Calculate the angle between the two centers
          const dx = parentCenterX - childCenterX;
          const dy = parentCenterY - childCenterY;
          const angle = Math.atan2(dy, dx);
          
          // Determine connection points based on the angle
          let childConnectionX: number, childConnectionY: number;
          let parentConnectionX: number, parentConnectionY: number;
          
          // Child connection point (where arrow starts)
          if (Math.abs(angle) < Math.PI / 4) {
            // Connect from child right
            childConnectionX = childPos.x + childWidth;
            childConnectionY = childCenterY;
          } else if (Math.abs(angle) > 3 * Math.PI / 4) {
            // Connect from child left
            childConnectionX = childPos.x;
            childConnectionY = childCenterY;
          } else if (angle > 0) {
            // Connect from child bottom
            childConnectionX = childCenterX;
            childConnectionY = childPos.y + childHeight;
          } else {
            // Connect from child top
            childConnectionX = childCenterX;
            childConnectionY = childPos.y;
          }
          
          // Parent connection point (where arrow ends)
          if (Math.abs(angle) < Math.PI / 4) {
            // Connect to parent left
            parentConnectionX = parentPos.x;
            parentConnectionY = parentCenterY;
          } else if (Math.abs(angle) > 3 * Math.PI / 4) {
            // Connect to parent right
            parentConnectionX = parentPos.x + parentWidth;
            parentConnectionY = parentCenterY;
          } else if (angle > 0) {
            // Connect to parent top
            parentConnectionX = parentCenterX;
            parentConnectionY = parentPos.y;
          } else {
            // Connect to parent bottom
            parentConnectionX = parentCenterX;
            parentConnectionY = parentPos.y + parentHeight;
          }
          
          // Create inheritance arrow (hollow triangle)
          const arrowKey = `inheritance-${metaClass.id}-${supertypeId}`;
          
          // Check if this inheritance is selected
          const isSelected = selectedInheritance &&
            selectedInheritance.childClass.id === metaClass.id &&
            selectedInheritance.parentClass.id === supertypeId;
          
          // Calculate arrow head angle
          const arrowAngle = Math.atan2(parentConnectionY - childConnectionY, parentConnectionX - childConnectionX);
          const arrowSize = 12;
          
          // Calculate triangle points for the arrow head
          const arrowHead1X = parentConnectionX - arrowSize * Math.cos(arrowAngle - Math.PI / 6);
          const arrowHead1Y = parentConnectionY - arrowSize * Math.sin(arrowAngle - Math.PI / 6);
          const arrowHead2X = parentConnectionX - arrowSize * Math.cos(arrowAngle + Math.PI / 6);
          const arrowHead2Y = parentConnectionY - arrowSize * Math.sin(arrowAngle + Math.PI / 6);
          
          arrows.push(
            <Group 
              key={arrowKey}
              onClick={() => {
                setSelectedInheritance({
                  childClass: metaClass,
                  parentClass: supertype,
                  childConnectionX,
                  childConnectionY,
                  parentConnectionX,
                  parentConnectionY
                });
                setSelectedClass(null);
                setSelectedReference(null);
              }}
              onMouseEnter={(e) => {
                const stage = e.target.getStage();
                if (stage && stage.container()) {
                  stage.container().style.cursor = 'pointer';
                }
              }}
              onMouseLeave={(e) => {
                const stage = e.target.getStage();
                if (stage && stage.container()) {
                  stage.container().style.cursor = 'default';
                }
              }}
            >
              {/* Inheritance line */}
              <Line
                points={[childConnectionX, childConnectionY, parentConnectionX, parentConnectionY]}
                stroke={isSelected ? "#2196f3" : "#4caf50"}
                strokeWidth={isSelected ? 3 : 2}
              />
              
              {/* Hollow triangle arrow at parent end */}
              <Line
                points={[
                  parentConnectionX, parentConnectionY,
                  arrowHead1X, arrowHead1Y,
                  arrowHead2X, arrowHead2Y,
                  parentConnectionX, parentConnectionY
                ]}
                stroke={isSelected ? "#2196f3" : "#4caf50"}
                strokeWidth={isSelected ? 3 : 2}
                fill="white"
                closed={true}
              />
              
              {/* Invisible wider line for easier clicking */}
              <Line
                points={[childConnectionX, childConnectionY, parentConnectionX, parentConnectionY]}
                stroke="transparent"
                strokeWidth={10}
              />
            </Group>
          );
        });
      }
    });
    
    return arrows;
  };
  
  // Helper function to get class position
  const getClassPosition = (metaClass: MetaClass) => {
    // Use the actual stored position if available, otherwise fall back to grid layout
    if (metaClass.position) {
      return metaClass.position;
    }
    
    // Fallback to grid layout if no position is stored
    const row = Math.floor(metamodel!.classes.indexOf(metaClass) / 3);
    const col = metamodel!.classes.indexOf(metaClass) % 3;
    return {
      x: col * 250 + 50,
      y: row * 200 + 50
    };
  };
  
  // Render dialogs
  const renderClassDialog = () => (
    <Dialog open={isClassDialogOpen} onClose={() => setIsClassDialogOpen(false)}>
      <DialogTitle>Add New Class</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Class Name"
          fullWidth
          value={newClassName}
          onChange={(e) => setNewClassName(e.target.value)}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={newClassAbstract}
              onChange={(e) => setNewClassAbstract(e.target.checked)}
            />
          }
          label="Abstract Class"
          sx={{ mt: 2 }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Abstract classes cannot be instantiated directly in models. They serve as base classes for inheritance.
        </Typography>
        
        {/* Supertype Selection */}
        <FormControl fullWidth sx={{ mt: 2 }}>
          <InputLabel>Supertypes</InputLabel>
          <Select
            multiple
            value={newClassSuperTypes}
            onChange={(e) => setNewClassSuperTypes(e.target.value as string[])}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {(selected as string[]).map((value) => {
                  const supertype = metamodel?.classes.find(cls => cls.id === value);
                  return (
                    <Chip key={value} label={supertype?.name || value} size="small" />
                  );
                })}
              </Box>
            )}
          >
            {metamodel?.classes.map(cls => (
              <MenuItem key={cls.id} value={cls.id}>
                {cls.name} {cls.abstract ? '(abstract)' : ''}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setIsClassDialogOpen(false)}>Cancel</Button>
        <Button onClick={handleAddClass} color="primary">Add</Button>
      </DialogActions>
    </Dialog>
  );
  
  const renderAttributeDialog = () => (
    <Dialog open={isAttributeDialogOpen} onClose={() => setIsAttributeDialogOpen(false)}>
      <DialogTitle>Add New Attribute</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Attribute Name"
          fullWidth
          value={newAttributeName}
          onChange={(e) => setNewAttributeName(e.target.value)}
        />
        <FormControl fullWidth margin="normal">
          <InputLabel>Type</InputLabel>
          <Select
            value={newAttributeType}
            onChange={(e: SelectChangeEvent) => setNewAttributeType(e.target.value)}
          >
            <MenuItem value="string">String</MenuItem>
            <MenuItem value="number">Number</MenuItem>
            <MenuItem value="boolean">Boolean</MenuItem>
            <MenuItem value="date">Date</MenuItem>
          </Select>
        </FormControl>
        <TextField
          margin="dense"
          label="Default Value"
          fullWidth
          value={newAttributeDefaultValue}
          onChange={(e) => setNewAttributeDefaultValue(e.target.value)}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={newAttributeRequired}
              onChange={(e) => setNewAttributeRequired(e.target.checked)}
            />
          }
          label="Required"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setIsAttributeDialogOpen(false)}>Cancel</Button>
        <Button onClick={handleAddAttribute} color="primary">Add</Button>
      </DialogActions>
    </Dialog>
  );
  
  const renderReferenceDialog = () => (
    <Dialog open={isReferenceDialogOpen} onClose={() => setIsReferenceDialogOpen(false)}>
      <DialogTitle>Add New Reference</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Reference Name"
          fullWidth
          value={newReferenceName}
          onChange={(e) => setNewReferenceName(e.target.value)}
        />
        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <TextField
            label="Lower Bound"
            value={newReferenceLowerBound}
            onChange={(e) => setNewReferenceLowerBound(e.target.value)}
            sx={{ width: '100px' }}
          />
          <TextField
            label="Upper Bound"
            value={newReferenceUpperBound}
            onChange={(e) => setNewReferenceUpperBound(e.target.value)}
            sx={{ width: '100px' }}
          />
        </Box>
        <FormControlLabel
          control={
            <Checkbox
              checked={newReferenceContainment}
              onChange={(e) => setNewReferenceContainment(e.target.checked)}
            />
          }
          label="Containment"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => {
          setIsReferenceDialogOpen(false);
          setIsDrawingReference(false);
          setReferenceStartClass(null);
          setTempReferencePoints(null);
        }}>Cancel</Button>
        <Button onClick={handleAddReference} color="primary">Add</Button>
      </DialogActions>
    </Dialog>
  );
  
  // Add reference attribute dialog
  const renderReferenceAttributeDialog = () => (
    <Dialog open={isReferenceAttributeDialogOpen} onClose={() => setIsReferenceAttributeDialogOpen(false)}>
      <DialogTitle>Add Reference Attribute</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Attribute Name"
          fullWidth
          value={newReferenceAttributeName}
          onChange={(e) => setNewReferenceAttributeName(e.target.value)}
        />
        <FormControl fullWidth margin="normal">
          <InputLabel>Type</InputLabel>
          <Select
            value={newReferenceAttributeType}
            onChange={(e: SelectChangeEvent) => setNewReferenceAttributeType(e.target.value)}
          >
            <MenuItem value="string">String</MenuItem>
            <MenuItem value="number">Number</MenuItem>
            <MenuItem value="boolean">Boolean</MenuItem>
            <MenuItem value="date">Date</MenuItem>
          </Select>
        </FormControl>
        <TextField
          margin="dense"
          label="Default Value"
          fullWidth
          value={newReferenceAttributeDefaultValue}
          onChange={(e) => setNewReferenceAttributeDefaultValue(e.target.value)}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={newReferenceAttributeRequired}
              onChange={(e) => setNewReferenceAttributeRequired(e.target.checked)}
            />
          }
          label="Required"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setIsReferenceAttributeDialogOpen(false)}>Cancel</Button>
        <Button onClick={() => {
          if (metamodel && selectedReference && newReferenceAttributeName.trim()) {
            // Add reference attribute
            const success = metamodelService.addReferenceAttribute(
              metamodel.id,
              selectedReference.sourceClass.id,
              selectedReference.reference.id,
              newReferenceAttributeName,
              newReferenceAttributeType as any,
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
        }} color="primary">
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
  
  // Add the edit attribute dialog renderer
  const renderEditAttributeDialog = () => (
    <Dialog open={isEditAttributeDialogOpen} onClose={() => setIsEditAttributeDialogOpen(false)}>
      <DialogTitle>Edit Attribute</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Attribute Name"
          fullWidth
          value={newAttributeName}
          onChange={(e) => setNewAttributeName(e.target.value)}
        />
        <FormControl fullWidth margin="normal">
          <InputLabel>Type</InputLabel>
          <Select
            value={newAttributeType}
            onChange={(e: SelectChangeEvent) => setNewAttributeType(e.target.value)}
          >
            <MenuItem value="string">String</MenuItem>
            <MenuItem value="number">Number</MenuItem>
            <MenuItem value="boolean">Boolean</MenuItem>
            <MenuItem value="date">Date</MenuItem>
          </Select>
        </FormControl>
        <TextField
          margin="dense"
          label="Default Value"
          fullWidth
          value={newAttributeDefaultValue}
          onChange={(e) => setNewAttributeDefaultValue(e.target.value)}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={newAttributeRequired}
              onChange={(e) => setNewAttributeRequired(e.target.checked)}
            />
          }
          label="Required"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setIsEditAttributeDialogOpen(false)}>Cancel</Button>
        <Button onClick={handleSaveEditedAttribute} color="primary">Save</Button>
      </DialogActions>
    </Dialog>
  );
  
  // Clean up Konva stage on unmount
  useEffect(() => {
    return () => {
      if (stageRef.current) {
        stageRef.current.destroyChildren();
        stageRef.current.destroy();
      }
    };
  }, []);
  
  // Navigate to testing dashboard with the current metamodel
  const handleTestMetamodel = () => {
    navigate(`/testing/${metamodelId}`);
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
              sourceClass.references.map(reference => 
                renderReferenceLines(sourceClass, reference)
              )
            )}
            
            {/* Draw classes */}
            {metamodel.classes.map(metaClass => renderClass(metaClass))}
            
            {/* Draw reference labels with intelligent positioning to avoid overlap */}
            {metamodel.classes.map(sourceClass => 
              sourceClass.references.map(reference => 
                renderReferenceLabels(sourceClass, reference)
              )
            )}
            
            {/* Draw inheritance arrows on top */}
            {renderInheritanceArrows()}
            
            {/* Draw draggable bend points for self-references */}
            {renderSelfReferenceBendPoints()}
            
            {/* Draw temporary reference line on top */}
            {renderTempReference()}
          </Layer>
        </Stage>
        
        {/* Toolbar */}
        <Paper
          sx={{
            position: 'absolute',
            top: 16,
            left: 16,
            p: 1,
            display: 'flex',
            gap: 1
          }}
        >
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setIsClassDialogOpen(true)}
          >
            Add Class
          </Button>
          
          <Button
            variant={isDrawingReference ? "contained" : "outlined"}
            color="primary"
            size="small"
            onClick={() => {
              setIsDrawingReference(!isDrawingReference);
              if (!isDrawingReference) {
                setReferenceStartClass(null);
              } else {
                // Clear bend points and reference start class when canceling
                setReferenceStartClass(null);
                setTempReferencePoints(null);
              }
            }}
          >
            {isDrawingReference ? "Cancel Reference" : "Add Reference"}
          </Button>
          
          <Button
            variant="contained"
            color="success"
            size="small"
            onClick={() => saveChanges()}
            startIcon={<SaveIcon />}
          >
            Save Changes
          </Button>

          <Button
            variant="contained"
            size="small"
            startIcon={<BugReportIcon />}
            color="secondary"
            onClick={handleTestMetamodel}
          >
            Test Metamodel
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
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={tabValue} 
            onChange={handleChangeTab}
            variant="fullWidth"
          >
            <Tab label="Properties" id="metamodel-tab-0" aria-controls="metamodel-tabpanel-0" />
            <Tab label="Constraints" id="metamodel-tab-1" aria-controls="metamodel-tabpanel-1" />
          </Tabs>
        </Box>
        
        <TabPanel value={tabValue} index={0}>
          {selectedClass ? (
            <Box sx={{ p: 2 }}>
              <Typography variant="h6">{selectedClass.name}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {selectedClass.abstract ? 'Abstract Class' : 'Concrete Class'}
              </Typography>
              
              {/* Abstract Property Toggle */}
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedClass.abstract}
                    onChange={(e) => {
                      if (metamodel && selectedClass) {
                        const success = metamodelService.updateMetaClass(
                          metamodel.id,
                          selectedClass.id,
                          { abstract: e.target.checked }
                        );
                        
                        if (success) {
                          // Refresh the metamodel
                          const updatedMetamodel = metamodelService.getMetamodelById(metamodel.id);
                          if (updatedMetamodel) {
                            setMetamodel(updatedMetamodel);
                            
                            // Update selected class reference
                            const updatedClass = updatedMetamodel.classes.find(c => c.id === selectedClass.id);
                            if (updatedClass) {
                              setSelectedClass(updatedClass);
                            }
                          }
                        }
                      }
                    }}
                  />
                }
                label="Abstract Class"
                sx={{ mb: 1 }}
              />
              
              <Divider sx={{ my: 1 }} />
              
              {/* Inheritance Section */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>Inheritance</Typography>
                <FormControl fullWidth size="small">
                  <InputLabel>Supertypes</InputLabel>
                  <Select
                    multiple
                    value={selectedClass.superTypes || []}
                    onChange={(e) => {
                      if (metamodel && selectedClass) {
                        const newSuperTypes = e.target.value as string[];
                        
                        // Check for circular inheritance
                        const hasCircularInheritance = (classId: string, targetSupertypes: string[]): boolean => {
                          if (targetSupertypes.includes(selectedClass.id)) {
                            return true;
                          }
                          
                          for (const supertypeId of targetSupertypes) {
                            const supertype = metamodel.classes.find(cls => cls.id === supertypeId);
                            if (supertype && supertype.superTypes && hasCircularInheritance(classId, supertype.superTypes)) {
                              return true;
                            }
                          }
                          return false;
                        };
                        
                        if (hasCircularInheritance(selectedClass.id, newSuperTypes)) {
                          alert('Circular inheritance detected! This would create an inheritance cycle.');
                          return;
                        }
                        
                        const success = metamodelService.updateMetaClass(
                          metamodel.id,
                          selectedClass.id,
                          {
                            superTypes: newSuperTypes
                          }
                        );
                        if (success) {
                          const updatedMetamodel = metamodelService.getMetamodelById(metamodel.id);
                          if (updatedMetamodel) {
                            setMetamodel(updatedMetamodel);
                            const updatedClass = updatedMetamodel.classes.find((cls: any) => cls.id === selectedClass.id);
                            if (updatedClass) {
                              setSelectedClass(updatedClass);
                            }
                          }
                        }
                      }
                    }}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(selected as string[]).map((value) => {
                          const supertype = metamodel?.classes.find(cls => cls.id === value);
                          return (
                            <Chip key={value} label={supertype?.name || value} size="small" />
                          );
                        })}
                      </Box>
                    )}
                  >
                    {metamodel?.classes
                      .filter(cls => cls.id !== selectedClass.id) // Can't inherit from self
                      .map(cls => (
                        <MenuItem key={cls.id} value={cls.id}>
                          {cls.name} {cls.abstract ? '(abstract)' : ''}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
                
                {/* Show inherited attributes */}
                {selectedClass.superTypes && selectedClass.superTypes.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Inherited Attributes:
                    </Typography>
                    {selectedClass.superTypes.map(supertypeId => {
                      const supertype = metamodel?.classes.find(cls => cls.id === supertypeId);
                      if (!supertype) return null;
                      
                      return (
                        <Box key={supertypeId} sx={{ ml: 1, mt: 0.5 }}>
                          <Typography variant="caption" color="primary">
                            From {supertype.name}:
                          </Typography>
                          {supertype.attributes.map(attr => (
                            <Typography key={attr.id} variant="caption" display="block" sx={{ ml: 1, color: 'text.secondary' }}>
                              • {attr.name}: {attr.type}
                            </Typography>
                          ))}
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Box>
              
              <Divider sx={{ my: 1 }} />
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle1">Own Attributes</Typography>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setIsAttributeDialogOpen(true)}
                >
                  Add
                </Button>
              </Box>
              
              <List dense>
                {selectedClass.attributes.map(attr => (
                  <ListItem
                    key={attr.id}
                    secondaryAction={
                      <>
                        <IconButton edge="end" onClick={() => handleEditAttribute(attr)} sx={{ mr: 1 }}>
                          <EditIcon />
                        </IconButton>
                        <IconButton edge="end" onClick={() => handleDeleteAttribute(attr.id)}>
                          <DeleteIcon />
                        </IconButton>
                      </>
                    }
                  >
                    <ListItemText
                      primary={attr.name}
                      secondary={`${attr.type}${attr.required ? ' (required)' : ''}`}
                    />
                  </ListItem>
                ))}
              </List>
              
              <Button
                variant="outlined"
                color="error"
                onClick={handleDeleteClass}
                sx={{ mt: 2 }}
                startIcon={<DeleteIcon />}
              >
                Delete Class
              </Button>
            </Box>
          ) : selectedInheritance ? (
            <Box sx={{ p: 2 }}>
              <Typography variant="h6">Inheritance Relationship</Typography>
              <Divider sx={{ my: 1 }} />
              
              <List dense>
                <ListItem>
                  <ListItemText 
                    primary="Child Class" 
                    secondary={selectedInheritance.childClass.name}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Parent Class" 
                    secondary={selectedInheritance.parentClass.name}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Relationship Type" 
                    secondary="Inheritance (extends)"
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Description" 
                    secondary={`${selectedInheritance.childClass.name} inherits all attributes and references from ${selectedInheritance.parentClass.name}`}
                  />
                </ListItem>
              </List>
              
              <Divider sx={{ my: 1 }} />
              
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Inherited Attributes:</Typography>
              {selectedInheritance.parentClass.attributes.length > 0 ? (
                <List dense>
                  {selectedInheritance.parentClass.attributes.map(attr => (
                    <ListItem key={attr.id}>
                      <ListItemText
                        primary={attr.name}
                        secondary={`${attr.type}${attr.required ? ' (required)' : ''}`}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No attributes to inherit
                </Typography>
              )}
              
              <Button
                variant="outlined"
                color="error"
                onClick={() => {
                  if (metamodel && selectedInheritance) {
                    // Remove the inheritance relationship
                    const updatedSuperTypes = selectedInheritance.childClass.superTypes?.filter(
                      st => st !== selectedInheritance.parentClass.id
                    ) || [];
                    
                    const success = metamodelService.updateMetaClass(
                      metamodel.id,
                      selectedInheritance.childClass.id,
                      { superTypes: updatedSuperTypes }
                    );
                    
                    if (success) {
                      const updatedMetamodel = metamodelService.getMetamodelById(metamodel.id);
                      if (updatedMetamodel) {
                        setMetamodel(updatedMetamodel);
                      }
                    }
                    
                    setSelectedInheritance(null);
                  }
                }}
                sx={{ mt: 2 }}
                startIcon={<DeleteIcon />}
              >
                Remove Inheritance
              </Button>
            </Box>
          ) : selectedReference ? (
            <Box sx={{ p: 2 }}>
              <Typography variant="h6">{selectedReference.reference.name}</Typography>
              <Divider sx={{ my: 1 }} />
              
              <List dense>
                <ListItem>
                  <ListItemText primary="Source" secondary={selectedReference.sourceClass.name} />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Target" 
                    secondary={metamodel.classes.find(cls => cls.id === selectedReference.reference.target)?.name || 'Unknown'} 
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Cardinality" 
                    secondary={`${selectedReference.reference.cardinality.lowerBound}..${selectedReference.reference.cardinality.upperBound}`} 
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Containment" 
                    secondary={selectedReference.reference.containment ? 'Yes' : 'No'} 
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Allow Self Reference" 
                    secondary={selectedReference.reference.allowSelfReference ? 'Yes' : 'No'} 
                  />
                </ListItem>
              </List>
              
              {/* Reference Attributes Section */}
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle1">Reference Attributes</Typography>
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => setIsReferenceAttributeDialogOpen(true)}
                  >
                    Add Attribute
                  </Button>
                </Box>
                
                <List dense>
                  {selectedReference.reference.attributes && selectedReference.reference.attributes.length > 0 ? (
                    selectedReference.reference.attributes.map(attr => (
                      <ListItem
                        key={attr.id}
                        secondaryAction={
                          <IconButton edge="end" onClick={() => {
                            // Delete reference attribute
                            if (metamodel && selectedReference) {
                              const success = metamodelService.deleteReferenceAttribute(
                                metamodel.id,
                                selectedReference.sourceClass.id,
                                selectedReference.reference.id,
                                attr.id
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
                            }
                          }}>
                            <DeleteIcon />
                          </IconButton>
                        }
                      >
                        <ListItemText
                          primary={attr.name}
                          secondary={`${attr.type}${attr.required ? ' (required)' : ''}`}
                        />
                      </ListItem>
                    ))
                  ) : (
                    <ListItem>
                      <ListItemText secondary="No attributes defined" />
                    </ListItem>
                  )}
                </List>
              </Box>
              
              <Button
                variant="outlined"
                color="error"
                onClick={handleDeleteReference}
                sx={{ mt: 2 }}
                startIcon={<DeleteIcon />}
              >
                Delete Reference
              </Button>
            </Box>
          ) : (
            <Box sx={{ p: 2 }}>
              <Typography color="textSecondary">
                Select a class or reference to view and edit its properties.
              </Typography>
            </Box>
          )}
        </TabPanel>
        
        <TabPanel value={tabValue} index={1}>
          {selectedClass ? (
            <ConstraintTypeSelector 
              metamodelId={metamodel.id}
              metaClass={selectedClass}
              metamodel={metamodel}
              highlightedConstraints={highlightedConstraints}
              isConstraintHighlighted={(constraintName) => isConstraintHighlighted(selectedClass.name, constraintName)}
              highlightColor={getHighlightColor()}
              onUpdateMetamodel={() => {
                // Reload the metamodel when constraints change
                const updatedMetamodel = metamodelService.getMetamodelById(metamodelId);
                if (updatedMetamodel) {
                  setMetamodel(updatedMetamodel);
                  
                  // Update selected class reference if needed
                  if (selectedClass) {
                    const updatedClass = updatedMetamodel.classes.find(c => c.id === selectedClass.id);
                    if (updatedClass) {
                      setSelectedClass(updatedClass);
                    }
                  }
                }
              }}
            />
          ) : (
            <Box sx={{ p: 2 }}>
              <Typography color="textSecondary">
                Select a class to manage its constraints.
              </Typography>
            </Box>
          )}
        </TabPanel>
      </Drawer>
      
      {/* Dialogs */}
      {renderClassDialog()}
      {renderAttributeDialog()}
      {renderReferenceDialog()}
      {renderReferenceAttributeDialog()}
      {renderEditAttributeDialog()}
    </Box>
  );
};

export default VisualMetamodelEditor; 