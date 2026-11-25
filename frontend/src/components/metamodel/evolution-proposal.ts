import { MetamodelEvolutionChange, MetamodelMigrationRule } from '../../models/lifecycle.types';
import { Metamodel } from '../../models/types';

export type EvolutionEdit =
  | { kind: 'rename-class'; classId: string; name: string }
  | { kind: 'rename-attribute'; classId: string; attributeId: string; name: string }
  | { kind: 'remove-attribute'; classId: string; attributeId: string }
  | { kind: 'remove-class'; classId: string };

export function editProposal(source: Metamodel, edit: EvolutionEdit): Metamodel {
  const metaClass = source.classes.find(candidate => candidate.id === edit.classId);
  if (!metaClass) throw new Error('Choose a class from the current proposal.');

  if (edit.kind === 'remove-class') {
    return { ...source, classes: source.classes.filter(candidate => candidate.id !== edit.classId) };
  }
  if (edit.kind === 'rename-class') {
    const name = edit.name.trim();
    if (!name || name === metaClass.name) throw new Error('Enter a different class name.');
    return { ...source, classes: source.classes.map(candidate => candidate.id === edit.classId ? { ...candidate, name } : candidate) };
  }

  const previousAttributes = metaClass.attributes || [];
  const attribute = previousAttributes.find(candidate => candidate.id === edit.attributeId);
  if (!attribute) throw new Error('Choose an attribute from the current proposal.');
  const name = edit.kind === 'rename-attribute' ? edit.name.trim() : '';
  if (edit.kind === 'rename-attribute' && (!name || name === attribute.name)) {
    throw new Error('Enter a different attribute name.');
  }
  const attributes = edit.kind === 'remove-attribute'
    ? previousAttributes.filter(candidate => candidate.id !== edit.attributeId)
    : previousAttributes.map(candidate => candidate.id === edit.attributeId ? { ...candidate, name } : candidate);
  return {
    ...source,
    classes: source.classes.map(candidate => candidate.id === edit.classId ? { ...candidate, attributes } : candidate),
  };
}

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const name = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const named = (value: unknown): value is { id: string; name: string } & Record<string, unknown> => (
  object(value) && name(value.id) && name(value.name)
);

export function parseEvolutionProposal(text: string, source: Metamodel): Metamodel {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('The proposal must be valid JSON.');
  }
  if (!named(value) || !name(value.uri) || !name(value.prefix) || !Array.isArray(value.classes)) {
    throw new Error('Choose a complete SpatialDSL Studio metamodel JSON export.');
  }
  if (value.id !== source.id || value.conformsTo !== source.conformsTo) {
    throw new Error('The proposal must use the current metamodel ID and its meta-metamodel ID.');
  }
  const classes = value.classes;
  if (!classes.every(cls => named(cls) && Array.isArray(cls.attributes) && cls.attributes.every(named)
    && Array.isArray(cls.references) && cls.references.every(ref => named(ref) && name(ref.target)
        && object(ref.cardinality) && typeof ref.cardinality.lowerBound === 'number')
    && Array.isArray(cls.superTypes) && cls.superTypes.every(name))
    || [value.constraints, value.enums, value.spatialRules].some(items => items !== undefined && !Array.isArray(items))) {
    throw new Error('The proposal contains an invalid class, feature, or metamodel collection.');
  }
  return value as unknown as Metamodel;
}

export interface MigrationRuleChoice {
  id: string;
  label: string;
  rule: MetamodelMigrationRule;
}

export function migrationRuleChoices(changes: MetamodelEvolutionChange[], source: Metamodel): MigrationRuleChoice[] {
  return changes.flatMap<MigrationRuleChoice>(change => {
    const fromName = String(change.before?.name || '');
    const toName = String(change.after?.name || '');
    const className = source.classes.find(cls => cls.id === change.classId)?.name ?? change.classId;
    const id = `${change.kind}:${change.classId}:${change.featureId || ''}`;
    const base = { classId: change.classId, featureId: change.featureId };
    switch (change.kind) {
      case 'attribute-renamed':
        return [{ id, label: `Move ${className}.${fromName} values to ${toName}`, rule: { ...base, kind: 'rename-attribute', fromName, toName } }];
      case 'attribute-removed':
        return [{ id, label: `Remove stored values of ${className}.${fromName}`, rule: { ...base, kind: 'remove-attribute', fromName } }];
      case 'class-removed':
        return [{ id, label: `Delete all instances of ${className}`, rule: { ...base, kind: 'remove-class', deleteInstances: true } }];
      default:
        return [];
    }
  });
}
