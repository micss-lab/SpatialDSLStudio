import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import smartHomeMetamodel from '../../examples/data/smart-home-metamodel.json';
import smartHomeModel from '../../examples/data/smart-home-model.json';
import smartHomeViewpoints from '../../examples/data/smart-home-viewpoints.json';
import smartHomeProject from '../../examples/data/smart-home-project.json';
import { Diagram, Metamodel, Model, Viewpoint } from '../../models/types';
import { evaluateSpatialRules, validateConcreteSyntaxMapVerticalPlacements, validateSpatialRules } from '../../services/spatial';
import { exampleDataService } from '../../services/metamodel/exampleData.service';
import { CodegenContextBuilderService } from '../../services/codegeneration/codegen-context-builder.service';
import { CodegenHandlebarsService } from '../../services/codegeneration/codegen-handlebars.service';

const metamodel = smartHomeMetamodel as unknown as Metamodel;
const model = smartHomeModel as unknown as Model;
const viewpoint = (smartHomeViewpoints as unknown as Viewpoint[])[0];
const classId = (name: string) => metamodel.classes.find(metaClass => metaClass.name === name)!.id;
const byName = (target: Model, name: string) => target.elements.find(element => element.style.name === name)!;
const copy = (): Model => JSON.parse(JSON.stringify(model));
const DEVICE_CLASSES = ['Hub', 'SmokeDetector', 'MotionSensor', 'Thermostat', 'Camera', 'SmartPlug'];

describe('Smart Home example language', () => {
  it('declares rooms, a hub, and devices under an abstract Device with the planned rules', () => {
    expect(metamodel.classes.map(metaClass => metaClass.name)).toEqual([
      'Home', 'Room', 'Device', 'Hub', 'SmokeDetector', 'MotionSensor', 'Thermostat', 'Camera', 'SmartPlug',
    ]);
    expect(metamodel.classes.find(metaClass => metaClass.name === 'Device')!.abstract).toBe(true);
    DEVICE_CLASSES.forEach(name => {
      expect(metamodel.classes.find(metaClass => metaClass.name === name)!.superTypes).toEqual([classId('Device')]);
    });
    expect(validateSpatialRules(metamodel.spatialRules, metamodel)).toEqual([]);
    expect(metamodel.spatialRules!.map(rule => [rule.kind, rule.sourceClassId, rule.targetClassId, rule.distanceMm, rule.mode]))
      .toEqual([
        ['noOverlap', classId('Room'), classId('Room'), undefined, 'plan'],
        ['within', classId('Device'), classId('Room'), undefined, 'plan'],
        ['within', classId('SmokeDetector'), classId('Room'), 300, 'plan'],
        ['maxDistance', classId('Device'), classId('Hub'), 10000, 'volume'],
      ]);
  });

  it('models five rooms, one hub, and 12 devices that satisfy every rule', () => {
    const count = (name: string) => model.elements.filter(element => element.modelElementId === classId(name)).length;
    expect(model.elements.filter(element => element.modelElementId === classId('Room')).map(room => room.style.name))
      .toEqual(['Hallway', 'Living room', 'Kitchen', 'Bedroom', 'Bathroom']);
    expect(count('Hub')).toBe(1);
    expect(DEVICE_CLASSES.slice(1).reduce((sum, name) => sum + count(name), 0)).toBe(12);
    expect(evaluateSpatialRules(metamodel, model)).toEqual([]);
  });

  it('reports a smoke detector moved out of its room or too close to its walls', () => {
    const moved = copy();
    // Onto the wall between the living room and the hallway.
    byName(moved, 'SD-LIV').presentation!.position3D = { x: -2000, y: 500, z: 2600 };
    expect(evaluateSpatialRules(metamodel, moved).map(issue => issue.message)).toEqual([
      'Device inside a room: SD-LIV is not inside any Room.',
      'Smoke detector away from walls: SD-LIV must be at least 300 mm inside a room.',
    ]);

    // Still inside the living room, but 140 mm from that wall.
    byName(moved, 'SD-LIV').presentation!.position3D = { x: -2000, y: 700, z: 2600 };
    expect(evaluateSpatialRules(metamodel, moved).map(issue => [issue.constraintId, issue.elementId])).toEqual([
      [metamodel.spatialRules![2].id, byName(moved, 'SD-LIV').id],
    ]);

    // Exactly 300 mm from the wall is allowed.
    byName(moved, 'SD-LIV').presentation!.position3D = { x: -2000, y: 860, z: 2600 };
    expect(evaluateSpatialRules(metamodel, moved)).toEqual([]);
  });

  it('reports a device moved out of hub range', () => {
    const moved = copy();
    // Outside, north of the living room: 11.6 m from the hub (centre to centre, in 3D).
    byName(moved, 'CAM-LIV').presentation!.position3D = { x: -4850, y: 9000, z: 2200 };
    expect(evaluateSpatialRules(metamodel, moved).map(issue => issue.message)).toEqual([
      'Device inside a room: CAM-LIV is not inside any Room.',
      'Device in hub range: CAM-LIV has no Hub within 10000 mm; the nearest is 11585.5 mm away.',
    ]);
  });

  it('places devices with adjustable elevation and keeps rooms grounded', () => {
    viewpoint.representationDescriptions.filter(item => item.kind === 'diagram').forEach(representation => {
      const syntax = representation.concreteSyntaxByMetaClassId!;
      expect(validateConcreteSyntaxMapVerticalPlacements(syntax)).toEqual([]);
      expect(syntax[classId('Room')].three_d!.verticalPlacement!.mode).toBe('grounded');
      expect(Object.fromEntries(DEVICE_CLASSES.map(name => [name, syntax[classId(name)].three_d!.verticalPlacement])))
        .toEqual(Object.fromEntries(Object.entries({
          Hub: 900, SmokeDetector: 2400, MotionSensor: 2100, Thermostat: 1500, Camera: 2200, SmartPlug: 300,
        }).map(([name, defaultBaseZMm]) => [name, {
          mode: 'adjustable', defaultBaseZMm, minBaseZMm: 0, maxBaseZMm: 3000, stepMm: 50,
        }])));
    });
  });

  it('generates a device configuration list whose positions match the model in metres', () => {
    new CodegenHandlebarsService().registerAllHelpers();
    const builder = new CodegenContextBuilderService();
    const diagram: Diagram = { id: 'configuration', name: 'Configuration', modelId: model.id, elements: [] };
    const context = builder.prepareMultiElementContext(model.elements, diagram, metamodel);
    const template = (smartHomeProject as any).templates[0];
    const output = JSON.parse(Handlebars.compile(template.templateContent, { noEscape: true })(context));

    expect(Handlebars.compile(template.outputPattern)(context)).toBe('device-configuration.json');
    expect(output.home).toBe('Example Home');
    expect(output.devices).toHaveLength(13);
    output.devices.forEach((device: any) => {
      const element = byName(model, device.deviceId);
      const position = element.presentation!.position3D!;
      expect(Object.keys(device)).toEqual(['deviceId', 'type', 'room', 'x', 'y', 'z', 'yaw']);
      expect(device.type).toBe(metamodel.classes.find(metaClass => metaClass.id === element.modelElementId)!.name);
      expect(device.room).toBe(model.elements.find(candidate => candidate.id === element.references.room)!.style.name);
      expect(device.x).toBeCloseTo(position.x / 1000, 9);
      expect(device.y).toBeCloseTo(position.y / 1000, 9);
      expect(device.z).toBeCloseTo(position.z / 1000, 9);
      expect(device.yaw).toBe(element.presentation!.rotationZ || 0);
    });
    expect(output.devices.find((device: any) => device.deviceId === 'SD-LIV')).toEqual({
      deviceId: 'SD-LIV', type: 'SmokeDetector', room: 'Living room', x: -2, y: 3.5, z: 2.6, yaw: 0,
    });
    expect(output.devices.find((device: any) => device.deviceId === 'TH-LIV')).toEqual(expect.objectContaining({
      type: 'Thermostat', z: 1.5, yaw: 90,
    }));
  });

  it('keeps the device list valid JSON when names contain quotes, backslashes, or newlines', () => {
    new CodegenHandlebarsService().registerAllHelpers();
    const awkward = copy();
    byName(awkward, 'SD-LIV').style.deviceId = 'SD "LIV" \\ 1\nB';
    byName(awkward, 'Living room').style.name = 'Living "room"';
    const diagram: Diagram = { id: 'configuration', name: 'Configuration', modelId: awkward.id, elements: [] };
    const context = new CodegenContextBuilderService().prepareMultiElementContext(awkward.elements, diagram, metamodel);
    const template = (smartHomeProject as any).templates[0];
    const output = JSON.parse(Handlebars.compile(template.templateContent, { noEscape: true })(context));

    expect(output.devices.find((device: any) => device.deviceId === 'SD "LIV" \\ 1\nB')).toEqual(expect.objectContaining({
      room: 'Living "room"',
    }));
  });

  it('is bundled as a project starter with consistently remapped ids', () => {
    const bundle = exampleDataService.getSmartHomeBundle();
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

  it('gives each project its own starter ids, stable for retries in that project', () => {
    const first = exampleDataService.getSmartHomeBundle('project-a');
    const retry = exampleDataService.getSmartHomeBundle('project-a');
    const second = exampleDataService.getSmartHomeBundle('project-b');

    expect(retry).toEqual(first);
    expect(second.metamodels[0].id).not.toBe(first.metamodels[0].id);
    expect(second.models[0].elements.map(element => element.id))
      .not.toEqual(expect.arrayContaining([first.models[0].elements[0].id]));
    expect(exampleDataService.getSmartHomeBundle().metamodels[0].id).not.toBe(first.metamodels[0].id);
    expect(evaluateSpatialRules(second.metamodels[0], second.models[0])).toEqual([]);
  });

  it('bundles the UML Activity example as a starter as well', () => {
    const bundle = exampleDataService.getActivityBundle();
    expect(bundle.metamodels.map(item => item.name)).toEqual(['UMLActivityDiagramMM']);
    expect(bundle.models).toHaveLength(1);
    expect(bundle.viewpoints).toHaveLength(1);
    expect(bundle.views.map(view => view.name)).toEqual(['Order Processing Flow', 'Happy Path (In Stock)']);
    expect(bundle.projects).toHaveLength(0);
  });

  it('ships the device configuration generator next to the other codegen examples', () => {
    const shipped = JSON.parse(fs.readFileSync(
      path.resolve(process.cwd(), '..', 'examples', 'codegen-projects', 'smart-home-device-configuration-project.json'),
      'utf8'
    ));
    expect(shipped).toEqual(smartHomeProject);
  });
});
