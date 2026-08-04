import { v5 as uuidv5 } from 'uuid';
import prisma from '../../config/database';
import { ApiError } from '../../middleware';
import {
  MetaClass,
  Metamodel,
  Model,
  ModelElement,
  PatternElement,
  TransformationPattern,
} from '../../../../shared/types';
import { contentHash, stableStringify } from '../lifecycle/canonical';

const TRANSFORMATION_NAMESPACE = '99e13ef5-b58d-4c3a-a423-d9f231f80f29';

const asPattern = (value: unknown, type: 'LHS' | 'RHS' | 'NAC'): TransformationPattern => {
  if (!value || typeof value !== 'object' || !Array.isArray((value as any).elements)) {
    throw new ApiError(400, `${type} transformation pattern is malformed`);
  }
  return value as TransformationPattern;
};

const literalValue = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const expression = value as Record<string, unknown>;
  if (expression.type === 'LITERAL') return expression.value;
  throw new ApiError(400, `Headless transformations support literal attributes only; found ${String(expression.type)}`);
};

const referenceValues = (value: string | string[] | null | undefined): string[] => (
  value === null || value === undefined ? [] : Array.isArray(value) ? value : [value]
);

export class TransformationEngine {
  async apply(
    projectId: string,
    model: Model,
    metamodel: Metamodel,
    ruleId: string,
    maxIterations = 1
  ): Promise<Record<string, any>> {
    const rule = await prisma.transformationRule.findFirst({ where: { id: ruleId, projectId } });
    if (!rule) throw new ApiError(404, 'Transformation rule not found in this project');
    if (!rule.enabled) throw new ApiError(409, `Transformation rule ${rule.name} is disabled`);
    if (Array.isArray(rule.conditions) && rule.conditions.length > 0) {
      throw new ApiError(400, 'Headless transformations do not execute free-form rule conditions');
    }

    const lhs = asPattern(rule.lhs, 'LHS');
    const rhs = asPattern(rule.rhs, 'RHS');
    const nacs = Array.isArray(rule.nacs)
      ? (rule.nacs as unknown[]).map(value => asPattern(value, 'NAC'))
      : [];
    if (lhs.globalExpression || rhs.globalExpression || nacs.some(nac => nac.globalExpression)) {
      throw new ApiError(400, 'Headless transformations do not execute free-form pattern expressions');
    }
    if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 1000) {
      throw new ApiError(400, 'maxIterations must be an integer between 1 and 1000');
    }

    let elements = structuredClone(model.elements);
    let connections = structuredClone(model.connections || []);
    const steps: Array<Record<string, any>> = [];
    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      if (nacs.some(nac => this.findMatches(nac, elements, metamodel).length > 0)) break;
      const match = this.findMatches(lhs, elements, metamodel)[0];
      if (!match) break;
      const result = this.applyMatch(
        model.id,
        rule.id,
        iteration,
        lhs,
        rhs,
        match,
        elements,
        connections,
        metamodel
      );
      if (!result.changed) break;
      elements = result.elements;
      connections = result.connections;
      steps.push({
        iteration: iteration + 1,
        matchedElementIds: Object.values(match).sort(),
        createdElementIds: result.createdIds,
        updatedElementIds: result.updatedIds,
        deletedElementIds: result.deletedIds,
      });
    }

    if (steps.length > 0) {
      await prisma.model.update({
        where: { id: model.id },
        data: { elements: elements as any, connections: connections as any },
      });
    }
    const transformedModel = { ...model, elements, connections };
    return {
      ruleId,
      ruleName: rule.name,
      appliedIterations: steps.length,
      steps,
      modelHash: contentHash({ elements, connections }),
      model: transformedModel,
    };
  }

  private classForPatternType(metamodel: Metamodel, type: string): MetaClass | undefined {
    return metamodel.classes.find(metaClass => metaClass.id === type || metaClass.name === type);
  }

  private attributeName(metaClass: MetaClass | undefined, key: string): string {
    return metaClass?.attributes.find(attribute => attribute.id === key)?.name || key;
  }

  private referenceName(metaClass: MetaClass | undefined, key: string): string {
    return metaClass?.references.find(reference => reference.id === key)?.name || key;
  }

  private elementMatches(pattern: PatternElement, element: ModelElement, metamodel: Metamodel): boolean {
    const expectedClass = this.classForPatternType(metamodel, pattern.type);
    if (!expectedClass || element.modelElementId !== expectedClass.id) return false;
    return Object.entries(pattern.attributes || {}).every(([key, expected]) => {
      const name = this.attributeName(expectedClass, key);
      return stableStringify(element.style?.[name]) === stableStringify(literalValue(expected));
    });
  }

  private findMatches(
    pattern: TransformationPattern,
    elements: ModelElement[],
    metamodel: Metamodel
  ): Array<Record<string, string>> {
    const patternElements = [...pattern.elements].sort((left, right) => left.id.localeCompare(right.id));
    const candidates = [...elements].sort((left, right) => left.id.localeCompare(right.id));
    const results: Array<Record<string, string>> = [];
    const search = (index: number, mapping: Record<string, string>, used: Set<string>): void => {
      if (index === patternElements.length) {
        if (this.referencesMatch(patternElements, mapping, elements, metamodel)) results.push({ ...mapping });
        return;
      }
      const patternElement = patternElements[index];
      candidates.forEach(candidate => {
        if (!used.has(candidate.id) && this.elementMatches(patternElement, candidate, metamodel)) {
          mapping[patternElement.id] = candidate.id;
          used.add(candidate.id);
          search(index + 1, mapping, used);
          used.delete(candidate.id);
          delete mapping[patternElement.id];
        }
      });
    };
    search(0, {}, new Set());
    return results;
  }

  private referencesMatch(
    patternElements: PatternElement[],
    mapping: Record<string, string>,
    elements: ModelElement[],
    metamodel: Metamodel
  ): boolean {
    const byId = new Map(elements.map(element => [element.id, element]));
    return patternElements.every(patternElement => {
      const modelElement = byId.get(mapping[patternElement.id]);
      const metaClass = this.classForPatternType(metamodel, patternElement.type);
      if (!modelElement) return false;
      return Object.entries(patternElement.references || {}).every(([key, target]) => {
        const name = this.referenceName(metaClass, key);
        const actual = referenceValues(modelElement.references?.[name] ?? modelElement.references?.[key]);
        const expectedPatternIds = target === null ? [] : Array.isArray(target) ? target : [target];
        const expected = expectedPatternIds.map(id => mapping[id]).filter(Boolean).sort();
        return stableStringify([...actual].sort()) === stableStringify(expected);
      });
    });
  }

  private applyMatch(
    modelId: string,
    ruleId: string,
    iteration: number,
    lhs: TransformationPattern,
    rhs: TransformationPattern,
    match: Record<string, string>,
    sourceElements: ModelElement[],
    sourceConnections: any[],
    metamodel: Metamodel
  ): {
    changed: boolean;
    elements: ModelElement[];
    connections: any[];
    createdIds: string[];
    updatedIds: string[];
    deletedIds: string[];
  } {
    const elements = structuredClone(sourceElements);
    const lhsIds = new Set(lhs.elements.map(element => element.id));
    const rhsIds = new Set(rhs.elements.map(element => element.id));
    const deletedIds = lhs.elements
      .filter(element => !rhsIds.has(element.id))
      .map(element => match[element.id])
      .filter(Boolean)
      .sort();
    const deletedSet = new Set(deletedIds);
    const remaining = elements.filter(element => !deletedSet.has(element.id));
    const byId = new Map(remaining.map(element => [element.id, element]));
    const rhsToModel: Record<string, string> = {};
    Object.entries(match).forEach(([patternId, elementId]) => {
      if (rhsIds.has(patternId)) rhsToModel[patternId] = elementId;
    });
    const createdIds: string[] = [];
    const updatedIds: string[] = [];

    rhs.elements.forEach(patternElement => {
      const metaClass = this.classForPatternType(metamodel, patternElement.type);
      if (!metaClass) throw new ApiError(409, `RHS element ${patternElement.name} uses unknown type ${patternElement.type}`);
      let modelElement = rhsToModel[patternElement.id]
        ? byId.get(rhsToModel[patternElement.id])
        : undefined;
      if (!modelElement) {
        const id = uuidv5(`${modelId}:${ruleId}:${iteration}:${patternElement.id}`, TRANSFORMATION_NAMESPACE);
        if (byId.has(id)) throw new ApiError(409, `Transformation would create duplicate element ${id}`);
        modelElement = {
          id,
          modelElementId: metaClass.id,
          style: {},
          references: {},
        };
        remaining.push(modelElement);
        byId.set(id, modelElement);
        rhsToModel[patternElement.id] = id;
        createdIds.push(id);
      }
      const before = stableStringify(modelElement);
      modelElement.modelElementId = metaClass.id;
      Object.entries(patternElement.attributes || {}).forEach(([key, value]) => {
        modelElement!.style[this.attributeName(metaClass, key)] = literalValue(value);
      });
      if (stableStringify(modelElement) !== before && !createdIds.includes(modelElement.id)) {
        updatedIds.push(modelElement.id);
      }
    });

    rhs.elements.forEach(patternElement => {
      const modelElement = byId.get(rhsToModel[patternElement.id]);
      const metaClass = this.classForPatternType(metamodel, patternElement.type);
      if (!modelElement) return;
      const before = stableStringify(modelElement.references);
      Object.entries(patternElement.references || {}).forEach(([key, target]) => {
        const name = this.referenceName(metaClass, key);
        if (target === null) modelElement.references[name] = null;
        else if (Array.isArray(target)) modelElement.references[name] = target.map(id => rhsToModel[id]).filter(Boolean);
        else modelElement.references[name] = rhsToModel[target] || null;
      });
      if (
        stableStringify(modelElement.references) !== before
        && !createdIds.includes(modelElement.id)
        && !updatedIds.includes(modelElement.id)
      ) updatedIds.push(modelElement.id);
    });

    remaining.forEach(element => {
      Object.entries(element.references || {}).forEach(([name, value]) => {
        if (Array.isArray(value)) element.references[name] = value.filter(id => !deletedSet.has(id));
        else if (value && deletedSet.has(value)) element.references[name] = null;
      });
    });
    const connections = sourceConnections.filter(connection => (
      !deletedSet.has(connection.sourceId) && !deletedSet.has(connection.targetId)
    ));
    remaining.sort((left, right) => left.id.localeCompare(right.id));
    createdIds.sort();
    updatedIds.sort();
    return {
      changed: deletedIds.length > 0 || createdIds.length > 0 || updatedIds.length > 0,
      elements: remaining,
      connections,
      createdIds,
      updatedIds,
      deletedIds,
    };
  }
}

export const transformationEngine = new TransformationEngine();

