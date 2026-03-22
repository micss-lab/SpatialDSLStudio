/**
 * ExampleTemplatesTab - Displays list of example templates
 */

import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  IconButton
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { CodeGenerationTemplate } from '../../../models/types';
import { metamodelService } from '../../../services/metamodel';
import { ProjectTemplate } from '../types';

interface ExampleTemplatesTabProps {
  templates: CodeGenerationTemplate[];
  onUseTemplate: (template: CodeGenerationTemplate) => void;
  canCreate: boolean;
}

/**
 * ExampleTemplatesTab displays a list of example templates that can be used
 */
export const ExampleTemplatesTab: React.FC<ExampleTemplatesTabProps> = ({
  templates,
  onUseTemplate,
  canCreate
}) => {
  return (
    <>
      <Typography variant="h6" gutterBottom>Example Templates</Typography>
      <List>
        {templates.map(template => (
          <ListItem
            key={template.id}
            secondaryAction={
              canCreate ? (
                <Box>
                  <IconButton edge="end" onClick={() => onUseTemplate(template)}>
                    <AddIcon />
                  </IconButton>
                </Box>
              ) : null
            }
          >
            <ListItemText
              primary={template.name}
              secondary={`Language: ${template.language} | Target: ${
                metamodelService.getMetamodelById(template.targetMetamodelId)?.name || 'Unknown'
              }`}
            />
          </ListItem>
        ))}
        
        {templates.length === 0 && (
          <Typography variant="body2" color="textSecondary" align="center" sx={{ py: 2 }}>
            No example templates available.
          </Typography>
        )}
      </List>
    </>
  );
};
