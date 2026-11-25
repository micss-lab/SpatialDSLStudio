import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../middleware';
import {
  ApplyMetamodelEvolutionRequest,
  MetaAttribute,
  MetaClass,
  MetaReference,
  Metamodel,
  MetamodelEvolutionChange,
  MetamodelEvolutionImpact,
  MetamodelEvolutionReport,
  MetamodelMigrationResult,
  MetamodelMigrationRule,
  ModelElement,
  ProjectArtifactRef,
  SpatialRule,
} from '../../../../shared/types';
import { validateConcreteSyntaxVerticalPlacement } from '../../../../shared/spatial';
import { validateSpatialRules } from '../../../../shared/spatial-rules';
import { contentHash, stableStringify } from './canonical';
import { projectCheckpointService } from './project-checkpoint.service';
import { inheritedFeatures } from '../pipeline/model-validation.engine';

const asArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];
const hasOwn = (value: Record<string, any>, key: string): boolean => (
  Object.prototype.hasOwnProperty.call(value, key)
);
const nonEmptyReference = (value: unknown): boolean => (
  Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== ''
);
const refKey = (value: ProjectArtifactRef): string => `${value.type}:${value.id}`;

const typeKey = (value: MetaAttribute['type']): string => stableStringify(value);
const featureSummary = (value: MetaAttribute | MetaReference): Record<string, any> => ({
  id: value.id,
  name: value.name,
  ...('type' in value ? {
    type: value.type,
    required: value.required,
    many: value.many,
    defaultValue: value.defaultValue,
  } : {}),
  ...('target' in value ? { target: value.target, cardinality: value.cardinality } : {}),
});
const classSummary = (value: MetaClass): Record<string, any> => ({ id: value.id, name: value.name });

const toMetamodel = (row: any): Metamodel => ({
  id: row.id,
  projectId: row.projectId || undefined,
  name: row.name,
  description: row.description || undefined,
  eClass: row.eClass || '',
  uri: row.uri,
  prefix: row.prefix,
  classes: asArray<MetaClass>(row.classes),
  enums: asArray(row.enums),
  conformsTo: row.conformsToId,
  constraints: asArray(row.constraints),
  spatialRules: asArray(row.spatialRules),
});

const metamodelFingerprint = (metamodel: Metamodel): string => contentHash({
  id: metamodel.id,
  name: metamodel.name,
  description: metamodel.description,
  eClass: metamodel.eClass,
  uri: metamodel.uri,
  prefix: metamodel.prefix,
  conformsTo: metamodel.conformsTo,
  classes: metamodel.classes,
  enums: metamodel.enums || [],
  constraints: metamodel.constraints || [],
  // Omitted when empty so fingerprints of rule-free metamodels are unchanged.
  spatialRules: metamodel.spatialRules && metamodel.spatialRules.length > 0 ? metamodel.spatialRules : undefined,
});

const matchesAttributeValue = (value: unknown, attribute: Record<string, any>): boolean => {
  if (value === undefined || value === null) return !attribute.required;
  if (attribute.many) {
    return Array.isArray(value) && value.every(item => matchesAttributeValue(item, { ...attribute, many: false }));
  }
  if (Array.isArray(value)) return false;
  if (typeof attribute.type === 'object') return typeof value === 'string';
  if (attribute.type === 'date') return typeof value === 'string' && !Number.isNaN(Date.parse(value));
  return typeof value === attribute.type;
};

const matchesRule = (
  rules: MetamodelMigrationRule[],
  kind: MetamodelMigrationRule['kind'],
  change: MetamodelEvolutionChange
): MetamodelMigrationRule | undefined => rules.find(rule => (
  rule.kind === kind
  && rule.classId === change.classId
  && (!rule.featureId || rule.featureId === change.featureId)
  && (!rule.fromName || rule.fromName === change.before?.name)
));

const featuresByClass = (metamodel: Metamodel) => {
  const classes = new Map(metamodel.classes.map(cls => [cls.id, cls]));
  return new Map(metamodel.classes.map(cls => {
    const lineage = new Set<string>();
    const visit = (id: string) => {
      if (lineage.has(id)) return;
      lineage.add(id);
      classes.get(id)?.superTypes?.forEach(visit);
    };
    visit(cls.id);
    return [cls.id, {
      lineage,
      attributes: inheritedFeatures<MetaAttribute>(metamodel, cls, 'attributes'),
      references: inheritedFeatures<MetaReference>(metamodel, cls, 'references'),
    }];
  }));
};

const affectedFeatures = (before: ReturnType<typeof featuresByClass>, after: ReturnType<typeof featuresByClass>) => {
  return (classId: string, change: MetamodelEvolutionChange): boolean => {
    if (!change.featureId) return change.classId === classId;
    const classFeatures = (change.before ? before : after).get(classId);
    if (!classFeatures?.lineage.has(change.classId)) return false;
    const features = change.kind.startsWith('attribute-') ? classFeatures.attributes : classFeatures.references;
    return features.some(feature => feature.id === change.featureId);
  };
};

class MetamodelEvolutionService {
  compare(current: Metamodel, next: Metamodel): MetamodelEvolutionChange[] {
    const changes: MetamodelEvolutionChange[] = [];
    const currentClasses = new Map(current.classes.map(metaClass => [metaClass.id, metaClass]));
    const nextClasses = new Map(next.classes.map(metaClass => [metaClass.id, metaClass]));

    currentClasses.forEach((beforeClass, classId) => {
      const afterClass = nextClasses.get(classId);
      if (!afterClass) {
        changes.push({
          kind: 'class-removed', classId, before: classSummary(beforeClass), breaking: true,
        });
        return;
      }
      if (beforeClass.name !== afterClass.name) {
        changes.push({
          kind: 'class-renamed', classId,
          before: classSummary(beforeClass), after: classSummary(afterClass), breaking: true,
        });
      }
      this.compareAttributes(classId, beforeClass.attributes || [], afterClass.attributes || [], changes);
      this.compareReferences(classId, beforeClass.references || [], afterClass.references || [], changes);
    });
    nextClasses.forEach((afterClass, classId) => {
      if (!currentClasses.has(classId)) {
        changes.push({
          kind: 'class-added', classId, after: classSummary(afterClass), breaking: false,
        });
      }
    });

    return changes.sort((left, right) => (
      `${left.classId}:${left.featureId || ''}:${left.kind}`
        .localeCompare(`${right.classId}:${right.featureId || ''}:${right.kind}`)
    ));
  }

  private compareAttributes(
    classId: string,
    current: MetaAttribute[],
    next: MetaAttribute[],
    changes: MetamodelEvolutionChange[]
  ): void {
    const currentById = new Map(current.map(feature => [feature.id, feature]));
    const nextById = new Map(next.map(feature => [feature.id, feature]));
    currentById.forEach((before, featureId) => {
      const after = nextById.get(featureId);
      if (!after) {
        changes.push({ kind: 'attribute-removed', classId, featureId, before: featureSummary(before), breaking: true });
        return;
      }
      if (before.name !== after.name) {
        changes.push({
          kind: 'attribute-renamed', classId, featureId,
          before: featureSummary(before), after: featureSummary(after), breaking: true,
        });
      }
      if (typeKey(before.type) !== typeKey(after.type)) {
        changes.push({
          kind: 'attribute-type-changed', classId, featureId,
          before: featureSummary(before), after: featureSummary(after), breaking: true,
        });
      }
      if (before.required !== after.required || before.many !== after.many) {
        changes.push({
          kind: 'attribute-cardinality-changed', classId, featureId,
          before: featureSummary(before), after: featureSummary(after), breaking: true,
        });
      }
    });
    nextById.forEach((after, featureId) => {
      if (!currentById.has(featureId)) {
        changes.push({
          kind: 'attribute-added', classId, featureId, after: featureSummary(after),
          breaking: Boolean(after.required && after.defaultValue === undefined),
        });
      }
    });
  }

  private compareReferences(
    classId: string,
    current: MetaReference[],
    next: MetaReference[],
    changes: MetamodelEvolutionChange[]
  ): void {
    const currentById = new Map(current.map(feature => [feature.id, feature]));
    const nextById = new Map(next.map(feature => [feature.id, feature]));
    currentById.forEach((before, featureId) => {
      const after = nextById.get(featureId);
      if (!after) {
        changes.push({ kind: 'reference-removed', classId, featureId, before: featureSummary(before), breaking: true });
        return;
      }
      if (before.name !== after.name) {
        changes.push({
          kind: 'reference-renamed', classId, featureId,
          before: featureSummary(before), after: featureSummary(after), breaking: true,
        });
      }
      if (before.target !== after.target) {
        changes.push({
          kind: 'reference-target-changed', classId, featureId,
          before: featureSummary(before), after: featureSummary(after), breaking: true,
        });
      }
      if (stableStringify(before.cardinality) !== stableStringify(after.cardinality)) {
        changes.push({
          kind: 'reference-cardinality-changed', classId, featureId,
          before: featureSummary(before), after: featureSummary(after), breaking: true,
        });
      }
    });
    nextById.forEach((after, featureId) => {
      if (!currentById.has(featureId)) {
        changes.push({
          kind: 'reference-added', classId, featureId, after: featureSummary(after),
          breaking: after.cardinality.lowerBound > 0,
        });
      }
    });
  }

  private assertTargetIsValid(current: Metamodel, next: Metamodel): void {
    if (!next || typeof next !== 'object' || !Array.isArray(next.classes)) {
      throw new ApiError(400, 'nextMetamodel must contain a classes array');
    }
    if (next.id !== current.id) throw new ApiError(400, 'nextMetamodel.id must match the evolving metamodel');
    if (next.conformsTo !== current.conformsTo) {
      throw new ApiError(400, 'Changing the meta-metamodel is not supported by this evolution operation');
    }

    const classIds = new Set<string>();
    const classNames = new Set<string>();
    next.classes.forEach((metaClass, classIndex) => {
      if (!metaClass.id || !metaClass.name) throw new ApiError(400, `classes[${classIndex}] requires id and name`);
      if (classIds.has(metaClass.id)) throw new ApiError(400, `Duplicate class ID ${metaClass.id}`);
      if (classNames.has(metaClass.name)) throw new ApiError(400, `Duplicate class name ${metaClass.name}`);
      classIds.add(metaClass.id);
      classNames.add(metaClass.name);

      const featureIds = new Set<string>();
      const featureNames = new Set<string>();
      [...(metaClass.attributes || []), ...(metaClass.references || [])].forEach(feature => {
        if (featureIds.has(feature.id)) throw new ApiError(400, `Duplicate feature ID ${feature.id} in ${metaClass.name}`);
        if (featureNames.has(feature.name)) throw new ApiError(400, `Duplicate feature name ${feature.name} in ${metaClass.name}`);
        featureIds.add(feature.id);
        featureNames.add(feature.name);
      });
      if (metaClass.concreteSyntax !== undefined) {
        const errors = validateConcreteSyntaxVerticalPlacement(
          metaClass.concreteSyntax,
          `classes[${classIndex}].concreteSyntax`
        );
        if (errors.length > 0) throw new ApiError(400, errors[0]);
      }
    });
    next.classes.forEach(metaClass => {
      (metaClass.superTypes || []).forEach(superType => {
        if (!classIds.has(superType)) throw new ApiError(400, `${metaClass.name} has unknown supertype ${superType}`);
      });
      (metaClass.references || []).forEach(reference => {
        if (!classIds.has(reference.target)) {
          throw new ApiError(400, `${metaClass.name}.${reference.name} targets unknown class ${reference.target}`);
        }
      });
    });
  }

  private async loadContext(projectId: string, metamodelId: string, db: Prisma.TransactionClient = prisma): Promise<{
    current: Metamodel;
    models: any[];
    diagrams: any[];
    viewpoints: any[];
    transformations: any[];
    generators: any[];
    tests: any[];
  }> {
    const row = await db.metamodel.findFirst({ where: { id: metamodelId, projectId } });
    if (!row) throw new ApiError(404, 'Metamodel not found in this project');
    const models = await db.model.findMany({ where: { projectId, conformsToId: metamodelId } });
    const modelIds = models.map(model => model.id);
    const [diagrams, viewpoints, transformations, generators, tests] = await Promise.all([
      db.diagram.findMany({ where: { projectId, modelId: { in: modelIds } } }),
      db.viewpoint.findMany({ where: { projectId, metamodelId } }),
      db.transformationRule.findMany({ where: { projectId } }),
      db.codeGenerationProject.findMany({ where: { projectId, targetMetamodelId: metamodelId } }),
      db.testCase.findMany({ where: { projectId } }),
    ]);
    return {
      current: toMetamodel(row),
      models: models || [], diagrams: diagrams || [], viewpoints: viewpoints || [],
      transformations: transformations || [], generators: generators || [], tests: tests || [],
    };
  }

  async preview(
    projectId: string,
    metamodelId: string,
    next: Metamodel,
    rules: MetamodelMigrationRule[] = []
  ): Promise<MetamodelEvolutionReport> {
    const context = await this.loadContext(projectId, metamodelId);
    return this.buildReport(context, next, rules);
  }

  private buildReport(
    context: Awaited<ReturnType<MetamodelEvolutionService['loadContext']>>,
    next: Metamodel,
    rules: MetamodelMigrationRule[]
  ): MetamodelEvolutionReport {
    this.assertTargetIsValid(context.current, next);
    const changes = this.compare(context.current, next);
    const impacts: MetamodelEvolutionImpact[] = [];
    const blockers: string[] = [];
    const warnings: string[] = [];
    const beforeFeatures = featuresByClass(context.current);
    const afterFeatures = featuresByClass(next);
    const affects = affectedFeatures(beforeFeatures, afterFeatures);
    const impactedClassIds = new Set(context.current.classes
      .filter(cls => changes.some(change => affects(cls.id, change))).map(cls => cls.id));
    const tokenChanges = changes.filter(change => change.breaking).map(change => ({
      change,
      tokens: [
        ...(change.kind.startsWith('class-') ? [change.classId] : []),
        change.featureId,
        change.before?.name,
      ]
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    }));

    context.models.forEach(model => {
      const elements = asArray<ModelElement>(model.elements);
      const affectedElementIds = elements
        .filter(element => impactedClassIds.has(element.modelElementId))
        .map(element => element.id);
      impacts.push({
        artifact: { type: 'model', id: model.id },
        name: model.name,
        reasons: affectedElementIds.length > 0
          ? [`${affectedElementIds.length} element(s) instantiate changed classes`]
          : ['Model conforms to the evolving metamodel'],
        affectedElementIds,
      });
    });
    context.diagrams.forEach(diagram => impacts.push({
      artifact: { type: 'view', id: diagram.id },
      name: diagram.name,
      reasons: ['View projects a model that conforms to the evolving metamodel'],
    }));
    context.viewpoints.forEach(viewpoint => impacts.push({
      artifact: { type: 'viewpoint', id: viewpoint.id },
      name: viewpoint.name,
      reasons: ['Viewpoint is defined for the evolving metamodel'],
    }));
    context.generators.forEach(generator => impacts.push({
      artifact: { type: 'generator', id: generator.id },
      name: generator.name,
      reasons: ['Generator targets the evolving metamodel'],
    }));

    const serializedContains = (value: unknown, tokens: string[]): boolean => {
      const serialized = stableStringify(value);
      return tokens.some(token => serialized.includes(JSON.stringify(token).slice(1, -1)));
    };
    context.transformations.forEach(rule => {
      const matched = tokenChanges.filter(item => serializedContains(
        { lhs: rule.lhs, rhs: rule.rhs, nacs: rule.nacs, conditions: rule.conditions },
        item.tokens
      ));
      if (matched.length > 0) {
        impacts.push({ artifact: { type: 'transformation', id: rule.id }, name: rule.name, reasons: ['Rule references changed language elements'] });
        blockers.push(`Transformation ${rule.name} must be updated before applying this breaking evolution`);
      }
    });
    context.viewpoints.forEach(viewpoint => {
      const matched = tokenChanges.filter(item => serializedContains(
        { representations: viewpoint.representationDescriptions, shared: viewpoint.sharedConcreteSyntax },
        item.tokens
      ));
      if (matched.length > 0) {
        blockers.push(`Viewpoint ${viewpoint.name} must be updated before applying this breaking evolution`);
      }
    });
    context.generators.forEach(generator => {
      const matched = tokenChanges.filter(item => serializedContains(generator.templates, item.tokens));
      if (matched.length > 0) {
        blockers.push(`Generator ${generator.name} must be updated before applying this breaking evolution`);
      }
    });

    // Apply writes the rules directly, so they get the same validation as a metamodel
    // update. Class references are checked below to name removed classes.
    blockers.push(...validateSpatialRules(next.spatialRules ?? []));
    const nextClassNames = new Map(next.classes.map(metaClass => [metaClass.id, metaClass.name]));
    const currentClassNames = new Map(context.current.classes.map(metaClass => [metaClass.id, metaClass.name]));
    asArray<SpatialRule>(next.spatialRules).forEach(rule => {
      [rule?.sourceClassId, rule?.targetClassId].forEach(classId => {
        if (typeof classId !== 'string' || nextClassNames.has(classId)) return;
        const removedName = currentClassNames.get(classId);
        blockers.push(removedName
          ? `Spatial rule ${rule.name} references removed class ${removedName}; update or delete the rule before applying this evolution`
          : `Spatial rule ${rule?.name || rule?.id} references unknown class ${classId}`);
      });
    });

    const allElements = context.models.flatMap(model => asArray<ModelElement>(model.elements));
    const removedClasses = new Set(changes.filter(change => change.kind === 'class-removed').map(change => change.classId));
    if (removedClasses.size > 0) context.models.forEach(model => {
      const elements = asArray<ModelElement>(model.elements);
      const removedIds = new Set(elements.filter(element => removedClasses.has(element.modelElementId)).map(element => element.id));
      const survivingLinks = elements.some(element => !removedIds.has(element.id) && (
        (element.presentation?.attachedToElementId && removedIds.has(element.presentation.attachedToElementId))
        || Object.values(element.references || {}).some(value => (Array.isArray(value) ? value : [value])
          .some(targetId => targetId !== null && removedIds.has(targetId)))
      ));
      if (survivingLinks) blockers.push(`Model ${model.name} links surviving elements to instances of removed classes; clear those links before applying`);
    });
    for (const change of changes) {
      const elements = allElements.filter(element => affects(element.modelElementId, change)
        && (change.kind === 'class-removed' || !removedClasses.has(element.modelElementId)));
      if (change.kind === 'class-removed' && elements.length > 0) {
        const rule = matchesRule(rules, 'remove-class', change);
        if (!rule?.deleteInstances) {
          blockers.push(`Class ${change.before?.name} has ${elements.length} instance(s); add a remove-class rule with deleteInstances=true`);
        }
      }
      if (change.kind === 'attribute-renamed') {
        const fromName = String(change.before?.name || '');
        const toName = String(change.after?.name || '');
        const withValue = elements.filter(element => hasOwn(element.style || {}, fromName));
        const rule = matchesRule(rules, 'rename-attribute', change);
        if (withValue.length > 0 && (!rule || rule.toName !== toName)) {
          blockers.push(`Attribute ${fromName} has instance values; add a rename-attribute rule to ${toName}`);
        }
        if (rule && withValue.some(element => hasOwn(element.style || {}, toName)
          || afterFeatures.get(element.modelElementId)?.attributes.some(attribute => attribute.name === toName && attribute.id !== change.featureId))) {
          blockers.push(`Attribute rename ${fromName} -> ${toName} would overwrite existing instance values`);
        }
      }
      if (change.kind === 'attribute-removed') {
        const fromName = String(change.before?.name || '');
        const withValue = elements.filter(element => hasOwn(element.style || {}, fromName));
        if (withValue.length > 0 && !matchesRule(rules, 'remove-attribute', change)) {
          blockers.push(`Attribute ${fromName} has instance values; add a remove-attribute rule`);
        }
      }
      if (change.kind === 'attribute-renamed' || change.kind === 'attribute-removed') {
        const fromName = String(change.before?.name || '');
        if (elements.some(element => hasOwn(element.style || {}, fromName)
          && beforeFeatures.get(element.modelElementId)?.attributes.some(attribute => attribute.name === fromName && attribute.id !== change.featureId))) {
          blockers.push(`Attribute ${fromName} has ambiguous inherited values; resolve the duplicate attribute before applying`);
        }
      }
      if (change.kind === 'attribute-added' && change.after?.required && change.after.defaultValue === undefined) {
        const missing = elements.filter(element => !hasOwn(element.style || {}, String(change.after?.name || '')));
        if (missing.length > 0) blockers.push(`Required attribute ${change.after?.name} has no default for ${missing.length} existing instance(s)`);
      }
      if (
        change.kind === 'attribute-type-changed'
        || change.kind === 'attribute-cardinality-changed'
      ) {
        const currentName = String(change.before?.name || change.after?.name || '');
        const incompatible = elements.filter(element => (
          hasOwn(element.style || {}, currentName)
          && !matchesAttributeValue(element.style[currentName], change.after || {})
        ));
        if (incompatible.length > 0) {
          blockers.push(`Attribute ${currentName} has ${incompatible.length} value(s) incompatible with its new type or cardinality`);
        }
      }
      if (change.kind.startsWith('reference-') && change.breaking) {
        const oldName = String(change.before?.name || '');
        const withValue = elements.filter(element => (
          nonEmptyReference(element.references?.[oldName])
          || nonEmptyReference(change.featureId ? element.references?.[change.featureId] : undefined)
        ));
        if (withValue.length > 0) {
          blockers.push(`Reference ${oldName} has live links; clean or migrate them before applying this evolution`);
        }
      }
      if (change.kind === 'class-renamed') {
        warnings.push(`Review expressions and templates that refer to class name ${change.before?.name}`);
      }
    }

    context.tests.forEach(test => {
      const relevant = changes.filter(change => (
        affects(test.targetMetaClassId, change)
        && (
          change.kind.startsWith('class-')
          || change.before?.name === test.targetProperty
          || change.featureId === test.constraintId
        )
      ));
      if (relevant.length > 0) {
        impacts.push({ artifact: { type: 'test', id: test.id }, name: test.name, reasons: ['Test targets a changed language element'] });
        if (relevant.some(change => change.kind === 'class-removed' || change.kind === 'attribute-removed')) {
          blockers.push(`Test ${test.name} targets a removed language element and must be updated or deleted`);
        }
      }
    });

    const dedupe = (items: string[]): string[] => [...new Set(items)].sort();
    return {
      metamodelId: context.current.id,
      sourceHash: metamodelFingerprint(context.current),
      targetHash: metamodelFingerprint(next),
      changes,
      impacts: [...new Map(impacts.map(impact => [refKey(impact.artifact), impact])).values()]
        .sort((left, right) => refKey(left.artifact).localeCompare(refKey(right.artifact))),
      blockers: dedupe(blockers),
      warnings: dedupe(warnings),
    };
  }

  private migrateModel(
    model: any,
    changes: MetamodelEvolutionChange[],
    rules: MetamodelMigrationRule[],
    affects: ReturnType<typeof affectedFeatures>
  ): { elements: ModelElement[]; connections: any[]; changedElements: number; deletedElements: number; deletedIds: string[] } {
    const original = asArray<ModelElement>(model.elements);
    const deletedClassIds = new Set(
      changes
        .filter(change => change.kind === 'class-removed' && matchesRule(rules, 'remove-class', change)?.deleteInstances)
        .map(change => change.classId)
    );
    const deletedIds = original
      .filter(element => deletedClassIds.has(element.modelElementId))
      .map(element => element.id);
    const deletedSet = new Set(deletedIds);
    let changedElements = 0;
    const elements = original
      .filter(element => !deletedSet.has(element.id))
      .map(element => {
        const style = { ...(element.style || {}) };
        let changed = false;
        changes.filter(change => affects(element.modelElementId, change)).forEach(change => {
          if (change.kind === 'attribute-renamed') {
            const rule = matchesRule(rules, 'rename-attribute', change);
            const fromName = String(change.before?.name || '');
            const toName = String(change.after?.name || '');
            if (rule && hasOwn(style, fromName)) {
              style[toName] = style[fromName];
              delete style[fromName];
              changed = true;
            }
          } else if (change.kind === 'attribute-removed') {
            const fromName = String(change.before?.name || '');
            if (matchesRule(rules, 'remove-attribute', change) && hasOwn(style, fromName)) {
              delete style[fromName];
              changed = true;
            }
          } else if (change.kind === 'attribute-added' && change.after?.defaultValue !== undefined) {
            const name = String(change.after.name || '');
            if (!hasOwn(style, name)) {
              style[name] = change.after.defaultValue;
              changed = true;
            }
          }
        });
        if (changed) changedElements += 1;
        return changed ? { ...element, style } : element;
      });
    const connections = asArray<any>(model.connections).filter(connection => (
      !deletedSet.has(connection.sourceId) && !deletedSet.has(connection.targetId)
    ));
    return {
      elements,
      connections,
      changedElements,
      deletedElements: deletedIds.length,
      deletedIds,
    };
  }

  async apply(
    projectId: string,
    metamodelId: string,
    request: ApplyMetamodelEvolutionRequest,
    userId: string
  ): Promise<MetamodelMigrationResult> {
    const rules = request.rules || [];
    const report = await this.preview(projectId, metamodelId, request.nextMetamodel, rules);
    if (request.expectedSourceHash !== report.sourceHash) {
      throw new ApiError(409, 'Metamodel changed after the preview; run evolution preview again');
    }
    if (report.blockers.length > 0) {
      throw new ApiError(409, `Evolution is blocked: ${report.blockers.join('; ')}`);
    }

    const checkpoint = await projectCheckpointService.create(projectId, userId, {
      tag: request.checkpointTag,
      message: request.message || `Before evolution of ${request.nextMetamodel.name}`,
    });
    let migratedModels: MetamodelMigrationResult['migratedModels'] = [];
    let appliedReport = report;

    try {
      const migrationRow = await prisma.$transaction(async tx => {
        const context = await this.loadContext(projectId, metamodelId, tx);
        if (metamodelFingerprint(context.current) !== report.sourceHash) {
          throw new ApiError(409, 'Metamodel changed while the migration was being prepared');
        }
        const next = request.nextMetamodel;
        appliedReport = this.buildReport(context, next, rules);
        if (appliedReport.blockers.length > 0) {
          throw new ApiError(409, `Evolution is blocked: ${appliedReport.blockers.join('; ')}`);
        }
        const affects = affectedFeatures(featuresByClass(context.current), featuresByClass(next));
        const migrations = context.models.map(model => ({
          model,
          result: this.migrateModel(model, appliedReport.changes, rules, affects),
        }));
        migratedModels = migrations.map(({ model, result }) => ({
          modelId: model.id, changedElements: result.changedElements, deletedElements: result.deletedElements,
        }));

        for (const migration of migrations) {
          if (migration.result.changedElements > 0 || migration.result.deletedElements > 0) {
            await tx.model.update({
              where: { id: migration.model.id },
              data: {
                elements: migration.result.elements as any,
                connections: migration.result.connections as any,
              },
            });
          }
          if (migration.result.deletedIds.length > 0) {
            const diagrams = context.diagrams.filter(diagram => diagram.modelId === migration.model.id);
            for (const diagram of diagrams) {
              const deleted = new Set(migration.result.deletedIds);
              await tx.diagram.update({
                where: { id: diagram.id },
                data: {
                  includedElementIds: asArray<string>(diagram.includedElementIds).filter(id => !deleted.has(id)) as any,
                  elements: asArray<any>(diagram.elements).filter(element => (
                    !deleted.has(element.modelElementId)
                    && !deleted.has(element.id)
                    && !deleted.has(element.sourceId)
                    && !deleted.has(element.targetId)
                  )) as any,
                },
              });
            }
          }
        }

        for (const test of context.tests) {
          const rename = appliedReport.changes.find(change => (
            change.kind === 'attribute-renamed'
            && affects(test.targetMetaClassId, change)
            && change.before?.name === test.targetProperty
          ));
          const classRename = appliedReport.changes.find(change => (
            change.kind === 'class-renamed' && change.classId === test.targetMetaClassId
          ));
          if (rename || classRename) {
            await tx.testCase.update({
              where: { id: test.id },
              data: {
                ...(rename && { targetProperty: String(rename.after?.name) }),
                ...(classRename && { targetMetaClassName: String(classRename.after?.name) }),
                status: 'pending',
                actualOutput: Prisma.JsonNull,
                errorMessage: null,
              },
            });
          }
        }

        await tx.metamodel.update({
          where: { id: metamodelId },
          data: {
            name: next.name,
            description: next.description || null,
            uri: next.uri,
            prefix: next.prefix,
            eClass: next.eClass || null,
            classes: next.classes as any,
            enums: (next.enums || []) as any,
            constraints: (next.constraints || []) as any,
            spatialRules: (next.spatialRules || []) as any,
          },
        });

        return tx.metamodelMigration.create({
          data: {
            projectId,
            metamodelId,
            sourceCheckpointId: checkpoint.id,
            sourceHash: report.sourceHash,
            targetHash: report.targetHash,
            status: 'APPLIED',
            changeSet: appliedReport.changes as any,
            impactReport: appliedReport as any,
            migrationReport: { migratedModels } as any,
            createdById: userId,
            appliedAt: new Date(),
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      return {
        id: migrationRow.id,
        projectId,
        metamodelId,
        sourceCheckpointId: checkpoint.id,
        sourceHash: report.sourceHash,
        targetHash: report.targetHash,
        status: 'APPLIED',
        report: appliedReport,
        migratedModels,
        createdAt: migrationRow.createdAt.toISOString(),
        appliedAt: migrationRow.appliedAt?.toISOString(),
      };
    } catch (error) {
      const failure = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'
        ? new ApiError(409, 'Project artifacts changed during the migration. Run the preview again.')
        : error;
      await prisma.metamodelMigration.create({
        data: {
          projectId,
          metamodelId,
          sourceCheckpointId: checkpoint.id,
          sourceHash: report.sourceHash,
          targetHash: report.targetHash,
          status: 'FAILED',
          changeSet: appliedReport.changes as any,
          impactReport: appliedReport as any,
          migrationReport: { migratedModels, error: failure instanceof Error ? failure.message : String(failure) } as any,
          createdById: userId,
        },
      }).catch(() => undefined);
      throw failure;
    }
  }

  async list(projectId: string, metamodelId?: string): Promise<MetamodelMigrationResult[]> {
    const rows = await prisma.metamodelMigration.findMany({
      where: { projectId, ...(metamodelId && { metamodelId }) },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(row => ({
      id: row.id,
      projectId: row.projectId,
      metamodelId: row.metamodelId,
      sourceCheckpointId: row.sourceCheckpointId,
      sourceHash: row.sourceHash,
      targetHash: row.targetHash,
      status: row.status,
      report: row.impactReport as unknown as MetamodelEvolutionReport,
      migratedModels: ((row.migrationReport as any)?.migratedModels || []),
      createdAt: row.createdAt.toISOString(),
      appliedAt: row.appliedAt?.toISOString(),
    }));
  }
}

export const metamodelEvolutionService = new MetamodelEvolutionService();
