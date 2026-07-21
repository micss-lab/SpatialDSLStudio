import React from 'react';
import { render, screen } from '@testing-library/react';

import TableView from '../../components/diagram/TableView';
import { diagramService } from '../../services/diagram';
import { modelService } from '../../services/model';
import { metamodelService } from '../../services/metamodel';
import viewpointService from '../../services/viewpoint.service';

jest.mock('../../services/diagram', () => ({ diagramService: { getDiagramById: jest.fn() } }));
jest.mock('../../services/model', () => ({ modelService: { getModelById: jest.fn() } }));
jest.mock('../../services/metamodel', () => ({ metamodelService: { getMetamodelById: jest.fn() } }));
jest.mock('../../services/viewpoint.service', () => ({
  __esModule: true,
  default: { resolveRepresentationDescription: jest.fn() },
}));

const metamodel = {
  id: 'mm-1',
  name: 'Workflow',
  classes: [
    {
      id: 'task',
      name: 'Task',
      abstract: false,
      superTypes: [],
      attributes: [
        { id: 'a-name', name: 'name' },
        { id: 'a-priority', name: 'priority' },
        { id: 'a-done', name: 'done' },
      ],
      references: [],
    },
  ],
} as any;

const model = {
  id: 'm-1',
  name: 'Work',
  conformsTo: 'mm-1',
  elements: [
    { id: 'e1', modelElementId: 'task', style: { name: 'Design', priority: 1, done: false } },
    { id: 'e2', modelElementId: 'task', style: { name: 'Build', priority: 2, done: true } },
  ],
} as any;

const diagram = { id: 'd1', name: 'Tasks', modelId: 'm-1' } as any;

beforeEach(() => {
  jest.clearAllMocks();
  (diagramService.getDiagramById as jest.Mock).mockReturnValue(diagram);
  (modelService.getModelById as jest.Mock).mockReturnValue(model);
  (metamodelService.getMetamodelById as jest.Mock).mockReturnValue(metamodel);
  (viewpointService.resolveRepresentationDescription as jest.Mock).mockReturnValue({
    representationDescription: { kind: 'table', visibleMetaClassIds: ['task'] },
  });
});

describe('TableView', () => {
  it('renders visible model elements as rows with attribute columns', () => {
    render(<TableView diagramId="d1" />);

    // Attribute columns (name is its own column and excluded from attribute columns).
    expect(screen.getByText('priority')).toBeInTheDocument();
    expect(screen.getByText('done')).toBeInTheDocument();

    // Element rows.
    expect(screen.getByText('Design')).toBeInTheDocument();
    expect(screen.getByText('Build')).toBeInTheDocument();
    expect(screen.getAllByText('Task')).toHaveLength(2); // Type column per row
  });

  it('shows an empty message when no elements match the visible metaclasses', () => {
    (viewpointService.resolveRepresentationDescription as jest.Mock).mockReturnValue({
      representationDescription: { kind: 'table', visibleMetaClassIds: ['other'] },
    });

    render(<TableView diagramId="d1" />);

    expect(screen.getByText(/no model elements match/i)).toBeInTheDocument();
  });
});
