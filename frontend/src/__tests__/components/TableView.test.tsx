import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import TableView from '../../components/diagram/TableView';
import { diagramService } from '../../services/diagram';
import { modelService } from '../../services/model';
import { metamodelService } from '../../services/metamodel';
import viewpointService from '../../services/viewpoint.service';
import smartWarehouseMetamodel from '../../examples/data/smart-warehouse-metamodel.json';
import smartWarehouseModel from '../../examples/data/smart-warehouse-model.json';

jest.mock('../../services/diagram', () => ({ diagramService: { getDiagramById: jest.fn() } }));
jest.mock('../../services/model', () => ({
  modelService: {
    getModelById: jest.fn(),
    updateModelElementProperties: jest.fn(),
  },
  modelInheritanceUtilsService: {
    getAllAttributes: (metaClass: any) => metaClass.attributes || [],
  },
}));
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
        { id: 'a-name', name: 'name', type: 'string', many: false },
        { id: 'a-priority', name: 'priority', type: 'number', many: false },
        { id: 'a-done', name: 'done', type: 'boolean', many: false },
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

const resolveTable = (tableColumns?: string[]) => {
  (viewpointService.resolveRepresentationDescription as jest.Mock).mockReturnValue({
    representationDescription: {
      kind: 'table',
      visibleMetaClassIds: ['task'],
      ...(tableColumns !== undefined && { tableColumns }),
    },
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  (diagramService.getDiagramById as jest.Mock).mockReturnValue(diagram);
  (modelService.getModelById as jest.Mock).mockReturnValue(model);
  (modelService.updateModelElementProperties as jest.Mock).mockReturnValue(true);
  (metamodelService.getMetamodelById as jest.Mock).mockReturnValue(metamodel);
  resolveTable();
});

describe('TableView', () => {
  it('renders all attribute columns by default', () => {
    render(<TableView diagramId="d1" />);

    expect(screen.getByRole('button', { name: /^name/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^priority/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^done/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Edit name for Design' })).toHaveValue('Design');
    expect(screen.getByRole('checkbox', { name: 'Edit done for Build' })).toBeChecked();
  });

  it('honors the representation table column selection', () => {
    resolveTable(['priority']);

    render(<TableView diagramId="d1" />);

    expect(screen.getByRole('button', { name: /^priority/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^name/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^done/i })).not.toBeInTheDocument();
  });

  it('writes inline edits back to the semantic model with the attribute type', () => {
    resolveTable(['priority']);
    render(<TableView diagramId="d1" />);

    const input = screen.getByRole('spinbutton', { name: 'Edit priority for Design' });
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.blur(input);

    expect(modelService.updateModelElementProperties).toHaveBeenCalledWith('m-1', 'e1', { priority: 5 });
  });

  it('sorts rows in both directions from a column header', () => {
    resolveTable(['name']);
    render(<TableView diagramId="d1" />);

    const nameHeader = screen.getByRole('button', { name: /^name/i });
    fireEvent.click(nameHeader);
    let rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByRole('textbox')).toHaveValue('Build');
    expect(within(rows[1]).getByRole('textbox')).toHaveValue('Design');

    fireEvent.click(nameHeader);
    rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByRole('textbox')).toHaveValue('Design');
    expect(within(rows[1]).getByRole('textbox')).toHaveValue('Build');
  });

  it('shows an empty message when no elements match the visible metaclasses', () => {
    (viewpointService.resolveRepresentationDescription as jest.Mock).mockReturnValue({
      representationDescription: { kind: 'table', visibleMetaClassIds: ['other'] },
    });

    render(<TableView diagramId="d1" />);

    expect(screen.getByText(/no model elements match/i)).toBeInTheDocument();
  });

  it('opens and edits a configured table against the Smart Warehouse example', () => {
    const robotClassId = '10000000-0000-4000-8000-000000000102';
    const firstRobotId = '20000000-0000-4000-8000-000000000002';
    (diagramService.getDiagramById as jest.Mock).mockReturnValue({
      id: 'warehouse-table',
      modelId: smartWarehouseModel.id,
    });
    (modelService.getModelById as jest.Mock).mockReturnValue(smartWarehouseModel);
    (metamodelService.getMetamodelById as jest.Mock).mockReturnValue(smartWarehouseMetamodel);
    (viewpointService.resolveRepresentationDescription as jest.Mock).mockReturnValue({
      representationDescription: {
        name: 'Robot Inventory',
        kind: 'table',
        visibleMetaClassIds: [robotClassId],
        tableColumns: ['name', 'BatteryLevel'],
      },
    });

    render(<TableView diagramId="warehouse-table" />);

    expect(screen.getByRole('textbox', { name: 'Edit name for Mobile Robot Resource' })).toBeInTheDocument();
    const battery = screen.getByRole('spinbutton', { name: 'Edit BatteryLevel for Mobile Robot Resource' });
    fireEvent.change(battery, { target: { value: '85' } });
    fireEvent.blur(battery);

    expect(modelService.updateModelElementProperties).toHaveBeenCalledWith(
      smartWarehouseModel.id,
      firstRobotId,
      { BatteryLevel: 85 }
    );
  });
});
