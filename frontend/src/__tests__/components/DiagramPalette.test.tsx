import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import DiagramPalette from '../../components/palette/DiagramPalette';
import { viewpointService } from '../../services/viewpoint.service';

jest.mock('../../services/viewpoint.service', () => ({
  viewpointService: {
    resolveRepresentationDescription: jest.fn(),
  },
}));

const mockResolve = viewpointService.resolveRepresentationDescription as jest.Mock;

const metamodel = {
  id: 'mm-1',
  name: 'Warehouse',
  classes: [
    { id: 'mc-robot', name: 'MobileRobot', abstract: false, superTypes: [] },
    { id: 'mc-station', name: 'ChargingStation', abstract: false, superTypes: [] },
    { id: 'mc-conveyor', name: 'Conveyor', abstract: false, superTypes: [] },
  ],
} as any;

const model = {
  id: 'm-1',
  name: 'Warehouse Ops',
  elements: [
    { id: 'el-robot', name: 'Robot 1', modelElementId: 'mc-robot' },
    { id: 'el-conveyor', name: 'Conveyor 1', modelElementId: 'mc-conveyor' },
  ],
} as any;

// The robot is already on the canvas; the conveyor is not
const diagram = {
  id: 'd-1',
  elements: [{ id: 'el-robot', type: 'node' }],
} as any;

const renderPalette = (props: Partial<React.ComponentProps<typeof DiagramPalette>> = {}) =>
  render(
    <MemoryRouter>
      <DiagramPalette
        metamodel={metamodel}
        model={model}
        diagram={diagram}
        onDragStart={jest.fn()}
        onAddAll={jest.fn()}
        {...props}
      />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DiagramPalette without a type filter', () => {
  beforeEach(() => {
    mockResolve.mockReturnValue({ representationDescription: undefined });
  });

  it('lists every model element not yet on the canvas', () => {
    renderPalette();

    expect(screen.getByText('Conveyor 1')).toBeInTheDocument();
    expect(screen.queryByText(/manage view types/i)).not.toBeInTheDocument();
  });
});

describe('DiagramPalette with a viewpoint type filter', () => {
  beforeEach(() => {
    mockResolve.mockReturnValue({
      representationDescription: {
        id: 'rd-1',
        name: 'Fleet and Charging',
        visibleMetaClassIds: ['mc-robot', 'mc-station'],
        creatableMetaClassIds: ['mc-robot', 'mc-station'],
      },
    });
  });

  it('explains that remaining elements are hidden by the view description', () => {
    renderPalette();

    // The conveyor is filtered out, and all visible elements are on the canvas
    expect(screen.queryByText('Conveyor 1')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /1 other model element is hidden because the "Fleet and Charging" view description does not list its type as visible/i
      )
    ).toBeInTheDocument();
  });

  it('only offers creatable types allowed by the description', () => {
    renderPalette();

    expect(screen.getByText('MobileRobot')).toBeInTheDocument();
    expect(screen.getByText('ChargingStation')).toBeInTheDocument();
    expect(screen.queryByText('Conveyor')).not.toBeInTheDocument();
  });

  it('guides the user to the viewpoint manager to allow more types', () => {
    renderPalette();

    expect(
      screen.getByText(/tick them as visible or creatable/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /manage view types/i })).toBeInTheDocument();
  });
});

describe('DiagramPalette with authored tools', () => {
  const tools = [
    { id: 'tool-node', name: 'Deploy robot', type: 'create-node', metaClassId: 'mc-robot' },
    { id: 'tool-edge', name: 'Assign station', type: 'create-edge', referenceId: 'ref-station' },
    { id: 'tool-delete', name: 'Remove asset', type: 'delete' },
    { id: 'tool-reconnect', name: 'Reassign station', type: 'reconnect', referenceId: 'ref-station' },
  ];

  beforeEach(() => {
    mockResolve.mockReturnValue({
      representationDescription: {
        id: 'rd-tools',
        name: 'Tool-driven floor',
        visibleMetaClassIds: ['mc-robot', 'mc-station'],
        creatableMetaClassIds: ['mc-robot', 'mc-station'],
        toolDefinitions: tools,
      },
    });
  });

  it('renders named creation tools instead of the metaclass fallback', () => {
    renderPalette({ onToolActivate: jest.fn() });

    expect(screen.getByText('Deploy robot')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign station' })).toBeInTheDocument();
    expect(screen.queryByText('ChargingStation')).not.toBeInTheDocument();
  });

  it('passes the authored create-node tool with its drag item', () => {
    const onDragStart = jest.fn();
    renderPalette({ onDragStart, onToolActivate: jest.fn() });

    const toolEntry = screen.getByText('Deploy robot').closest('[draggable="true"]');
    expect(toolEntry).not.toBeNull();
    fireEvent.dragStart(toolEntry!, {
      dataTransfer: { setData: jest.fn(), effectAllowed: '' },
    });

    expect(onDragStart).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'new-metaclass',
      metaClass: expect.objectContaining({ id: 'mc-robot' }),
      tool: expect.objectContaining({ id: 'tool-node' }),
    }));
  });

  it('activates edge, delete, and reconnect tools from the palette', () => {
    const onToolActivate = jest.fn();
    renderPalette({ onToolActivate });

    fireEvent.click(screen.getByRole('button', { name: 'Assign station' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove asset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reassign station' }));

    expect(onToolActivate.mock.calls.map(call => call[0].id)).toEqual([
      'tool-edge',
      'tool-delete',
      'tool-reconnect',
    ]);
  });
});
