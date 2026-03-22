import { parseExpression as _parseExpression } from './expression/expression.parser';
import { evaluateExpression as _evaluateExpression } from './expression/expression.evaluator';
import { expressionToString as _expressionToString } from './expression/expression.helpers';

class ExpressionService {
  parseExpression = _parseExpression;
  expressionToString = _expressionToString;
  evaluateExpression = _evaluateExpression;
}

export const expressionService = new ExpressionService();
