import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { ProjectSelector } from '../../components/codegeneration/components/ProjectSelector';

const metamodels = [{ id: 'mm-1', name: 'Smart Warehouse', classes: [] }] as any;
const projects = [
  { id: 'p-1', name: 'SmartWarehouseProject', targetMetamodelId: 'mm-1', templates: [] },
] as any;

const renderSelector = (overrides: Record<string, unknown> = {}) => {
  const onGenerate = jest.fn();
  const onNewProject = jest.fn();
  render(
    <ProjectSelector
      selectedProject="p-1"
      projects={projects}
      exampleProjects={[]}
      metamodels={metamodels}
      onProjectChange={jest.fn()}
      onNewProject={onNewProject}
      onGenerate={onGenerate}
      canCreate
      {...overrides}
    />
  );
  return { onGenerate, onNewProject };
};

describe('ProjectSelector', () => {
  it('groups Generate Code with the project select, before New Project', () => {
    renderSelector();

    const generate = screen.getByRole('button', { name: /generate code/i });
    const newProject = screen.getByRole('button', { name: /new project/i });
    const select = screen.getByLabelText(/project/i);

    // The select and Generate Code share a parent group; New Project sits outside it
    expect(generate.parentElement).toBe(select.closest('.MuiFormControl-root')?.parentElement);
    expect(newProject.parentElement).not.toBe(generate.parentElement);
  });

  it('disables Generate Code when no project is selected', () => {
    renderSelector({ selectedProject: '' });

    expect(screen.getByRole('button', { name: /generate code/i })).toBeDisabled();
  });

  it('fires the callbacks', () => {
    const { onGenerate, onNewProject } = renderSelector();

    fireEvent.click(screen.getByRole('button', { name: /generate code/i }));
    fireEvent.click(screen.getByRole('button', { name: /new project/i }));

    expect(onGenerate).toHaveBeenCalled();
    expect(onNewProject).toHaveBeenCalled();
  });
});
