import { exampleDataService } from '../../services/metamodel/exampleData.service';

import smartWarehouseMetamodelFixture from '../../examples/data/smart-warehouse-metamodel.json';
import activityDiagramMetamodelFixture from '../../examples/data/activity-diagram-metamodel.json';
import smartWarehouseModelFixture from '../../examples/data/smart-warehouse-model.json';
import smartWarehouseProjectFixture from '../../examples/data/smart-warehouse-project.json';

describe('example bundle id remapping', () => {
  const metamodels = exampleDataService.getExampleMetamodels();
  const models = exampleDataService.getExampleModels();
  const views = exampleDataService.getExampleViews();
  const viewpoints = exampleDataService.getExampleViewpoints();
  const projects = exampleDataService.getExampleProjects();

  const metamodelIds = new Set(metamodels.map(mm => mm.id));
  const classIds = new Set(metamodels.flatMap(mm => mm.classes.map(cls => cls.id)));
  const referenceIds = new Set(
    metamodels.flatMap(mm => mm.classes.flatMap(cls => (cls.references || []).map(ref => ref.id)))
  );
  const modelIds = new Set(models.map(m => m.id));
  const elementIds = new Set(models.flatMap(m => m.elements.map(el => el.id)));
  const viewpointIds = new Set(viewpoints.map(vp => vp.id));
  const representationDescriptionIds = new Set(
    viewpoints.flatMap(vp => vp.representationDescriptions.map(rd => rd.id))
  );

  it('assigns fresh ids so accounts do not collide on the fixture uuids', () => {
    expect(metamodelIds.has(smartWarehouseMetamodelFixture.id)).toBe(false);
    expect(metamodelIds.has(activityDiagramMetamodelFixture.id)).toBe(false);
    expect(modelIds.has(smartWarehouseModelFixture.id)).toBe(false);
    expect(projects.some(p => p.id === smartWarehouseProjectFixture.id)).toBe(false);
  });

  it('keeps the same ids across repeated calls within a session', () => {
    expect(exampleDataService.getExampleMetamodels().map(mm => mm.id)).toEqual(
      metamodels.map(mm => mm.id)
    );
    expect(exampleDataService.getExampleModels().map(m => m.id)).toEqual(models.map(m => m.id));
  });

  it('keeps models consistent with their metamodel', () => {
    for (const model of models) {
      expect(metamodelIds.has(model.conformsTo || (model as any).metamodelId)).toBe(true);
      for (const element of model.elements) {
        expect(classIds.has(element.modelElementId)).toBe(true);
        for (const value of Object.values(element.references || {})) {
          const targets = Array.isArray(value) ? value : [value];
          targets.forEach(target => expect(elementIds.has(target as string)).toBe(true));
        }
      }
      for (const connection of model.connections || []) {
        expect(elementIds.has(connection.sourceId)).toBe(true);
        expect(elementIds.has(connection.targetId)).toBe(true);
        if (connection.referenceId) {
          expect(referenceIds.has(connection.referenceId)).toBe(true);
        }
      }
    }
  });

  it('keeps metamodel-internal references consistent', () => {
    for (const metamodel of metamodels) {
      for (const cls of metamodel.classes) {
        (cls.superTypes || []).forEach(superTypeId => expect(classIds.has(superTypeId)).toBe(true));
        for (const ref of cls.references || []) {
          const target = (ref as any).target || (ref as any).targetClassId;
          if (target) expect(classIds.has(target)).toBe(true);
        }
      }
    }
  });

  it('keeps views pointing at remapped models, elements, and viewpoints', () => {
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) {
      expect(modelIds.has(view.modelId)).toBe(true);
      (view.includedElementIds || []).forEach(id => expect(elementIds.has(id)).toBe(true));
      if (view.viewpointId) expect(viewpointIds.has(view.viewpointId)).toBe(true);
      if (view.representationDescriptionId) {
        expect(representationDescriptionIds.has(view.representationDescriptionId)).toBe(true);
      }
    }
  });

  it('keeps viewpoints pointing at remapped metamodels, classes, and references', () => {
    expect(viewpoints.length).toBeGreaterThan(0);
    for (const viewpoint of viewpoints) {
      expect(metamodelIds.has(viewpoint.metamodelId)).toBe(true);
      for (const rd of viewpoint.representationDescriptions) {
        expect(rd.viewpointId).toBe(viewpoint.id);
        (rd.visibleMetaClassIds || []).forEach(id => expect(classIds.has(id)).toBe(true));
        (rd.creatableMetaClassIds || []).forEach(id => expect(classIds.has(id)).toBe(true));
        Object.keys(rd.concreteSyntaxByMetaClassId || {}).forEach(id =>
          expect(classIds.has(id)).toBe(true)
        );
        Object.keys(rd.concreteSyntaxByReferenceId || {}).forEach(id =>
          expect(referenceIds.has(id)).toBe(true)
        );
      }
    }
  });

  it('ships Smart Warehouse diagram, table, and tree examples with saved views', () => {
    const warehouseMetamodel = metamodels.find(metamodel => metamodel.name === 'Smart Warehouse');
    const warehouseModel = models.find(model => model.name === 'WarehouseModel');
    const operationsViewpoint = viewpoints.find(viewpoint => (
      viewpoint.name === 'Warehouse Operations'
      && viewpoint.metamodelId === warehouseMetamodel?.id
    ));

    expect(warehouseMetamodel).toBeDefined();
    expect(warehouseModel).toBeDefined();
    expect(operationsViewpoint).toBeDefined();

    const kindByDescriptionId = new Map(
      operationsViewpoint!.representationDescriptions.map(description => [description.id, description.kind])
    );
    expect(new Set(kindByDescriptionId.values())).toEqual(new Set(['diagram', 'table', 'tree']));

    const savedKinds = new Set(
      views
        .filter(view => view.modelId === warehouseModel!.id)
        .map(view => kindByDescriptionId.get(view.representationDescriptionId || ''))
        .filter(Boolean)
    );
    expect(savedKinds).toEqual(new Set(['diagram', 'table', 'tree']));
  });

  it('keeps the Smart Warehouse containment hierarchy usable by its tree view', () => {
    const warehouseModel = models.find(model => model.name === 'WarehouseModel');
    const root = warehouseModel?.elements.find(element => element.style?.name === 'WarehouseMAS');
    const containedIds = Object.values(root?.references || {}).flatMap(value => (
      Array.isArray(value) ? value : value ? [value] : []
    ));

    expect(root).toBeDefined();
    expect(containedIds.length).toBeGreaterThan(0);
    containedIds.forEach(id => expect(elementIds.has(id)).toBe(true));
  });

  it('keeps the aerial inspection fixture in the same remapped warehouse bundle', () => {
    const warehouseModel = models.find(model => model.name === 'WarehouseModel')!;
    const operations = viewpoints.find(viewpoint => viewpoint.name === 'Warehouse Operations')!;
    const aerial = operations.representationDescriptions.find(description => description.name === 'Aerial Inspection')!;
    const aerialView = views.find(view => view.representationDescriptionId === aerial.id)!;
    const drones = warehouseModel.elements.filter(element => (
      element.style?.name === 'Inspection Drone Alpha' || element.style?.name === 'Inspection Drone Beta'
    ));

    expect(aerialView.modelId).toBe(warehouseModel.id);
    expect(drones).toHaveLength(2);
    expect(drones.map(drone => drone.presentation?.position3D?.z).sort((a, b) => (a || 0) - (b || 0)))
      .toEqual([0, 4500]);
    drones.forEach(drone => expect(aerialView.includedElementIds).toContain(drone.id));
  });

  it('keeps the codegen project targeting a remapped metamodel', () => {
    expect(projects.map(project => project.name)).toEqual(expect.arrayContaining([
      'Smart Warehouse Visual Components (Example)',
      'Smart Warehouse Omniverse USD',
    ]));
    for (const project of projects) {
      expect(metamodelIds.has(project.targetMetamodelId)).toBe(true);
      for (const template of project.templates || []) {
        expect(metamodelIds.has(template.targetMetamodelId)).toBe(true);
      }
    }
  });

  it('returns one connected Smart Warehouse starter bundle', () => {
    const starter = exampleDataService.getSmartWarehouseBundle();
    const metamodelId = starter.metamodels[0].id;
    const modelIds = new Set(starter.models.map(model => model.id));

    expect(starter.metamodels).toHaveLength(1);
    expect(starter.models).toHaveLength(1);
    expect(starter.projects).toHaveLength(2);
    starter.viewpoints.forEach(viewpoint => expect(viewpoint.metamodelId).toBe(metamodelId));
    starter.views.forEach(view => expect(modelIds.has(view.modelId)).toBe(true));
    starter.projects.forEach(project => expect(project.targetMetamodelId).toBe(metamodelId));
  });

  it('still exposes the fixture viewpoints for legacy fixed-id accounts', () => {
    const legacy = exampleDataService.getLegacyExampleViewpoints();
    expect(legacy.some(vp => vp.metamodelId === smartWarehouseMetamodelFixture.id)).toBe(true);
  });
});
