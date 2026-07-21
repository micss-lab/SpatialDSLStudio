/**
 * Tests for native template content types (json, xml, plaintext) accepted
 * by the code generation project importer.
 */

jest.mock('../../services/core', () => ({
  apiClient: {
    get: jest.fn().mockResolvedValue([]),
    post: jest.fn().mockResolvedValue(undefined),
    put: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  },
  API_ENDPOINTS: {
    CODEGEN_PROJECTS: '/codegen/projects',
  },
}));

import { codegenProjectCrudService } from '../../services/codegeneration/codegen-project-crud.service';

const TARGET_METAMODEL_ID = 'metamodel-content-types-test';

function buildProjectFixture(language: string) {
  return {
    name: `Project using ${language}`,
    targetMetamodelId: TARGET_METAMODEL_ID,
    templates: [
      {
        name: 'Template',
        language,
        templateContent: 'content',
        outputPattern: '{{name}}.out',
      },
    ],
  };
}

describe('codegen content types', () => {
  afterEach(() => {
    codegenProjectCrudService.clearProjects();
  });

  it.each(['json', 'xml', 'plaintext'])('imports a project with a "%s" template without throwing', (language) => {
    const project = buildProjectFixture(language);
    expect(() => codegenProjectCrudService.importProject(project)).not.toThrow();

    const imported = codegenProjectCrudService.getAllProjects().find(p => p.name === project.name);
    expect(imported?.templates[0].language).toBe(language);
  });

  it('rejects a project with an unsupported language such as "ruby"', () => {
    const project = buildProjectFixture('ruby');
    expect(() => codegenProjectCrudService.importProject(project)).toThrow();
  });
});
