import { v4 as uuidv4 } from 'uuid';
import {
  Metamodel,
  MetaClass,
  MetaAttribute,
  MetaReference,
  Model,
  Constraint
} from '../../models/types';
import { TestCase, TestGenerationOptions } from './testing-types';

/**
 * Generate test cases using rule-based heuristics.
 */
export function generateTestCasesWithRules(
  metamodel: Metamodel,
  _model: Model,
  options: TestGenerationOptions
): TestCase[] {
  return generateTestCasesFromMetamodel(metamodel, options);
}

/**
 * Fallback test case generation when AI generation fails.
 */
export function generateFallbackTestCases(
  metamodel: Metamodel,
  options: TestGenerationOptions
): TestCase[] {
  console.log('Falling back to rule-based test generation');
  return generateTestCasesFromMetamodel(metamodel, options);
}

// ── shared core ──────────────────────────────────────────────────────────

function generateTestCasesFromMetamodel(
  metamodel: Metamodel,
  options: TestGenerationOptions
): TestCase[] {
  const testCases: TestCase[] = [];

  metamodel.classes.forEach(cls => {
    // Generate attribute tests
    if (options.includeAttributeTests) {
      cls.attributes.forEach(attr => {
        const attributeTests = generateAttributeTests(cls, attr, options.testCasesPerAttribute);
        testCases.push(...attributeTests);
      });
    }

    // Generate reference tests
    if (options.includeReferenceTests) {
      cls.references.forEach(ref => {
        const referenceTests = generateReferenceTests(cls, ref, metamodel, options.testCasesPerReference);
        testCases.push(...referenceTests);
      });
    }

    // Generate constraint tests
    if (options.includeConstraintTests && cls.constraints && cls.constraints.length > 0) {
      cls.constraints.forEach(constraint => {
        const constraintTests = generateConstraintTests(cls, constraint, options.testCasesPerConstraint);
        testCases.push(...constraintTests);
      });
    }
  });

  return testCases;
}

// ── attribute tests ──────────────────────────────────────────────────────

function generateAttributeTests(
  cls: MetaClass,
  attr: MetaAttribute,
  count: number
): TestCase[] {
  const testCases: TestCase[] = [];
  const testCase: TestCase = {
    id: uuidv4(),
    name: `${cls.name}.${attr.name} Validation Test`,
    description: `Tests that the ${attr.name} attribute of ${cls.name} meets validation requirements`,
    type: 'attribute',
    targetMetaClassId: cls.id,
    targetMetaClassName: cls.name,
    targetProperty: attr.name,
    testValues: [],
    status: 'pending'
  };

  // Generate test values based on attribute type
  switch (attr.type) {
    case 'string':
      testCase.testValues = [
        {
          id: uuidv4(),
          value: 'Valid string value',
          expected: true,
          description: 'A valid string that meets the requirements'
        },
        {
          id: uuidv4(),
          value: '',
          expected: attr.required ? false : true,
          description: attr.required ? 'An empty string, which violates the required constraint' : 'An empty string, which is allowed'
        }
      ];
      break;

    case 'number':
      testCase.testValues = [
        {
          id: uuidv4(),
          value: 42,
          expected: true,
          description: 'A positive number (valid)'
        },
        {
          id: uuidv4(),
          value: -1,
          expected: true, // Default rule, might be invalid for some constraints
          description: 'A negative number (usually valid)'
        },
        {
          id: uuidv4(),
          value: 'not a number',
          expected: false,
          description: 'An invalid value that is not a number'
        }
      ];
      break;

    case 'boolean':
      testCase.testValues = [
        {
          id: uuidv4(),
          value: true,
          expected: true,
          description: 'Boolean value: true'
        },
        {
          id: uuidv4(),
          value: false,
          expected: true,
          description: 'Boolean value: false'
        }
      ];
      break;

    case 'date':
      testCase.testValues = [
        {
          id: uuidv4(),
          value: new Date().toISOString(),
          expected: true,
          description: 'Valid date in ISO format'
        },
        {
          id: uuidv4(),
          value: 'invalid-date',
          expected: false,
          description: 'Invalid date format'
        }
      ];
      break;
  }

  testCases.push(testCase);
  return testCases;
}

// ── reference tests ──────────────────────────────────────────────────────

function generateReferenceTests(
  cls: MetaClass,
  ref: MetaReference,
  metamodel: Metamodel,
  count: number
): TestCase[] {
  const testCases: TestCase[] = [];
  const targetClass = metamodel.classes.find(c => c.id === ref.target);
  if (!targetClass) return testCases;

  const testCase: TestCase = {
    id: uuidv4(),
    name: `${cls.name}.${ref.name} Reference Test`,
    description: `Tests that the ${ref.name} reference of ${cls.name} to ${targetClass.name} meets cardinality requirements [${ref.cardinality.lowerBound}..${ref.cardinality.upperBound}]`,
    type: 'reference',
    targetMetaClassId: cls.id,
    targetMetaClassName: cls.name,
    targetProperty: ref.name,
    testValues: [],
    status: 'pending'
  };

  // Add tests for cardinality
  if (ref.cardinality.lowerBound > 0) {
    testCase.testValues.push({
      id: uuidv4(),
      value: null,
      expected: false,
      description: `Empty reference (violates min cardinality ${ref.cardinality.lowerBound})`
    });
  } else {
    testCase.testValues.push({
      id: uuidv4(),
      value: null,
      expected: true,
      description: 'Empty reference (allowed by cardinality)'
    });
  }

  // Test for valid reference
  testCase.testValues.push({
    id: uuidv4(),
    value: { 
      id: `valid-${targetClass.name.toLowerCase()}-id`,
      type: targetClass.name,
      description: `A valid ${targetClass.name} reference`
    },
    expected: true,
    description: "A valid reference to a MedicalRecord object"
  });

  // Test for invalid target type - find a metaclass that's not the target
  const invalidClass = metamodel.classes.find(c => 
    c.id !== targetClass.id && !c.superTypes.includes(targetClass.id)
  );

  if (invalidClass) {
    testCase.testValues.push({
      id: uuidv4(),
      value: { 
        id: `invalid-${invalidClass.name.toLowerCase()}-id`,
        type: invalidClass.name,
        description: `Invalid target type (${invalidClass.name} instead of ${targetClass.name})`
      },
      expected: false,
      description: "An invalid reference to an object of the wrong type"
    });
  } else {
    // Fallback if no other metaclass is available
    testCase.testValues.push({
      id: uuidv4(),
      value: { 
        id: 'non-existent-id',
        type: 'NonExistentType',
        description: `Invalid target type (not a ${targetClass.name})`
      },
      expected: false,
      description: "An invalid reference to an object of the wrong type"
    });
  }

  // Add a test for cardinality upper bound violations if it's not unlimited
  if (ref.cardinality.upperBound !== '*' && ref.cardinality.upperBound > 1) {
    const tooManyReferences = [];
    // Create number of references exceeding the upper bound
    for (let i = 0; i <= ref.cardinality.upperBound; i++) {
      tooManyReferences.push({
        id: `valid-${targetClass.name.toLowerCase()}-${i}`,
        type: targetClass.name,
        description: `Valid ${targetClass.name} ${i+1}`
      });
    }
    
    testCase.testValues.push({
      id: uuidv4(),
      value: tooManyReferences,
      expected: false,
      description: `Too many references (exceeds max cardinality ${ref.cardinality.upperBound})`
    });
  }

  testCases.push(testCase);
  return testCases;
}

// ── constraint tests ─────────────────────────────────────────────────────

function generateConstraintTests(
  cls: MetaClass,
  constraint: Constraint,
  count: number
): TestCase[] {
  const testCases: TestCase[] = [];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const constraintType = 'type' in constraint ? constraint.type : 'unknown';

  const testCase: TestCase = {
    id: uuidv4(),
    name: `${cls.name}.${constraint.name} Constraint Test`,
    description: `Tests that the ${constraint.name} constraint on ${cls.name} is properly enforced: ${constraint.description || 'No description'}`,
    type: 'constraint',
    targetMetaClassId: cls.id,
    targetMetaClassName: cls.name,
    constraintId: constraint.id,
    constraintType: 'type' in constraint ? constraint.type as 'ocl' | 'javascript' : undefined,
    testValues: [],
    status: 'pending'
  };

  // Add a basic pass/fail test
  testCase.testValues.push({
    id: uuidv4(),
    value: 'Value that should satisfy the constraint',
    expected: true,
    description: 'A value that satisfies the constraint'
  });

  testCase.testValues.push({
    id: uuidv4(),
    value: 'Value that should violate the constraint',
    expected: false,
    description: 'A value that violates the constraint'
  });

  testCases.push(testCase);
  return testCases;
}
