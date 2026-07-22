import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import TreeView from '../../components/diagram/TreeView';
import { diagramService } from '../../services/diagram';
import { metamodelService } from '../../services/metamodel';
import { modelService } from '../../services/model';
import viewpointService from '../../services/viewpoint.service';
import smartWarehouseMetamodel from '../../examples/data/smart-warehouse-metamodel.json';
import smartWarehouseModel from '../../examples/data/smart-warehouse-model.json';

jest.mock('../../services/diagram', () => ({ diagramService: { getDiagramById: jest.fn() } }));
jest.mock('../../services/model', () => ({
  modelService: { getModelById: jest.fn() },
  modelInheritanceUtilsService: {
    getAllReferences: (metaClass: any) => metaClass.references || [],
  },
}));
jest.mock('../../services/metamodel', () => ({ metamodelService: { getMetamodelById: jest.fn() } }));
jest.mock('../../services/viewpoint.service', () => ({
  __esModule: true,
  default: { resolveRepresentationDescription: jest.fn() },
}));

const metamodel = {
  id: 'mm-1',
  name: 'Folders',
  classes: [
    {
      id: 'folder',
      name: 'Folder',
      attributes: [{ id: 'folder-name', name: 'name' }],
      references: [{ id: 'folder-children', name: 'children', containment: true }],
    },
    {
      id: 'group',
      name: 'HiddenGroup',
      attributes: [{ id: 'group-name', name: 'name' }],
      references: [{ id: 'group-children', name: 'children', containment: true }],
    },
    {
      id: 'item',
      name: 'Item',
      attributes: [{ id: 'item-name', name: 'name' }],
      references: [],
    },
  ],
} as any;

const model = {
  id: 'model-1',
  conformsTo: 'mm-1',
  elements: [
    {
      id: 'root',
      modelElementId: 'folder',
      style: { name: 'Root' },
      references: { children: ['child', 'hidden-parent'] },
    },
    {
      id: 'child',
      modelElementId: 'item',
      style: { name: 'Direct child' },
      references: {},
    },
    {
      id: 'hidden-parent',
      modelElementId: 'group',
      style: { name: 'Hidden parent' },
      references: { children: ['promoted-child'] },
    },
    {
      id: 'promoted-child',
      modelElementId: 'item',
      style: { name: 'Promoted child' },
      references: {},
    },
    {
      id: 'orphan',
      modelElementId: 'item',
      style: { name: 'Orphan' },
      references: {},
    },
  ],
} as any;

beforeEach(() => {
  jest.clearAllMocks();
  (diagramService.getDiagramById as jest.Mock).mockReturnValue({ id: 'view-1', modelId: 'model-1' });
  (modelService.getModelById as jest.Mock).mockReturnValue(model);
  (metamodelService.getMetamodelById as jest.Mock).mockReturnValue(metamodel);
  (viewpointService.resolveRepresentationDescription as jest.Mock).mockReturnValue({
    representationDescription: {
      id: 'tree-1',
      name: 'Folder Tree',
      kind: 'tree',
      visibleMetaClassIds: ['folder', 'item'],
    },
  });
});

describe('TreeView', () => {
  it('renders visible roots and containment children while promoting children of hidden containers', () => {
    render(<TreeView diagramId="view-1" />);

    expect(screen.getByRole('tree', { name: 'Folder Tree' })).toBeInTheDocument();
    expect(screen.getByText('Root')).toBeInTheDocument();
    expect(screen.getByText('Direct child')).toBeInTheDocument();
    expect(screen.getByText('Promoted child')).toBeInTheDocument();
    expect(screen.getByText('Orphan')).toBeInTheDocument();
    expect(screen.queryByText('Hidden parent')).not.toBeInTheDocument();
  });

  it('lets users collapse and expand containment branches', async () => {
    render(<TreeView diagramId="view-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Root' }));
    await waitFor(() => expect(screen.queryByText('Direct child')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Expand Root' }));
    expect(await screen.findByText('Direct child')).toBeInTheDocument();
  });

  it('opens a visible-metaclass tree against the Smart Warehouse example', () => {
    const warehouseClassId = '10000000-0000-4000-8000-000000000101';
    const robotClassId = '10000000-0000-4000-8000-000000000102';
    (diagramService.getDiagramById as jest.Mock).mockReturnValue({
      id: 'warehouse-tree',
      modelId: smartWarehouseModel.id,
    });
    (modelService.getModelById as jest.Mock).mockReturnValue(smartWarehouseModel);
    (metamodelService.getMetamodelById as jest.Mock).mockReturnValue(smartWarehouseMetamodel);
    (viewpointService.resolveRepresentationDescription as jest.Mock).mockReturnValue({
      representationDescription: {
        name: 'Warehouse Tree',
        kind: 'tree',
        visibleMetaClassIds: [warehouseClassId, robotClassId],
      },
    });

    render(<TreeView diagramId="warehouse-tree" />);

    expect(screen.getByRole('tree', { name: 'Warehouse Tree' })).toBeInTheDocument();
    expect(screen.getByText('WarehouseMAS')).toBeInTheDocument();
    expect(screen.getByText('Mobile Robot Resource')).toBeInTheDocument();
    expect(screen.getByText('Mobile Robot Resource #2')).toBeInTheDocument();
    expect(screen.queryByText('Conveyor')).not.toBeInTheDocument();
  });
});
