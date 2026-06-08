/**
 * Custom IDE-like template editor component
 * Uncontrolled editor - syncs to parent only on blur
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { autocompletion } from '@codemirror/autocomplete';
import { createHandlebarsCompletions } from '../../../services/codegeneration';
import { TemplateEditorProps } from '../types';

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
  // Ref to track if this is a new template being loaded (external change)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const templateIdRef = useRef(value);
  // Local state only for forcing editor reset on template switch
  const [editorValue, setEditorValue] = useState(value);
  
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

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column',
      height: '400px',
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
        justifyContent: 'space-between'
      }}>
        <Typography variant="caption">Template Editor</Typography>
        <Typography variant="caption">Handlebars (JS)</Typography>
      </Box>
      
      <div onBlur={handleBlur}>
        <CodeMirror
          value={editorValue}
          height="400px"
          extensions={extensions}
          onChange={handleChange}
          theme="dark"
        />
      </div>
    </Box>
  );
};
