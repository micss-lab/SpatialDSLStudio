/**
 * Helper utilities for JS constraint service
 */

/**
 * Format JavaScript error messages to be more user-friendly
 */
export function formatJSError(message: string): string {
  // Clean up common syntax error messages
  if (message.includes('Unexpected token')) {
    return `Syntax error: ${message}`;
  }
  if (message.includes('Unexpected end of input')) {
    return 'Syntax error: Unexpected end of expression. Check for missing closing brackets, parentheses, or quotes.';
  }
  return message;
}

/**
 * Add convenience methods for collections
 * This adds OCL-like operations to JavaScript arrays
 */
export function addCollectionMethods(arr: any[]): void {
  // Add methods that are similar to OCL collection operations
  Object.defineProperties(arr, {
    size: {
      get: function() { return this.length; }
    },
    isEmpty: {
      get: function() { return this.length === 0; }
    },
    notEmpty: {
      get: function() { return this.length > 0; }
    },
    includes: {
      value: function(item: any) { return this.includes(item); }
    },
    excludes: {
      value: function(item: any) { return !this.includes(item); }
    },
    includesAll: {
      value: function(items: any[]) { 
        return items.every((item: any) => this.includes(item)); 
      }
    },
    excludesAll: {
      value: function(items: any[]) { 
        return items.every((item: any) => !this.includes(item)); 
      }
    },
    count: {
      value: function(predicate: (item: any) => boolean) { 
        return this.filter(predicate).length; 
      }
    },
    exists: {
      value: function(predicate: (item: any) => boolean) { 
        return this.some(predicate); 
      }
    },
    forAll: {
      value: function(predicate: (item: any) => boolean) { 
        return this.every(predicate); 
      }
    },
    select: {
      value: function(predicate: (item: any) => boolean) { 
        return this.filter(predicate); 
      }
    },
    reject: {
      value: function(predicate: (item: any) => boolean) { 
        return this.filter((item: any) => !predicate(item)); 
      }
    },
    collect: {
      value: function(mapper: (item: any) => any) { 
        return this.map(mapper); 
      }
    },
    sum: {
      value: function() { 
        return this.reduce((a: number, b: number) => a + b, 0); 
      }
    },
    any: {
      value: function(predicate: (item: any) => boolean) { 
        return this.find(predicate); 
      }
    },
    one: {
      value: function(predicate: (item: any) => boolean) { 
        return this.filter(predicate).length === 1; 
      }
    }
  });
}
