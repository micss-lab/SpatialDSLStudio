import {
  Model,
  ModelElement,
  Metamodel
} from '../../../models/types';
import { spatialContextFields, boundsOf, overlaps, clearance } from '../spatial.helpers';

/**
 * Prepare context for JavaScript evaluation
 */
export function prepareContextForJS(
  element: ModelElement,
  model: Model,
  metamodel: Metamodel
): Record<string, any> {
  // Create a clean context
  const context: Record<string, any> = {
    self: {
      ...spatialContextFields(element),
      ...element.style,
      id: element.id,
      type: element.modelElementId
    },
    model: {
      id: model.id,
      name: model.name,
      elements: model.elements.map(e => ({
        id: e.id,
        type: e.modelElementId,
        ...spatialContextFields(e),
        ...e.style
      }))
    },
    metamodel: {
      id: metamodel.id,
      name: metamodel.name
    },
    spatial: {
      boundsOf,
      overlaps,
      clearance
    }
  };

  // Add all directly referenced elements
  if (element.references) {
    Object.entries(element.references).forEach(([refName, refValue]) => {
      if (refValue) {
        if (Array.isArray(refValue)) {
          // For multi-valued references
          context.self[refName] = refValue.map(refId => {
            const refElement = model.elements.find(e => e.id === refId);
            if (refElement) {
              return {
                ...spatialContextFields(refElement),
                ...refElement.style,
                id: refElement.id,
                type: refElement.modelElementId
              };
            }
            return null;
          }).filter(Boolean);
        } else {
          // For single-valued references
          const refElement = model.elements.find(e => e.id === refValue);
          if (refElement) {
            context.self[refName] = {
              ...spatialContextFields(refElement),
              ...refElement.style,
              id: refElement.id,
              type: refElement.modelElementId
            };
          }
        }
      }
    });
  }

  return context;
}

/**
 * Creates a sandbox environment for safely evaluating JavaScript constraints
 */
export function createJSSandbox(
  context: Record<string, any>,
  model: Model
): Record<string, any> {
  // Create a new sandbox with restricted access
  const sandbox: Record<string, any> = {
    ...context,
    // Add utility functions
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    decodeURI,
    decodeURIComponent,
    encodeURI,
    encodeURIComponent,
    Math,
    Date,
    String,
    Number,
    Array,
    Object,
    Boolean,
    RegExp,
    JSON,
    Error,
    // Add model access methods
    findElementById: (id: string) => {
      return model.elements.find(e => e.id === id);
    },
    findElementsByType: (metaClassId: string) => {
      return model.elements.filter(e => e.modelElementId === metaClassId);
    },
    // For debugging
    console: {
      log: (...args: any[]) => console.log('JS Constraint log:', ...args)
    }
  };

  // Log about current element
  console.log('Creating sandbox for element:', context.self);

  // Special handling for common variable names that might be used in constraints
  // Add any model elements with style.name property to the global scope for easier access
  // Also create lowercase version of metaclass name as a reference to self
  if (context.self) {
    // Get the metaclass name for this element (if available)
    const metaClass = context.metamodel ? 
      context.metamodel.classes?.find((c: any) => c.id === context.self.type) : null;
    
    if (metaClass) {
      const className = metaClass.name.toLowerCase();
      console.log(`Adding ${className} as reference to self`);
      
      // Create a variable with the lowercase metaclass name that refers to self
      // For example, if metaclass name is "Cafeteria", create a variable "cafeteria" = self
      sandbox[className] = context.self;
    }
  }

  if (model.elements) {
    console.log('Adding named elements to sandbox:');
    for (const element of model.elements) {
      if (element.style && typeof element.style.name === 'string' && element.style.name.trim()) {
        // Make the element accessible via its name for convenience
        const safeName = element.style.name.trim().replace(/[^a-zA-Z0-9_]/g, '_');
        
        // Only add if it's a valid JavaScript identifier and doesn't conflict with existing properties
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(safeName) && !(safeName in sandbox)) {
          console.log(`  - Adding ${safeName} for element ${element.id}`);
          sandbox[safeName] = element;
        }
      }
    }
  }

  return sandbox;
}

/**
 * Safely evaluate a JavaScript expression in a sandbox
 * Returns true if constraint passes, or an error message string if it fails
 */
export function evaluateInSandbox(expression: string, sandbox: Record<string, any>): boolean | string {
  try {
    // Debug: Log the available variables in the sandbox and the exact constraint expression
    console.log('Evaluating expression:', JSON.stringify(expression));
    console.log('Available vars in sandbox:', Object.keys(sandbox));
    console.log('Self in sandbox:', sandbox.self ? Object.keys(sandbox.self) : 'not defined');
    
    // Show the actual values of attributes that might be referenced in the expression
    if (sandbox.self) {
      const keys = Object.keys(sandbox.self);
      for (const key of keys) {
        if (typeof sandbox.self[key] !== 'object' || sandbox.self[key] === null) {
          console.log(`  - ${key}: ${sandbox.self[key]} (type: ${typeof sandbox.self[key]})`);
        }
      }
    }
    
    // Check if the expression is simple or complex (contains control structures)
    const isSimpleExpression = !expression.includes('return') && 
                              !expression.includes('if') && 
                              !expression.includes('for');
    
    // Create a safer function body
    let functionBody;
    
    if (isSimpleExpression) {
      // For simple expressions, just return the result directly
      functionBody = `
        "use strict";
        try {
          const self = arguments[0];
          console.log('JS constraint evaluating with self:', self ? {id: self.id, type: self.type} : 'undefined');
          return (${expression});
        } catch (err) {
          console.error('Error in constraint simple expression:', err);
          return { valid: false, message: "Runtime error: " + err.message };
        }
      `;
    } else {
      // For complex expressions with if/return statements
      functionBody = `
        "use strict";
        try {
          const self = arguments[0];
          console.log('JS constraint evaluating with self:', self ? {id: self.id, type: self.type} : 'undefined');
          
          // Complex function with explicit return
          ${expression}
          
          // Default return true if no explicit return in complex function
          return true;
        } catch (err) {
          console.error('Error in constraint complex expression:', err);
          return { valid: false, message: "Runtime error: " + err.message };
        }
      `;
    }
    
    console.log('Function body:', functionBody);
    
    try {
      // Create a function using the sandbox as context
      // eslint-disable-next-line no-new-func
      const constraintFunction = new Function(...Object.keys(sandbox), functionBody);
      
      // Call the function with the sandbox variables
      const result = constraintFunction(...Object.values(sandbox));
      
      // Handle various return value formats
      if (result === true || result === undefined) {
        return true;
      } else if (result === false) {
        return "Constraint failed";
      } else if (typeof result === 'object' && result !== null) {
        if ('valid' in result) {
          if (result.valid === true) {
            return true;
          } else {
            return result.message || "Constraint failed";
          }
        }
      }
      
      return "Constraint returned an invalid result: " + String(result);
    } catch (fnError) {
      console.error('Error creating or running constraint function:', fnError);
      return `Runtime error: ${fnError instanceof Error ? fnError.message : String(fnError)}`;
    }
  } catch (error) {
    console.error('Error in evaluateInSandbox outer block:', error);
    return `Runtime error: ${error instanceof Error ? error.message : String(error)}`;
  }
}
