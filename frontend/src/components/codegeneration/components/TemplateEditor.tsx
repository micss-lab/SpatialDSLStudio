/**
 * Custom IDE-like template editor component
 * Uncontrolled editor - syncs to parent only on blur
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Tooltip,
  Typography
} from '@mui/material';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { autocompletion } from '@codemirror/autocomplete';
import { createHandlebarsCompletions } from '../../../services/codegeneration';
import { TemplateEditorProps } from '../types';

const THREE_D_PROPERTIES: Array<{ label: string; info: string }> = [
  { label: 'X', info: 'X position in 3D space' },
  { label: 'Y', info: 'Y position in 3D space' },
  { label: 'RZ', info: 'Rotation around Z-axis' },
  { label: 'Width', info: 'Width in mm' },
  { label: 'Length', info: 'Length in mm' },
  { label: 'Height', info: 'Height in mm' }
];

/**
 * TemplateEditor component provides a code editor for Handlebars templates
 * with autocomplete support for metamodels, models, and diagrams
 */
export const TemplateEditor: React.FC<TemplateEditorProps> = ({
  value,
  onChange,
  metamodels = [],
  models = [],
  diagram = null,
  targetMetamodelId
}) => {
  // Ref to store current editor content without causing re-renders
  const contentRef = useRef(value);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  // Local state only for forcing editor reset on template switch
  const [editorValue, setEditorValue] = useState(value);
  const [expanded, setExpanded] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [referenceClassId, setReferenceClassId] = useState('');

  // Detect when a completely different template is loaded (not just typing)
  useEffect(() => {
    // If value changed externally (template switch), reset the editor
    if (value !== contentRef.current) {
      contentRef.current = value;
      setEditorValue(value);
    }
  }, [value]);

  // Memoize extensions
  const extensions = useMemo(() => [
    javascript(),
    autocompletion({
      override: [createHandlebarsCompletions(metamodels, models, diagram, targetMetamodelId)]
    })
  ], [metamodels, models, diagram, targetMetamodelId]);

  // Handle typing - store in ref, don't update parent or state
  const handleChange = useCallback((newValue: string) => {
    contentRef.current = newValue;
  }, []);

  // Sync to parent only on blur
  const handleBlur = useCallback(() => {
    onChange(contentRef.current);
  }, [onChange]);

  // The editor remounts when it moves in or out of the fullscreen dialog,
  // so flush the latest content first to avoid losing unsynced typing
  const toggleExpanded = useCallback(() => {
    setEditorValue(contentRef.current);
    onChange(contentRef.current);
    setExpanded(previous => !previous);
  }, [onChange]);

  const insertSnippet = useCallback((snippet: string) => {
    const view = editorRef.current?.view;
    if (view) {
      view.dispatch(view.state.replaceSelection(snippet));
      contentRef.current = view.state.doc.toString();
      view.focus();
    } else {
      contentRef.current = `${contentRef.current}${snippet}`;
      setEditorValue(contentRef.current);
    }
    onChange(contentRef.current);
  }, [onChange]);

  const targetMetamodel = useMemo(
    () => metamodels.find(mm => mm.id === targetMetamodelId) || null,
    [metamodels, targetMetamodelId]
  );
  const referenceClass = targetMetamodel?.classes.find(cls => cls.id === referenceClassId) || null;
  const conformingModels = useMemo(
    () => (targetMetamodelId ? models.filter(m => m.conformsTo === targetMetamodelId) : models),
    [models, targetMetamodelId]
  );
  const referenceInstances = useMemo(() => {
    if (!referenceClass) return [];
    return conformingModels.flatMap(model =>
      model.elements
        .filter(element => element.modelElementId === referenceClass.id)
        .map(element => element.style?.name || element.name)
        .filter((name): name is string => Boolean(name))
    );
  }, [conformingModels, referenceClass]);

  const renderReferencePanel = () => {
    if (!referenceOpen) return null;

    return (
      <Box
        sx={{
          borderBottom: '1px solid #494949',
          backgroundColor: '#252526',
          color: '#d4d4d4',
          p: 1.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          maxHeight: 220,
          overflowY: 'auto'
        }}
      >
        {targetMetamodel ? (
          <>
            <FormControl size="small" sx={{ maxWidth: 320 }}>
              <InputLabel id="template-reference-class-label" sx={{ color: '#9e9e9e' }}>
                Metaclass
              </InputLabel>
              <Select
                labelId="template-reference-class-label"
                label="Metaclass"
                value={referenceClass ? referenceClassId : ''}
                onChange={(e) => setReferenceClassId(e.target.value)}
                sx={{ color: '#d4d4d4', '.MuiOutlinedInput-notchedOutline': { borderColor: '#494949' } }}
              >
                {targetMetamodel.classes.map(cls => (
                  <MenuItem key={cls.id} value={cls.id}>
                    {cls.name}{cls.abstract ? ' (abstract)' : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {referenceClass ? (
              <>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ color: '#9e9e9e', minWidth: 90 }}>Snippets</Typography>
                  <Chip
                    size="small"
                    clickable
                    label={`Count ${referenceClass.name}`}
                    onClick={() => insertSnippet(`{{countElements "${referenceClass.name}"}}`)}
                  />
                  <Chip
                    size="small"
                    clickable
                    label={`Loop ${referenceClass.name}`}
                    onClick={() => insertSnippet(`{{#each elementsByClassName.${referenceClass.name}}}\n  \n{{/each}}`)}
                  />
                </Box>

                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ color: '#9e9e9e', minWidth: 90 }}>Attributes</Typography>
                  {(referenceClass.attributes || []).length === 0 && (
                    <Typography variant="caption" sx={{ color: '#757575' }}>No attributes defined</Typography>
                  )}
                  {(referenceClass.attributes || []).map(attribute => (
                    <Tooltip
                      key={attribute.id || attribute.name}
                      title={`Inserts {{${attribute.name}}}. Use inside a loop, or as {{InstanceName.${attribute.name}}}`}
                    >
                      <Chip
                        size="small"
                        clickable
                        variant="outlined"
                        label={`${attribute.name}: ${attribute.type || 'string'}`}
                        onClick={() => insertSnippet(`{{${attribute.name}}}`)}
                        sx={{ color: '#d4d4d4', borderColor: '#494949' }}
                      />
                    </Tooltip>
                  ))}
                </Box>

                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ color: '#9e9e9e', minWidth: 90 }}>3D placement</Typography>
                  {THREE_D_PROPERTIES.map(property => (
                    <Tooltip key={property.label} title={property.info}>
                      <Chip
                        size="small"
                        clickable
                        variant="outlined"
                        label={property.label}
                        onClick={() => insertSnippet(`{{${property.label}}}`)}
                        sx={{ color: '#d4d4d4', borderColor: '#494949' }}
                      />
                    </Tooltip>
                  ))}
                </Box>

                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ color: '#9e9e9e', minWidth: 90 }}>Instances</Typography>
                  {referenceInstances.length === 0 && (
                    <Typography variant="caption" sx={{ color: '#757575' }}>
                      No instances in conforming models
                    </Typography>
                  )}
                  {referenceInstances.map(name => (
                    <Tooltip key={name} title={`Inserts {{${name}.name}}. Swap .name for any attribute`}>
                      <Chip
                        size="small"
                        clickable
                        variant="outlined"
                        label={name}
                        onClick={() => insertSnippet(`{{${name}.name}}`)}
                        sx={{ color: '#d4d4d4', borderColor: '#494949' }}
                      />
                    </Tooltip>
                  ))}
                </Box>
              </>
            ) : (
              <Typography variant="caption" sx={{ color: '#9e9e9e' }}>
                Pick a metaclass to see what this template can access.
              </Typography>
            )}
          </>
        ) : (
          <Typography variant="caption" sx={{ color: '#9e9e9e' }}>
            Select a target metamodel for the project to browse its classes here.
          </Typography>
        )}
      </Box>
    );
  };

  const renderEditor = (height: string) => (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height,
      border: '1px solid #494949',
      borderRadius: '4px',
      overflow: 'hidden'
    }}>
      <Box sx={{
        backgroundColor: '#333333',
        color: 'white',
        padding: '4px 8px',
        borderBottom: '1px solid #494949',
        display: 'flex',
        alignItems: 'center',
        gap: 1
      }}>
        <Typography variant="caption">Template Editor</Typography>
        <Typography variant="caption" sx={{ ml: 'auto' }}>Handlebars (JS)</Typography>
        <Tooltip title={referenceOpen ? 'Hide model reference' : 'Show model reference'}>
          <IconButton
            size="small"
            onClick={() => setReferenceOpen(open => !open)}
            sx={{ color: referenceOpen ? '#90caf9' : 'white', p: 0.25 }}
            aria-label={referenceOpen ? 'Hide model reference' : 'Show model reference'}
          >
            <MenuBookIcon fontSize="inherit" />
          </IconButton>
        </Tooltip>
        <Tooltip title={expanded ? 'Exit full screen' : 'Expand editor'}>
          <IconButton
            size="small"
            onClick={toggleExpanded}
            sx={{ color: 'white', p: 0.25 }}
            aria-label={expanded ? 'Exit full screen' : 'Expand editor'}
          >
            {expanded ? <CloseFullscreenIcon fontSize="inherit" /> : <OpenInFullIcon fontSize="inherit" />}
          </IconButton>
        </Tooltip>
      </Box>

      {renderReferencePanel()}

      <Box onBlur={handleBlur} sx={{ flex: 1, minHeight: 0, '& .cm-editor': { height: '100%' } }}>
        <CodeMirror
          ref={editorRef}
          value={editorValue}
          height="100%"
          extensions={extensions}
          onChange={handleChange}
          theme="dark"
        />
      </Box>
    </Box>
  );

  if (expanded) {
    return (
      <>
        {/* Placeholder keeps the dialog layout stable while the editor is expanded */}
        <Box sx={{ height: '400px', border: '1px dashed #494949', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="caption" color="textSecondary">Editing in full screen</Typography>
        </Box>
        <Dialog open fullScreen onClose={toggleExpanded}>
          <DialogContent sx={{ p: 2, display: 'flex', flexDirection: 'column' }}>
            {renderEditor('100%')}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return renderEditor('400px');
};
