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
  canGenerate: boolean;
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
  canCreate,
  canGenerate
}) => {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
      {/* Generate Code operates on the selected project, so they form one group */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <FormControl sx={{ minWidth: 300 }}>
          <InputLabel id="project-select-label">Generator Configuration</InputLabel>
          <Select
            labelId="project-select-label"
            value={selectedProject}
            label="Generator Configuration"
            onChange={onProjectChange}
          >
            {/* User generator configurations */}
            {projects.length > 0 && (
              <ListSubheader>Your Configurations</ListSubheader>
            )}
            {projects.map((project) => (
              <MenuItem key={project.id} value={project.id}>
                {project.name} ({metamodels.find(m => m.id === project.targetMetamodelId)?.name || 'Unknown Metamodel'})
              </MenuItem>
            ))}

            {/* Example generator configurations */}
            {exampleProjects.length > 0 && (
              <ListSubheader>Example Configurations</ListSubheader>
            )}
            {exampleProjects.map((project) => (
              <MenuItem key={project.id} value={project.id}>
                {project.name} ({metamodels.find(m => m.id === project.targetMetamodelId)?.name || 'Unknown Metamodel'})
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button
          variant="contained"
          color="primary"
          startIcon={<PlayArrowIcon />}
          onClick={onGenerate}
          disabled={!selectedProject || !canGenerate}
        >
          Generate Code
        </Button>
      </Box>

      {canCreate && (
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={onNewProject}
        >
          New Configuration
        </Button>
      )}
    </Box>
  );
};
