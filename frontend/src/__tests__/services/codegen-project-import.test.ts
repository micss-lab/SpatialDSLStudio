import { CodegenProjectCrudService } from '../../services/codegeneration/codegen-project-crud.service';
import { codegenApiSyncService } from '../../services/codegeneration/codegen-api-sync.service';

jest.mock('../../services/codegeneration/codegen-api-sync.service', () => ({
  codegenApiSyncService: {
    syncProjectToAPI: jest.fn().mockResolvedValue(undefined),
  },
}));

const syncProjectToAPI = codegenApiSyncService.syncProjectToAPI as any;

const validTemplate = () => ({
  id: 'template-1',
  name: 'Entity Template',
  language: 'java' as const,
  templateContent: 'class {{name}} {}',
  targetMetamodelId: 'metamodel-1',
  outputPattern: '{{name}}.java',
});

const validProject = () => ({
  id: 'project-1',
  name: 'Demo Project',
  description: 'A demo',
  targetMetamodelId: 'metamodel-1',
  templates: [validTemplate()],
  createdAt: 1000,
  updatedAt: 2000,
  isExample: true,
});

describe('CodegenProjectCrudService.importProject', () => {
  let service: CodegenProjectCrudService;

  beforeEach(() => {
    service = new CodegenProjectCrudService();
    syncProjectToAPI.mockClear();
  });

  it('imports a valid project and syncs it to the API', () => {
    const imported = service.importProject(validProject());

    expect(imported.id).toBe('project-1');
    expect(imported.name).toBe('Demo Project');
    expect(imported.description).toBe('A demo');
    expect(imported.targetMetamodelId).toBe('metamodel-1');
    expect(imported.templates).toHaveLength(1);
    expect(imported.templates[0].id).toBe('template-1');
    expect(imported.createdAt).toBe(1000);
    expect(service.getAllProjects()).toHaveLength(1);
    expect(syncProjectToAPI).toHaveBeenCalledWith(imported);
  });

  it('forces imported projects to be non-example', () => {
    const imported = service.importProject(validProject());
    expect(imported.isExample).toBe(false);
  });

  it('assigns a fresh project id when the id collides with an existing project', () => {
    service.importProject(validProject());
    const second = service.importProject(validProject());

    expect(second.id).not.toBe('project-1');
    expect(service.getAllProjects()).toHaveLength(2);
  });

  it('assigns a fresh template id when a template id collides with an existing one', () => {
    service.importProject(validProject());
    const second = service.importProject({
      ...validProject(),
      id: 'project-2',
      templates: [validTemplate()],
    });

    expect(second.templates[0].id).not.toBe('template-1');
  });

  it('assigns a fresh template id when ids collide within the same import', () => {
    const imported = service.importProject({
      ...validProject(),
      templates: [validTemplate(), validTemplate()],
    });

    expect(imported.templates[0].id).not.toBe(imported.templates[1].id);
  });

  it('falls back to the project metamodel id when a template omits its own', () => {
    const { targetMetamodelId, ...templateWithoutMetamodel } = validTemplate();
    const imported = service.importProject({
      ...validProject(),
      templates: [templateWithoutMetamodel],
    });

    expect(imported.templates[0].targetMetamodelId).toBe('metamodel-1');
  });

  it('defaults missing optional fields', () => {
    const { description, createdAt, ...rest } = validProject();
    const imported = service.importProject(rest);

    expect(imported.description).toBe('');
    expect(typeof imported.createdAt).toBe('number');
  });

  describe('validation', () => {
    const cases: Array<[string, unknown]> = [
      ['non-object input', 'not-a-project'],
      ['null input', null],
      ['missing name', { ...validProject(), name: undefined }],
      ['missing targetMetamodelId', { ...validProject(), targetMetamodelId: undefined }],
      ['non-array templates', { ...validProject(), templates: {} }],
      ['template missing name', { ...validProject(), templates: [{ ...validTemplate(), name: undefined }] }],
      ['template invalid language', { ...validProject(), templates: [{ ...validTemplate(), language: 'ruby' }] }],
      ['template missing content', { ...validProject(), templates: [{ ...validTemplate(), templateContent: undefined }] }],
      ['template missing outputPattern', { ...validProject(), templates: [{ ...validTemplate(), outputPattern: undefined }] }],
    ];

    it.each(cases)('rejects %s', (_label, input) => {
      expect(() => service.importProject(input)).toThrow();
      expect(service.getAllProjects()).toHaveLength(0);
      expect(syncProjectToAPI).not.toHaveBeenCalled();
    });
  });
});
