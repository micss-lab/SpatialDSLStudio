/**
 * End-to-end coverage for the Smart Warehouse codegen flow: import project,
 * generate all files, and zip download, for both the Visual Components and
 * Omniverse projects.
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

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import JSZip from 'jszip';
import smartWarehouseMetamodel from '../../examples/data/smart-warehouse-metamodel.json';
import smartWarehouseModel from '../../examples/data/smart-warehouse-model.json';
import { Diagram, Metamodel, Model, CodeGenerationResult, CodeGenerationProject } from '../../models/types';
import { CodegenContextBuilderService } from '../../services/codegeneration/codegen-context-builder.service';
import { CodegenHandlebarsService } from '../../services/codegeneration/codegen-handlebars.service';
import { codegenProjectCrudService } from '../../services/codegeneration/codegen-project-crud.service';
import { downloadAllFilesAsZip } from '../../components/codegeneration/utils/fileDownload';

const projectPath = (filename: string): string => path.resolve(
  process.cwd(),
  '..',
  'examples',
  'codegen-projects',
  filename
);

function loadProjectJson(filename: string): unknown {
  return JSON.parse(fs.readFileSync(projectPath(filename), 'utf8'));
}

function buildContext(model: Model, metamodel: Metamodel): Record<string, any> {
  const contextBuilder = new CodegenContextBuilderService();
  const virtualDiagram: Diagram = {
    id: 'smart-warehouse-codegen-e2e-test',
    name: 'Smart Warehouse Codegen E2E Test',
    modelId: model.id,
    elements: [],
  };
  const preparedElements = model.elements.map(element => (
    contextBuilder.prepareSingleElementContext(element)
  ));
  const namedModelContext: Record<string, any> = {
    id: model.id,
    name: model.name,
    elements: preparedElements,
  };

  model.elements.forEach((element, index) => {
    const name = element.style?.name;
    if (name) namedModelContext[name] = preparedElements[index];
  });

  return {
    ...contextBuilder.prepareMultiElementContext(model.elements, virtualDiagram, metamodel),
    elements: preparedElements,
    currentElement: {},
    metamodel: {
      id: metamodel.id,
      name: metamodel.name,
      classes: metamodel.classes,
    },
    model: {
      id: model.id,
      name: model.name,
      elements: preparedElements,
    },
    [model.name]: namedModelContext,
  };
}

// Renders every template of an imported project to { filename, content } pairs.
// The direct-Handlebars-compile approach (rather than a full CodeGenerationService
// run) is used because the render context here needs no persisted diagram/UI state;
// it mirrors the approach already established in
// smart-warehouse-codegen-projects.test.ts and keeps this test independent of
// diagram/editor wiring that other in-flight changes are touching.
// A leftover unresolved Handlebars tag always sits on a single line (e.g.
// "{{WarehouseModel.WarehouseMAS.ApplicationURI}}"). Config.java legitimately
// contains a multi-line Java double-brace initializer ("...() {{" ... "}};"),
// which must not be mistaken for an unresolved tag, so the check requires the
// opening and closing braces to appear on the same line.
const UNRESOLVED_MUSTACHE_PATTERN = /\{\{[^\n]*\}\}/;

function generateAllFiles(templates: { templateContent: string; outputPattern: string }[]): CodeGenerationResult[] {
  const model = smartWarehouseModel as unknown as Model;
  const metamodel = smartWarehouseMetamodel as Metamodel;
  const context = buildContext(model, metamodel);

  return templates.map(template => {
    const filename = Handlebars.compile(template.outputPattern, { noEscape: true })(context);
    const content = Handlebars.compile(template.templateContent, { noEscape: true })(context);
    return { filename, content };
  });
}

describe('Smart Warehouse codegen end-to-end (import -> generate -> zip)', () => {
  beforeAll(() => {
    new CodegenHandlebarsService().registerAllHelpers();
  });

  beforeEach(() => {
    codegenProjectCrudService.clearProjects();
    (global as any).URL.createObjectURL = jest.fn(() => 'blob:mock');
    (global as any).URL.revokeObjectURL = jest.fn();
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    codegenProjectCrudService.clearProjects();
  });

  it('imports the Visual Components project with all 8 templates', () => {
    const projectData = loadProjectJson('smart-warehouse-visual-components-project.json');
    let imported: CodeGenerationProject | undefined;
    expect(() => {
      imported = codegenProjectCrudService.importProject(projectData);
    }).not.toThrow();

    expect(imported).toBeDefined();
    expect(imported!.templates).toHaveLength(8);
  });

  it('imports the Omniverse project with its 6 templates', () => {
    const projectData = loadProjectJson('smart-warehouse-omniverse-project.json');
    let imported: CodeGenerationProject | undefined;
    expect(() => {
      imported = codegenProjectCrudService.importProject(projectData);
    }).not.toThrow();

    expect(imported).toBeDefined();
    expect(imported!.templates).toHaveLength(6);
  });

  it('generates all 8 Visual Components files with the expected filenames and no leftover mustache tags', () => {
    const projectData = loadProjectJson('smart-warehouse-visual-components-project.json') as {
      templates: { templateContent: string; outputPattern: string }[];
    };
    const imported = codegenProjectCrudService.importProject(projectData);
    const files = generateAllFiles(imported.templates);

    expect(files).toHaveLength(8);
    const filenames = files.map(f => f.filename);
    expect(filenames).toEqual(expect.arrayContaining([
      'Config.java',
      'SimulationScript.py',
      'PathwayAreaLocation.json',
      'RobotLocation.json',
      'ConveyorLocation.json',
      'OutputLocation.json',
      'ChargingStationLocation.json',
      'OPCUAConfig.xml',
    ]));

    files.forEach(file => {
      expect(file.content).not.toMatch(UNRESOLVED_MUSTACHE_PATTERN);
    });

    const opcUaConfig = files.find(f => f.filename === 'OPCUAConfig.xml');
    expect(opcUaConfig).toBeDefined();
    expect(opcUaConfig!.content).toContain(
      '<Array:string>urn:localhost:4840/WarehouseMAS</Array:string>'
    );
  });

  it('generates the Omniverse script, layout JSON, and four USD layers', () => {
    const projectData = loadProjectJson('smart-warehouse-omniverse-project.json') as {
      templates: { templateContent: string; outputPattern: string }[];
    };
    const imported = codegenProjectCrudService.importProject(projectData);
    const files = generateAllFiles(imported.templates);

    expect(files).toHaveLength(6);
    const filenames = files.map(f => f.filename);
    expect(filenames).toEqual(expect.arrayContaining([
      'generate_warehouse_usd.py',
      'warehouse_layout.json',
      'warehouse_layout.usda',
      'warehouse_assets.usda',
      'warehouse_physics.usda',
      'warehouse_simulation.usda',
    ]));

    const scene = files.find(f => f.filename === 'generate_warehouse_usd.py');
    expect(scene!.content).toContain('Usd.Stage.CreateNew');

    const layout = files.find(f => f.filename === 'warehouse_layout.json');
    const parsedLayout = JSON.parse(layout!.content);
    expect(parsedLayout.robots).toHaveLength(2);
    expect(parsedLayout.obstacles).toHaveLength(3);
    expect(parsedLayout.pickups).toHaveLength(2);
    expect(parsedLayout.dropoffs).toHaveLength(1);
    expect(parsedLayout.chargers).toHaveLength(2);
    expect(parsedLayout.robots[0].batteryLevel).toBeDefined();

    const rootLayer = files.find(f => f.filename === 'warehouse_simulation.usda');
    expect(rootLayer!.content).toContain('@./warehouse_layout.usda@');
    expect(rootLayer!.content).toContain('@./warehouse_assets.usda@');
    expect(rootLayer!.content).toContain('@./warehouse_physics.usda@');

    files.forEach(file => expect(file.content).not.toMatch(UNRESOLVED_MUSTACHE_PATTERN));
  });

  it('zips the generated Visual Components files and every filename round-trips through the archive', async () => {
    const projectData = loadProjectJson('smart-warehouse-visual-components-project.json') as {
      templates: { templateContent: string; outputPattern: string }[];
    };
    const imported = codegenProjectCrudService.importProject(projectData);
    const files = generateAllFiles(imported.templates);

    const zip = new JSZip();
    files.forEach(file => {
      zip.file(file.filename, file.content);
    });
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const reloaded = await JSZip.loadAsync(buffer);

    files.forEach(file => {
      expect(reloaded.file(file.filename)).not.toBeNull();
    });

    const roundTrippedConfig = await reloaded.file('Config.java')!.async('string');
    const originalConfig = files.find(f => f.filename === 'Config.java')!.content;
    expect(roundTrippedConfig).toBe(originalConfig);
  });

  it('zips the generated Omniverse file and it round-trips through the archive', async () => {
    const projectData = loadProjectJson('smart-warehouse-omniverse-project.json') as {
      templates: { templateContent: string; outputPattern: string }[];
    };
    const imported = codegenProjectCrudService.importProject(projectData);
    const files = generateAllFiles(imported.templates);

    const zip = new JSZip();
    files.forEach(file => {
      zip.file(file.filename, file.content);
    });
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const reloaded = await JSZip.loadAsync(buffer);

    expect(reloaded.file('generate_warehouse_usd.py')).not.toBeNull();
    const roundTripped = await reloaded.file('generate_warehouse_usd.py')!.async('string');
    expect(roundTripped).toBe(files[0].content);
  });

  it('drives the real downloadAllFilesAsZip for the Visual Components bundle without throwing', async () => {
    const projectData = loadProjectJson('smart-warehouse-visual-components-project.json') as {
      templates: { templateContent: string; outputPattern: string }[];
    };
    const imported = codegenProjectCrudService.importProject(projectData);
    const files = generateAllFiles(imported.templates);

    await expect(
      downloadAllFilesAsZip(files, 'smart-warehouse-visual-components.zip')
    ).resolves.toBeUndefined();

    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('drives the real downloadAllFilesAsZip for the Omniverse bundle without throwing', async () => {
    const projectData = loadProjectJson('smart-warehouse-omniverse-project.json') as {
      templates: { templateContent: string; outputPattern: string }[];
    };
    const imported = codegenProjectCrudService.importProject(projectData);
    const files = generateAllFiles(imported.templates);

    await expect(
      downloadAllFilesAsZip(files, 'smart-warehouse-omniverse.zip')
    ).resolves.toBeUndefined();

    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
