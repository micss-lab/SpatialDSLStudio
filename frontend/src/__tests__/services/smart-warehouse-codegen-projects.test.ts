import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import smartWarehouseMetamodel from '../../examples/data/smart-warehouse-metamodel.json';
import smartWarehouseModel from '../../examples/data/smart-warehouse-model.json';
import { Diagram, Metamodel, Model } from '../../models/types';
import { CodegenContextBuilderService } from '../../services/codegeneration/codegen-context-builder.service';
import { CodegenHandlebarsService } from '../../services/codegeneration/codegen-handlebars.service';

interface ProjectTemplateFixture {
  name: string;
  language: 'java' | 'python';
  templateContent: string;
  outputPattern: string;
  targetMetamodelId?: string;
}

interface ProjectFixture {
  name: string;
  targetMetamodelId: string;
  templates: ProjectTemplateFixture[];
}

const projectPath = (filename: string): string => path.resolve(
  process.cwd(),
  '..',
  'examples',
  'codegen-projects',
  filename
);

function loadProject(filename: string): ProjectFixture {
  return JSON.parse(fs.readFileSync(projectPath(filename), 'utf8')) as ProjectFixture;
}

function buildContext(model: Model, metamodel: Metamodel): Record<string, any> {
  const contextBuilder = new CodegenContextBuilderService();
  const virtualDiagram: Diagram = {
    id: 'smart-warehouse-codegen-test',
    name: 'Smart Warehouse Codegen Test',
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

function renderProject(project: ProjectFixture): Record<string, string> {
  const model = smartWarehouseModel as Model;
  const metamodel = smartWarehouseMetamodel as Metamodel;
  const context = buildContext(model, metamodel);

  return Object.fromEntries(project.templates.map(template => {
    const filename = Handlebars.compile(template.outputPattern, { noEscape: true })(context);
    const content = Handlebars.compile(template.templateContent, { noEscape: true })(context);
    return [filename, content];
  }));
}

describe('Smart Warehouse code generation project fixtures', () => {
  beforeAll(() => {
    new CodegenHandlebarsService().registerAllHelpers();
  });

  it('renders the Visual Components bundle with valid JSON location files', () => {
    const project = loadProject('smart-warehouse-visual-components-project.json');
    const outputs = renderProject(project);

    expect(project.targetMetamodelId).toBe(smartWarehouseMetamodel.id);
    expect(Object.keys(outputs)).toEqual([
      'SimulationScript.py',
      'Config.java',
      'PathwayAreaLocation.json',
      'RobotLocation.json',
      'ConveyorLocation.json',
      'OutputLocation.json',
      'ChargingStationLocation.json',
      'OPCUAConfig.xml',
    ]);

    const jsonOutputs = Object.entries(outputs).filter(([filename]) => filename.endsWith('.json'));
    jsonOutputs.forEach(([, content]) => expect(() => JSON.parse(content)).not.toThrow());

    expect(JSON.parse(outputs['PathwayAreaLocation.json'])).toHaveLength(18);
    expect(JSON.parse(outputs['RobotLocation.json'])).toHaveLength(2);
    expect(JSON.parse(outputs['ConveyorLocation.json'])).toHaveLength(2);
    expect(JSON.parse(outputs['OutputLocation.json'])).toHaveLength(1);
    expect(JSON.parse(outputs['ChargingStationLocation.json'])).toHaveLength(2);
    expect(outputs['SimulationScript.py']).toContain('MobileRobotQuantity = 2');
    expect(outputs['SimulationScript.py']).toContain('ConveyorQuantity = 2');
    expect(outputs['OPCUAConfig.xml']).toContain('<ConnectivityConfiguration');
    const parsedOpcUaConfig = new DOMParser().parseFromString(
      outputs['OPCUAConfig.xml'],
      'application/xml'
    );
    expect(parsedOpcUaConfig.querySelector('parsererror')).toBeNull();
    expect(outputs['OPCUAConfig.xml']).toContain(
      '<OpcUA:ServerUrl>opc.tcp://localhost:4840</OpcUA:ServerUrl>'
    );
    expect(outputs['OPCUAConfig.xml']).toContain('<Array:string>urn:warehouse:mas</Array:string>');
    expect(outputs['OPCUAConfig.xml']).toContain('<OpcUA:UserPrivateKeyFilePath i:nil="true"/>');
    expect(outputs['OPCUAConfig.xml']).not.toContain('umuta');
    expect(outputs['OPCUAConfig.xml']).not.toContain('DESKTOP-');
  });

  it('renders the Omniverse OpenUSD scene script', () => {
    const project = loadProject('smart-warehouse-omniverse-project.json');
    const outputs = renderProject(project);

    expect(project.targetMetamodelId).toBe(smartWarehouseMetamodel.id);
    expect(Object.keys(outputs)).toEqual(['generate_warehouse_usd.py']);
    expect(outputs['generate_warehouse_usd.py']).toContain('Usd.Stage.CreateNew');
    expect(outputs['generate_warehouse_usd.py'].match(/"class_name":/g)).toHaveLength(25);
    expect(outputs['generate_warehouse_usd.py']).toContain(
      'print("Elements: " + str(len(ELEMENTS)))'
    );
  });

  it('uses template metadata accepted by the current project importer', () => {
    const projects = [
      loadProject('smart-warehouse-visual-components-project.json'),
      loadProject('smart-warehouse-omniverse-project.json'),
    ];

    projects.forEach(project => {
      expect(project.name).toBeTruthy();
      expect(project.targetMetamodelId).toBe(smartWarehouseMetamodel.id);
      expect(project.templates.length).toBeGreaterThan(0);
      project.templates.forEach(template => {
        expect(['java', 'python']).toContain(template.language);
        expect(template.templateContent).toBeTruthy();
        expect(template.outputPattern).toBeTruthy();
        expect(template.targetMetamodelId ?? project.targetMetamodelId).toBe(smartWarehouseMetamodel.id);
      });
    });
  });
});
