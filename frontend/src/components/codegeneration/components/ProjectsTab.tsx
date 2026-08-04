/**
 * ProjectsTab - Displays list of user's code generation projects
 */

import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Button
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ShareIcon from '@mui/icons-material/Share';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { CodeGenerationProject } from '../../../models/types';
import { metamodelService } from '../../../services/metamodel';
import { getParentGroupSurfaceColor, groupByParent } from '../../../services/common/grouping.service';

interface ProjectsTabProps {
  projects: CodeGenerationProject[];
  onEdit: (project: CodeGenerationProject) => void;
  onDelete: (projectId: string) => void;
  onShare: (project: CodeGenerationProject) => void;
  onNewProject: () => void;
  onImportProject: (file: File) => void;
  canCreate: boolean;
  canDelete: boolean;
  canShare: boolean;
}

/**
 * ProjectsTab displays a list of projects with edit/delete/share actions
 */
export const ProjectsTab: React.FC<ProjectsTabProps> = ({
  projects,
  onEdit,
  onDelete,
  onShare,
  onNewProject,
  onImportProject,
  canCreate,
  canDelete,
  canShare
}) => {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const getMetamodelName = (metamodelId: string): string => (
    metamodelService.getMetamodelById(metamodelId)?.name || 'Unknown'
  );

  return (
    <>
      <Typography variant="h6" gutterBottom>Generator Configurations</Typography>
      <List>
        {groupByParent(
          projects,
          project => project.targetMetamodelId,
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
            {group.items.map(project => (
              <ListItem
                key={project.id}
                secondaryAction={
                  <Box>
                    <IconButton edge="end" onClick={() => onEdit(project)}>
                      <EditIcon />
                    </IconButton>
                    {canShare && (
                      <IconButton edge="end" onClick={() => onShare(project)}>
                        <ShareIcon />
                      </IconButton>
                    )}
                    {canDelete && (
                      <IconButton edge="end" onClick={() => onDelete(project.id)}>
                        <DeleteIcon />
                      </IconButton>
                    )}
                  </Box>
                }
                sx={{ borderLeft: '4px solid', borderLeftColor: group.color }}
              >
                <ListItemText
                  primary={project.name}
                  secondary={`Templates: ${project.templates.length} | Target Metamodel: ${group.parentName}`}
                />
              </ListItem>
            ))}
          </Box>
        ))}
        
        {projects.length === 0 && (
          <Typography variant="body2" color="textSecondary" align="center" sx={{ py: 2 }}>
            No generator configurations defined yet. Create one to generate code.
          </Typography>
        )}
      </List>
      
      {canCreate && (
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) {
                onImportProject(file);
              }
            }}
          />
          <Button
            variant="outlined"
            startIcon={<UploadFileIcon />}
            onClick={() => fileInputRef.current?.click()}
          >
            Import Configuration
          </Button>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={onNewProject}
          >
            New Configuration
          </Button>
        </Box>
      )}
    </>
  );
};
