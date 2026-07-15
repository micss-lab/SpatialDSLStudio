import { metamodelService } from '../../services/metamodel/metamodel.service';
import { deleteMetamodelFromAPI } from '../../services/metamodel/metamodel-api-sync.service';
import { Metamodel } from '../../models/types';

jest.mock('../../services/metamodel/metamodel-api-sync.service', () => ({
  syncMetamodelToAPI: jest.fn(),
  saveMetamodelToAPI: jest.fn(),
  deleteMetamodelFromAPI: jest.fn(),
}));

const mockDeleteFromAPI = deleteMetamodelFromAPI as jest.Mock;

// conformsTo is set so importMetamodel does not fall back to the core
// EPackage, which is not initialized in this test environment
const makeMetamodel = (id: string, name: string): Metamodel =>
  ({ id, name, classes: [], conformsTo: 'external-package' } as unknown as Metamodel);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('metamodelService.deleteMetamodel', () => {
  it('keeps the metamodel locally when the server refuses the delete', async () => {
    metamodelService.importMetamodel(makeMetamodel('mm-del-1', 'Refused'));
    mockDeleteFromAPI.mockRejectedValue(
      new Error('Cannot delete metamodel: 2 model(s) depend on it')
    );

    await expect(metamodelService.deleteMetamodel('mm-del-1')).rejects.toThrow(
      'Cannot delete metamodel: 2 model(s) depend on it'
    );

    expect(metamodelService.getMetamodelById('mm-del-1')).toBeDefined();
  });

  it('removes the metamodel locally once the server confirms the delete', async () => {
    metamodelService.importMetamodel(makeMetamodel('mm-del-2', 'Deletable'));
    mockDeleteFromAPI.mockResolvedValue(undefined);

    await expect(metamodelService.deleteMetamodel('mm-del-2')).resolves.toBe(true);

    expect(metamodelService.getMetamodelById('mm-del-2')).toBeUndefined();
  });

  it('still deletes locally when an unsynced metamodel is missing remotely', async () => {
    // Never synced to the database, so the backend answering 404 is expected
    metamodelService.importMetamodel(makeMetamodel('mm-del-3', 'Local only'));
    mockDeleteFromAPI.mockRejectedValue(
      new Error('Metamodel not found or you are not the owner')
    );

    await expect(metamodelService.deleteMetamodel('mm-del-3')).resolves.toBe(true);

    expect(metamodelService.getMetamodelById('mm-del-3')).toBeUndefined();
  });

  it('returns false without calling the API for an unknown id', async () => {
    await expect(metamodelService.deleteMetamodel('mm-del-unknown')).resolves.toBe(false);

    expect(mockDeleteFromAPI).not.toHaveBeenCalled();
  });
});
