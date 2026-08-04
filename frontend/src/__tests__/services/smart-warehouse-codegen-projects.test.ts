import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import Handlebars from 'handlebars';
import smartWarehouseMetamodel from '../../examples/data/smart-warehouse-metamodel.json';
import smartWarehouseModel from '../../examples/data/smart-warehouse-model.json';
import { Diagram, Metamodel, Model } from '../../models/types';
import { CodegenContextBuilderService } from '../../services/codegeneration/codegen-context-builder.service';
import { CodegenHandlebarsService } from '../../services/codegeneration/codegen-handlebars.service';

interface ProjectTemplateFixture {
  name: string;
  language: 'java' | 'python' | 'json' | 'xml' | 'plaintext';
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
  const model = smartWarehouseModel as unknown as Model;
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
    expect(Object.values(outputs).join('\n')).not.toContain('Inspection Drone Alpha');
    expect(Object.values(outputs).join('\n')).not.toContain('Inspection Drone Beta');
    expect(outputs['SimulationScript.py']).toContain('robot_prefix + "State"');
    expect(outputs['Config.java']).toContain('public static final class ControllerSpec');
    expect(outputs['Config.java']).toContain('public static final class TaskSpec');
    expect(outputs['Config.java']).toContain('public static final class ProductSpec');
    expect(outputs['Config.java']).toContain('"Controller1"');
    expect(outputs['Config.java']).toContain('"Main Controller"');
    expect(outputs['Config.java']).toContain('"nearest-first"');
    expect(outputs['Config.java']).toContain('new String[] { "Robot1", "Robot2" }');
    expect(outputs['Config.java']).toContain('new String[] { "Conveyor1", "Conveyor2" }');
    expect(outputs['Config.java']).toContain(
      '"Task1",\n            "Task 1",\n            "Pending",\n            1,\n            "Robot1",\n            "Conveyor",\n            "Output Location"'
    );
    expect(outputs['Config.java']).toContain('"SKU-0001"');
    expect(outputs['Config.java']).toContain('public static final String NODE_STATE = "State"');
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
    expect(outputs['OPCUAConfig.xml']).toContain('ns=2;s=Robot1/State');
    expect(outputs['OPCUAConfig.xml']).toContain('<Property>Robot1State</Property>');
    [
      ['Location', 'NODE_LOCATION'],
      ['Target', 'NODE_TARGET'],
      ['State', 'NODE_STATE'],
      ['HasProduct', 'NODE_HAS_PRODUCT'],
      ['BatteryLevel', 'NODE_BATTERY_LEVEL'],
    ].forEach(([leaf, constant]) => {
      expect(outputs['OPCUAConfig.xml']).toContain(`ns=2;s=Robot1/${leaf}`);
      expect(outputs['Config.java']).toContain(constant);
    });
    expect(outputs['OPCUAConfig.xml']).toContain('<OpcUA:UserPrivateKeyFilePath i:nil="true"/>');
    expect(outputs['OPCUAConfig.xml']).not.toContain('umuta');
    expect(outputs['OPCUAConfig.xml']).not.toContain('DESKTOP-');
  });

  it('emits a javac-clean model-driven MAS Config when a JDK is installed', () => {
    try {
      execFileSync('javac', ['-version'], { stdio: 'pipe' });
    } catch (error: any) {
      if (error.code === 'ENOENT') return;
      throw error;
    }

    const outputs = renderProject(loadProject('smart-warehouse-visual-components-project.json'));
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spatialdsl-javac-'));
    try {
      const sourceDir = path.join(tempDir, 'warehouse', 'mas');
      fs.mkdirSync(sourceDir, { recursive: true });
      const sourcePath = path.join(sourceDir, 'Config.java');
      fs.writeFileSync(sourcePath, outputs['Config.java']);
      execFileSync('javac', ['-d', path.join(tempDir, 'classes'), sourcePath], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('renders the Omniverse OpenUSD scene script', () => {
    const project = loadProject('smart-warehouse-omniverse-project.json');
    const outputs = renderProject(project);

    expect(project.targetMetamodelId).toBe(smartWarehouseMetamodel.id);
    expect(Object.keys(outputs)).toEqual(
      expect.arrayContaining([
        'generate_warehouse_usd.py',
        'warehouse_layout.json',
        'warehouse_layout.usda',
        'warehouse_assets.usda',
        'warehouse_physics.usda',
        'warehouse_simulation.usda',
      ])
    );
    const generatedLayout = JSON.parse(outputs['warehouse_layout.json']);
    expect(generatedLayout.robots).toHaveLength(2);
    expect(generatedLayout.drones).toEqual([
      expect.objectContaining({ name: 'Inspection Drone Alpha', z: 4500, kinematic: true }),
      expect.objectContaining({ name: 'Inspection Drone Beta', z: 0, kinematic: true }),
    ]);
    Object.values(generatedLayout)
      .filter(Array.isArray)
      .flat()
      .forEach((record: any) => expect(Number.isFinite(record.z)).toBe(true));
    expect(outputs['generate_warehouse_usd.py']).toContain('Usd.Stage.CreateNew');
    expect(outputs['generate_warehouse_usd.py']).toContain('ASSET_MAP = {');
    expect(outputs['generate_warehouse_usd.py']).toContain(
      'cc0-mini-vehicle-kit/demo_forklift.usda'
    );
    expect(outputs['generate_warehouse_usd.py']).toContain('GetReferences().AddReference');
    expect(outputs['generate_warehouse_usd.py']).toContain('Asset not found; using placeholder');
    expect(outputs['generate_warehouse_usd.py']).toContain('Referenced assets: ');
    expect(outputs['generate_warehouse_usd.py'].match(/"class_name":/g)).toHaveLength(30);
    expect(outputs['generate_warehouse_usd.py']).toContain('"z_mm": 4500');
    expect(outputs['generate_warehouse_usd.py']).toContain('"z_mm": 0');
    expect(outputs['generate_warehouse_usd.py']).toContain('spatialDsl:baseElevationMm');
    expect(outputs['generate_warehouse_usd.py']).toContain(
      'Gf.Vec3d(x_m, y_m, z_m + height_m / 2.0)'
    );
    expect(outputs['generate_warehouse_usd.py']).toContain(
      'print("Elements: " + str(len(ELEMENTS)))'
    );
    expect(outputs['warehouse_layout.usda']).toContain('def Xform "Mobile_Robot_Resource_0"');
    expect(outputs['warehouse_layout.usda']).toContain('def Xform "InspectionDrone"');
    expect(outputs['warehouse_layout.usda']).toContain('double3 xformOp:translate = (12, 6, 4.5)');
    expect(outputs['warehouse_layout.usda']).toContain('double3 xformOp:translate = (18, 6, 0)');
    expect(outputs['warehouse_assets.usda']).toContain(
      'nvidia-f1tenth-amr/f1tenth_amr_collision.usda'
    );
    expect(outputs['warehouse_assets.usda']).toContain(
      'warehouse-kit/inspection_drone.usda'
    );
    expect(outputs['warehouse_physics.usda']).toContain('def PhysicsScene "PhysicsScene"');
    expect(outputs['warehouse_physics.usda']).toContain('bool physics:kinematicEnabled = true');
    expect(outputs['warehouse_physics.usda']).toContain('over "InspectionDrone"');
    expect(outputs['warehouse_physics.usda']).toContain(
      'custom string spatialDsl:bodyMode = "kinematic-aerial-placement"'
    );
    expect(outputs['warehouse_physics.usda']).not.toContain('over "PathwayArea"');
    expect(outputs['warehouse_simulation.usda']).toContain('@./warehouse_layout.usda@');
    expect(outputs['warehouse_simulation.usda']).toContain('@./warehouse_assets.usda@');
    expect(outputs['warehouse_simulation.usda']).toContain('@./warehouse_physics.usda@');
  });

  it('emits usdchecker-clean layered scenes when OpenUSD tools are installed', () => {
    if (!fs.existsSync('/usr/bin/usdchecker')) return;
    const outputs = renderProject(loadProject('smart-warehouse-omniverse-project.json'));
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spatialdsl-usd-'));
    try {
      const sourceAssets = path.resolve(process.cwd(), '..', 'examples', 'omniverse-assets');
      fs.symlinkSync(sourceAssets, path.join(tempDir, 'omniverse-assets'), 'dir');
      const layers = [
        'warehouse_layout.usda',
        'warehouse_assets.usda',
        'warehouse_physics.usda',
        'warehouse_simulation.usda',
      ];
      layers.forEach(filename => fs.writeFileSync(path.join(tempDir, filename), outputs[filename]));
      layers.forEach(filename => {
        try {
          execFileSync('/usr/bin/usdchecker', [path.join(tempDir, filename)], {
            encoding: 'utf8',
            stdio: 'pipe',
          });
        } catch (error: any) {
          throw new Error(
            `${filename} failed usdchecker:\n${error.stdout || ''}${error.stderr || ''}`
          );
        }
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('retains the CC0 composition demonstrator as a legacy fallback fixture', () => {
    const assetRoot = path.resolve(
      process.cwd(),
      '..',
      'examples',
      'omniverse-assets',
      'cc0-mini-vehicle-kit'
    );
    const requiredFiles = [
      'demo_forklift.usda',
      'SOURCE.md',
      'UPSTREAM_README.md',
      'assets/vehicles/tractor/asset/tractorBodyAsset.usda',
      'assets/vehicles/tractor/geo/tractorGeo.usd',
      'assets/wheels/wheelWide/asset/wheelWideAsset.usda',
      'assets/wheels/wheelWide/geo/wheelWideGeo.usd',
      'assets/wheels/wheelBlack/asset/wheelBlackAsset.usda',
      'assets/wheels/wheelBlack/geo/wheelBlackGeo.usd',
      'materials/lightGrey.usda',
      'materials/mediumGrey.usda',
      'textures/global-colors/greylight.jpg',
      'textures/global-colors/greymedium.jpg',
    ];

    requiredFiles.forEach(relativePath => {
      expect(fs.existsSync(path.join(assetRoot, relativePath))).toBe(true);
    });

    const sourceNotes = fs.readFileSync(path.join(assetRoot, 'SOURCE.md'), 'utf8');
    expect(sourceNotes).toContain('Creative Commons Zero (CC0 1.0)');
    expect(sourceNotes).toContain('1b91f3c464891af259d51d9ee9ee9e6c357f7079');
  });

  it('includes the normalized MIT F1TENTH production asset and physics layers', () => {
    const assetRoot = path.resolve(
      process.cwd(),
      '..',
      'examples',
      'omniverse-assets',
      'nvidia-f1tenth-amr'
    );
    [
      'LICENSE',
      'SOURCE.md',
      'QA.md',
      'f1tenth_amr.usda',
      'f1tenth_amr_collision.usda',
      'f1tenth_amr_articulation.usda',
      'layers/materials.usda',
      'layers/visual.usda',
      'layers/collision.usda',
      'layers/articulation.usda',
    ].forEach(relativePath => {
      expect(fs.existsSync(path.join(assetRoot, relativePath))).toBe(true);
    });

    const sourceNotes = fs.readFileSync(path.join(assetRoot, 'SOURCE.md'), 'utf8');
    expect(sourceNotes).toContain('NVIDIA-Omniverse/sample-ackermann-amr');
    expect(sourceNotes).toContain('ccf6b3ee65a3df82160b217a4cd1b523b2f7c351');
    expect(sourceNotes).toContain('MIT');
  });

  it('includes the project-authored base-normalized inspection drone asset', () => {
    const assetRoot = path.resolve(
      process.cwd(),
      '..',
      'examples',
      'omniverse-assets',
      'warehouse-kit'
    );
    const droneAsset = fs.readFileSync(path.join(assetRoot, 'inspection_drone.usda'), 'utf8');
    const sourceNotes = fs.readFileSync(path.join(assetRoot, 'SOURCE.md'), 'utf8');

    expect(droneAsset).toContain('defaultPrim = "InspectionDrone"');
    expect(droneAsset).toContain('metersPerUnit = 1');
    expect(droneAsset).toContain('upAxis = "Z"');
    expect(droneAsset).toContain('custom string spatialDsl:pivot = "base-center"');
    expect(sourceNotes).toContain('inspection_drone.usda');
    expect(sourceNotes).toContain('base Z=0');
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
        expect(['java', 'python', 'json', 'xml', 'plaintext']).toContain(template.language);
        expect(template.templateContent).toBeTruthy();
        expect(template.outputPattern).toBeTruthy();
        expect(template.targetMetamodelId ?? project.targetMetamodelId).toBe(smartWarehouseMetamodel.id);
      });
    });
  });
});
