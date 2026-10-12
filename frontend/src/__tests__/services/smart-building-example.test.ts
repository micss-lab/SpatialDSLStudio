import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import smartBuildingMetamodel from '../../examples/data/smart-building-metamodel.json';
import smartBuildingModel from '../../examples/data/smart-building-model.json';
import smartBuildingViewpoints from '../../examples/data/smart-building-viewpoints.json';
import smartBuildingProject from '../../examples/data/smart-building-project.json';
import { Diagram, Metamodel, Model, Viewpoint } from '../../models/types';
import { evaluateSpatialRules, validateConcreteSyntaxMapVerticalPlacements, validateSpatialRules } from '../../services/spatial';
import { exampleDataService } from '../../services/metamodel/exampleData.service';
import { CodegenContextBuilderService } from '../../services/codegeneration/codegen-context-builder.service';
import { CodegenHandlebarsService } from '../../services/codegeneration/codegen-handlebars.service';

const metamodel = smartBuildingMetamodel as unknown as Metamodel;
const model = smartBuildingModel as unknown as Model;
const viewpoint = (smartBuildingViewpoints as unknown as Viewpoint[])[0];
const classId = (name: string) => metamodel.classes.find(metaClass => metaClass.name === name)!.id;
const byName = (target: Model, name: string) => target.elements.find(element => element.style.name === name)!;
const copy = (): Model => JSON.parse(JSON.stringify(model));

describe('Smart Building example language', () => {
  it('declares rooms, a corridor, and devices with the planned rules', () => {
    expect(metamodel.classes.map(metaClass => metaClass.name)).toEqual(expect.arrayContaining([
      'Building', 'Zone', 'Room', 'Corridor', 'Device', 'SmokeDetector', 'MotionSensor', 'Camera', 'Gateway',
    ]));
    expect(validateSpatialRules(metamodel.spatialRules, metamodel)).toEqual([]);
    expect(metamodel.spatialRules!.map(rule => [rule.kind, rule.distanceMm, rule.mode])).toEqual([
      ['noOverlap', undefined, 'plan'],
      ['within', undefined, 'plan'],
      ['within', 300, 'plan'],
      ['maxDistance', 15000, 'volume'],
    ]);
  });

  it('models six rooms, one corridor, and 25 devices that satisfy every rule', () => {
    const count = (name: string) => model.elements.filter(element => element.modelElementId === classId(name)).length;
    expect(count('Room')).toBe(6);
    expect(count('Corridor')).toBe(1);
    expect(['SmokeDetector', 'MotionSensor', 'Camera', 'Gateway'].reduce((sum, name) => sum + count(name), 0)).toBe(25);
    expect(evaluateSpatialRules(metamodel, model)).toEqual([]);
  });

  it('reports a smoke detector moved out of its room', () => {
    const moved = copy();
    // Onto the wall between rooms 104 and 105.
    byName(moved, 'SD-104').presentation!.position3D = { x: -5000, y: -4600, z: 2700 };
    expect(evaluateSpatialRules(metamodel, moved).map(issue => issue.message)).toEqual([
      'Device inside a zone: SD-104 is not inside any Zone.',
      'Smoke detector away from walls: SD-104 must be at least 300 mm inside a room or corridor.',
    ]);

    // Still inside room 104, but within 300 mm of its wall.
    byName(moved, 'SD-104').presentation!.position3D = { x: -5250, y: -4600, z: 2700 };
    expect(evaluateSpatialRules(metamodel, moved).map(issue => issue.constraintId)).toEqual([
      metamodel.spatialRules![2].id,
    ]);
  });

  it('reports devices left outside gateway range when a gateway is removed', () => {
    const withoutGateway = copy();
    withoutGateway.elements = withoutGateway.elements.filter(element => element.style.name !== 'GW-2');
    const issues = evaluateSpatialRules(metamodel, withoutGateway);

    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every(issue => issue.constraintId === metamodel.spatialRules![3].id)).toBe(true);
    expect(issues.map(issue => byName(model, issue.message.split(': ')[1].split(' ')[0]).style.name)).toEqual(
      expect.arrayContaining(['CAM-C2', 'MS-103', 'MS-106'])
    );
    // Every reported device is more than 15 m (centre to centre, in 3D) from GW-1.
    const gw1 = byName(model, 'GW-1').presentation!.position3D!;
    issues.forEach(issue => {
      const device = byName(model, issue.message.split(': ')[1].split(' ')[0]).presentation!.position3D!;
      expect(Math.hypot(device.x - gw1.x, device.y - gw1.y)).toBeGreaterThan(14000);
    });
  });

  it('places devices with adjustable elevation and keeps zones grounded', () => {
    const representation = viewpoint.representationDescriptions.find(item => item.name === 'Device Placement 3D')!;
    const syntax = representation.concreteSyntaxByMetaClassId!;
    expect(validateConcreteSyntaxMapVerticalPlacements(syntax)).toEqual([]);
    expect(syntax[classId('SmokeDetector')].three_d!.verticalPlacement).toEqual(expect.objectContaining({
      mode: 'adjustable', defaultBaseZMm: 2700, minBaseZMm: 0, maxBaseZMm: 4000,
    }));
    expect(syntax[classId('MotionSensor')].three_d!.verticalPlacement!.defaultBaseZMm).toBe(2200);
    expect(syntax[classId('Camera')].three_d!.verticalPlacement!.defaultBaseZMm).toBe(2500);
    expect(syntax[classId('Gateway')].three_d!.verticalPlacement!.defaultBaseZMm).toBe(2400);
    expect(syntax[classId('Room')].three_d!.verticalPlacement!.mode).toBe('grounded');
    expect(syntax[classId('Corridor')].three_d!.verticalPlacement!.mode).toBe('grounded');
  });

  it('generates a commissioning list whose positions match the model in metres', () => {
    new CodegenHandlebarsService().registerAllHelpers();
    const builder = new CodegenContextBuilderService();
    const diagram: Diagram = { id: 'commissioning', name: 'Commissioning', modelId: model.id, elements: [] };
    const context = builder.prepareMultiElementContext(model.elements, diagram, metamodel);
    const template = (smartBuildingProject as any).templates[0];
    const output = JSON.parse(Handlebars.compile(template.templateContent, { noEscape: true })(context));

    expect(Handlebars.compile(template.outputPattern)(context)).toBe('device-commissioning.json');
    expect(output.building).toBe('Research Building');
    expect(output.devices).toHaveLength(25);
    output.devices.forEach((device: any) => {
      const element = byName(model, device.deviceId);
      const position = element.presentation!.position3D!;
      expect(device.x).toBeCloseTo(position.x / 1000, 9);
      expect(device.y).toBeCloseTo(position.y / 1000, 9);
      expect(device.z).toBeCloseTo(position.z / 1000, 9);
      expect(device.yaw).toBe(element.presentation!.rotationZ || 0);
    });
    expect(output.devices.find((device: any) => device.deviceId === 'SD-105')).toEqual(expect.objectContaining({
      type: 'SmokeDetector', room: 'Room 105', gateway: 'GW-1', z: 3,
    }));
    expect(output.devices.find((device: any) => device.deviceId === 'GW-1')).toEqual(expect.objectContaining({
      type: 'Gateway', room: 'Main corridor', z: 2.4,
    }));
  });

  it('is bundled as a project starter with consistently remapped ids', () => {
    const bundle = exampleDataService.getSmartBuildingBundle();
    expect(bundle.metamodels).toHaveLength(1);
    expect(bundle.models).toHaveLength(1);
    expect(bundle.viewpoints).toHaveLength(1);
    expect(bundle.views).toHaveLength(3);
    expect(bundle.projects).toHaveLength(1);

    const [remappedMetamodel] = bundle.metamodels;
    expect(remappedMetamodel.id).not.toBe(metamodel.id);
    expect(bundle.models[0].conformsTo).toBe(remappedMetamodel.id);
    expect(bundle.projects[0].targetMetamodelId).toBe(remappedMetamodel.id);
    expect(validateSpatialRules(remappedMetamodel.spatialRules, remappedMetamodel)).toEqual([]);
    expect(evaluateSpatialRules(remappedMetamodel, bundle.models[0])).toEqual([]);
  });

  it('ships the commissioning generator next to the other codegen examples', () => {
    const shipped = JSON.parse(fs.readFileSync(
      path.resolve(process.cwd(), '..', 'examples', 'codegen-projects', 'smart-building-commissioning-project.json'),
      'utf8'
    ));
    expect(shipped).toEqual(smartBuildingProject);
  });
});
