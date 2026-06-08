
import { JSConstraint } from '../models/types';
import { jsService } from '../services/constraint';

/**
 * This file contains example JavaScript constraints that showcase
 * the advanced capabilities of JavaScript constraints compared to OCL
 */

/**
 * Example 1: Complex String Validation
 * 
 * This constraint validates that a field contains a valid email address
 * using a regular expression, which is difficult to express in OCL.
 */
export const createEmailValidationConstraint = (
  metamodelId: string,
  contextClassId: string
): JSConstraint | null => {
  const name = 'Valid Email Format';
  const expression = `
// Check if the email field has a valid format
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/;
if (self.email && !emailRegex.test(self.email)) {
  return false;
}
return true;
`;
  const description = 'Validates that the email field contains a properly formatted email address';
  
  return jsService.createConstraint(
    metamodelId,
    contextClassId,
    name,
    expression,
    description,
    'error'
  );
};

/**
 * Example 2: Complex Collection Manipulation
 * 
 * This constraint checks that a collection meets complex criteria:
 * - There's at least one item with price > 100
 * - The sum of all prices is under a maximum value
 * - No duplicate item names
 */
export const createCollectionConstraint = (
  metamodelId: string,
  contextClassId: string
): JSConstraint | null => {
  const name = 'Complex Collection Validation';
  const expression = `
// Check that we have at least one premium item (price > 100)
if (!self.items.exists(item => item.price > 100)) {
  return false;
}

// Check that the total price is under the maximum budget
const totalPrice = self.items.collect(item => item.price).sum();
if (totalPrice > self.budget) {
  return false;
}

// Check for duplicate names in items
const names = self.items.collect(item => item.name);
const uniqueNames = new Set(names);
if (names.length !== uniqueNames.size) {
  return false;
}

return true;
`;
  const description = 'Performs complex validation on item collections that would be difficult with OCL';
  
  return jsService.createConstraint(
    metamodelId,
    contextClassId,
    name,
    expression,
    description,
    'error'
  );
};

/**
 * Example 3: Date/Time Operations
 * 
 * This constraint validates that:
 * - A date is in the future
 * - The time difference between two dates is within limits
 */
export const createDateConstraint = (
  metamodelId: string,
  contextClassId: string
): JSConstraint | null => {
  const name = 'Date Range Validation';
  const expression = `
// Check that the event date is in the future
const now = new Date();
const eventDate = new Date(self.eventDate);
if (eventDate <= now) {
  return false;
}

// Check that the registration deadline is at least 1 day before the event
// but not more than 30 days before
if (self.registrationDeadline) {
  const deadlineDate = new Date(self.registrationDeadline);
  const oneDay = 24 * 60 * 60 * 1000; // milliseconds in a day
  const daysBeforeEvent = (eventDate.getTime() - deadlineDate.getTime()) / oneDay;
  
  if (daysBeforeEvent < 1 || daysBeforeEvent > 30) {
    return false;
  }
}

return true;
`;
  const description = 'Validates date ranges and time differences between dates';
  
  return jsService.createConstraint(
    metamodelId,
    contextClassId,
    name,
    expression,
    description,
    'warning'
  );
};

/**
 * Example 4: Conditional Logic with Multiple Branches
 * 
 * This constraint implements complex branching logic based on an element's state
 */
export const createConditionalConstraint = (
  metamodelId: string,
  contextClassId: string
): JSConstraint | null => {
  const name = 'State-based Validation';
  const expression = `
// Different validation rules based on the state
switch (self.state) {
  case 'draft':
    // In draft mode, all fields are optional
    return true;
    
  case 'submitted':
    // In submitted state, all required fields must be filled
    if (!self.title || !self.description || !self.author) {
      return false;
    }
    return true;
    
  case 'published':
    // In published state, need complete data and approvals
    if (!self.title || !self.description || !self.author) {
      return false;
    }
    if (self.approvers.size < 2) {
      return false;
    }
    return true;
    
  case 'archived':
    // Archived items can't be modified
    // This would need to check against previous state which
    // isn't possible in a simple constraint
    return true;
    
  default:
    // Unknown state is invalid
    return false;
}
`;
  const description = 'Implements complex state-based validation rules with multiple conditions';
  
  return jsService.createConstraint(
    metamodelId,
    contextClassId,
    name,
    expression,
    description,
    'error'
  );
};

/**
 * Example 5: Utility Function Example
 * 
 * This constraint uses the utility functions available in the sandbox
 */
export const createUtilityConstraint = (
  metamodelId: string,
  contextClassId: string
): JSConstraint | null => {
  const name = 'Utility Functions Example';
  const expression = `
// Check string formatting using utility functions
if (!utils.isString(self.name) || utils.isEmpty(self.name)) {
  return false;
}

// Check number is within range
if (!utils.isNumber(self.value) || self.value < utils.min(0, self.minimum) || self.value > utils.max(100, self.maximum)) {
  return false;
}

// Format message with values
const message = utils.format("Value {0} must be between {1} and {2}", self.value, self.minimum, self.maximum);
console.log(message); // This would show in browser console for debugging

return true;
`;
  const description = 'Demonstrates the use of utility functions available in the JavaScript sandbox';
  
  return jsService.createConstraint(
    metamodelId,
    contextClassId,
    name,
    expression,
    description,
    'info'
  );
};

/**
 * Helper function to run all examples
 */
export const createAllExampleConstraints = (
  metamodelId: string,
  contextClassId: string
): JSConstraint[] => {
  const constraints: (JSConstraint | null)[] = [
    createEmailValidationConstraint(metamodelId, contextClassId),
    createCollectionConstraint(metamodelId, contextClassId),
    createDateConstraint(metamodelId, contextClassId),
    createConditionalConstraint(metamodelId, contextClassId),
    createUtilityConstraint(metamodelId, contextClassId)
  ];
  
  return constraints.filter(c => c !== null) as JSConstraint[];
}; 