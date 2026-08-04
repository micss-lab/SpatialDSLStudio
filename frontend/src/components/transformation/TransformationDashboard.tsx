import React, { useState } from 'react';
import { Alert, Box, Tabs, Tab, Paper } from '@mui/material';
import TransformationRuleEditor from './TransformationRuleEditor';
import TransformationExecutionPanel from './TransformationExecutionPanel';
import { useProject } from '../../contexts/ProjectContext';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`transformation-tabpanel-${index}`}
      aria-labelledby={`transformation-tab-${index}`}
      {...other}
      style={{ height: 'calc(100% - 48px)', overflow: 'auto' }}
    >
      {value === index && (
        <Box sx={{ p: 3, height: '100%' }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `transformation-tab-${index}`,
    'aria-controls': `transformation-tabpanel-${index}`,
  };
}

const TransformationDashboard: React.FC = () => {
  const { can } = useProject();
  const canAuthor = can('transformation.author');
  const canExecute = can('transformation.execute');
  const [tabValue, setTabValue] = useState(canAuthor ? 0 : 1);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [selectedRuleId, setSelectedRuleId] = useState<string>('');

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleShowModel = (modelId: string) => {
    setSelectedModelId(modelId);
    // If we had a model viewer tab, we could switch to it here
  };

  const handleRuleSelect = (ruleId: string) => {
    setSelectedRuleId(ruleId);
  };

  return (
    <Box sx={{ width: '100%', height: 'calc(100vh - 64px)' }}>
      <Paper sx={{ width: '100%', height: '100%' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={tabValue} 
            onChange={handleTabChange} 
            aria-label="transformation tabs"
          >
            <Tab label="Rule Editor" disabled={!canAuthor} {...a11yProps(0)} />
            <Tab label="Execution" disabled={!canExecute} {...a11yProps(1)} />
          </Tabs>
        </Box>
        
        <TabPanel value={tabValue} index={0}>
          {canAuthor ? (
            <TransformationRuleEditor
              selectedRuleId={selectedRuleId}
              onRuleSelect={handleRuleSelect}
            />
          ) : (
            <Alert severity="info">Your project role cannot author transformation rules.</Alert>
          )}
        </TabPanel>
        
        <TabPanel value={tabValue} index={1}>
          {canExecute ? (
            <TransformationExecutionPanel
              onShowModel={handleShowModel}
            />
          ) : (
            <Alert severity="info">Transformation execution is read-only for your project role.</Alert>
          )}
        </TabPanel>
      </Paper>
    </Box>
  );
};

export default TransformationDashboard;
