import { diagramService } from '../../services/diagram/diagram.service';
import { diagramCrudService } from '../../services/diagram/diagram-crud.service';
import { diagramApiSyncService } from '../../services/diagram/diagram-api-sync.service';

jest.mock('../../services/diagram/diagram-api-sync.service', () => ({
  diagramApiSyncService: {
    loadFromAPI: jest.fn(),
    syncDiagramToAPI: jest.fn(),
    saveDiagramToAPI: jest.fn(),
    createModelElementInView: jest.fn(),
    updateModelElementPresentation: jest.fn(),
    deleteDiagramFromAPI: jest.fn(),
    removeSyncedDiagram: jest.fn(),
    isSyncedToDb: jest.fn(),
    waitForPendingSave: jest.fn(),
    clearSyncState: jest.fn(),
  },
}));

const mockDeleteFromAPI = diagramApiSyncService.deleteDiagramFromAPI as jest.Mock;
const mockIsSyncedToDb = diagramApiSyncService.isSyncedToDb as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockIsSyncedToDb.mockReturnValue(true);
});

describe('diagramService.deleteDiagram', () => {
  it('keeps the diagram locally when the server refuses the delete', async () => {
    const diagram = diagramService.createDiagram('Refused view', 'model-1');
    mockDeleteFromAPI.mockRejectedValue(
      new Error('Diagram not found or you are not the owner')
    );

    await expect(diagramService.deleteDiagram(diagram.id)).rejects.toThrow(
      'Diagram not found or you are not the owner'
    );

    expect(diagramCrudService.getDiagramById(diagram.id)).toBeDefined();
  });

  it('removes the diagram locally once the server confirms the delete', async () => {
    const diagram = diagramService.createDiagram('Deletable view', 'model-1');
    mockDeleteFromAPI.mockResolvedValue(undefined);

    await expect(diagramService.deleteDiagram(diagram.id)).resolves.toBe(true);

    expect(diagramCrudService.getDiagramById(diagram.id)).toBeUndefined();
    expect(diagramApiSyncService.removeSyncedDiagram).toHaveBeenCalledWith(diagram.id);
  });

  it('still deletes locally when an unsynced diagram is missing remotely', async () => {
    const diagram = diagramService.createDiagram('Local only view', 'model-1');
    mockIsSyncedToDb.mockReturnValue(false);
    mockDeleteFromAPI.mockRejectedValue(
      new Error('Diagram not found or you are not the owner')
    );

    await expect(diagramService.deleteDiagram(diagram.id)).resolves.toBe(true);

    expect(diagramCrudService.getDiagramById(diagram.id)).toBeUndefined();
  });

  it('returns false without calling the API for an unknown id', async () => {
    await expect(diagramService.deleteDiagram('diagram-unknown')).resolves.toBe(false);

    expect(mockDeleteFromAPI).not.toHaveBeenCalled();
  });
});
