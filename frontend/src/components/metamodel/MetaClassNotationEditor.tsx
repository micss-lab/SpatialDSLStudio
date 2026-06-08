import React from 'react';
import {
  Box,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { MetaClass, MetaReference, Metamodel } from '../../models/types';
import { metamodelService } from '../../services/metamodel';

interface MetaClassNotationEditorProps {
  metamodel: Metamodel;
  selectedClass: MetaClass | null;
  selectedReference: { sourceClass: MetaClass; reference: MetaReference } | null;
  readOnly: boolean;
  onUpdateMetamodel: (updatedMetamodel: Metamodel) => void;
  onUpdateSelectedClass: (updatedClass: MetaClass | null) => void;
  onUpdateSelectedReference: (updatedReference: { sourceClass: MetaClass; reference: MetaReference } | null) => void;
}

const shapeOptions = ['rectangle', 'circle', 'ellipse', 'diamond', 'triangle', 'star', 'custom-image', 'custom-3d-model'];
const fallbackShapeOptions = ['box', 'sphere', 'cylinder'];
const arrowOptions = ['none', 'open', 'filled', 'diamond'];

export const MetaClassNotationEditor: React.FC<MetaClassNotationEditorProps> = ({
  metamodel,
  selectedClass,
  selectedReference,
  readOnly,
  onUpdateMetamodel,
  onUpdateSelectedClass,
  onUpdateSelectedReference
}) => {
  const refreshClassSelection = (classId: string) => {
    const updatedMetamodel = metamodelService.getMetamodelById(metamodel.id);
    if (!updatedMetamodel) return;
    onUpdateMetamodel(updatedMetamodel);
    onUpdateSelectedClass(updatedMetamodel.classes.find(cls => cls.id === classId) || null);
  };

  const refreshReferenceSelection = (classId: string, referenceId: string) => {
    const updatedMetamodel = metamodelService.getMetamodelById(metamodel.id);
    if (!updatedMetamodel) return;
    onUpdateMetamodel(updatedMetamodel);
    const updatedSourceClass = updatedMetamodel.classes.find(cls => cls.id === classId);
    const updatedReference = updatedSourceClass?.references.find(ref => ref.id === referenceId);
    onUpdateSelectedReference(updatedSourceClass && updatedReference ? {
      sourceClass: updatedSourceClass,
      reference: updatedReference
    } : null);
  };

  const updateClassNotation = (path: 'two_d' | 'three_d', key: string, value: any) => {
    if (!selectedClass) return;
    const concreteSyntax = {
      ...(selectedClass.concreteSyntax || {}),
      [path]: {
        ...(selectedClass.concreteSyntax?.[path] || {}),
        [key]: value
      }
    };

    metamodelService.updateMetaClass(metamodel.id, selectedClass.id, { concreteSyntax });
    refreshClassSelection(selectedClass.id);
  };

  const updateClassNestedNotation = (path: 'two_d' | 'three_d', key: string, nestedValue: Record<string, number>) => {
    if (!selectedClass) return;
    const concreteSyntax = {
      ...(selectedClass.concreteSyntax || {}),
      [path]: {
        ...(selectedClass.concreteSyntax?.[path] || {}),
        [key]: {
          ...((selectedClass.concreteSyntax?.[path] as any)?.[key] || {}),
          ...nestedValue
        }
      }
    };

    metamodelService.updateMetaClass(metamodel.id, selectedClass.id, { concreteSyntax });
    refreshClassSelection(selectedClass.id);
  };

  const updateReferenceNotation = (key: string, value: any) => {
    if (!selectedReference) return;
    metamodelService.updateMetaReference(
      metamodel.id,
      selectedReference.sourceClass.id,
      selectedReference.reference.id,
      {
        concreteSyntax: {
          ...(selectedReference.reference.concreteSyntax || {}),
          [key]: value
        }
      }
    );
    refreshReferenceSelection(selectedReference.sourceClass.id, selectedReference.reference.id);
  };

  if (!selectedClass && !selectedReference) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="text.secondary">Select a class or reference to edit fallback notation.</Typography>
      </Box>
    );
  }

  if (selectedReference) {
    const syntax = selectedReference.reference.concreteSyntax || {};
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="h6">{selectedReference.reference.name}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Fallback edge notation. Representation descriptions own view notation.
        </Typography>
        <Stack spacing={2}>
          <TextField
            label="Line color"
            type="color"
            size="small"
            value={syntax.lineColor || '#000000'}
            disabled={readOnly}
            onChange={(event) => updateReferenceNotation('lineColor', event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Line width"
            type="number"
            size="small"
            value={syntax.lineWidth || 2}
            disabled={readOnly}
            onChange={(event) => updateReferenceNotation('lineWidth', Number(event.target.value))}
          />
          <TextField
            label="Dash pattern"
            size="small"
            value={(syntax.lineDash || []).join(',')}
            disabled={readOnly}
            onChange={(event) => updateReferenceNotation('lineDash', event.target.value.split(',').map(value => Number(value.trim())).filter(Number.isFinite))}
          />
          <FormControl size="small">
            <InputLabel>Arrow</InputLabel>
            <Select
              label="Arrow"
              value={syntax.arrowHead || 'filled'}
              disabled={readOnly}
              onChange={(event) => updateReferenceNotation('arrowHead', event.target.value)}
            >
              {arrowOptions.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
            </Select>
          </FormControl>
        </Stack>
      </Box>
    );
  }

  const twoD = selectedClass?.concreteSyntax?.two_d || {};
  const threeD = selectedClass?.concreteSyntax?.three_d || {};

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6">{selectedClass?.name}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Fallback class notation. Representation descriptions own view notation.
      </Typography>
      <Stack spacing={2}>
        <Typography variant="subtitle2">2D</Typography>
        <FormControl size="small">
          <InputLabel>Shape</InputLabel>
          <Select
            label="Shape"
            value={twoD.shape || 'rectangle'}
            disabled={readOnly}
            onChange={(event) => updateClassNotation('two_d', 'shape', event.target.value)}
          >
            {shapeOptions.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField label="Fill" type="color" size="small" value={twoD.fillColor || '#4287f5'} disabled={readOnly} onChange={(event) => updateClassNotation('two_d', 'fillColor', event.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField label="Stroke" type="color" size="small" value={twoD.strokeColor || '#000000'} disabled={readOnly} onChange={(event) => updateClassNotation('two_d', 'strokeColor', event.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField label="Stroke width" type="number" size="small" value={twoD.strokeWidth || 1} disabled={readOnly} onChange={(event) => updateClassNotation('two_d', 'strokeWidth', Number(event.target.value))} />
        <TextField label="Image URL" size="small" value={twoD.imageUrl || ''} disabled={readOnly} onChange={(event) => updateClassNotation('two_d', 'imageUrl', event.target.value || undefined)} />
        <Stack direction="row" spacing={1}>
          <TextField label="Width" type="number" size="small" value={twoD.defaultSize?.width || 120} disabled={readOnly} onChange={(event) => updateClassNestedNotation('two_d', 'defaultSize', { width: Number(event.target.value) })} />
          <TextField label="Height" type="number" size="small" value={twoD.defaultSize?.height || 80} disabled={readOnly} onChange={(event) => updateClassNestedNotation('two_d', 'defaultSize', { height: Number(event.target.value) })} />
        </Stack>
        <Divider />
        <Typography variant="subtitle2">3D</Typography>
        <TextField label="Model URL" size="small" value={threeD.modelUrl || ''} disabled={readOnly} onChange={(event) => updateClassNotation('three_d', 'modelUrl', event.target.value || undefined)} />
        <FormControl size="small">
          <InputLabel>Fallback</InputLabel>
          <Select
            label="Fallback"
            value={threeD.fallbackShape || 'box'}
            disabled={readOnly}
            onChange={(event) => updateClassNotation('three_d', 'fallbackShape', event.target.value)}
          >
            {fallbackShapeOptions.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField label="Fallback color" type="color" size="small" value={threeD.fallbackColor || '#4287f5'} disabled={readOnly} onChange={(event) => updateClassNotation('three_d', 'fallbackColor', event.target.value)} InputLabelProps={{ shrink: true }} />
        <Stack direction="row" spacing={1}>
          <TextField label="W mm" type="number" size="small" value={threeD.defaultSizeMm?.widthMm || 500} disabled={readOnly} onChange={(event) => updateClassNestedNotation('three_d', 'defaultSizeMm', { widthMm: Number(event.target.value) })} />
          <TextField label="H mm" type="number" size="small" value={threeD.defaultSizeMm?.heightMm || 800} disabled={readOnly} onChange={(event) => updateClassNestedNotation('three_d', 'defaultSizeMm', { heightMm: Number(event.target.value) })} />
          <TextField label="D mm" type="number" size="small" value={threeD.defaultSizeMm?.depthMm || 200} disabled={readOnly} onChange={(event) => updateClassNestedNotation('three_d', 'defaultSizeMm', { depthMm: Number(event.target.value) })} />
        </Stack>
      </Stack>
    </Box>
  );
};

export default MetaClassNotationEditor;
