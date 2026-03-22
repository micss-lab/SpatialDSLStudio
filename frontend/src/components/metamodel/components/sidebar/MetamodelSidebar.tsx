import React from 'react';
import {
  Drawer,
  Box,
  Tabs,
  Tab,
  Typography,
  FormControlLabel,
  Checkbox,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Button
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ConstraintTypeSelector from '../../ConstraintTypeSelector';
import { metamodelService } from '../../../../services/metamodel';
import { MetaClass, Metamodel } from '../../../../models/types';

// Tab Panel component for displaying tab content
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

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

interface SelectedInheritance {
  childClass: MetaClass;
  parentClass: MetaClass;
  childConnectionX: number;
  childConnectionY: number;
  parentConnectionX: number;
  parentConnectionY: number;
}

interface SelectedReference {
  sourceClass: MetaClass;
  reference: any;
}

interface MetamodelSidebarProps {
  metamodel: Metamodel;
  tabValue: number;
  selectedClass: MetaClass | null;
  selectedInheritance: SelectedInheritance | null;
  selectedReference: SelectedReference | null;
  highlightedConstraints: Set<string>;
  readOnly: boolean;
  onChangeTab: (event: React.SyntheticEvent, newValue: number) => void;
  onUpdateMetamodel: (updatedMetamodel: Metamodel) => void;
  onUpdateSelectedClass: (updatedClass: MetaClass | null) => void;
  onUpdateSelectedReference: (updatedReference: SelectedReference | null) => void;
  onUpdateSelectedInheritance: (updatedInheritance: SelectedInheritance | null) => void;
  onAddAttribute: () => void;
  onEditAttribute: (attr: any) => void;
  onDeleteAttribute: (attrId: string) => void;
  onDeleteClass: () => void;
  onDeleteReference: () => void;
  onAddReferenceAttribute: () => void;
  isConstraintHighlighted: (className: string, constraintName: string) => boolean;
  getHighlightColor: () => string;
}

export const MetamodelSidebar: React.FC<MetamodelSidebarProps> = ({
  metamodel,
  tabValue,
  selectedClass,
  selectedInheritance,
  selectedReference,
  highlightedConstraints,
  readOnly,
  onChangeTab,
  onUpdateMetamodel,
  onUpdateSelectedClass,
  onUpdateSelectedReference,
  onUpdateSelectedInheritance,
  onAddAttribute,
  onEditAttribute,
  onDeleteAttribute,
  onDeleteClass,
  onDeleteReference,
  onAddReferenceAttribute,
  isConstraintHighlighted,
  getHighlightColor
}) => {
  return (
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
          onChange={onChangeTab}
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
                          onUpdateMetamodel(updatedMetamodel);
                          
                          // Update selected class reference
                          const updatedClass = updatedMetamodel.classes.find((c: MetaClass) => c.id === selectedClass.id);
                          if (updatedClass) {
                            onUpdateSelectedClass(updatedClass);
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
                          const supertype = metamodel.classes.find((cls: MetaClass) => cls.id === supertypeId);
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
                          onUpdateMetamodel(updatedMetamodel);
                          const updatedClass = updatedMetamodel.classes.find((cls: MetaClass) => cls.id === selectedClass.id);
                          if (updatedClass) {
                            onUpdateSelectedClass(updatedClass);
                          }
                        }
                      }
                    }
                  }}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(selected as string[]).map((value: string) => {
                        const supertype = metamodel?.classes.find((cls: MetaClass) => cls.id === value);
                        return (
                          <Chip key={value} label={supertype?.name || value} size="small" />
                        );
                      })}
                    </Box>
                  )}
                >
                  {metamodel?.classes
                    .filter((cls: MetaClass) => cls.id !== selectedClass.id) // Can't inherit from self
                    .map((cls: MetaClass) => (
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
                  {selectedClass.superTypes.map((supertypeId: string) => {
                    const supertype = metamodel?.classes.find((cls: MetaClass) => cls.id === supertypeId);
                    if (!supertype) return null;
                    
                    return (
                      <Box key={supertypeId} sx={{ ml: 1, mt: 0.5 }}>
                        <Typography variant="caption" color="primary">
                          From {supertype.name}:
                        </Typography>
                        {supertype.attributes.map((attr: any) => (
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
                onClick={onAddAttribute}
                disabled={readOnly}
              >
                Add
              </Button>
            </Box>
            
            <List dense>
              {selectedClass.attributes.map((attr: any) => (
                <ListItem
                  key={attr.id}
                  secondaryAction={
                    !readOnly && (
                      <>
                        <IconButton edge="end" onClick={() => onEditAttribute(attr)} sx={{ mr: 1 }}>
                          <EditIcon />
                        </IconButton>
                        <IconButton edge="end" onClick={() => onDeleteAttribute(attr.id)}>
                          <DeleteIcon />
                        </IconButton>
                      </>
                    )
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
              onClick={onDeleteClass}
              sx={{ mt: 2 }}
              startIcon={<DeleteIcon />}
              disabled={readOnly}
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
                {selectedInheritance.parentClass.attributes.map((attr: any) => (
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
              disabled={readOnly}
              onClick={() => {
                if (metamodel && selectedInheritance) {
                  // Remove the inheritance relationship
                  const updatedSuperTypes = selectedInheritance.childClass.superTypes?.filter(
                    (st: string) => st !== selectedInheritance.parentClass.id
                  ) || [];
                  
                  const success = metamodelService.updateMetaClass(
                    metamodel.id,
                    selectedInheritance.childClass.id,
                    { superTypes: updatedSuperTypes }
                  );
                  
                  if (success) {
                    const updatedMetamodel = metamodelService.getMetamodelById(metamodel.id);
                    if (updatedMetamodel) {
                      onUpdateMetamodel(updatedMetamodel);
                    }
                  }
                  
                  onUpdateSelectedInheritance(null);
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
                  secondary={metamodel.classes.find((cls: MetaClass) => cls.id === selectedReference.reference.target)?.name || 'Unknown'} 
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
                  onClick={onAddReferenceAttribute}
                  disabled={readOnly}
                >
                  Add Attribute
                </Button>
              </Box>
              
              <List dense>
                {selectedReference.reference.attributes && selectedReference.reference.attributes.length > 0 ? (
                  selectedReference.reference.attributes.map((attr: any) => (
                    <ListItem
                      key={attr.id}
                      secondaryAction={
                        !readOnly && (
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
                                  onUpdateMetamodel(updatedMetamodel);
                                  
                                  // Update selected reference
                                  const updatedSourceClass = updatedMetamodel.classes.find((c: MetaClass) => c.id === selectedReference.sourceClass.id);
                                  if (updatedSourceClass) {
                                    const updatedReference = updatedSourceClass.references.find((r: any) => r.id === selectedReference.reference.id);
                                    if (updatedReference) {
                                      onUpdateSelectedReference({
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
                        )
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
              onClick={onDeleteReference}
              sx={{ mt: 2 }}
              startIcon={<DeleteIcon />}
              disabled={readOnly}
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
            isConstraintHighlighted={(constraintName: string) => isConstraintHighlighted(selectedClass.name, constraintName)}
            highlightColor={getHighlightColor()}
            readOnly={readOnly}
            onUpdateMetamodel={() => {
              // Reload the metamodel when constraints change
              const updatedMetamodel = metamodelService.getMetamodelById(metamodel.id);
              if (updatedMetamodel) {
                onUpdateMetamodel(updatedMetamodel);
                
                // Update selected class reference if needed
                if (selectedClass) {
                  const updatedClass = updatedMetamodel.classes.find((c: MetaClass) => c.id === selectedClass.id);
                  if (updatedClass) {
                    onUpdateSelectedClass(updatedClass);
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
  );
};

export default MetamodelSidebar;
