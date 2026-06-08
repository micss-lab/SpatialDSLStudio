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
import { getParentGroupSurfaceColor, groupByParent } from '../../../services/common/grouping.service';

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
  const getMetamodelName = (metamodelId: string): string => (
    metamodelService.getMetamodelById(metamodelId)?.name || 'Unknown'
  );

  return (
    <>
      <Typography variant="h6" gutterBottom>Example Templates</Typography>
      <List>
        {groupByParent(
          templates,
          template => template.targetMetamodelId,
          parentId => getMetamodelName(parentId)
        ).map(group => (
          <Box key={group.parentId} sx={{ mb: 1.5 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1,
                py: 0.75,
                mb: 0.5,
                borderRadius: 1,
                bgcolor: getParentGroupSurfaceColor(group.parentId),
              }}
            >
              <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: group.color, flexShrink: 0 }} />
              <Typography variant="caption" sx={{ fontWeight: 600 }}>{group.parentName}</Typography>
              <Typography variant="caption" color="text.secondary">
                {group.items.length}
              </Typography>
            </Box>
            {group.items.map(template => (
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
                sx={{ borderLeft: '4px solid', borderLeftColor: group.color }}
              >
                <ListItemText
                  primary={template.name}
                  secondary={`Language: ${template.language} | Target: ${group.parentName}`}
                />
              </ListItem>
            ))}
          </Box>
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
