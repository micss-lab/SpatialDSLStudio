import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import MetamodelManager from '../../components/metamodel/MetamodelManager';
import { metamodelService } from '../../services/metamodel';

jest.mock('../../services/metamodel', () => ({
  metamodelService: {
    getAllMetamodels: jest.fn(),
    deleteMetamodel: jest.fn(),
    createMetamodel: jest.fn(),
    importMetamodel: jest.fn(),
  },
  exportService: { exportMetamodel: jest.fn() },
  ecoreService: { importFromEcore: jest.fn() },
}));

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'me@example.com' },
    canShare: true,
    canCreate: true,
    canDelete: true,
    canEditMetamodel: true,
  }),
}));

jest.mock('../../contexts/ProjectContext', () => ({
  useProject: () => ({
    can: () => true,
    project: { id: 'project-1' },
  }),
}));

jest.mock('../../contexts/OwnerFilterContext', () => ({
  useOwnerFilterMatcher: () => () => true,
}));

jest.mock('../../components/common', () => ({
  ShareDialog: () => null,
  resolveOwnerEmail: () => null,
}));

// The visual editor drags in the whole diagram stack and is irrelevant here
jest.mock('../../components/metamodel/VisualMetamodelEditor', () => () => null);

const mockGetAll = metamodelService.getAllMetamodels as jest.Mock;
const mockDelete = metamodelService.deleteMetamodel as jest.Mock;

const warehouse = { id: 'mm-1', name: 'Warehouse', classes: [] } as any;

const renderManager = () =>
  render(
    <MemoryRouter>
      <MetamodelManager />
    </MemoryRouter>
  );

const openActionsAndDelete = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Warehouse' }));
  fireEvent.click(screen.getByRole('menuitem', { name: /delete/i }));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAll.mockReturnValue([warehouse]);
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  (window.confirm as jest.Mock).mockRestore();
});

describe('MetamodelManager delete', () => {
  it('shows the server reason and keeps the row when the delete is refused', async () => {
    mockDelete.mockRejectedValue(
      new Error('Cannot delete metamodel: 2 model(s) depend on it')
    );

    renderManager();
    openActionsAndDelete();

    expect(
      await screen.findByText('Cannot delete metamodel: 2 model(s) depend on it')
    ).toBeInTheDocument();
    expect(screen.getByText('Warehouse')).toBeInTheDocument();
  });

  it('removes the row when the server confirms the delete', async () => {
    mockDelete.mockResolvedValue(true);
    mockGetAll.mockReturnValueOnce([warehouse]).mockReturnValue([]);

    renderManager();
    openActionsAndDelete();

    await waitFor(() => {
      expect(screen.queryByText('Warehouse')).not.toBeInTheDocument();
    });
    expect(mockDelete).toHaveBeenCalledWith('mm-1');
  });

  it('does not call the service when the confirmation is declined', () => {
    (window.confirm as jest.Mock).mockReturnValue(false);

    renderManager();
    openActionsAndDelete();

    expect(mockDelete).not.toHaveBeenCalled();
  });
});
