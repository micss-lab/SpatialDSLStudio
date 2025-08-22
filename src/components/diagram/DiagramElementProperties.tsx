import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Button,
  Tooltip,
  ListItemText
} from '@mui/material';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import LinkIcon from '@mui/icons-material/Link';
import { DiagramElement, Metamodel, MetaClass, MetaAttribute, Model } from '../../models/types';
import { modelService } from '../../services/model.service';
import { diagramService } from '../../services/diagram.service';
import ElementAppearanceSelector from './ElementAppearanceSelector';

interface DiagramElementPropertiesProps {
  element: DiagramElement;
  metamodel: Metamodel;
  onChange: (propertyName: string, value: any) => void;
  diagramId?: string;
  is3D?: boolean;
}

const DiagramElementProperties: React.FC<DiagramElementPropertiesProps> = ({
  element,
  metamodel,
  onChange,
  diagramId,
  is3D = false
}) => {
  const [model, setModel] = useState<Model | null>(null);
  const [modelElements, setModelElements] = useState<any[]>([]);

  // Find the meta class for this element, handling edges specially
  let metaClass = metamodel.classes.find(c => c.id === element.modelElementId);

  // For edges, we need special handling as they use reference IDs as modelElementId
  if (!metaClass && element.type === 'edge') {
    // Look for the reference in all metaclasses
    for (const cls of metamodel.classes) {
      const reference = cls.references.find(ref => ref.id === element.modelElementId);
      if (reference) {
        // Create a virtual metaclass for this reference
        metaClass = {
          id: reference.id,
          name: reference.name,
          eClass: 'metareference',
          abstract: false,
          superTypes: [],
          attributes: reference.attributes || [],
          references: []
        };
        break;
      }
    }
  }

  // Load the model and available model elements when the component mounts
  useEffect(() => {
    // Instead of getting all models that conform to this metamodel,
    // we should get the specific model for this diagram
    if (diagramId) {
      const diagram = diagramService.getDiagramById(diagramId);
      if (diagram) {
        const modelData = modelService.getModelById(diagram.modelId);
        if (modelData) {
          setModel(modelData);
          
          // Get model elements that are instances of the current metaClass
          if (metaClass) {
            const compatibleElements = modelData.elements.filter(e => {
              return e.modelElementId === metaClass?.id;
            });
            setModelElements(compatibleElements);
          }
        }
      }
    } else {
      // Fallback to the old behavior if no diagramId is provided
    const models = modelService.getAllModels().filter(m => m.conformsTo === metamodel.id);
    
    if (models.length > 0) {
      // For simplicity, just use the first model
      const firstModel = models[0];
      setModel(firstModel);
      
      // Get model elements that are instances of the current metaClass
      if (metaClass) {
          const compatibleElements = firstModel.elements.filter(e => e.modelElementId === metaClass?.id);
        setModelElements(compatibleElements);
      }
    }
    }
  }, [diagramId, metamodel.id, metaClass]);
  
  if (!metaClass) {
    return (
      <Typography color="error">
        Error: Could not find metaclass for this element
      </Typography>
    );
  }

  const handleTextFieldChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    attributeName: string
  ) => {
    onChange(attributeName, event.target.value);
  };

  const handleSelectChange = (
    event: SelectChangeEvent<string | number | boolean>,
    attributeName: string,
    attributeType: string
  ) => {
    let value = event.target.value;
    
    // Convert value based on attribute type
    if (attributeType === 'number') {
      value = Number(value);
    } else if (attributeType === 'boolean') {
      value = value === 'true';
    }
    
    onChange(attributeName, value);
  };

  // Function to handle model element selection
  const handleModelElementChange = (event: SelectChangeEvent<string>) => {
    const linkedModelElementId = event.target.value;
    
    // Store the linked model element ID in the style object
    onChange('linkedModelElementId', linkedModelElementId);
    
    // If we have a diagram ID, directly update the diagram element
    if (diagramId) {
      // Get the linked model element to access its name and appearance
      if (model && linkedModelElementId) {
        const linkedElement = model.elements.find(e => e.id === linkedModelElementId);
        if (linkedElement) {
          console.log("Linking to model element:", linkedElement.style.name);
          
          // Create the updated style object
          const updatedStyle = {
            ...element.style,
            linkedModelElementId,
            // Also update the diagram element's own name to match the model element
            name: linkedElement.style.name || element.style.name
          };
          
          // Update the element directly through diagram service
          diagramService.updateElement(diagramId, element.id, {
            style: updatedStyle
          });
          
          // Force update the name field in the input as well
          const nameField = document.querySelector(`input[label="Name (In Diagram)"]`) as HTMLInputElement;
          if (nameField && linkedElement.style.name) {
            nameField.value = linkedElement.style.name;
          }
          
          // Force page refresh to ensure changes are visible
          setTimeout(() => {
            window.dispatchEvent(new Event('storage'));
          }, 100);
        }
      } else if (linkedModelElementId === '') {
        // If unlinking, just update through diagram service
        diagramService.updateElement(diagramId, element.id, {
          style: {
            ...element.style,
            linkedModelElementId: ''
          }
        });
      }
    }
  };

  // Function to apply default values for all attributes
  const applyDefaultValues = () => {
    if (!metaClass) return;
    
    // Process each attribute that has a default value
    metaClass.attributes.forEach(attribute => {
      // Only apply default if it's defined
      if (attribute.defaultValue !== undefined) {
        // Convert value based on type if needed
        let value = attribute.defaultValue;
        
        // Apply the default value
        onChange(attribute.name, value);
      }
    });
  };

  // Function to render properties from the linked model element
  const renderLinkedModelProperties = () => {
    if (!model || !element.style.linkedModelElementId) {
      return (
        <Typography variant="caption" color="textSecondary">
          No linked model element selected
        </Typography>
      );
    }

    // Find the linked model element
    const linkedElement = model.elements.find(e => e.id === element.style.linkedModelElementId);
    if (!linkedElement) {
      return (
        <Typography variant="caption" color="error">
          Linked model element not found
        </Typography>
      );
    }

    // Get all attributes from the linked element
    const attributeEntries = Object.entries(linkedElement.style);
    if (attributeEntries.length === 0) {
      return (
        <Typography variant="caption" color="textSecondary">
          No attributes in linked model element
        </Typography>
      );
    }

    // Filter out position-related attributes
    const filteredAttributes = attributeEntries.filter(([attrName]) => {
      // Skip position-related attributes
      const positionAttrs = ['position', 'x', 'y', 'width', 'height'];
      return !positionAttrs.includes(attrName);
    });

    if (filteredAttributes.length === 0) {
      return (
        <Typography variant="caption" color="textSecondary">
          No relevant attributes in linked model element
        </Typography>
      );
    }

    return (
      <Box sx={{ bgcolor: '#f5f5f5', p: 1, borderRadius: 1 }}>
        {filteredAttributes.map(([attrName, attrValue]) => (
          <Box key={attrName} sx={{ mb: 1 }}>
            <Typography variant="caption" fontWeight="bold" display="inline">
              {attrName}:
            </Typography>
            <Typography variant="caption" sx={{ ml: 1 }} display="inline">
              {attrValue !== null && attrValue !== undefined ? attrValue.toString() : 'null'}
            </Typography>
          </Box>
        ))}
      </Box>
    );
  };

  // Render an appropriate input field based on attribute type
  const renderAttributeField = (attribute: MetaAttribute) => {
    const value = element.style[attribute.name] !== undefined 
      ? element.style[attribute.name] 
      : attribute.defaultValue !== undefined 
        ? attribute.defaultValue 
        : '';
    
    switch (attribute.type) {
      case 'string':
        return (
          <TextField
            key={attribute.id}
            label={attribute.name}
            value={value || ''}
            onChange={(e) => handleTextFieldChange(e, attribute.name)}
            fullWidth
            margin="dense"
            size="small"
          />
        );
      
      case 'number':
        return (
          <TextField
            key={attribute.id}
            label={attribute.name}
            value={value || ''}
            onChange={(e) => handleTextFieldChange(e, attribute.name)}
            type="number"
            fullWidth
            margin="dense"
            size="small"
          />
        );
      
      case 'boolean':
        return (
          <FormControl key={attribute.id} fullWidth margin="dense" size="small">
            <InputLabel id={`${attribute.id}-label`}>{attribute.name}</InputLabel>
            <Select
              labelId={`${attribute.id}-label`}
              value={value !== undefined ? String(value) : ''}
              label={attribute.name}
              onChange={(e) => handleSelectChange(e, attribute.name, attribute.type)}
            >
              <MenuItem value="true">True</MenuItem>
              <MenuItem value="false">False</MenuItem>
            </Select>
          </FormControl>
        );
      
      case 'date':
        return (
          <TextField
            key={attribute.id}
            label={attribute.name}
            value={value || ''}
            onChange={(e) => handleTextFieldChange(e, attribute.name)}
            type="date"
            fullWidth
            margin="dense"
            size="small"
            InputLabelProps={{ shrink: true }}
          />
        );
      
      default:
        return (
          <TextField
            key={attribute.id}
            label={attribute.name}
            value={value || ''}
            onChange={(e) => handleTextFieldChange(e, attribute.name)}
            fullWidth
            margin="dense"
            size="small"
          />
        );
    }
  };

  // Special case for edge elements
  if (element.type === 'edge') {
    // Get the source and target elements from the model
    let sourceMetaClass: MetaClass | null = null;
    let targetMetaClass: MetaClass | null = null;
    let availableReferences = [] as any[];
    let currentReference = null as any;
    
    if (model) {
      // Find the diagram nodes connected by this edge
      const sourceElement = element.sourceId ? 
        diagramService.getElementById(diagramId || "", element.sourceId) : null;
      const targetElement = element.targetId ? 
        diagramService.getElementById(diagramId || "", element.targetId) : null;
      
      // Find their linked model elements
      const sourceLinkedId = sourceElement?.style?.linkedModelElementId;
      const targetLinkedId = targetElement?.style?.linkedModelElementId;
      
      // Get their metaclasses
      if (sourceElement) {
        sourceMetaClass = metamodel.classes.find(c => c.id === sourceElement.modelElementId) || null;
      }
      
      if (targetElement) {
        targetMetaClass = metamodel.classes.find(c => c.id === targetElement.modelElementId) || null;
      }
      
      if (sourceMetaClass) {
        // Find the current reference being used
        currentReference = sourceMetaClass.references.find(r => r.id === element.modelElementId);
        
        // Get all references from the source metaclass
        availableReferences = sourceMetaClass.references;
        
        // If we also know the target, filter to only valid refs between them
        if (targetMetaClass) {
          const targetId = targetMetaClass.id;
          availableReferences = availableReferences.filter(ref => 
            ref.target === targetId
          );
        }
      }
    }
    
    return (
      <Box>
        <Typography variant="subtitle1" gutterBottom>Edge Properties</Typography>
        
        <TextField
          label="Name"
          value={element.style.name || ''}
          onChange={(e) => handleTextFieldChange(e, 'name')}
          fullWidth
          margin="dense"
          size="small"
        />
        
        {/* Reference Type Selector */}
        <Box sx={{ my: 2 }}>
          <FormControl fullWidth margin="dense" size="small">
            <InputLabel id="reference-type-label">Reference Type</InputLabel>
            <Select
              labelId="reference-type-label"
              value={element.style.referenceType || element.modelElementId || ''}
              label="Reference Type"
              onChange={(e) => onChange('referenceType', e.target.value)}
            >
              <MenuItem value="">
                <em>Default (Use Element Type)</em>
              </MenuItem>
              {availableReferences.map((ref) => (
                <MenuItem key={ref.id} value={ref.id}>
                  <Tooltip title={`ID: ${ref.id}`} placement="right">
                    <ListItemText 
                      primary={ref.name}
                      secondary={`Target: ${
                        metamodel.classes.find(c => c.id === ref.target)?.name || ref.target
                      }`}
                    />
                  </Tooltip>
                </MenuItem>
              ))}
              {/* Always include default types */}
              <MenuItem value="relationship-source">
                <ListItemText primary="source" secondary="Default source relationship" />
              </MenuItem>
              <MenuItem value="relationship-target">
                <ListItemText primary="target" secondary="Default target relationship" />
              </MenuItem>
            </Select>
          </FormControl>
          <Typography variant="caption" color="textSecondary">
            Specifies the type of relationship this edge represents
          </Typography>
        </Box>
        
        {/* Display reference attributes if applicable */}
        {currentReference && currentReference.attributes && currentReference.attributes.length > 0 && (
          <Box sx={{ my: 2 }}>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2">Reference Attributes</Typography>
            {currentReference.attributes.map((attr: any) => (
              <TextField
                key={attr.id || attr.name}
                label={attr.name}
                value={(element.referenceAttributes && element.referenceAttributes[attr.name]) || ''}
                onChange={(e) => {
                  const newValue = e.target.value;
                  // Update the reference attributes
                  const updatedAttrs = {
                    ...(element.referenceAttributes || {}),
                    [attr.name]: newValue
                  };
                  
                  // Call the onChange for the entire referenceAttributes object
                  onChange('referenceAttributes', updatedAttrs);
                }}
                fullWidth
                margin="dense"
                size="small"
              />
            ))}
          </Box>
        )}
        
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="textSecondary">
            Source: {element.sourceId}
          </Typography>
          <br />
          <Typography variant="caption" color="textSecondary">
            Target: {element.targetId}
          </Typography>
        </Box>
      </Box>
    );
  }

  const getDisplayName = () => {
    if (element.style.linkedModelElementId && model) {
      const linkedElement = model?.elements.find(e => e.id === element.style.linkedModelElementId);
      if (linkedElement && linkedElement.style.name) {
        return linkedElement.style.name;
      }
    }
    return element.style.name || 'Unnamed';
  };

  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom>
        {metaClass.name} Properties
      </Typography>
      
      <Box sx={{ mb: 2 }}>
        <TextField
          label="Name (In Diagram)"
          value={getDisplayName()}
          onChange={(e) => handleTextFieldChange(e, 'name')}
          fullWidth
          margin="dense"
          size="small"
          helperText="This name is used only in this diagram"
          disabled={!!element.style.linkedModelElementId}
        />
        {element.style.linkedModelElementId && (
          <Typography variant="caption" color="primary">
            This name is controlled by the linked model element
          </Typography>
        )}
      </Box>
      
      {/* Model Element Selector */}
      <Box sx={{ mb: 2 }}>
        <FormControl fullWidth margin="dense" size="small">
          <InputLabel id="model-element-label">
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <LinkIcon fontSize="small" sx={{ mr: 0.5 }} />
              Link to Model Element
            </Box>
          </InputLabel>
          <Select
            labelId="model-element-label"
            value={element.style.linkedModelElementId || ''}
            label="Link to Model Element"
            onChange={handleModelElementChange}
          >
            <MenuItem value="">
              <em>None (No link)</em>
            </MenuItem>
            {modelElements.map((modelElement) => {
              // Find a descriptive attribute to show in addition to name
              let secondaryText = `ID: ${modelElement.id.substring(0, 8)}...`;
              
              // Try to find a significant attribute to display
              const significantAttributes = ['nodeId', 'id', 'identifier', 'code', 'key'];
              for (const attrName of significantAttributes) {
                if (modelElement.style[attrName]) {
                  secondaryText = `${attrName}: ${modelElement.style[attrName]}`;
                  break;
                }
              }
              
              return (
              <MenuItem key={modelElement.id} value={modelElement.id}>
                  <Tooltip title={`Full ID: ${modelElement.id}`} placement="right">
                  <ListItemText 
                      primary={modelElement.style.name || `${metaClass?.name || 'Unknown'} (unnamed)`}
                      secondary={secondaryText}
                  />
                </Tooltip>
              </MenuItem>
              );
            })}
          </Select>
        </FormControl>
        <Typography variant="caption" color="textSecondary">
          Links this diagram element to a model element. The name from the model will be displayed in the diagram.
        </Typography>
      </Box>
      
      {/* Add Element Appearance Selector */}
      {element.type === 'node' && (
        <ElementAppearanceSelector element={element} onChange={onChange} />
      )}
      
      {/* Model Properties Section (read-only) */}
      {element.style.linkedModelElementId && (
        <Box sx={{ mb: 2 }}>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" gutterBottom>
            Model Properties (Read-only)
          </Typography>
          
          {renderLinkedModelProperties()}
        </Box>
      )}
      
      {/* Only show Diagram Attributes section if not in 3D mode */}
      {!is3D && (
        <>
          <Divider sx={{ my: 2 }} />
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle2">
              Diagram Attributes
            </Typography>
            
            <Button
              variant="outlined"
              size="small"
              startIcon={<SettingsBackupRestoreIcon />}
              onClick={applyDefaultValues}
            >
              Apply Default Values
            </Button>
          </Box>
          
          {metaClass.attributes.map(attribute => renderAttributeField(attribute))}
          
          {metaClass.attributes.length === 0 && (
            <Typography variant="caption" color="textSecondary">
              No attributes defined for this class.
            </Typography>
          )}
        </>
      )}
      
      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="textSecondary">
          Position: x={element.x}, y={element.y}
        </Typography>
        <br />
        <Typography variant="caption" color="textSecondary">
          Size: width={element.width}, height={element.height}
        </Typography>
      </Box>
    </Box>
  );
};

export default DiagramElementProperties; 