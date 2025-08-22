import React, { useState } from 'react';
import { 
  Box, 
  Tabs, 
  Tab, 
  Typography, 
  Paper,
  Divider
} from '@mui/material';
import TransformationRuleEditor from './TransformationRuleEditor';
import TransformationExecutionPanel from './TransformationExecutionPanel';

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
  const [tabValue, setTabValue] = useState(0);
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
            <Tab label="Rule Editor" {...a11yProps(0)} />
            <Tab label="Execution" {...a11yProps(1)} />
          </Tabs>
        </Box>
        
        <TabPanel value={tabValue} index={0}>
          <TransformationRuleEditor 
            selectedRuleId={selectedRuleId}
            onRuleSelect={handleRuleSelect}
          />
        </TabPanel>
        
        <TabPanel value={tabValue} index={1}>
          <TransformationExecutionPanel 
            onShowModel={handleShowModel}
          />
        </TabPanel>
      </Paper>
    </Box>
  );
};

export default TransformationDashboard; 