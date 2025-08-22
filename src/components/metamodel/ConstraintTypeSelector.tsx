import React, { useState } from 'react';
import { 
  Tabs, 
  Tab, 
  Box,
  Typography,
  Paper,
  Alert,
  Chip
} from '@mui/material';
import JavaScriptIcon from '@mui/icons-material/Javascript';
import CodeIcon from '@mui/icons-material/Code';
import OCLConstraintEditor from './OCLConstraintEditor';
import JSConstraintEditor from './JSConstraintEditor';
import { MetaClass, Metamodel } from '../../models/types';

interface ConstraintTypeSelectorProps {
  metamodelId: string;
  metaClass: MetaClass;
  metamodel: Metamodel;
  onUpdateMetamodel: () => void;
  highlightedConstraints?: Set<string>;
  isConstraintHighlighted?: (constraintName: string) => boolean;
  highlightColor?: string;
}

/**
 * A component that allows users to switch between OCL and JavaScript constraint editors
 */
const ConstraintTypeSelector: React.FC<ConstraintTypeSelectorProps> = ({
  metamodelId,
  metaClass,
  metamodel,
  onUpdateMetamodel,
  highlightedConstraints,
  isConstraintHighlighted,
  highlightColor = '#8aff8a' // Default light green
}) => {
  const [constraintType, setConstraintType] = useState<'ocl' | 'javascript'>('ocl');
  
  // Count existing constraints by type
  const oclConstraintCount = React.useMemo(() => {
    const allConstraints = metaClass.constraints || [];
    return allConstraints.filter(c => !('type' in c) || c.type === 'ocl').length;
  }, [metaClass]);
  
  const jsConstraintCount = React.useMemo(() => {
    const allConstraints = metaClass.constraints || [];
    return allConstraints.filter(c => 'type' in c && c.type === 'javascript').length;
  }, [metaClass]);
  
  const handleChange = (event: React.SyntheticEvent, newValue: 'ocl' | 'javascript') => {
    setConstraintType(newValue);
  };
  
  return (
    <Box sx={{ width: '100%' }}>
      <Tabs
        value={constraintType}
        onChange={handleChange}
        aria-label="Constraint Type Selector"
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
      >
        <Tab 
          value="ocl" 
          label={
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <CodeIcon sx={{ mr: 1 }} />
              <span>OCL Constraints</span>
              {oclConstraintCount > 0 && (
                <Chip 
                  label={oclConstraintCount} 
                  size="small" 
                  sx={{ ml: 1 }} 
                  color="primary"
                />
              )}
            </Box>
          } 
        />
        <Tab 
          value="javascript" 
          label={
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <JavaScriptIcon sx={{ mr: 1 }} />
              <span>JavaScript Constraints</span>
              {jsConstraintCount > 0 && (
                <Chip 
                  label={jsConstraintCount} 
                  size="small" 
                  sx={{ ml: 1 }} 
                  color="primary"
                />
              )}
            </Box>
          } 
        />
      </Tabs>
      
      <Box sx={{ p: 2 }}>
        {constraintType === 'ocl' ? (
          <OCLConstraintEditor 
            metamodel={metamodel}
            selectedClass={metaClass}
            onMetamodelChange={onUpdateMetamodel}
            isConstraintHighlighted={isConstraintHighlighted}
            highlightColor={highlightColor}
          />
        ) : (
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              JavaScript constraints allow you to use the full power of JavaScript to define complex validation rules,
              including conditional logic, collection operations, and more.
            </Alert>
            <JSConstraintEditor 
              metamodelId={metamodelId}
              metaClass={metaClass}
              metamodel={metamodel}
              onUpdateMetamodel={onUpdateMetamodel}
              isConstraintHighlighted={isConstraintHighlighted}
              highlightColor={highlightColor}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default ConstraintTypeSelector; 