import { v4 as uuidv4 } from 'uuid';
import { 
  Metamodel, 
  MetaClass, 
  MetaAttribute, 
  MetaReference, 
  Model, 
  ModelElement, 
  Constraint,
  JSConstraint,
  OCLConstraint 
} from '../models/types';
import { metamodelService } from './metamodel.service';
import { modelService } from './model.service';
import { aiService } from './ai.service';

// Test case types
export interface TestCase {
  id: string;
  name: string;
  description: string;
  type: 'attribute' | 'reference' | 'constraint' | 'reference_attribute';
  targetMetaClassId: string;
  targetMetaClassName: string;
  targetProperty?: string;
  testValues: TestValue[];
  constraintId?: string;
  constraintType?: 'ocl' | 'javascript';
  status: 'pending' | 'running' | 'passed' | 'failed';
  errorMessage?: string;
  aiPrompt?: string;
  aiResponse?: string;
  originalInput?: any;
  expectedOutput?: any;
  actualOutput?: any;
}

export interface TestValue {
  id: string;
  value: any;
  expected: boolean; // Should this value pass (true) or fail (false)
  result?: boolean;
  errorMessage?: string;
  description?: string; // Description of what this test value is testing
}

export interface TestCoverage {
  totalElementsCount: number;
  testedElementsCount: number;
  totalAttributesCount: number;
  testedAttributesCount: number;
  totalReferencesCount: number;
  testedReferencesCount: number;
  totalConstraintsCount: number;
  testedConstraintsCount: number;
  testedMetaClasses: { id: string; name: string }[];
  untestedMetaClasses: { id: string; name: string }[];
}

export interface TestGenerationOptions {
  includeAttributeTests: boolean;
  includeReferenceTests: boolean;
  includeConstraintTests: boolean;
  testCasesPerAttribute: number;
  testCasesPerReference: number;
  testCasesPerConstraint: number;
}

class TestGenerationService {
  private testCases: Map<string, TestCase[]> = new Map(); // modelId -> TestCases
  private readonly STORAGE_KEY = 'obeo_like_tool_test_cases';

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const storedData = localStorage.getItem(this.STORAGE_KEY);
      if (storedData) {
        const parsed = JSON.parse(storedData);
        Object.entries(parsed).forEach(([modelId, testCases]) => {
          this.testCases.set(modelId, testCases as TestCase[]);
        });
      }
    } catch (error) {
      console.error('Error loading test cases from localStorage:', error);
      this.testCases.clear();
    }
  }

  private saveToStorage(): void {
    try {
      const data: Record<string, TestCase[]> = {};
      this.testCases.forEach((testCases, modelId) => {
        data[modelId] = testCases;
      });
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving test cases to localStorage:', error);
    }
  }

  getTestCasesForModel(modelId: string): TestCase[] {
    return this.testCases.get(modelId) || [];
  }

  deleteTestCasesForModel(modelId: string): void {
    this.testCases.delete(modelId);
    this.saveToStorage();
  }

  async generateTestCases(
    modelId: string, 
    options: TestGenerationOptions
  ): Promise<TestCase[]> {
    const model = modelService.getModelById(modelId);
    if (!model) {
      throw new Error(`Model with ID ${modelId} not found`);
    }

    const metamodel = metamodelService.getMetamodelById(model.metamodelId);
    if (!metamodel) {
      throw new Error(`Metamodel with ID ${model.metamodelId} not found`);
    }

    let newTestCases: TestCase[] = [];

    // Generate tests using AI for comprehensive coverage
    if (aiService.hasAI()) {
      try {
        newTestCases = await this.generateTestCasesWithAI(metamodel, model, options);
      } catch (error) {
        console.error('Error generating test cases with AI:', error);
        // Fall back to rule-based generation if AI fails
        newTestCases = this.generateTestCasesWithRules(metamodel, model, options);
      }
    } else {
      // Use rule-based generation if AI is not available
      newTestCases = this.generateTestCasesWithRules(metamodel, model, options);
    }

    // Store the generated test cases
    this.testCases.set(modelId, newTestCases);
    this.saveToStorage();

    return newTestCases;
  }

  private async generateTestCasesWithAI(
    metamodel: Metamodel,
    model: Model,
    options: TestGenerationOptions
  ): Promise<TestCase[]> {
    if (!aiService.hasAI()) {
      throw new Error('AI service is not available');
    }

    // Build detailed prompt for the AI
    const prompt = this.buildAIPrompt(metamodel, model, options);

    try {
      // Use the AI service to generate test cases
      const result = await aiService.generateMetamodel(prompt);
      if (!result.metamodel) {
        throw new Error(result.error || 'Failed to generate test cases');
      }

      // Parse the AI response and convert it to TestCase objects
      const aiResponse = aiService.getLastAIResponse();
      return this.parseAIResponseToTestCases(aiResponse, metamodel, options, prompt);
    } catch (error) {
      console.error('Error in AI test generation:', error);
      throw error;
    }
  }

  private buildAIPrompt(
    metamodel: Metamodel,
    model: Model,
    options: TestGenerationOptions
  ): string {
    // Construct a detailed description of the metamodel structure
    const metamodelDescription = this.getMetamodelDescription(metamodel);

    // Create a list of attributes validated by constraints for better test generation
    const attributesValidatedByConstraints = this.getAttributesValidatedByConstraints(metamodel);

    // Build a comprehensive prompt for the AI
    return `
I need to generate test cases for model validation based on this metamodel structure:

${metamodelDescription}

IMPORTANT: In this modeling system, validation works in the following ways:
1. For attributes WITHOUT specific constraints: The system only checks for basic type validation and required fields.
2. For attributes WITH specific constraints: The validation is handled by the constraint, NOT the attribute itself.

The following attributes are validated by constraints (DO NOT generate attribute tests for these):
${attributesValidatedByConstraints}

IMPORTANT: Attribute tests vs. Constraint tests:
- Attribute tests ONLY validate the basic type and required property:
  - String attributes are only checked to be strings and non-empty if required
  - Number attributes are only checked to be numeric
  - Date attributes are only checked to be valid dates
  - Boolean attributes are only checked to be boolean values
- Constraint tests validate specific value conditions:
  - For example, if "car" must be "fancy car" or "bad car", this is handled by a constraint, not attribute validation
  - DO NOT include constraint-specific requirements in attribute tests
  - Create separate constraint tests to verify value-specific rules

Test cases should cover the following areas (selected by the user):
${options.includeAttributeTests ? '- Attribute tests (ONLY for attributes NOT validated by constraints)' : ''}
${options.includeReferenceTests ? '- Reference tests' : ''}
${options.includeConstraintTests ? '- Constraint tests (These MUST include testing attributes validated by constraints)' : ''}

For each test case, I need:
1. A descriptive name
2. A detailed description explaining what the test validates
3. Test values that should PASS validation
4. Test values that should FAIL validation

Generate high-quality test cases with the following characteristics:
- For numeric attributes, include boundary testing (min, max, just inside valid range, just outside valid range)
- For string attributes, include empty strings, valid patterns, and invalid patterns
- For date attributes, include boundary dates and invalid formats
- For boolean attributes, include both true and false values when relevant
- For references, include valid targets, invalid targets, and cardinality violations
- For constraints, include values that should satisfy and violate each constraint

IMPORTANT FOR CONSTRAINT TESTS:
- When a constraint validates an attribute (like "self.car === 'fancy car' || self.car === 'bad car'"), 
  you MUST generate test values that both satisfy and violate the constraint.
- For the example above, 'fancy car' and 'bad car' would be valid test values, and any other string would be invalid.
- Do NOT generate separate attribute tests for attributes validated by constraints.

IMPORTANT: Generate test cases for ALL classes in the metamodel, not just a subset.

Respond with a JSON array of test cases following this schema:
[
  {
    "name": "Test case name",
    "description": "Detailed description",
    "type": "attribute|reference|constraint",
    "targetMetaClassName": "Name of metaclass",
    "targetProperty": "Name of attribute or reference",
    "constraintName": "Name of constraint (if type is constraint)",
    "constraintType": "ocl|javascript (if type is constraint)",
    "testValues": [
      {
        "value": "Test value or description",
        "expected": true|false (whether validation should pass),
        "description": "Explanation of what this test value is testing and why it's valid/invalid"
      }
    ]
  }
]

Please include ${options.testCasesPerAttribute} test cases per attribute, ${options.testCasesPerReference} test cases per reference, and ${options.testCasesPerConstraint} test cases per constraint.
`;
  }

  /**
   * Identify attributes that are validated by constraints
   */
  private getAttributesValidatedByConstraints(metamodel: Metamodel): string {
    let result = '';
    
    metamodel.classes.forEach(cls => {
      if (!cls.constraints || cls.constraints.length === 0) return;
      
      const validatedAttributes = new Set<string>();
      
      // Find attributes referenced in constraints
      cls.constraints.forEach(constraint => {
        const expression = constraint.expression;
        cls.attributes.forEach(attr => {
          if (expression.includes(`self.${attr.name}`)) {
            validatedAttributes.add(attr.name);
          }
        });
      });
      
      if (validatedAttributes.size > 0) {
        result += `\n- Class ${cls.name}: ${Array.from(validatedAttributes).join(', ')}`;
      }
    });
    
    return result.length > 0 ? result : '(None)';
  }

  private getMetamodelDescription(metamodel: Metamodel): string {
    let description = `Metamodel: ${metamodel.name}\n\n`;

    metamodel.classes.forEach(cls => {
      description += `Class: ${cls.name}${cls.abstract ? ' (abstract)' : ''}\n`;

      // Add attributes
      if (cls.attributes.length > 0) {
        description += `  Attributes:\n`;
        cls.attributes.forEach(attr => {
          description += `    - ${attr.name}: ${attr.type}${attr.many ? '[]' : ''}${attr.required ? ' (required)' : ''}\n`;
        });
      }

      // Add references
      if (cls.references.length > 0) {
        description += `  References:\n`;
        cls.references.forEach(ref => {
          const targetClass = metamodel.classes.find(c => c.id === ref.target);
          description += `    - ${ref.name}: ${targetClass?.name || 'Unknown'}${ref.containment ? ' (containment)' : ''} [${ref.cardinality.lowerBound}..${ref.cardinality.upperBound}]\n`;
        });
      }

      // Add constraints
      if (cls.constraints && cls.constraints.length > 0) {
        description += `  Constraints:\n`;
        cls.constraints.forEach(constraint => {
          const constraintType = 'type' in constraint ? constraint.type : 'unknown';
          description += `    - ${constraint.name}: ${constraintType} constraint - ${constraint.description || 'No description'}\n`;
          description += `      Expression: ${constraint.expression}\n`;
        });
      }

      description += `\n`;
    });

    // Add global constraints if any
    if (metamodel.constraints && metamodel.constraints.length > 0) {
      description += `Global Constraints:\n`;
      metamodel.constraints.forEach(constraint => {
        const constraintType = 'type' in constraint ? constraint.type : 'unknown';
        description += `  - ${constraint.name}: ${constraintType} constraint - ${constraint.description || 'No description'}\n`;
        description += `    Expression: ${constraint.expression}\n`;
      });
    }

    return description;
  }

  private parseAIResponseToTestCases(
    aiResponse: string,
    metamodel: Metamodel,
    options: TestGenerationOptions,
    aiPrompt?: string
  ): TestCase[] {
    try {
      // Extract JSON from the AI response
      const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) || 
                        aiResponse.match(/```\s*([\s\S]*?)\s*```/) ||
                        [null, aiResponse];
      
      if (!jsonMatch || !jsonMatch[1]) {
        throw new Error('Failed to extract JSON from AI response');
      }
      
      const testCasesJson = JSON.parse(jsonMatch[1].trim());
      
      if (!Array.isArray(testCasesJson)) {
        throw new Error('AI response is not an array of test cases');
      }

      // Convert the JSON to TestCase objects
      const testCases: TestCase[] = testCasesJson.map(tc => {
        // Find the target metaclass ID
        const targetMetaClass = metamodel.classes.find(c => c.name === tc.targetMetaClassName);
        if (!targetMetaClass) {
          throw new Error(`Metaclass ${tc.targetMetaClassName} not found`);
        }

        // For constraint tests, find the constraint ID
        let constraintId: string | undefined;
        let constraintType: 'ocl' | 'javascript' | undefined;

        if (tc.type === 'constraint' && tc.constraintName) {
          const constraint = targetMetaClass.constraints?.find(c => c.name === tc.constraintName);
          if (constraint) {
            constraintId = constraint.id;
            constraintType = 'type' in constraint ? constraint.type as 'ocl' | 'javascript' : undefined;
          }
        }

        // Create the test case
        return {
          id: uuidv4(),
          name: tc.name,
          description: tc.description,
          type: tc.type as 'attribute' | 'reference' | 'constraint',
          targetMetaClassId: targetMetaClass.id,
          targetMetaClassName: targetMetaClass.name,
          targetProperty: tc.targetProperty,
          constraintId,
          constraintType,
          testValues: tc.testValues.map((tv: any) => ({
            id: uuidv4(),
            value: tv.value,
            expected: tv.expected,
            result: undefined,
            errorMessage: undefined,
            description: tv.description || undefined
          })),
          status: 'pending',
          aiPrompt: aiPrompt,
          aiResponse: aiResponse
        };
      });

      return testCases;
    } catch (error: any) {
      console.error('Error parsing AI response:', error);
      throw new Error(`Failed to parse AI response: ${error.message}`);
    }
  }

  private generateTestCasesWithRules(
    metamodel: Metamodel,
    model: Model,
    options: TestGenerationOptions
  ): TestCase[] {
    const testCases: TestCase[] = [];

    metamodel.classes.forEach(cls => {
      // Generate attribute tests
      if (options.includeAttributeTests) {
        cls.attributes.forEach(attr => {
          const attributeTests = this.generateAttributeTests(cls, attr, options.testCasesPerAttribute);
          testCases.push(...attributeTests);
        });
      }

      // Generate reference tests
      if (options.includeReferenceTests) {
        cls.references.forEach(ref => {
          const referenceTests = this.generateReferenceTests(cls, ref, metamodel, options.testCasesPerReference);
          testCases.push(...referenceTests);
        });
      }

      // Generate constraint tests
      if (options.includeConstraintTests && cls.constraints && cls.constraints.length > 0) {
        cls.constraints.forEach(constraint => {
          const constraintTests = this.generateConstraintTests(cls, constraint, options.testCasesPerConstraint);
          testCases.push(...constraintTests);
        });
      }
    });

    return testCases;
  }

  private generateAttributeTests(
    cls: MetaClass,
    attr: MetaAttribute,
    count: number
  ): TestCase[] {
    const testCases: TestCase[] = [];

    // Check if this attribute is validated by a constraint
    const hasConstraint = cls.constraints?.some(constraint => {
      const expression = constraint.expression;
      // Check if the constraint expression references this attribute
      return expression.includes(`self.${attr.name}`);
    });

    // If the attribute is validated by a constraint, skip generating attribute tests
    if (hasConstraint) {
      console.log(`Skipping attribute test for ${attr.name} as it is validated by a constraint`);
      return testCases;
    }

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

  private generateReferenceTests(
    cls: MetaClass,
    ref: MetaReference,
    metamodel: Metamodel,
    count: number
  ): TestCase[] {
    const testCases: TestCase[] = [];
    const targetClass = metamodel.classes.find(c => c.id === ref.target);
    if (!targetClass) return testCases;

    // Main reference test for cardinality/target validation
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
        value: `Empty reference (violates min cardinality ${ref.cardinality.lowerBound})`,
        expected: false
      });
    } else {
      testCase.testValues.push({
        id: uuidv4(),
        value: 'Empty reference',
        expected: true
      });
    }

    // Test for valid reference
    testCase.testValues.push({
      id: uuidv4(),
      value: `Valid ${targetClass.name} reference`,
      expected: true
    });

    // Test for invalid target type
    testCase.testValues.push({
      id: uuidv4(),
      value: `Invalid target type (not a ${targetClass.name})`,
      expected: false
    });

    // Test for self-reference if applicable
    if (ref.allowSelfReference) {
      testCase.testValues.push({
        id: uuidv4(),
        value: `Self-reference (${cls.name} to itself)`,
        expected: true,
        description: 'A reference where the source and target are the same instance'
      });
    } else if (cls.id === targetClass.id) {
      testCase.testValues.push({
        id: uuidv4(),
        value: `Self-reference attempt (not allowed)`,
        expected: false,
        description: 'Attempting to create a self-reference when not allowed'
      });
    }

    testCases.push(testCase);

    // If the reference has attributes, generate tests for those attributes
    if (ref.attributes && ref.attributes.length > 0) {
      ref.attributes.forEach(attr => {
        const attrTestCase: TestCase = {
          id: uuidv4(),
          name: `${cls.name}.${ref.name}.${attr.name} Reference Attribute Test`,
          description: `Tests that the ${attr.name} attribute on the ${ref.name} reference of ${cls.name} to ${targetClass.name} meets validation requirements`,
          type: 'reference_attribute',
          targetMetaClassId: cls.id,
          targetMetaClassName: cls.name,
          targetProperty: `${ref.name}.${attr.name}`,
          testValues: [],
          status: 'pending'
        };

        // Generate test values based on attribute type
        switch (attr.type) {
          case 'string':
            attrTestCase.testValues = [
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
            attrTestCase.testValues = [
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
            attrTestCase.testValues = [
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
            attrTestCase.testValues = [
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

        testCases.push(attrTestCase);
      });
    }

    return testCases;
  }

  private generateConstraintTests(
    cls: MetaClass,
    constraint: Constraint,
    count: number
  ): TestCase[] {
    const testCases: TestCase[] = [];
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

  calculateTestCoverage(modelId: string): TestCoverage {
    const testCases = this.getTestCasesForModel(modelId);
    const model = modelService.getModelById(modelId);
    
    if (!model) {
      throw new Error(`Model with ID ${modelId} not found`);
    }

    const metamodel = metamodelService.getMetamodelById(model.metamodelId);
    if (!metamodel) {
      throw new Error(`Metamodel with ID ${model.metamodelId} not found`);
    }

    // Count metamodel elements
    const allMetaClasses = metamodel.classes;
    const allAttributes = allMetaClasses.flatMap(cls => cls.attributes);
    const allReferences = allMetaClasses.flatMap(cls => cls.references);
    const allConstraints = allMetaClasses.flatMap(cls => cls.constraints || []);

    // Add global constraints if any
    const globalConstraints = metamodel.constraints || [];
    const totalConstraints = [...allConstraints, ...globalConstraints];

    // Find tested elements
    const testedMetaClassIds = new Set(testCases.map(tc => tc.targetMetaClassId));
    const testedAttributes = new Set(
      testCases
        .filter(tc => tc.type === 'attribute')
        .map(tc => `${tc.targetMetaClassId}.${tc.targetProperty}`)
    );
    const testedReferences = new Set(
      testCases
        .filter(tc => tc.type === 'reference')
        .map(tc => `${tc.targetMetaClassId}.${tc.targetProperty}`)
    );
    const testedConstraints = new Set(
      testCases
        .filter(tc => tc.type === 'constraint' && tc.constraintId)
        .map(tc => tc.constraintId as string)
    );

    // Categorize metaclasses
    const testedMetaClasses = allMetaClasses
      .filter(cls => testedMetaClassIds.has(cls.id))
      .map(cls => ({ id: cls.id, name: cls.name }));

    const untestedMetaClasses = allMetaClasses
      .filter(cls => !testedMetaClassIds.has(cls.id))
      .map(cls => ({ id: cls.id, name: cls.name }));

    return {
      totalElementsCount: allMetaClasses.length,
      testedElementsCount: testedMetaClassIds.size,
      totalAttributesCount: allAttributes.length,
      testedAttributesCount: testedAttributes.size,
      totalReferencesCount: allReferences.length,
      testedReferencesCount: testedReferences.size,
      totalConstraintsCount: totalConstraints.length,
      testedConstraintsCount: testedConstraints.size,
      testedMetaClasses,
      untestedMetaClasses
    };
  }
}

export const testGenerationService = new TestGenerationService(); 