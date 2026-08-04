import {
  MetaAttribute,
  MetaClass,
  MetaReference,
  Metamodel,
  Model,
  ModelElement,
  ValidationIssue,
  ValidationResult,
} from '../../../../shared/types';
import { spatialElementErrors } from '../../middleware/presentationValidation';

export const isSubtype = (
  metamodel: Metamodel,
  typeId: string,
  expectedTypeId: string,
  visited = new Set<string>()
): boolean => {
  if (typeId === expectedTypeId) return true;
  if (visited.has(typeId)) return false;
  visited.add(typeId);
  const metaClass = metamodel.classes.find(candidate => candidate.id === typeId);
  return Boolean(metaClass?.superTypes?.some(superType => (
    isSubtype(metamodel, superType, expectedTypeId, visited)
  )));
};

export const valueMatchesAttribute = (value: unknown, attribute: MetaAttribute): boolean => {
  if (value === undefined || value === null || (attribute.required && value === '')) {
    return !attribute.required;
  }
  if (attribute.many) {
    return Array.isArray(value) && value.every(item => valueMatchesAttribute(item, {
      ...attribute,
      many: false,
      required: true,
    }));
  }
  if (Array.isArray(value)) return false;
  if (typeof attribute.type === 'object') return typeof value === 'string';
  if (attribute.type === 'date') return typeof value === 'string' && !Number.isNaN(Date.parse(value));
  return typeof value === attribute.type;
};

const inheritedFeatures = <T extends MetaAttribute | MetaReference>(
  metamodel: Metamodel,
  metaClass: MetaClass,
  key: 'attributes' | 'references',
  visited = new Set<string>()
): T[] => {
  if (visited.has(metaClass.id)) return [];
  visited.add(metaClass.id);
  const inherited = (metaClass.superTypes || []).flatMap(superTypeId => {
    const superType = metamodel.classes.find(candidate => candidate.id === superTypeId);
    return superType ? inheritedFeatures<T>(metamodel, superType, key, visited) : [];
  });
  const own = (metaClass[key] || []) as T[];
  return [...new Map([...inherited, ...own].map(feature => [feature.id, feature])).values()];
};

const referenceValues = (value: string | string[] | null | undefined): string[] => (
  value === null || value === undefined ? [] : Array.isArray(value) ? value : [value]
);

export class ModelValidationEngine {
  validate(model: Model, metamodel: Metamodel): ValidationResult {
    const issues: ValidationIssue[] = [];
    const elementsById = new Map<string, ModelElement>();
    const duplicateIds = new Set<string>();
    model.elements.forEach(element => {
      if (elementsById.has(element.id)) duplicateIds.add(element.id);
      elementsById.set(element.id, element);
    });
    duplicateIds.forEach(id => issues.push({
      severity: 'error',
      message: `Duplicate model element ID ${id}`,
      elementId: id,
      location: `elements[${id}]`,
    }));

    for (const element of model.elements) {
      const path = `elements[${element.id}]`;
      const metaClass = metamodel.classes.find(candidate => candidate.id === element.modelElementId);
      if (!metaClass) {
        issues.push({
          severity: 'error',
          message: `Element ${element.id} uses unknown metaclass ${element.modelElementId}`,
          elementId: element.id,
          location: `${path}.modelElementId`,
        });
        continue;
      }
      if (metaClass.abstract) {
        issues.push({
          severity: 'error',
          message: `Element ${element.id} instantiates abstract metaclass ${metaClass.name}`,
          elementId: element.id,
          location: `${path}.modelElementId`,
        });
      }

      inheritedFeatures<MetaAttribute>(metamodel, metaClass, 'attributes').forEach(attribute => {
        const value = element.style?.[attribute.name];
        if (!valueMatchesAttribute(value, attribute)) {
          issues.push({
            severity: 'error',
            message: `${metaClass.name}.${attribute.name} has an invalid value`,
            elementId: element.id,
            location: `${path}.style.${attribute.name}`,
          });
        }
      });

      inheritedFeatures<MetaReference>(metamodel, metaClass, 'references').forEach(reference => {
        const raw = element.references?.[reference.name] ?? element.references?.[reference.id];
        const values = referenceValues(raw);
        const maximum = reference.cardinality.upperBound;
        if (
          values.length < reference.cardinality.lowerBound
          || (maximum !== '*' && values.length > maximum)
        ) {
          issues.push({
            severity: 'error',
            message: `${metaClass.name}.${reference.name} violates cardinality ${reference.cardinality.lowerBound}..${maximum}`,
            elementId: element.id,
            location: `${path}.references.${reference.name}`,
          });
        }
        values.forEach(targetId => {
          const target = elementsById.get(targetId);
          if (!target) {
            issues.push({
              severity: 'error',
              message: `${metaClass.name}.${reference.name} targets missing element ${targetId}`,
              elementId: element.id,
              location: `${path}.references.${reference.name}`,
            });
          } else if (!isSubtype(metamodel, target.modelElementId, reference.target)) {
            issues.push({
              severity: 'error',
              message: `${metaClass.name}.${reference.name} targets incompatible metaclass ${target.modelElementId}`,
              elementId: element.id,
              location: `${path}.references.${reference.name}`,
            });
          }
        });
      });

      spatialElementErrors(element, path).forEach(message => issues.push({
        severity: 'error', message, elementId: element.id, location: path,
      }));
    }

    (model.connections || []).forEach(connection => {
      if (!elementsById.has(connection.sourceId) || !elementsById.has(connection.targetId)) {
        issues.push({
          severity: 'error',
          message: `Connection ${connection.id} has a missing endpoint`,
          location: `connections[${connection.id}]`,
        });
      }
    });

    return { valid: !issues.some(issue => issue.severity === 'error'), issues };
  }
}

export const modelValidationEngine = new ModelValidationEngine();

