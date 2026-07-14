import React from 'react';
import { render, screen } from '@testing-library/react';
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

const renderPalette = () =>
  render(
    <MemoryRouter>
      <DiagramPalette
        metamodel={metamodel}
        model={model}
        diagram={diagram}
        onDragStart={jest.fn()}
        onAddAll={jest.fn()}
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
        /1 other model element is hidden because the "Fleet and Charging" view description does not list their types as visible/i
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
