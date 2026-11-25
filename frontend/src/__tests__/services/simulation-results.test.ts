import { exampleDataService } from '../../services/metamodel/exampleData.service';
import warehouse from '../../examples/data/smart-warehouse-model.json';
import {
  matchingSimulationModels, parseSimulationReport, resolveSimulationElementId,
} from '../../services/simulation-results.service';

const rack = warehouse.elements.find(element => element.style.name === 'Storage Rack #2')!;
const trace = { elementId: rack.id, elementName: 'Storage Rack #2', className: 'StorageRack', prim: '/World/Storage_Rack__2' };
const designPose = { x: 1500, y: 2000, z: 0, rotationZ: 15 };
const observedPose = { ...designPose, x: 300 };
const sample = {
  provenance: {
    modelId: warehouse.id,
    modelHash: 'sha256:warehouse',
    observation: { source: 'stand-in', durationS: 60, samples: 121 },
  },
  ruleFindings: [{
    kind: 'runtime-rule-violation', ruleId: 'clearance', ruleName: 'Storage rack aisle width',
    severity: 'error', message: 'The aisle is too narrow.', firstT: 20, lastT: 59, samples: 79,
    elements: [trace],
  }],
  deviations: [{ kind: 'runtime-drift', trace, onsetT: 20, designPose, observedPose, finalPose: observedPose }],
};

it('reads legacy and current reports and rejects missing or invalid poses', () => {
  expect(parseSimulationReport(JSON.stringify(sample)).deviations[0].observedPose).toEqual(observedPose);
  const current = { ...sample, ruleFindings: [{ ...sample.ruleFindings[0], poses: [{ elementId: rack.id, designPose, observedPose }] }] };
  expect(parseSimulationReport(JSON.stringify(current)).ruleFindings[0].poses?.[0].observedPose).toEqual(observedPose);
  expect(() => parseSimulationReport(JSON.stringify({ ...sample, deviations: [{ ...sample.deviations[0], observedPose: null }] })))
    .toThrow('valid findings');
  expect(() => parseSimulationReport('{')).toThrow('invalid JSON');
});

it('locates the reported rack in a remapped Smart Warehouse starter', () => {
  const report = parseSimulationReport(JSON.stringify(sample));
  const starter = exampleDataService.getSmartWarehouseBundle('test-project');
  const [model] = starter.models;
  const [metamodel] = starter.metamodels;
  const remappedRack = model.elements.find(element => element.style.name === trace.elementName)!;
  expect(matchingSimulationModels(report, starter.models, starter.metamodels)).toEqual([model]);
  expect(remappedRack.id).not.toBe(trace.elementId);
  expect(resolveSimulationElementId(report, trace, model, metamodel)).toBe(remappedRack.id);

  const ambiguousModel = { ...model, elements: [...model.elements, { ...remappedRack, id: 'duplicate-rack' }] };
  expect(resolveSimulationElementId(report, trace, ambiguousModel, metamodel)).toBeUndefined();
  expect(resolveSimulationElementId(report, { ...trace, elementId: 'unrecognized' }, model, metamodel)).toBeUndefined();
  const renamedModel = { ...model, elements: model.elements.map(element => element.id === remappedRack.id
    ? { ...element, name: 'Renamed rack' }
    : element) };
  expect(resolveSimulationElementId(report, trace, renamedModel, metamodel, { [trace.elementId]: remappedRack.id })).toBe(remappedRack.id);
});
