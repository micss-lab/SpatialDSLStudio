import {
  MetaAttribute,
  MetaClass,
  Metamodel,
  ToolDefinition,
  ToolOperation,
  ToolOperationValue,
} from '../../models/types';
import { modelInheritanceUtilsService } from '../model/model-inheritance-utils.service';

export type ExecutableToolType = 'create-node' | 'create-edge' | 'delete' | 'direct-edit' | 'reconnect';

const executableToolTypes = new Set<ExecutableToolType>([
  'create-node',
  'create-edge',
  'delete',
  'direct-edit',
  'reconnect',
]);

/**
 * Early example viewpoints used `node` and `edge`. Keep those definitions
 * executable while persisting all newly-authored tools with explicit verbs.
 */
export const normalizeToolType = (type?: string): string => {
  if (type === 'node') return 'create-node';
  if (type === 'edge') return 'create-edge';
  return type || '';
};

export const getExecutableToolType = (tool: ToolDefinition): ExecutableToolType | undefined => {
  const normalized = normalizeToolType(tool.type);
  return executableToolTypes.has(normalized as ExecutableToolType)
    ? normalized as ExecutableToolType
    : undefined;
};

export const getToolOperations = (tool: ToolDefinition): ToolOperation[] => {
  const operations = tool.payload?.operations;
  if (!Array.isArray(operations)) return [];

  return operations
    .slice(0, 50)
    .filter((operation): operation is ToolOperation => (
      Boolean(operation)
      && operation.type === 'set-attribute'
      && typeof operation.attributeName === 'string'
      && operation.attributeName.trim().length > 0
      && (
        operation.value === null
        || typeof operation.value === 'string'
        || typeof operation.value === 'boolean'
        || (typeof operation.value === 'number' && Number.isFinite(operation.value))
      )
    ));
};

const coerceValue = (
  value: ToolOperationValue,
  attribute: MetaAttribute,
  metamodel: Metamodel
): { valid: boolean; value?: ToolOperationValue } => {
  if (value === null) {
    return attribute.required ? { valid: false } : { valid: true, value: null };
  }

  if (attribute.many) return { valid: false };

  const attributeType = attribute.type;
  if (typeof attributeType === 'object') {
    const targetEnum = metamodel.enums?.find(candidate => candidate.id === attributeType.enumId);
    const validLiterals = new Set(
      (targetEnum?.literals || []).flatMap(literal => [literal.name, literal.literal, literal.value]
        .filter((candidate): candidate is string | number => candidate !== undefined))
    );
    return validLiterals.size === 0 || validLiterals.has(value as string | number)
      ? { valid: true, value }
      : { valid: false };
  }

  switch (attributeType) {
    case 'number': {
      const numberValue = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(numberValue)
        ? { valid: true, value: numberValue }
        : { valid: false };
    }
    case 'boolean':
      if (typeof value === 'boolean') return { valid: true, value };
      if (value === 'true' || value === 'false') return { valid: true, value: value === 'true' };
      return { valid: false };
    case 'date':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value))
        ? { valid: true, value }
        : { valid: false };
    case 'string':
    default:
      return typeof value === 'string' ? { valid: true, value } : { valid: false };
  }
};

/**
 * Interpret the deliberately small operation language. It never evaluates
 * expressions: only declared, scalar metaclass attributes can be initialized.
 */
export const getToolInitialAttributes = (
  tool: ToolDefinition,
  metaClass: MetaClass,
  metamodel: Metamodel
): Record<string, ToolOperationValue> => {
  if (getExecutableToolType(tool) !== 'create-node') return {};

  const attributes = modelInheritanceUtilsService.getAllAttributes(metaClass, metamodel);
  const attributesByName = new Map<string, MetaAttribute>();
  attributes.forEach(attribute => {
    attributesByName.set(attribute.name, attribute);
    attributesByName.set(attribute.id, attribute);
  });

  const result: Record<string, ToolOperationValue> = {};
  for (const operation of getToolOperations(tool)) {
    const attribute = attributesByName.get(operation.attributeName.trim());
    if (!attribute) continue;

    const coerced = coerceValue(operation.value, attribute, metamodel);
    if (coerced.valid) {
      result[attribute.name] = coerced.value ?? null;
    }
  }

  return result;
};
