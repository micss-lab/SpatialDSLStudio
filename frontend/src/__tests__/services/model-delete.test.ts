import { modelService } from '../../services/model/model.service';
import { modelApiSyncService } from '../../services/model/model-api-sync.service';

jest.mock('../../services/model/model-api-sync.service', () => ({
  modelApiSyncService: {
    loadFromAPI: jest.fn(),
    syncModelToAPI: jest.fn(),
    saveModelToAPI: jest.fn(),
    upsertModelToAPI: jest.fn(),
    updateModelInAPI: jest.fn(),
    deleteModelFromAPI: jest.fn(),
    removeSyncedModel: jest.fn(),
    isSyncedToDb: jest.fn(),
    waitForPendingSave: jest.fn(),
    clearSyncState: jest.fn(),
  },
}));

const mockDeleteFromAPI = modelApiSyncService.deleteModelFromAPI as jest.Mock;
const mockIsSyncedToDb = modelApiSyncService.isSyncedToDb as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockIsSyncedToDb.mockReturnValue(true);
});

describe('modelService.deleteModel', () => {
  it('keeps the model locally when the server refuses the delete', async () => {
    const model = modelService.createModel('Refused', 'mm-1');
    mockDeleteFromAPI.mockRejectedValue(
      new Error('Model not found or you are not the owner')
    );

    await expect(modelService.deleteModel(model.id)).rejects.toThrow(
      'Model not found or you are not the owner'
    );

    expect(modelService.getModelById(model.id)).toBeDefined();
  });

  it('removes the model locally once the server confirms the delete', async () => {
    const model = modelService.createModel('Deletable', 'mm-1');
    mockDeleteFromAPI.mockResolvedValue(undefined);

    await expect(modelService.deleteModel(model.id)).resolves.toBe(true);

    expect(modelService.getModelById(model.id)).toBeUndefined();
    expect(modelApiSyncService.removeSyncedModel).toHaveBeenCalledWith(model.id);
  });

  it('still deletes locally when an unsynced model is missing remotely', async () => {
    const model = modelService.createModel('Local only', 'mm-1');
    mockIsSyncedToDb.mockReturnValue(false);
    mockDeleteFromAPI.mockRejectedValue(
      new Error('Model not found or you are not the owner')
    );

    await expect(modelService.deleteModel(model.id)).resolves.toBe(true);

    expect(modelService.getModelById(model.id)).toBeUndefined();
  });

  it('returns false without calling the API for an unknown id', async () => {
    await expect(modelService.deleteModel('model-unknown')).resolves.toBe(false);

    expect(mockDeleteFromAPI).not.toHaveBeenCalled();
  });
});
