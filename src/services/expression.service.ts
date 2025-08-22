import { 
  Expression, 
  ExpressionType, 
  ExpressionOperator,
  ElementReference,
  PatternElement,
  PatternMatch
} from '../models/types';

class ExpressionService {
  
  /**
   * Parse a string into an Expression object
   * @param input The expression string to parse
   * @param context Additional context information for parsing
   * @returns Parsed Expression object or null if parsing fails
   */
  parseExpression(input: string, context?: { 
    availableElements?: PatternElement[] 
  }): Expression | null {
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
          references: [{ elementName, attributeName }]
        };
      }
      
      // Check for "element.attribute increment/decrement X"
      const opPattern = new RegExp(`^${elementName}\\.${attributeName}\\s+(increment|decrement|multiply|divide|add|subtract)\\s+(.+)$`);
      const opMatch = input.match(opPattern);
      
      if (opMatch) {
        const operation = opMatch[1].toLowerCase();
        const rightSide = opMatch[2].trim();
        
        // Create a reference for the left side
        const leftOperand: Expression = {
          type: ExpressionType.REFERENCE,
          value: null,
          references: [{ elementName, attributeName }]
        };
        
        // Parse the right side
        const rightOperand = this.parseExpression(rightSide, context);
        
        // Determine the operator
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
            operator = ExpressionOperator.ADD; // Default
        }
        
        return this.createOperationWithOperands(operator, leftOperand, rightOperand);
      }
    }
    
    // Check if the input is a reference with curly braces {elementName.attributeName}
    if (input.match(/\{[^{}]+\}/)) {
      return this.parseReferenceExpression(input, context?.availableElements || []);
    }
    
    // Check for nested expressions with parentheses
    if (input.includes('(') && input.includes(')')) {
      return this.parseNestedExpression(input, context);
    }
    
    // Check for mathematical expressions
    if (input.match(/\s*(increment|decrement|multiply|add|subtract|divide)\s+/i)) {
      return this.parseMathExpression(input, context);
    }

    // Check for comparison expressions
    if (input.match(/\s*(equals|greater than|less than|greater than or equals|less than or equals|not equals)\s+/i)) {
      return this.parseComparisonExpression(input, context);
    }
    
    // Check for logical expressions with AND/OR
    if (input.match(/\s+(AND|OR)\s+/i)) {
      return this.parseLogicalExpression(input, context);
    }
    
    // If it's a simple value, return as literal
    return {
      type: ExpressionType.LITERAL,
      value: input
    };
  }
  
  /**
   * Parse an expression referencing another element's attribute
   * Format: {elementName.attributeName}
   */
  private parseReferenceExpression(input: string, availableElements: PatternElement[]): Expression | null {
    // Extract the content inside curly braces
    const matches = input.match(/\{([^{}]+)\}/g);
    if (!matches) return null;
    
    // If there are multiple references, we need to handle it as an operation
    if (matches.length > 1) {
      // This is a more complex expression with multiple references
      // We need to replace each reference with a placeholder and parse the whole expression
      let processedInput = input;
      const references: ElementReference[] = [];
      
      matches.forEach((match, index) => {
        const refContent = match.slice(1, -1); // Remove the { }
        const [elementName, attributeName] = refContent.split('.');
        
        if (elementName && attributeName) {
          references.push({ elementName, attributeName });
          processedInput = processedInput.replace(match, `__REF${index}__`);
        }
      });
      
      // Determine the operation type based on the content
      if (processedInput.includes('increment')) {
        return this.createOperationExpression(ExpressionOperator.ADD, references[0], 1, references);
      } else if (processedInput.includes('decrement')) {
        return this.createOperationExpression(ExpressionOperator.SUBTRACT, references[0], 1, references);
      } else if (processedInput.includes('multiply')) {
        const parts = processedInput.split('multiply');
        const rightValue = parseFloat(parts[1].trim().replace('__REF', ''));
        return this.createOperationExpression(ExpressionOperator.MULTIPLY, references[0], rightValue || 1, references);
      }
      
      // Default to a reference expression if we can't determine the operation
      return {
        type: ExpressionType.REFERENCE,
        value: null,
        references
      };
    }
    
    // Simple reference with a single {element.attribute}
    const refContent = matches[0].slice(1, -1); // Remove the { }
    const [elementName, attributeName] = refContent.split('.');
    
    if (!elementName || !attributeName) {
      console.error('Invalid reference format. Must be {elementName.attributeName}');
      return null;
    }
    
    // Validate that the referenced element exists in available elements
    if (availableElements.length > 0) {
      const referencedElement = availableElements.find(e => e.name === elementName);
      if (!referencedElement) {
        console.warn(`Referenced element "${elementName}" not found in available elements`);
      }
    }
    
    return {
      type: ExpressionType.REFERENCE,
      value: null,
      references: [{ elementName, attributeName }]
    };
  }
  
  /**
   * Parse a nested expression with parentheses
   */
  private parseNestedExpression(input: string, context?: { availableElements?: PatternElement[] }): Expression | null {
    // Find the innermost parentheses using a regex with non-greedy matching
    const matches = input.match(/\(([^()]*)\)/);
    if (!matches) return null;
    
    const innerExpression = matches[1];
    const parsedInner = this.parseExpression(innerExpression, context);
    
    if (!parsedInner) return null;
    
    // Mark as nested
    parsedInner.isNested = true;
    
    // If the entire input is just the parenthesized expression, return it
    if (input === `(${innerExpression})`) {
      return parsedInner;
    }
    
    // Otherwise, replace the parenthesized part with a placeholder and parse the rest
    const updatedInput = input.replace(`(${innerExpression})`, '__NESTED__');
    const outerExpression = this.parseExpression(updatedInput, context);
    
    if (!outerExpression) return parsedInner;
    
    // Merge the nested expression into the outer expression
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
   * Parse a mathematical expression (increment, decrement, multiply, etc.)
   */
  private parseMathExpression(input: string, context?: { availableElements?: PatternElement[] }): Expression | null {
    // Check for increment/decrement syntax
    const incMatch = input.match(/(.+)\s+increment\s+(.+)/i);
    if (incMatch) {
      const left = this.parseExpression(incMatch[1].trim(), context);
      const right = this.parseExpression(incMatch[2].trim(), context);
      return this.createOperationWithOperands(ExpressionOperator.ADD, left, right);
    }
    
    const decMatch = input.match(/(.+)\s+decrement\s+(.+)/i);
    if (decMatch) {
      const left = this.parseExpression(decMatch[1].trim(), context);
      const right = this.parseExpression(decMatch[2].trim(), context);
      return this.createOperationWithOperands(ExpressionOperator.SUBTRACT, left, right);
    }
    
    const mulMatch = input.match(/(.+)\s+multiply\s+(.+)/i);
    if (mulMatch) {
      const left = this.parseExpression(mulMatch[1].trim(), context);
      const right = this.parseExpression(mulMatch[2].trim(), context);
      return this.createOperationWithOperands(ExpressionOperator.MULTIPLY, left, right);
    }
    
    const divMatch = input.match(/(.+)\s+divide\s+(.+)/i);
    if (divMatch) {
      const left = this.parseExpression(divMatch[1].trim(), context);
      const right = this.parseExpression(divMatch[2].trim(), context);
      return this.createOperationWithOperands(ExpressionOperator.DIVIDE, left, right);
    }
    
    return null;
  }
  
  /**
   * Parse a comparison expression (equals, greater than, etc.)
   */
  private parseComparisonExpression(input: string, context?: { availableElements?: PatternElement[] }): Expression | null {
    const eqMatch = input.match(/(.+)\s+equals\s+(.+)/i);
    if (eqMatch) {
      const left = this.parseExpression(eqMatch[1].trim(), context);
      const right = this.parseExpression(eqMatch[2].trim(), context);
      return this.createOperationWithOperands(ExpressionOperator.EQUALS, left, right);
    }
    
    const neqMatch = input.match(/(.+)\s+not\s+equals\s+(.+)/i);
    if (neqMatch) {
      const left = this.parseExpression(neqMatch[1].trim(), context);
      const right = this.parseExpression(neqMatch[2].trim(), context);
      return this.createOperationWithOperands(ExpressionOperator.NOT_EQUALS, left, right);
    }
    
    const gtMatch = input.match(/(.+)\s+greater\s+than\s+(.+)/i);
    if (gtMatch) {
      const left = this.parseExpression(gtMatch[1].trim(), context);
      const right = this.parseExpression(gtMatch[2].trim(), context);
      return this.createOperationWithOperands(ExpressionOperator.GREATER_THAN, left, right);
    }
    
    const ltMatch = input.match(/(.+)\s+less\s+than\s+(.+)/i);
    if (ltMatch) {
      const left = this.parseExpression(ltMatch[1].trim(), context);
      const right = this.parseExpression(ltMatch[2].trim(), context);
      return this.createOperationWithOperands(ExpressionOperator.LESS_THAN, left, right);
    }
    
    const gteMatch = input.match(/(.+)\s+greater\s+than\s+or\s+equals\s+(.+)/i);
    if (gteMatch) {
      const left = this.parseExpression(gteMatch[1].trim(), context);
      const right = this.parseExpression(gteMatch[2].trim(), context);
      return this.createOperationWithOperands(ExpressionOperator.GREATER_EQUALS, left, right);
    }
    
    const lteMatch = input.match(/(.+)\s+less\s+than\s+or\s+equals\s+(.+)/i);
    if (lteMatch) {
      const left = this.parseExpression(lteMatch[1].trim(), context);
      const right = this.parseExpression(lteMatch[2].trim(), context);
      return this.createOperationWithOperands(ExpressionOperator.LESS_EQUALS, left, right);
    }
    
    return null;
  }
  
  /**
   * Parse a logical expression with AND/OR
   */
  private parseLogicalExpression(input: string, context?: { availableElements?: PatternElement[] }): Expression | null {
    const andMatch = input.match(/(.+)\s+AND\s+(.+)/i);
    if (andMatch) {
      const left = this.parseExpression(andMatch[1].trim(), context);
      const right = this.parseExpression(andMatch[2].trim(), context);
      return {
        type: ExpressionType.COMPOUND,
        value: null,
        operator: ExpressionOperator.AND,
        leftOperand: left || undefined,
        rightOperand: right || undefined
      };
    }
    
    const orMatch = input.match(/(.+)\s+OR\s+(.+)/i);
    if (orMatch) {
      const left = this.parseExpression(orMatch[1].trim(), context);
      const right = this.parseExpression(orMatch[2].trim(), context);
      return {
        type: ExpressionType.COMPOUND,
        value: null,
        operator: ExpressionOperator.OR,
        leftOperand: left || undefined,
        rightOperand: right || undefined
      };
    }
    
    return null;
  }
  
  /**
   * Create an operation expression with reference and right value
   */
  private createOperationExpression(
    operator: ExpressionOperator, 
    leftRef: ElementReference,
    rightValue: any,
    references?: ElementReference[]
  ): Expression {
    const leftOperand: Expression = {
      type: ExpressionType.REFERENCE,
      value: null,
      references: [leftRef]
    };
    
    const rightOperand: Expression = {
      type: ExpressionType.LITERAL,
      value: rightValue
    };
    
    return {
      type: ExpressionType.OPERATION,
      value: null,
      operator,
      leftOperand,
      rightOperand,
      references
    };
  }
  
  /**
   * Create an operation expression with left and right operands
   */
  private createOperationWithOperands(
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
        ...(rightOperand?.references || [])
      ]
    };
  }
  
  /**
   * Convert an expression to a readable string format for display
   */
  expressionToString(expression: Expression): string {
    if (!expression) return '';
    
    switch (expression.type) {
      case ExpressionType.LITERAL:
        return String(expression.value);
        
      case ExpressionType.REFERENCE:
        if (expression.references && expression.references.length > 0) {
          return expression.references.map(ref => 
            `{${ref.elementName}.${ref.attributeName}}`
          ).join(', ');
        }
        return 'Invalid Reference';
        
      case ExpressionType.OPERATION:
        const left = expression.leftOperand ? this.expressionToString(expression.leftOperand) : '';
        const right = expression.rightOperand ? this.expressionToString(expression.rightOperand) : '';
        
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
        
      case ExpressionType.COMPOUND:
        const leftExpr = expression.leftOperand ? this.expressionToString(expression.leftOperand) : '';
        const rightExpr = expression.rightOperand ? this.expressionToString(expression.rightOperand) : '';
        
        if (expression.operator === ExpressionOperator.AND) {
          return `${leftExpr} AND ${rightExpr}`;
        } else if (expression.operator === ExpressionOperator.OR) {
          return `${leftExpr} OR ${rightExpr}`;
        }
        return `${leftExpr} ${expression.operator} ${rightExpr}`;
        
      default:
        return String(expression.value || '');
    }
  }
  
  /**
   * Evaluate an expression in the context of a pattern match
   * @param expression The expression to evaluate
   * @param patternMatch The pattern match context (for resolving references)
   * @param model The model containing the elements
   * @param pattern The pattern containing the elements
   * @returns The evaluated result of the expression
   */
  evaluateExpression(
    expression: Expression | string, 
    context: {
      patternMatch?: PatternMatch,
      patternElements?: Record<string, any>, 
      modelElements?: Record<string, any>,
      allPatternElements?: any[],
      allModelElements?: any[]
    }
  ): any {
    // If expression is a string, parse it first
    if (typeof expression === 'string') {
      expression = this.parseExpression(expression, {
        availableElements: context.allPatternElements || []
      }) || { type: ExpressionType.LITERAL, value: expression };
    }
    
    // Handle null case
    if (!expression) {
      return null;
    }
    
    switch (expression.type) {
      case ExpressionType.LITERAL:
        return expression.value;
        
      case ExpressionType.REFERENCE:
        return this.evaluateReference(expression, context);
        
      case ExpressionType.OPERATION:
        return this.evaluateOperation(expression, context);
        
      case ExpressionType.COMPOUND:
        return this.evaluateCompound(expression, context);
        
      default:
        return null;
    }
  }
  
  /**
   * Evaluate a reference expression
   */
  private evaluateReference(
    expression: Expression,
    context: {
      patternMatch?: PatternMatch,
      patternElements?: Record<string, any>,
      modelElements?: Record<string, any>,
      allPatternElements?: any[],
      allModelElements?: any[]
    }
  ): any {
    if (!expression.references || expression.references.length === 0) {
      return null;
    }
    
    const reference = expression.references[0];
    const { elementName, attributeName } = reference;
    
    console.log(`[ExpressionService] Evaluating reference: ${elementName}.${attributeName}`);
    
    // Create name-to-id mapping for pattern elements if we have pattern elements
    const patternElementNameToId: Record<string, string> = {};
    if (context.patternElements) {
      // Build a mapping from element name to element ID
      Object.entries(context.patternElements).forEach(([id, element]) => {
        if (element && element.name) {
          patternElementNameToId[element.name] = id;
        }
      });
      
      console.log(`[ExpressionService] Pattern element name mapping:`, patternElementNameToId);
    }
    
    // First try to find the pattern element by name
    let patternElementId = patternElementNameToId[elementName];
    if (patternElementId && context.patternElements && context.patternElements[patternElementId]) {
      console.log(`[ExpressionService] Found pattern element by name: ${elementName} -> ${patternElementId}`);
      const patternElement = context.patternElements[patternElementId];
      
      // Look for the attribute in the pattern element
      if (patternElement.attributes && 
          (patternElement.attributes[attributeName] !== undefined || 
           patternElement.attributes[`attr-${attributeName}`] !== undefined)) {
        const value = patternElement.attributes[attributeName] || 
                      patternElement.attributes[`attr-${attributeName}`];
        console.log(`[ExpressionService] Found attribute value in pattern element: ${value}`);
        return value;
      }
    }
    
    // If we have a pattern match and model elements, try to find the value there
    if (context.patternMatch && context.modelElements) {
      // First try to resolve using the element name mapping
      if (patternElementId) {
        const modelElementId = context.patternMatch.matches[patternElementId];
        if (modelElementId && context.modelElements[patternElementId]) {
          console.log(`[ExpressionService] Found model element via pattern mapping: ${patternElementId} -> ${modelElementId}`);
          const modelElement = context.modelElements[patternElementId];
          
          // In model elements, attributes are often stored in a style property
          if (modelElement.style && 
              (modelElement.style[attributeName] !== undefined || 
               modelElement.style[`attr-${attributeName}`] !== undefined)) {
            const value = modelElement.style[attributeName] || 
                          modelElement.style[`attr-${attributeName}`];
            console.log(`[ExpressionService] Found attribute value in model element style: ${value}`);
            return value;
          }
          
          // Also check direct attributes on the model element
          if (modelElement[attributeName] !== undefined) {
            console.log(`[ExpressionService] Found attribute value directly on model element: ${modelElement[attributeName]}`);
            return modelElement[attributeName];
          }
        }
      }
      
      // If that didn't work, try looking through all model elements 
      // to find one that matches by name in its attributes
      for (const [elemId, modelElement] of Object.entries(context.modelElements)) {
        if (modelElement.style && modelElement.style.name === elementName) {
          console.log(`[ExpressionService] Found model element by style.name: ${elementName} -> ${elemId}`);
          
          if (modelElement.style[attributeName] !== undefined) {
            console.log(`[ExpressionService] Found attribute value in model element: ${modelElement.style[attributeName]}`);
            return modelElement.style[attributeName];
          }
        }
        // Also check the model element's 'attributes' property if it exists
        if ((modelElement as any).attributes && (modelElement as any).attributes.name === elementName) {
          console.log(`[ExpressionService] Found model element by attributes.name: ${elementName} -> ${elemId}`);
          
          if ((modelElement as any).attributes[attributeName] !== undefined) {
            console.log(`[ExpressionService] Found attribute value in model element attributes: ${(modelElement as any).attributes[attributeName]}`);
            return (modelElement as any).attributes[attributeName];
          }
        }
      }
      
      // If element name looks like a pattern element ID, try using it directly
      if (elementName.includes('-') && context.patternMatch.matches[elementName]) {
        const modelElementId = context.patternMatch.matches[elementName];
        if (modelElementId && context.modelElements[elementName]) {
          console.log(`[ExpressionService] Found model element via direct ID match: ${elementName} -> ${modelElementId}`);
          const modelElement = context.modelElements[elementName];
          
          if (modelElement.style && modelElement.style[attributeName] !== undefined) {
            console.log(`[ExpressionService] Found attribute value in model element style: ${modelElement.style[attributeName]}`);
            return modelElement.style[attributeName];
          }
          
          if (modelElement[attributeName] !== undefined) {
            console.log(`[ExpressionService] Found attribute value directly on model element: ${modelElement[attributeName]}`);
            return modelElement[attributeName];
          }
        }
      }
    }
    
    // If we have all pattern elements, search through them
    if (context.allPatternElements && context.allPatternElements.length > 0) {
      const element = context.allPatternElements.find(e => e.name === elementName);
      if (element && element.attributes) {
        console.log(`[ExpressionService] Found element in allPatternElements: ${elementName}`);
        const value = element.attributes[attributeName] || 
                     element.attributes[`attr-${attributeName}`];
        if (value !== undefined) {
          console.log(`[ExpressionService] Found attribute value in allPatternElements: ${value}`);
          return value;
        }
      }
    }
    
    // If we have all model elements, search through them by name
    if (context.allModelElements && context.allModelElements.length > 0) {
      const element = context.allModelElements.find(e => 
        e.name === elementName || 
        (e.style && e.style.name === elementName) ||
        ((e as any).attributes && (e as any).attributes.name === elementName)
      );
      
      if (element) {
        console.log(`[ExpressionService] Found element in allModelElements: ${elementName}`);
        
        if (element.style && 
            (element.style[attributeName] !== undefined || 
             element.style[`attr-${attributeName}`] !== undefined)) {
          const value = element.style[attributeName] || 
                       element.style[`attr-${attributeName}`];
          console.log(`[ExpressionService] Found attribute value in element style: ${value}`);
          return value;
        }
        
        if ((element as any).attributes && 
            ((element as any).attributes[attributeName] !== undefined || 
             (element as any).attributes[`attr-${attributeName}`] !== undefined)) {
          const value = (element as any).attributes[attributeName] || 
                       (element as any).attributes[`attr-${attributeName}`];
          console.log(`[ExpressionService] Found attribute value in element attributes: ${value}`);
          return value;
        }
        
        if (element[attributeName] !== undefined) {
          console.log(`[ExpressionService] Found attribute value directly on element: ${element[attributeName]}`);
          return element[attributeName];
        }
      }
    }
    
    console.warn(`Could not resolve reference to ${elementName}.${attributeName}`);
    return null;
  }
  
  /**
   * Evaluate an operation expression
   */
  private evaluateOperation(
    expression: Expression,
    context: any
  ): any {
    if (!expression.operator) {
      console.error('Operation expression missing operator');
      return null;
    }
    
    // Evaluate the left operand
    let leftValue: any = null;
    if (expression.leftOperand) {
      if (expression.leftOperand.type === ExpressionType.REFERENCE) {
        leftValue = this.evaluateReference(expression.leftOperand, context);
      } else if (expression.leftOperand.type === ExpressionType.LITERAL) {
        // Check if the literal is actually a reference in string form like "element.attribute"
        const value = expression.leftOperand.value;
        if (typeof value === 'string') {
          const match = value.match(/([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)/);
          if (match && match.length >= 3) {
            const elementName = match[1];
            const attributeName = match[2];
            
            // Create a reference expression and evaluate it
            const refExpr: Expression = {
              type: ExpressionType.REFERENCE,
              value: null,
              references: [{ elementName, attributeName }]
            };
            
            leftValue = this.evaluateReference(refExpr, context);
          } else {
            leftValue = value;
          }
        } else {
          leftValue = value;
        }
      } else {
        leftValue = this.evaluateExpression(expression.leftOperand, context);
      }
    }
    
    // Evaluate the right operand
    let rightValue: any = null;
    if (expression.rightOperand) {
      if (expression.rightOperand.type === ExpressionType.REFERENCE) {
        rightValue = this.evaluateReference(expression.rightOperand, context);
      } else if (expression.rightOperand.type === ExpressionType.LITERAL) {
        rightValue = expression.rightOperand.value;
      } else {
        rightValue = this.evaluateExpression(expression.rightOperand, context);
      }
    }
    
    // Convert values to appropriate types if needed
    if (typeof leftValue === 'string' && !isNaN(Number(leftValue))) {
      leftValue = Number(leftValue);
    }
    
    if (typeof rightValue === 'string' && !isNaN(Number(rightValue))) {
      rightValue = Number(rightValue);
    }
    
    console.log(`Evaluating operation: ${leftValue} ${expression.operator} ${rightValue}`);
    
    // Perform the operation
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
  
  /**
   * Evaluate a compound expression (AND/OR)
   */
  private evaluateCompound(
    expression: Expression,
    context: any
  ): any {
    if (!expression.operator || !expression.leftOperand) {
      return null;
    }
    
    const leftValue = this.evaluateExpression(expression.leftOperand, context);
    
    // Short-circuit evaluation for AND/OR
    if (expression.operator === ExpressionOperator.AND) {
      if (!leftValue) return false;
      return expression.rightOperand ? this.evaluateExpression(expression.rightOperand, context) : leftValue;
    }
    
    if (expression.operator === ExpressionOperator.OR) {
      if (leftValue) return true;
      return expression.rightOperand ? this.evaluateExpression(expression.rightOperand, context) : leftValue;
    }
    
    // Handle NOT operation
    if (expression.operator === ExpressionOperator.NOT) {
      return !leftValue;
    }
    
    return null;
  }
}

export const expressionService = new ExpressionService(); 