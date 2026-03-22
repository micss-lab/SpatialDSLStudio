import {
  Expression,
  ExpressionType,
  ExpressionOperator,
  ElementReference,
  PatternElement,
} from '../../../models/types';
import {
  createOperationExpression,
  createOperationWithOperands,
} from './expression.helpers';

type ParseContext = { availableElements?: PatternElement[] };

/**
 * Parse a string into an Expression object.
 * @param input The expression string to parse
 * @param context Additional context information for parsing
 * @returns Parsed Expression object or null if parsing fails
 */
export function parseExpression(
  input: string,
  context?: ParseContext
): Expression | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  input = input.trim();

  // First, check for element.attribute notation directly (without curly braces)
  const directRefMatch = input.match(/^([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)(\s+|$)/);
  if (directRefMatch) {
    const elementName = directRefMatch[1];
    const attributeName = directRefMatch[2];

    // If this is just "element.attribute" by itself, convert to a reference expression
    if (input === `${elementName}.${attributeName}`) {
      return {
        type: ExpressionType.REFERENCE,
        value: null,
        references: [{ elementName, attributeName }],
      };
    }

    // Check for "element.attribute increment/decrement X"
    const opPattern = new RegExp(
      `^${elementName}\\.${attributeName}\\s+(increment|decrement|multiply|divide|add|subtract)\\s+(.+)$`
    );
    const opMatch = input.match(opPattern);

    if (opMatch) {
      const operation = opMatch[1].toLowerCase();
      const rightSide = opMatch[2].trim();

      const leftOperand: Expression = {
        type: ExpressionType.REFERENCE,
        value: null,
        references: [{ elementName, attributeName }],
      };

      const rightOperand = parseExpression(rightSide, context);

      let operator: ExpressionOperator;
      switch (operation) {
        case 'increment':
        case 'add':
          operator = ExpressionOperator.ADD;
          break;
        case 'decrement':
        case 'subtract':
          operator = ExpressionOperator.SUBTRACT;
          break;
        case 'multiply':
          operator = ExpressionOperator.MULTIPLY;
          break;
        case 'divide':
          operator = ExpressionOperator.DIVIDE;
          break;
        default:
          operator = ExpressionOperator.ADD;
      }

      return createOperationWithOperands(operator, leftOperand, rightOperand);
    }
  }

  // Check if the input is a reference with curly braces {elementName.attributeName}
  if (input.match(/\{[^{}]+\}/)) {
    return parseReferenceExpression(input, context?.availableElements || []);
  }

  // Check for nested expressions with parentheses
  if (input.includes('(') && input.includes(')')) {
    return parseNestedExpression(input, context);
  }

  // Check for mathematical expressions
  if (input.match(/\s*(increment|decrement|multiply|add|subtract|divide)\s+/i)) {
    return parseMathExpression(input, context);
  }

  // Check for comparison expressions
  if (
    input.match(
      /\s*(equals|greater than|less than|greater than or equals|less than or equals|not equals)\s+/i
    )
  ) {
    return parseComparisonExpression(input, context);
  }

  // Check for logical expressions with AND/OR
  if (input.match(/\s+(AND|OR)\s+/i)) {
    return parseLogicalExpression(input, context);
  }

  // If it's a simple value, return as literal
  return {
    type: ExpressionType.LITERAL,
    value: input,
  };
}

// ---------------------------------------------------------------------------
// Private helpers (module-local)
// ---------------------------------------------------------------------------

/**
 * Parse an expression referencing another element's attribute.
 * Format: {elementName.attributeName}
 */
function parseReferenceExpression(
  input: string,
  availableElements: PatternElement[]
): Expression | null {
  const matches = input.match(/\{([^{}]+)\}/g);
  if (!matches) return null;

  if (matches.length > 1) {
    let processedInput = input;
    const references: ElementReference[] = [];

    matches.forEach((match, index) => {
      const refContent = match.slice(1, -1);
      const [elementName, attributeName] = refContent.split('.');

      if (elementName && attributeName) {
        references.push({ elementName, attributeName });
        processedInput = processedInput.replace(match, `__REF${index}__`);
      }
    });

    if (processedInput.includes('increment')) {
      return createOperationExpression(ExpressionOperator.ADD, references[0], 1, references);
    } else if (processedInput.includes('decrement')) {
      return createOperationExpression(ExpressionOperator.SUBTRACT, references[0], 1, references);
    } else if (processedInput.includes('multiply')) {
      const parts = processedInput.split('multiply');
      const rightValue = parseFloat(parts[1].trim().replace('__REF', ''));
      return createOperationExpression(
        ExpressionOperator.MULTIPLY,
        references[0],
        rightValue || 1,
        references
      );
    }

    return {
      type: ExpressionType.REFERENCE,
      value: null,
      references,
    };
  }

  // Simple reference: single {element.attribute}
  const refContent = matches[0].slice(1, -1);
  const [elementName, attributeName] = refContent.split('.');

  if (!elementName || !attributeName) {
    console.error('Invalid reference format. Must be {elementName.attributeName}');
    return null;
  }

  if (availableElements.length > 0) {
    const referencedElement = availableElements.find(e => e.name === elementName);
    if (!referencedElement) {
      console.warn(`Referenced element "${elementName}" not found in available elements`);
    }
  }

  return {
    type: ExpressionType.REFERENCE,
    value: null,
    references: [{ elementName, attributeName }],
  };
}

/**
 * Parse a nested expression with parentheses.
 */
function parseNestedExpression(
  input: string,
  context?: ParseContext
): Expression | null {
  const matches = input.match(/\(([^()]*)\)/);
  if (!matches) return null;

  const innerExpression = matches[1];
  const parsedInner = parseExpression(innerExpression, context);

  if (!parsedInner) return null;

  parsedInner.isNested = true;

  if (input === `(${innerExpression})`) {
    return parsedInner;
  }

  const updatedInput = input.replace(`(${innerExpression})`, '__NESTED__');
  const outerExpression = parseExpression(updatedInput, context);

  if (!outerExpression) return parsedInner;

  if (outerExpression.type === ExpressionType.OPERATION) {
    if (!outerExpression.leftOperand && updatedInput.indexOf('__NESTED__') === 0) {
      outerExpression.leftOperand = parsedInner;
    } else if (!outerExpression.rightOperand) {
      outerExpression.rightOperand = parsedInner;
    }
  }

  return outerExpression;
}

/**
 * Parse a mathematical expression (increment, decrement, multiply, etc.).
 */
function parseMathExpression(
  input: string,
  context?: ParseContext
): Expression | null {
  const incMatch = input.match(/(.+)\s+increment\s+(.+)/i);
  if (incMatch) {
    const left = parseExpression(incMatch[1].trim(), context);
    const right = parseExpression(incMatch[2].trim(), context);
    return createOperationWithOperands(ExpressionOperator.ADD, left, right);
  }

  const decMatch = input.match(/(.+)\s+decrement\s+(.+)/i);
  if (decMatch) {
    const left = parseExpression(decMatch[1].trim(), context);
    const right = parseExpression(decMatch[2].trim(), context);
    return createOperationWithOperands(ExpressionOperator.SUBTRACT, left, right);
  }

  const mulMatch = input.match(/(.+)\s+multiply\s+(.+)/i);
  if (mulMatch) {
    const left = parseExpression(mulMatch[1].trim(), context);
    const right = parseExpression(mulMatch[2].trim(), context);
    return createOperationWithOperands(ExpressionOperator.MULTIPLY, left, right);
  }

  const divMatch = input.match(/(.+)\s+divide\s+(.+)/i);
  if (divMatch) {
    const left = parseExpression(divMatch[1].trim(), context);
    const right = parseExpression(divMatch[2].trim(), context);
    return createOperationWithOperands(ExpressionOperator.DIVIDE, left, right);
  }

  return null;
}

/**
 * Parse a comparison expression (equals, greater than, etc.).
 */
function parseComparisonExpression(
  input: string,
  context?: ParseContext
): Expression | null {
  const eqMatch = input.match(/(.+)\s+equals\s+(.+)/i);
  if (eqMatch) {
    const left = parseExpression(eqMatch[1].trim(), context);
    const right = parseExpression(eqMatch[2].trim(), context);
    return createOperationWithOperands(ExpressionOperator.EQUALS, left, right);
  }

  const neqMatch = input.match(/(.+)\s+not\s+equals\s+(.+)/i);
  if (neqMatch) {
    const left = parseExpression(neqMatch[1].trim(), context);
    const right = parseExpression(neqMatch[2].trim(), context);
    return createOperationWithOperands(ExpressionOperator.NOT_EQUALS, left, right);
  }

  const gtMatch = input.match(/(.+)\s+greater\s+than\s+(.+)/i);
  if (gtMatch) {
    const left = parseExpression(gtMatch[1].trim(), context);
    const right = parseExpression(gtMatch[2].trim(), context);
    return createOperationWithOperands(ExpressionOperator.GREATER_THAN, left, right);
  }

  const ltMatch = input.match(/(.+)\s+less\s+than\s+(.+)/i);
  if (ltMatch) {
    const left = parseExpression(ltMatch[1].trim(), context);
    const right = parseExpression(ltMatch[2].trim(), context);
    return createOperationWithOperands(ExpressionOperator.LESS_THAN, left, right);
  }

  const gteMatch = input.match(/(.+)\s+greater\s+than\s+or\s+equals\s+(.+)/i);
  if (gteMatch) {
    const left = parseExpression(gteMatch[1].trim(), context);
    const right = parseExpression(gteMatch[2].trim(), context);
    return createOperationWithOperands(ExpressionOperator.GREATER_EQUALS, left, right);
  }

  const lteMatch = input.match(/(.+)\s+less\s+than\s+or\s+equals\s+(.+)/i);
  if (lteMatch) {
    const left = parseExpression(lteMatch[1].trim(), context);
    const right = parseExpression(lteMatch[2].trim(), context);
    return createOperationWithOperands(ExpressionOperator.LESS_EQUALS, left, right);
  }

  return null;
}

/**
 * Parse a logical expression with AND/OR.
 */
function parseLogicalExpression(
  input: string,
  context?: ParseContext
): Expression | null {
  const andMatch = input.match(/(.+)\s+AND\s+(.+)/i);
  if (andMatch) {
    const left = parseExpression(andMatch[1].trim(), context);
    const right = parseExpression(andMatch[2].trim(), context);
    return {
      type: ExpressionType.COMPOUND,
      value: null,
      operator: ExpressionOperator.AND,
      leftOperand: left || undefined,
      rightOperand: right || undefined,
    };
  }

  const orMatch = input.match(/(.+)\s+OR\s+(.+)/i);
  if (orMatch) {
    const left = parseExpression(orMatch[1].trim(), context);
    const right = parseExpression(orMatch[2].trim(), context);
    return {
      type: ExpressionType.COMPOUND,
      value: null,
      operator: ExpressionOperator.OR,
      leftOperand: left || undefined,
      rightOperand: right || undefined,
    };
  }

  return null;
}
