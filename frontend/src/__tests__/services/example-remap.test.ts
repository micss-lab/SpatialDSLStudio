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

  it('keeps the codegen project targeting a remapped metamodel', () => {
    for (const project of projects) {
      expect(metamodelIds.has(project.targetMetamodelId)).toBe(true);
      for (const template of project.templates || []) {
        expect(metamodelIds.has(template.targetMetamodelId)).toBe(true);
      }
    }
  });

  it('still exposes the fixture viewpoints for legacy fixed-id accounts', () => {
    const legacy = exampleDataService.getLegacyExampleViewpoints();
    expect(legacy.some(vp => vp.metamodelId === smartWarehouseMetamodelFixture.id)).toBe(true);
  });
});
