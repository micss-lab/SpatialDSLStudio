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
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LinkIcon from '@mui/icons-material/Link';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import TuneIcon from '@mui/icons-material/Tune';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../../contexts/ProjectContext';
import {
  Diagram,
  MetaClass,
  Metamodel,
  Model,
  ModelElement,
  RepresentationDescription,
  ToolDefinition,
} from '../../models/types';
import { viewpointService } from '../../services/viewpoint.service';
import { getExecutableToolType } from '../../services/diagram/tool-definition.utils';

export type DiagramPaletteDragItem =
  | { kind: 'existing-model-element'; modelElement: ModelElement }
  | { kind: 'new-metaclass'; metaClass: MetaClass; tool?: ToolDefinition };

interface DiagramPaletteProps {
  metamodel: Metamodel;
  model: Model;
  diagram: Diagram;
  onDragStart: (item: DiagramPaletteDragItem) => void;
  onAddAll: () => void;
  onToolActivate?: (tool: ToolDefinition) => void;
  activeToolId?: string;
}

const DiagramPalette: React.FC<DiagramPaletteProps> = ({
  metamodel,
  model,
  diagram,
  onDragStart,
  onAddAll,
  onToolActivate,
  activeToolId,
}) => {
  const navigate = useNavigate();
  const { project } = useProject();
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
  const toolDefinitions = representationDescription?.toolDefinitions || [];
  const creationTools = toolDefinitions.filter(tool => {
    const type = getExecutableToolType(tool);
    return type === 'create-node' || type === 'create-edge';
  });
  const interactionTools = toolDefinitions.filter(tool => {
    const type = getExecutableToolType(tool);
    return type === 'delete' || type === 'reconnect';
  });
  const hasAuthoredCreationTools = creationTools.length > 0;
  const getToolMetaClass = (tool: ToolDefinition): MetaClass | undefined => (
    metamodel.classes.find(metaClass => metaClass.id === tool.metaClassId)
  );
  const getToolReferenceLabel = (tool: ToolDefinition): string => {
    for (const sourceClass of metamodel.classes) {
      const reference = (sourceClass.references || []).find(candidate => (
        candidate.id === tool.referenceId || candidate.name === tool.referenceId
      ));
      if (reference) return `${sourceClass.name}.${reference.name}`;
    }
    return 'Reference not configured';
  };
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

  const handleMetaClassDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    metaClass: MetaClass,
    tool?: ToolDefinition
  ) => {
    try {
      e.dataTransfer.setData('application/json', JSON.stringify({
        kind: 'new-metaclass',
        metaClassId: metaClass.id,
        name: metaClass.name,
        ...(tool ? { toolId: tool.id } : {}),
      }));
      e.dataTransfer.effectAllowed = 'copy';
    } catch (error) {
      console.error('Error setting drag data:', error);
    }

    onDragStart({ kind: 'new-metaclass', metaClass, ...(tool ? { tool } : {}) });
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
          {hasAuthoredCreationTools ? 'Creation tools' : 'Create new instance'}
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {hasAuthoredCreationTools && creationTools.map(tool => {
            const type = getExecutableToolType(tool);
            if (type === 'create-edge') {
              return (
                <Tooltip
                  key={tool.id}
                  title={onToolActivate
                    ? `Use ${getToolReferenceLabel(tool)}`
                    : 'Edge tools are available in the 2D editor'}
                  placement="right"
                >
                  <span>
                    <Button
                      variant={activeToolId === tool.id ? 'contained' : 'outlined'}
                      size="small"
                      startIcon={<LinkIcon />}
                      onClick={() => onToolActivate?.(tool)}
                      disabled={!tool.referenceId || !onToolActivate}
                      aria-pressed={activeToolId === tool.id}
                      fullWidth
                      sx={{ justifyContent: 'flex-start' }}
                    >
                      {tool.name}
                    </Button>
                  </span>
                </Tooltip>
              );
            }

            const metaClass = getToolMetaClass(tool);
            const enabled = Boolean(metaClass && isCreatable(metaClass));
            return (
              <Tooltip
                key={tool.id}
                title={enabled && metaClass ? `Create ${metaClass.name}` : 'Concrete creatable metaclass not configured'}
                placement="right"
              >
                <div
                  draggable={enabled}
                  onDragStart={metaClass && enabled ? (event) => handleMetaClassDragStart(event, metaClass, tool) : undefined}
                  aria-disabled={!enabled}
                  style={{
                    border: '1px dashed #90caf9',
                    borderRadius: '4px',
                    marginBottom: '8px',
                    cursor: enabled ? 'copy' : 'not-allowed',
                    opacity: enabled ? 1 : 0.55,
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: '#f7fbff'
                  }}
                >
                  <Box sx={{ minWidth: 36, display: 'flex', alignItems: 'center' }}>
                    <AddCircleOutlineIcon color={enabled ? 'primary' : 'disabled'} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap>{tool.name}</Typography>
                    <Typography variant="caption" color="textSecondary" noWrap>
                      {metaClass?.name || 'Target not configured'}
                    </Typography>
                  </Box>
                </div>
              </Tooltip>
            );
          })}

          {!hasAuthoredCreationTools && creatableMetaClasses.map((metaClass) => (
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

        {!hasAuthoredCreationTools && creatableMetaClasses.length === 0 && (
          <Typography variant="body2" color="textSecondary" align="center" sx={{ py: 2 }}>
            No concrete metaclasses are available.
          </Typography>
        )}

        {interactionTools.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1" gutterBottom>Interaction tools</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {interactionTools.map(tool => {
                const type = getExecutableToolType(tool);
                const isActive = activeToolId === tool.id;
                return (
                  <Button
                    key={tool.id}
                    variant={isActive ? 'contained' : 'outlined'}
                    color={type === 'delete' ? 'error' : 'primary'}
                    size="small"
                    startIcon={type === 'delete' ? <DeleteOutlineIcon /> : <SyncAltIcon />}
                    onClick={() => onToolActivate?.(tool)}
                    disabled={!onToolActivate}
                    aria-pressed={isActive}
                    fullWidth
                    sx={{ justifyContent: 'flex-start' }}
                  >
                    {tool.name}
                  </Button>
                );
              })}
            </Box>
          </>
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
              onClick={() => navigate(`/projects/${project.id}/metamodels/${metamodel.id}/viewpoints`)}
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
