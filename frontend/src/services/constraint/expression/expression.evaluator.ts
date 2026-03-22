import {
  Expression,
  ExpressionType,
  ExpressionOperator,
  PatternMatch,
} from '../../../models/types';
import { parseExpression } from './expression.parser';

type EvalContext = {
  patternMatch?: PatternMatch;
  patternElements?: Record<string, any>;
  modelElements?: Record<string, any>;
  allPatternElements?: any[];
  allModelElements?: any[];
};

/**
 * Evaluate an expression in the context of a pattern match.
 * @param expression The expression to evaluate (object or string)
 * @param context The evaluation context for resolving references
 * @returns The evaluated result of the expression
 */
export function evaluateExpression(
  expression: Expression | string,
  context: EvalContext
): any {
  // If expression is a string, parse it first
  if (typeof expression === 'string') {
    expression =
      parseExpression(expression, {
        availableElements: context.allPatternElements || [],
      }) || { type: ExpressionType.LITERAL, value: expression };
  }

  if (!expression) {
    return null;
  }

  switch (expression.type) {
    case ExpressionType.LITERAL:
      return expression.value;

    case ExpressionType.REFERENCE:
      return evaluateReference(expression, context);

    case ExpressionType.OPERATION:
      return evaluateOperation(expression, context);

    case ExpressionType.COMPOUND:
      return evaluateCompound(expression, context);

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Private helpers (module-local)
// ---------------------------------------------------------------------------

function evaluateReference(expression: Expression, context: EvalContext): any {
  if (!expression.references || expression.references.length === 0) {
    return null;
  }

  const reference = expression.references[0];
  const { elementName, attributeName } = reference;

  console.log(`[ExpressionService] Evaluating reference: ${elementName}.${attributeName}`);

  // Build name→id mapping for pattern elements
  const patternElementNameToId: Record<string, string> = {};
  if (context.patternElements) {
    Object.entries(context.patternElements).forEach(([id, element]) => {
      if (element && element.name) {
        patternElementNameToId[element.name] = id;
      }
    });
    console.log(`[ExpressionService] Pattern element name mapping:`, patternElementNameToId);
  }

  // 1. Try pattern element by name
  const patternElementId = patternElementNameToId[elementName];
  if (patternElementId && context.patternElements?.[patternElementId]) {
    console.log(`[ExpressionService] Found pattern element by name: ${elementName} -> ${patternElementId}`);
    const patternElement = context.patternElements[patternElementId];

    if (
      patternElement.attributes &&
      (patternElement.attributes[attributeName] !== undefined ||
        patternElement.attributes[`attr-${attributeName}`] !== undefined)
    ) {
      const value =
        patternElement.attributes[attributeName] ??
        patternElement.attributes[`attr-${attributeName}`];
      console.log(`[ExpressionService] Found attribute value in pattern element: ${value}`);
      return value;
    }
  }

  // 2. Try model elements via the pattern match
  if (context.patternMatch && context.modelElements) {
    if (patternElementId) {
      const modelElementId = context.patternMatch.matches[patternElementId];
      if (modelElementId && context.modelElements[patternElementId]) {
        console.log(
          `[ExpressionService] Found model element via pattern mapping: ${patternElementId} -> ${modelElementId}`
        );
        const modelElement = context.modelElements[patternElementId];

        if (
          modelElement.style &&
          (modelElement.style[attributeName] !== undefined ||
            modelElement.style[`attr-${attributeName}`] !== undefined)
        ) {
          const value =
            modelElement.style[attributeName] ??
            modelElement.style[`attr-${attributeName}`];
          console.log(`[ExpressionService] Found attribute value in model element style: ${value}`);
          return value;
        }

        if (modelElement[attributeName] !== undefined) {
          console.log(
            `[ExpressionService] Found attribute value directly on model element: ${modelElement[attributeName]}`
          );
          return modelElement[attributeName];
        }
      }
    }

    // Search by name in all model elements
    for (const [elemId, modelElement] of Object.entries(context.modelElements)) {
      if (modelElement.style && modelElement.style.name === elementName) {
        console.log(`[ExpressionService] Found model element by style.name: ${elementName} -> ${elemId}`);

        if (modelElement.style[attributeName] !== undefined) {
          console.log(
            `[ExpressionService] Found attribute value in model element: ${modelElement.style[attributeName]}`
          );
          return modelElement.style[attributeName];
        }
      }
      if ((modelElement as any).attributes?.name === elementName) {
        console.log(
          `[ExpressionService] Found model element by attributes.name: ${elementName} -> ${elemId}`
        );

        if ((modelElement as any).attributes[attributeName] !== undefined) {
          console.log(
            `[ExpressionService] Found attribute value in model element attributes: ${(modelElement as any).attributes[attributeName]}`
          );
          return (modelElement as any).attributes[attributeName];
        }
      }
    }

    // If element name looks like a pattern element ID, try it directly
    if (elementName.includes('-') && context.patternMatch.matches[elementName]) {
      const modelElementId = context.patternMatch.matches[elementName];
      if (modelElementId && context.modelElements[elementName]) {
        console.log(
          `[ExpressionService] Found model element via direct ID match: ${elementName} -> ${modelElementId}`
        );
        const modelElement = context.modelElements[elementName];

        if (modelElement.style?.[attributeName] !== undefined) {
          console.log(
            `[ExpressionService] Found attribute value in model element style: ${modelElement.style[attributeName]}`
          );
          return modelElement.style[attributeName];
        }

        if (modelElement[attributeName] !== undefined) {
          console.log(
            `[ExpressionService] Found attribute value directly on model element: ${modelElement[attributeName]}`
          );
          return modelElement[attributeName];
        }
      }
    }
  }

  // 3. Search all pattern elements
  if (context.allPatternElements && context.allPatternElements.length > 0) {
    const element = context.allPatternElements.find(e => e.name === elementName);
    if (element?.attributes) {
      console.log(`[ExpressionService] Found element in allPatternElements: ${elementName}`);
      const value =
        element.attributes[attributeName] ??
        element.attributes[`attr-${attributeName}`];
      if (value !== undefined) {
        console.log(`[ExpressionService] Found attribute value in allPatternElements: ${value}`);
        return value;
      }
    }
  }

  // 4. Search all model elements
  if (context.allModelElements && context.allModelElements.length > 0) {
    const element = context.allModelElements.find(
      e =>
        e.name === elementName ||
        (e.style && e.style.name === elementName) ||
        ((e as any).attributes && (e as any).attributes.name === elementName)
    );

    if (element) {
      console.log(`[ExpressionService] Found element in allModelElements: ${elementName}`);

      if (
        element.style &&
        (element.style[attributeName] !== undefined ||
          element.style[`attr-${attributeName}`] !== undefined)
      ) {
        const value =
          element.style[attributeName] ?? element.style[`attr-${attributeName}`];
        console.log(`[ExpressionService] Found attribute value in element style: ${value}`);
        return value;
      }

      if (
        (element as any).attributes &&
        ((element as any).attributes[attributeName] !== undefined ||
          (element as any).attributes[`attr-${attributeName}`] !== undefined)
      ) {
        const value =
          (element as any).attributes[attributeName] ??
          (element as any).attributes[`attr-${attributeName}`];
        console.log(`[ExpressionService] Found attribute value in element attributes: ${value}`);
        return value;
      }

      if (element[attributeName] !== undefined) {
        console.log(
          `[ExpressionService] Found attribute value directly on element: ${element[attributeName]}`
        );
        return element[attributeName];
      }
    }
  }

  console.warn(`Could not resolve reference to ${elementName}.${attributeName}`);
  return null;
}

function evaluateOperation(expression: Expression, context: EvalContext): any {
  if (!expression.operator) {
    console.error('Operation expression missing operator');
    return null;
  }

  // Evaluate left operand
  let leftValue: any = null;
  if (expression.leftOperand) {
    if (expression.leftOperand.type === ExpressionType.REFERENCE) {
      leftValue = evaluateReference(expression.leftOperand, context);
    } else if (expression.leftOperand.type === ExpressionType.LITERAL) {
      const value = expression.leftOperand.value;
      if (typeof value === 'string') {
        const match = value.match(/([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)/);
        if (match && match.length >= 3) {
          const refExpr: Expression = {
            type: ExpressionType.REFERENCE,
            value: null,
            references: [{ elementName: match[1], attributeName: match[2] }],
          };
          leftValue = evaluateReference(refExpr, context);
        } else {
          leftValue = value;
        }
      } else {
        leftValue = value;
      }
    } else {
      leftValue = evaluateExpression(expression.leftOperand, context);
    }
  }

  // Evaluate right operand
  let rightValue: any = null;
  if (expression.rightOperand) {
    if (expression.rightOperand.type === ExpressionType.REFERENCE) {
      rightValue = evaluateReference(expression.rightOperand, context);
    } else if (expression.rightOperand.type === ExpressionType.LITERAL) {
      rightValue = expression.rightOperand.value;
    } else {
      rightValue = evaluateExpression(expression.rightOperand, context);
    }
  }

  // Coerce strings to numbers when applicable
  if (typeof leftValue === 'string' && !isNaN(Number(leftValue))) {
    leftValue = Number(leftValue);
  }
  if (typeof rightValue === 'string' && !isNaN(Number(rightValue))) {
    rightValue = Number(rightValue);
  }

  console.log(`Evaluating operation: ${leftValue} ${expression.operator} ${rightValue}`);

  switch (expression.operator) {
    case ExpressionOperator.ADD:
      return leftValue + rightValue;
    case ExpressionOperator.SUBTRACT:
      return leftValue - rightValue;
    case ExpressionOperator.MULTIPLY:
      return leftValue * rightValue;
    case ExpressionOperator.DIVIDE:
      return leftValue / rightValue;
    case ExpressionOperator.INCREMENT:
      return leftValue + 1;
    case ExpressionOperator.DECREMENT:
      return leftValue - 1;
    case ExpressionOperator.EQUALS:
      return leftValue == rightValue;
    case ExpressionOperator.NOT_EQUALS:
      return leftValue != rightValue;
    case ExpressionOperator.GREATER_THAN:
      return leftValue > rightValue;
    case ExpressionOperator.LESS_THAN:
      return leftValue < rightValue;
    case ExpressionOperator.GREATER_EQUALS:
      return leftValue >= rightValue;
    case ExpressionOperator.LESS_EQUALS:
      return leftValue <= rightValue;
    case ExpressionOperator.AND:
      return leftValue && rightValue;
    case ExpressionOperator.OR:
      return leftValue || rightValue;
    case ExpressionOperator.NOT:
      return !leftValue;
    default:
      console.error(`Unsupported operator: ${expression.operator}`);
      return null;
  }
}

function evaluateCompound(expression: Expression, context: EvalContext): any {
  if (!expression.operator || !expression.leftOperand) {
    return null;
  }

  const leftValue = evaluateExpression(expression.leftOperand, context);

  // Short-circuit evaluation
  if (expression.operator === ExpressionOperator.AND) {
    if (!leftValue) return false;
    return expression.rightOperand
      ? evaluateExpression(expression.rightOperand, context)
      : leftValue;
  }

  if (expression.operator === ExpressionOperator.OR) {
    if (leftValue) return true;
    return expression.rightOperand
      ? evaluateExpression(expression.rightOperand, context)
      : leftValue;
  }

  if (expression.operator === ExpressionOperator.NOT) {
    return !leftValue;
  }

  return null;
}
