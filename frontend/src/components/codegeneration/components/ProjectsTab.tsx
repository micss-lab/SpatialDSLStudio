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
import { CodeGenerationProject } from '../../../models/types';
import { metamodelService } from '../../../services/metamodel';
import { ProjectTemplate } from '../types';

interface ProjectsTabProps {
  projects: CodeGenerationProject[];
  onEdit: (project: CodeGenerationProject) => void;
  onDelete: (projectId: string) => void;
  onShare: (project: CodeGenerationProject) => void;
  onNewProject: () => void;
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
  canCreate,
  canDelete,
  canShare
}) => {
  return (
    <>
      <Typography variant="h6" gutterBottom>Projects</Typography>
      <List>
        {projects.map(project => (
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
          >
            <ListItemText
              primary={project.name}
              secondary={`Templates: ${project.templates.length} | Target Metamodel: ${
                metamodelService.getMetamodelById(project.targetMetamodelId)?.name || 'Unknown'
              }`}
            />
          </ListItem>
        ))}
        
        {projects.length === 0 && (
          <Typography variant="body2" color="textSecondary" align="center" sx={{ py: 2 }}>
            No projects defined yet. Create a project to generate code.
          </Typography>
        )}
      </List>
      
      {canCreate && (
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={onNewProject}
          >
            New Project
          </Button>
        </Box>
      )}
    </>
  );
};
