import { exampleDataService } from '../../services/metamodel/exampleData.service';
import { metamodelService } from '../../services/metamodel/metamodel.service';
import { codegenExampleDataService } from '../../services/codegeneration/codegen-example-data.service';
import { codegenProjectCrudService } from '../../services/codegeneration/codegen-project-crud.service';

jest.mock('../../services/metamodel/metamodel.service', () => ({
  metamodelService: {
    getAllMetamodels: jest.fn(),
  },
}));

const mockGetAllMetamodels = metamodelService.getAllMetamodels as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  codegenProjectCrudService.setProjects([]);
});

describe('codegenExampleDataService.loadExampleProjects', () => {
  it('retargets the example project to the metamodel row the account actually has', () => {
    const bundleProject = exampleDataService.getExampleProjects()[0];
    const bundleMetamodel = exampleDataService
      .getExampleMetamodels()
      .find(mm => mm.id === bundleProject.targetMetamodelId)!;

    // The account seeded its example metamodel in an earlier session, so its
    // row id differs from this session's bundle id
    mockGetAllMetamodels.mockReturnValue([
      { id: 'account-mm-id', name: bundleMetamodel.name, classes: [] },
    ]);

    codegenExampleDataService.loadExampleProjects();

    const loaded = codegenProjectCrudService.getAllProjects();
    expect(loaded).toHaveLength(exampleDataService.getExampleProjects().length);
    const warehouseProjects = loaded.filter(project => project.name.startsWith('Smart Warehouse'));
    expect(warehouseProjects).toHaveLength(2);
    warehouseProjects.forEach(project => {
      expect(project.targetMetamodelId).toBe('account-mm-id');
      project.templates.forEach(template => {
        expect(template.targetMetamodelId).toBe('account-mm-id');
      });
    });
    // Examples of other languages keep their own bundle targets.
    loaded.filter(project => !project.name.startsWith('Smart Warehouse')).forEach(project => {
      expect(project.targetMetamodelId).not.toBe('account-mm-id');
    });
  });

  it('keeps the bundle target when the account has no matching metamodel', () => {
    mockGetAllMetamodels.mockReturnValue([]);

    codegenExampleDataService.loadExampleProjects();

    const loaded = codegenProjectCrudService.getAllProjects();
    expect(loaded).toHaveLength(exampleDataService.getExampleProjects().length);
    loaded.forEach((project, index) => {
      expect(project.targetMetamodelId).toBe(
        exampleDataService.getExampleProjects()[index].targetMetamodelId
      );
    });
  });
});
