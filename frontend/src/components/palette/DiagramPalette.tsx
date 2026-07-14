import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Divider,
  Tooltip,
  Button
} from '@mui/material';
import ShapeLineIcon from '@mui/icons-material/ShapeLine';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import TuneIcon from '@mui/icons-material/Tune';
import { useNavigate } from 'react-router-dom';
import { Diagram, MetaClass, Metamodel, Model, ModelElement, RepresentationDescription } from '../../models/types';
import { viewpointService } from '../../services/viewpoint.service';

export type DiagramPaletteDragItem =
  | { kind: 'existing-model-element'; modelElement: ModelElement }
  | { kind: 'new-metaclass'; metaClass: MetaClass };

interface DiagramPaletteProps {
  metamodel: Metamodel;
  model: Model;
  diagram: Diagram;
  onDragStart: (item: DiagramPaletteDragItem) => void;
  onAddAll: () => void;
}

const DiagramPalette: React.FC<DiagramPaletteProps> = ({
  metamodel,
  model,
  diagram,
  onDragStart,
  onAddAll
}) => {
  const navigate = useNavigate();
  const includedElementIds = new Set(
    diagram.elements
      .filter(element => element.type === 'node')
      .map(element => element.id)
  );
  const { representationDescription } = viewpointService.resolveRepresentationDescription(diagram);
  const visibleMetaClassIds = new Set(representationDescription?.visibleMetaClassIds || []);
  const creatableMetaClassIds = new Set(representationDescription?.creatableMetaClassIds || []);
  const isVisible = (metaClassId: string) => visibleMetaClassIds.size === 0 || visibleMetaClassIds.has(metaClassId);
  const isCreatable = (metaClass: MetaClass) => (
    !metaClass.abstract && (creatableMetaClassIds.size === 0 || creatableMetaClassIds.has(metaClass.id))
  );
  const isMetaClassCompatible = (
    metaClassId: string,
    allowedMetaClassIds: string[] | undefined
  ): boolean => {
    if (!allowedMetaClassIds?.length) return true;
    if (allowedMetaClassIds.includes(metaClassId)) return true;

    const visited = new Set<string>();
    const visit = (candidateId: string): boolean => {
      if (visited.has(candidateId)) return false;
      visited.add(candidateId);

      const metaClass = metamodel.classes.find(cls => cls.id === candidateId);
      if (!metaClass) return false;

      return (metaClass.superTypes || []).some(superTypeId => (
        allowedMetaClassIds.includes(superTypeId) || visit(superTypeId)
      ));
    };

    return visit(metaClassId);
  };
  const isMappedPinMetaClass = (
    metaClassId: string,
    representation?: RepresentationDescription
  ): boolean => {
    return (representation?.pinMappings || []).some(mapping => (
      isMetaClassCompatible(metaClassId, mapping.pinMetaClassIds)
    ));
  };
  const remainingModelElements = model.elements.filter(element => !includedElementIds.has(element.id) && isVisible(element.modelElementId));
  const creatableMetaClasses = metamodel.classes.filter(metaClass => (
    isCreatable(metaClass) && !isMappedPinMetaClass(metaClass.id, representationDescription)
  ));
  const hiddenElementCount = model.elements.filter(
    element => !includedElementIds.has(element.id) && !isVisible(element.modelElementId)
  ).length;
  const isTypeFiltered = visibleMetaClassIds.size > 0 || creatableMetaClassIds.size > 0;
  const descriptionName = representationDescription?.name;
  const getMetaClassName = (modelElement: ModelElement) => {
    return metamodel.classes.find(cls => cls.id === modelElement.modelElementId)?.name || modelElement.modelElementId;
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, modelElement: ModelElement) => {
    console.log('Drag start event triggered:', { modelElement });
    
    // Try to set the drag data
    try {
      e.dataTransfer.setData('application/json', JSON.stringify({ 
        kind: 'existing-model-element',
        id: modelElement.id,
        name: modelElement.style?.name || modelElement.name || getMetaClassName(modelElement)
      }));
      e.dataTransfer.effectAllowed = 'copy';
    } catch (error) {
      console.error('Error setting drag data:', error);
    }
    
    // Notify parent component
    onDragStart({ kind: 'existing-model-element', modelElement });
  };

  const handleMetaClassDragStart = (e: React.DragEvent<HTMLDivElement>, metaClass: MetaClass) => {
    try {
      e.dataTransfer.setData('application/json', JSON.stringify({
        kind: 'new-metaclass',
        metaClassId: metaClass.id,
        name: metaClass.name,
      }));
      e.dataTransfer.effectAllowed = 'copy';
    } catch (error) {
      console.error('Error setting drag data:', error);
    }

    onDragStart({ kind: 'new-metaclass', metaClass });
  };

  return (
    <Paper
      elevation={3}
      sx={{
        width: 250,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto'
      }}
    >
      <Box sx={{ p: 2, borderBottom: '1px solid #eee' }}>
        <Typography variant="h6">View Palette</Typography>
        <Typography variant="caption" color="textSecondary">
          Add existing model elements or create new instances
        </Typography>
      </Box>

      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          Existing model elements
        </Typography>
        
        <Divider sx={{ my: 1 }} />

        <Button
          variant="outlined"
          size="small"
          startIcon={<PlaylistAddIcon />}
          onClick={onAddAll}
          disabled={remainingModelElements.length === 0}
          fullWidth
          sx={{ mb: 2 }}
        >
          Add all
        </Button>
        
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {remainingModelElements
            .map((modelElement) => (
            <Tooltip
              key={modelElement.id}
              title={`Type: ${getMetaClassName(modelElement)}`}
              placement="right"
            >
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, modelElement)}
                style={{
                  border: '1px solid #e0e0e0',
                  borderRadius: '4px',
                  marginBottom: '8px',
                  cursor: 'pointer',
                  padding: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#f5f5f5'
                }}
              >
                <Box sx={{ minWidth: 36, display: 'flex', alignItems: 'center' }}>
                  <ShapeLineIcon color="primary" />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" noWrap>
                    {modelElement.style?.name || modelElement.name || 'Unnamed'}
                  </Typography>
                  <Typography variant="caption" color="textSecondary" noWrap>
                    {getMetaClassName(modelElement)}
                  </Typography>
                </Box>
              </div>
            </Tooltip>
          ))}
        </Box>
        
        {remainingModelElements.length === 0 && (
          <Typography variant="body2" color="textSecondary" align="center" sx={{ py: 2 }}>
            {hiddenElementCount > 0
              ? `All elements this view can show are already included. ${hiddenElementCount} other model element${hiddenElementCount === 1 ? ' is' : 's are'} hidden because ${descriptionName ? `the "${descriptionName}" view description` : "this view's description"} does not list ${hiddenElementCount === 1 ? 'its type' : 'their types'} as visible.`
              : 'All model elements are already included in this view.'}
          </Typography>
        )}

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle1" gutterBottom>
          Create new instance
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {creatableMetaClasses.map((metaClass) => (
            <Tooltip
              key={metaClass.id}
              title={`Create ${metaClass.name}`}
              placement="right"
            >
              <div
                draggable
                onDragStart={(e) => handleMetaClassDragStart(e, metaClass)}
                style={{
                  border: '1px dashed #90caf9',
                  borderRadius: '4px',
                  marginBottom: '8px',
                  cursor: 'copy',
                  padding: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#f7fbff'
                }}
              >
                <Box sx={{ minWidth: 36, display: 'flex', alignItems: 'center' }}>
                  <AddCircleOutlineIcon color="primary" />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" noWrap>
                    {metaClass.name}
                  </Typography>
                </Box>
              </div>
            </Tooltip>
          ))}
        </Box>

        {creatableMetaClasses.length === 0 && (
          <Typography variant="body2" color="textSecondary" align="center" sx={{ py: 2 }}>
            No concrete metaclasses are available.
          </Typography>
        )}

        {isTypeFiltered && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="caption" color="textSecondary" component="p" sx={{ mb: 1 }}>
              {descriptionName
                ? `This view only shows and creates the types allowed by its "${descriptionName}" description.`
                : 'This view only shows and creates the types allowed by its view description.'}
              {' '}To allow more types, edit the description and tick them as Visible or Creatable.
            </Typography>
            <Button
              variant="text"
              size="small"
              startIcon={<TuneIcon />}
              onClick={() => navigate(`/metamodels/${metamodel.id}/viewpoints`)}
              fullWidth
            >
              Manage view types
            </Button>
          </>
        )}
      </Box>
      
      <Box sx={{ p: 2, mt: 'auto', borderTop: '1px solid #eee' }}>
        <Typography variant="caption" color="textSecondary">
          {model.name}
        </Typography>
      </Box>
    </Paper>
  );
};

export default DiagramPalette;
