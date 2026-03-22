import {
  Expression,
  ExpressionType,
  ExpressionOperator,
  ElementReference,
} from '../../../models/types';

/**
 * Create an operation expression with a reference on the left and a scalar on the right.
 */
export function createOperationExpression(
  operator: ExpressionOperator,
  leftRef: ElementReference,
  rightValue: any,
  references?: ElementReference[]
): Expression {
  const leftOperand: Expression = {
    type: ExpressionType.REFERENCE,
    value: null,
    references: [leftRef],
  };

  const rightOperand: Expression = {
    type: ExpressionType.LITERAL,
    value: rightValue,
  };

  return {
    type: ExpressionType.OPERATION,
    value: null,
    operator,
    leftOperand,
    rightOperand,
    references,
  };
}

/**
 * Create an operation expression with explicit left and right operands.
 */
export function createOperationWithOperands(
  operator: ExpressionOperator,
  leftOperand: Expression | null,
  rightOperand: Expression | null
): Expression {
  return {
    type: ExpressionType.OPERATION,
    value: null,
    operator,
    leftOperand: leftOperand || undefined,
    rightOperand: rightOperand || undefined,
    references: [
      ...(leftOperand?.references || []),
      ...(rightOperand?.references || []),
    ],
  };
}

/**
 * Convert an expression to a readable string format for display.
 */
export function expressionToString(expression: Expression): string {
  if (!expression) return '';

  switch (expression.type) {
    case ExpressionType.LITERAL:
      return String(expression.value);

    case ExpressionType.REFERENCE:
      if (expression.references && expression.references.length > 0) {
        return expression.references
          .map(ref => `{${ref.elementName}.${ref.attributeName}}`)
          .join(', ');
      }
      return 'Invalid Reference';

    case ExpressionType.OPERATION: {
      const left = expression.leftOperand ? expressionToString(expression.leftOperand) : '';
      const right = expression.rightOperand ? expressionToString(expression.rightOperand) : '';

      switch (expression.operator) {
        case ExpressionOperator.ADD:
          return `${left} increment ${right}`;
        case ExpressionOperator.SUBTRACT:
          return `${left} decrement ${right}`;
        case ExpressionOperator.MULTIPLY:
          return `${left} multiply ${right}`;
        case ExpressionOperator.DIVIDE:
          return `${left} divide ${right}`;
        case ExpressionOperator.EQUALS:
          return `${left} equals ${right}`;
        case ExpressionOperator.NOT_EQUALS:
          return `${left} not equals ${right}`;
        case ExpressionOperator.GREATER_THAN:
          return `${left} greater than ${right}`;
        case ExpressionOperator.LESS_THAN:
          return `${left} less than ${right}`;
        case ExpressionOperator.GREATER_EQUALS:
          return `${left} greater than or equals ${right}`;
        case ExpressionOperator.LESS_EQUALS:
          return `${left} less than or equals ${right}`;
        default:
          return `${left} ${expression.operator} ${right}`;
      }
    }

    case ExpressionType.COMPOUND: {
      const leftExpr = expression.leftOperand ? expressionToString(expression.leftOperand) : '';
      const rightExpr = expression.rightOperand ? expressionToString(expression.rightOperand) : '';

      if (expression.operator === ExpressionOperator.AND) {
        return `${leftExpr} AND ${rightExpr}`;
      } else if (expression.operator === ExpressionOperator.OR) {
        return `${leftExpr} OR ${rightExpr}`;
      }
      return `${leftExpr} ${expression.operator} ${rightExpr}`;
    }

    default:
      return String(expression.value || '');
  }
}
