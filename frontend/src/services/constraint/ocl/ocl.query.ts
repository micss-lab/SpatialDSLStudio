import { OCLServiceContext } from './types';

/**
 * Create a query expression directly with OCL.js
 * Useful for ad-hoc OCL expressions
 */
export function createOCLQuery(context: OCLServiceContext, query: string): any {
  try {
    return context.oclEngine.createQuery(query);
  } catch (error) {
    console.error('Error creating OCL query:', error);
    throw error;
  }
}

/**
 * Evaluate an OCL query expression on a context object
 */
export function evaluateOCLQuery(context: OCLServiceContext, queryContext: any, expression: any): any {
  try {
    return context.oclEngine.evaluateQuery(queryContext, expression);
  } catch (error) {
    console.error('Error evaluating OCL query:', error);
    throw error;
  }
}
