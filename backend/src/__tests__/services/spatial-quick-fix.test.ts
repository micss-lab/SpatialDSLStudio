import { readFileSync } from 'fs';
import path from 'path';
import { mockReset } from 'jest-mock-extended';
import { Metamodel, Model, ModelElement, SpatialQuickFixRequest, SpatialRule } from '../../../../shared/types';
import { evaluateSpatialRules } from '../../../../shared/spatial-rules';
import { diagramService } from '../../services/diagram.service';
import { planSpatialQuickFix } from '../../services/spatial-quick-fix';
import { prismaMock } from '../helpers/prisma.mock';

const rule: SpatialRule = {
  id: 'gap', name: 'Keep racks clear', kind: 'minClearance', distanceMm: 500,
  sourceClassId: 'rack', targetClassId: 'rack', mode: 'volume', severity: 'error',
};
const element = (id: string, x: number, y: number, z = 0, rotationZ = 0): ModelElement => ({
  id, modelElementId: 'rack', style: { name: id }, references: {},
  presentation: { position3D: { x, y, z }, rotationZ, size3D: { widthMm: 600, heightMm: 600, depthMm: 200 } },
});
const classDef = (id: string) => ({ id, name: id, eClass: '', abstract: false, superTypes: [], attributes: [], references: [] });
const metamodel: Metamodel = {
  id: 'mm', name: 'Warehouse', prefix: 'wh', uri: 'urn:wh', eClass: '', conformsTo: 'core',
  classes: [classDef('rack'), classDef('zone')], spatialRules: [rule],
};
const model: Model = {
  id: 'model', name: 'Floor plan', metamodelId: metamodel.id, conformsTo: metamodel.id,
  elements: [element('Rack A', 0, 0, 500), element('Rack B', 550, 0)],
};
const request: SpatialQuickFixRequest = { ruleId: rule.id, elementId: 'Rack A', relatedElementId: 'Rack B', moveElementId: 'Rack A' };
const movedModel = (model: Model, id: string, position3D: NonNullable<ModelElement['presentation']>['position3D']): Model => ({
  ...model, elements: model.elements.map(item => item.id === id ? { ...item, presentation: { ...item.presentation, position3D } } : item),
});

const relationship = (kind: 'within' | 'maxDistance' | 'adjacentTo', distanceMm: number, mode: 'plan' | 'volume' = 'plan'): SpatialRule => ({
  ...rule, id: kind, name: kind, kind, distanceMm, mode, targetClassId: 'zone',
});
const sourceRequest = (spatialRule: SpatialRule): SpatialQuickFixRequest => ({
  ruleId: spatialRule.id, elementId: 'Rack A', moveElementId: 'Rack A',
});
const zone = (id: string, x: number, y: number, z = 0, yaw = 0): ModelElement => ({
  ...element(id, x, y, z, yaw), modelElementId: 'zone',
});

it('clears volumetric clearance at a fixed elevation and chooses the same move on retry', () => {
  const result = planSpatialQuickFix(metamodel, model, request);
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') return;
  expect(result.plan.before).toEqual({ x: 0, y: 0, z: 500 });
  expect(result.plan.after.z).toBe(500);
  expect(result.plan.after.x).toBeCloseTo(-450, 1);
  expect(evaluateSpatialRules(metamodel, movedModel(model, 'Rack A', result.plan.after))).toEqual([]);
  expect(planSpatialQuickFix(metamodel, model, request)).toEqual(result);
});

it('resolves an overlap between rotated elements and preserves their yaw', () => {
  const language = { ...metamodel, spatialRules: [{ ...rule, kind: 'noOverlap' as const, mode: 'plan' as const }] };
  const rotated = { ...model, elements: [element('Rack A', 0, 0, 0, 31), element('Rack B', 220, 130, 0, -23)] };
  const result = planSpatialQuickFix(language, rotated, { ...request, moveElementId: 'Rack B' });
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') return;
  const next = movedModel(rotated, 'Rack B', result.plan.after);
  expect(next.elements[1].presentation?.rotationZ).toBe(-23);
  expect(evaluateSpatialRules(language, next)).toHaveLength(0);
  expect(rotated.elements[1].presentation?.position3D).toEqual({ x: 220, y: 130, z: 0 });
});

it('omits a move when every candidate would introduce a containment violation', () => {
  const inside: SpatialRule = { ...rule, id: 'inside', name: 'Racks inside the area', kind: 'within', distanceMm: 0, targetClassId: 'zone', mode: 'plan' };
  const language = { ...metamodel, spatialRules: [{ ...rule, mode: 'plan' as const }, inside] };
  const confined = { ...model, elements: [element('Rack A', 0, 0), element('Rack B', 0, 0), { ...element('Zone', 0, 0), modelElementId: 'zone' }] };
  expect(evaluateSpatialRules(language, confined).map(issue => issue.constraintId)).toEqual(['gap']);
  expect(planSpatialQuickFix(language, confined, request)).toEqual({ status: 'unavailable' });
});

it('clears a rack aisle violation in the Smart Warehouse starter', () => {
  const fixtures = path.resolve(__dirname, '../../../../frontend/src/examples/data');
  const warehouse: Model = JSON.parse(readFileSync(path.join(fixtures, 'smart-warehouse-model.json'), 'utf8'));
  const language: Metamodel = JSON.parse(readFileSync(path.join(fixtures, 'smart-warehouse-metamodel.json'), 'utf8'));
  const rack = warehouse.elements.find(item => item.style.name === 'Storage Rack #2')!;
  const position3D = rack.presentation!.position3D!;
  const disturbed = movedModel(warehouse, rack.id, { ...position3D, x: position3D.x - 1200 });
  const issue = evaluateSpatialRules(language, disturbed).find(issue => issue.message.startsWith('Storage rack aisle width'))!;
  const result = planSpatialQuickFix(language, disturbed, {
    ruleId: issue.constraintId!, elementId: issue.elementId!, relatedElementId: issue.relatedElementIds![0], moveElementId: rack.id,
  });
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') return;
  expect(evaluateSpatialRules(language, movedModel(disturbed, rack.id, result.plan.after))).toEqual([]);
});

it('moves a rotated source inside an oriented target while keeping the required margin', () => {
  const within = relationship('within', 150);
  const language = { ...metamodel, spatialRules: [within] };
  const target = zone('Receiving zone', 1500, 1000, 0, 30);
  target.presentation!.size3D = { widthMm: 1800, heightMm: 1400, depthMm: 300 };
  const placed = { ...model, elements: [element('Rack A', 0, 0, 25, -30), target] };
  const planned = planSpatialQuickFix(language, placed, sourceRequest(within));
  expect(planned.status).toBe('ready');
  if (planned.status !== 'ready') return;
  const updated = movedModel(placed, 'Rack A', planned.plan.after);
  expect(planned.plan.targetElementName).toBe('Receiving zone');
  expect(planned.plan.after.z).toBe(25);
  expect(updated.elements[0].presentation?.rotationZ).toBe(-30);
  expect(evaluateSpatialRules(language, updated)).toEqual([]);
});

it('uses volume center distance when closing a maximum-distance violation', () => {
  const reach = relationship('maxDistance', 500, 'volume');
  const language = { ...metamodel, spatialRules: [reach] };
  const placed = { ...model, elements: [element('Rack A', 0, 0, 300), zone('Beacon', 1500, 0)] };
  const planned = planSpatialQuickFix(language, placed, sourceRequest(reach));
  expect(planned.status).toBe('ready');
  if (planned.status !== 'ready') return;
  expect(planned.plan.after).toEqual({ x: 1100, y: 0, z: 300 });
  expect(evaluateSpatialRules(language, movedModel(placed, 'Rack A', planned.plan.after))).toEqual([]);
});

it('brings rotated elements into zero-gap adjacency without introducing overlap', () => {
  const adjacent = relationship('adjacentTo', 0);
  const noOverlap: SpatialRule = { ...adjacent, id: 'overlap', kind: 'noOverlap' };
  const language = { ...metamodel, spatialRules: [adjacent, noOverlap] };
  const placed = { ...model, elements: [element('Rack A', 0, 0, 0, 13), zone('Zone B', 1550, 360, 0, -33)] };
  const planned = planSpatialQuickFix(language, placed, sourceRequest(adjacent));
  expect(planned.status).toBe('ready');
  if (planned.status !== 'ready') return;
  expect(evaluateSpatialRules(language, movedModel(placed, 'Rack A', planned.plan.after))).toEqual([]);
});

it('chooses a farther containment target if the closer fit would introduce a collision', () => {
  const within = relationship('within', 0);
  const separation: SpatialRule = { ...rule, kind: 'noOverlap', targetClassId: 'block', mode: 'plan' };
  const language = { ...metamodel, classes: [...metamodel.classes, classDef('block')], spatialRules: [within, separation] };
  const placed = { ...model, elements: [
    element('Rack A', 0, 0), zone('Blocked zone', 1000, 0), zone('Open zone', 2000, 0),
    { ...element('Obstacle', 1000, 0), modelElementId: 'block' },
  ] };
  const planned = planSpatialQuickFix(language, placed, sourceRequest(within));
  expect(planned.status).toBe('ready');
  if (planned.status !== 'ready') return;
  expect(planned.plan.targetElementName).toBe('Open zone');
  expect(evaluateSpatialRules(language, movedModel(placed, 'Rack A', planned.plan.after))).toEqual([]);
});

it('rejects a move that would strand another source relying on the moved element', () => {
  const reach = { ...relationship('maxDistance', 500), targetClassId: 'hub' };
  const stayNearRack = { ...relationship('maxDistance', 75), id: 'near-rack', sourceClassId: 'zone', targetClassId: 'rack' };
  const language = { ...metamodel, classes: [...metamodel.classes, classDef('hub')], spatialRules: [reach, stayNearRack] };
  const placed = { ...model, elements: [
    element('Rack A', 0, 0), zone('Receiving zone', 0, 0), { ...zone('Hub', 2000, 0), modelElementId: 'hub' },
  ] };
  expect(evaluateSpatialRules(language, placed).map(issue => issue.constraintId)).toEqual([reach.id]);
  expect(planSpatialQuickFix(language, placed, sourceRequest(reach))).toEqual({ status: 'unavailable' });
});

it('keeps elevation fixed when a volumetric relationship cannot be repaired horizontally', () => {
  const reach = relationship('maxDistance', 500, 'volume');
  const language = { ...metamodel, spatialRules: [reach] };
  const placed = { ...model, elements: [element('Rack A', 0, 0, 800), zone('Beacon', 900, 0)] };
  expect(planSpatialQuickFix(language, placed, sourceRequest(reach))).toEqual({ status: 'unavailable' });
});

describe('applying a scoped placement fix', () => {
  const projectId = 'project-1';
  const revision = new Date('2026-11-25T17:00:00Z');
  const modelRow = { ...model, projectId, conformsToId: metamodel.id, updatedAt: revision };
  const setup = (position2D = { x: 0, y: 0 }) => {
    mockReset(prismaMock);
    prismaMock.diagram.findFirst.mockResolvedValue({ id: 'view', projectId, modelId: model.id, includedElementIds: ['Rack A'], updatedAt: revision } as any);
    prismaMock.model.findFirst.mockResolvedValue({ ...modelRow, elements: [
      { ...model.elements[0], presentation: { ...model.elements[0].presentation, position2D } }, model.elements[1],
    ] } as any);
    prismaMock.metamodel.findFirst.mockResolvedValue({ ...metamodel, projectId, conformsToId: 'core', updatedAt: revision } as any);
    (prismaMock.$transaction as jest.Mock).mockImplementation(async operation => operation(prismaMock));
  };

  it.each([true, false])('persists a confirmed move and preserves the 2D alignment policy (aligned: %s)', async aligned => {
    const schematic = { x: 20, y: 30 };
    setup(aligned ? undefined : schematic);
    const preview = await diagramService.previewSpatialQuickFix(projectId, 'view', request);
    expect(prismaMock.model.update).not.toHaveBeenCalled();
    const persisted = await diagramService.applySpatialQuickFix(projectId, 'view', request, preview.previewHash);
    expect(persisted).toMatchObject({ modelId: model.id, elementId: 'Rack A', presentation: { position3D: preview.after } });
    expect(persisted.presentation.position2D).toEqual(aligned ? { x: preview.after.x, y: preview.after.y } : schematic);
    expect(prismaMock.model.update).toHaveBeenCalledWith({ where: { id: model.id }, data: { elements: [
      expect.objectContaining({ id: 'Rack A', presentation: persisted.presentation }), model.elements[1],
    ] } });
  });

  it('rejects a stale model revision without writing a placement', async () => {
    setup();
    const preview = await diagramService.previewSpatialQuickFix(projectId, 'view', request);
    prismaMock.model.findFirst.mockResolvedValue({ ...modelRow, updatedAt: new Date('2026-11-25T17:00:01Z') } as any);
    await expect(diagramService.applySpatialQuickFix(projectId, 'view', request, preview.previewHash)).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.model.update).not.toHaveBeenCalled();
  });
});
