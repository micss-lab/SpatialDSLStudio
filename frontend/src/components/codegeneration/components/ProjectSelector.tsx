/**
 * Project selector component with action buttons
 */

import React from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  SelectChangeEvent,
  ListSubheader
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { CodeGenerationProject, Metamodel } from '../../../models/types';

interface ProjectSelectorProps {
  selectedProject: string;
  projects: CodeGenerationProject[];
  exampleProjects: CodeGenerationProject[];
  metamodels: Metamodel[];
  onProjectChange: (event: SelectChangeEvent<string>) => void;
  onNewProject: () => void;
  onGenerate: () => void;
  canCreate: boolean;
}

/**
 * ProjectSelector displays project dropdown and action buttons
 */
export const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  selectedProject,
  projects,
  exampleProjects,
  metamodels,
  onProjectChange,
  onNewProject,
  onGenerate,
  canCreate
}) => {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <FormControl sx={{ minWidth: 300 }}>
        <InputLabel id="project-select-label">Project</InputLabel>
        <Select
          labelId="project-select-label"
          value={selectedProject}
          label="Project"
          onChange={onProjectChange}
        >
          {/* User Projects */}
          {projects.length > 0 && (
            <ListSubheader>Your Projects</ListSubheader>
          )}
          {projects.map((project) => (
            <MenuItem key={project.id} value={project.id}>
              {project.name} ({metamodels.find(m => m.id === project.targetMetamodelId)?.name || 'Unknown Metamodel'})
            </MenuItem>
          ))}
          
          {/* Example Projects */}
          {exampleProjects.length > 0 && (
            <ListSubheader>Example Projects</ListSubheader>
          )}
          {exampleProjects.map((project) => (
            <MenuItem key={project.id} value={project.id}>
              {project.name} ({metamodels.find(m => m.id === project.targetMetamodelId)?.name || 'Unknown Metamodel'})
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      
      <Box sx={{ display: 'flex', gap: 2 }}>
        {canCreate && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={onNewProject}
          >
            New Project
          </Button>
        )}
        
        <Button
          variant="contained"
          color="primary"
          startIcon={<PlayArrowIcon />}
          onClick={onGenerate}
          disabled={!selectedProject}
        >
          Generate Code
        </Button>
      </Box>
    </Box>
  );
};
