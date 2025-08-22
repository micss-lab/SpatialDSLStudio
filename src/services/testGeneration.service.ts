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
  type: 'attribute' | 'reference' | 'constraint';
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

  getTestCasesForMetamodel(metamodelId: string): TestCase[] {
    // For metamodel-based testing, we're storing test cases using the metamodel ID directly
    return this.testCases.get(metamodelId) || [];
  }

  deleteTestCasesForModel(modelId: string): void {
    this.testCases.delete(modelId);
    this.saveToStorage();
  }

  deleteTestCasesForMetamodel(metamodelId: string): void {
    // For metamodel-based testing, we're using the metamodel ID directly
    this.testCases.delete(metamodelId);
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

  async generateTestCasesForMetamodel(
    metamodelId: string,
    options: TestGenerationOptions
  ): Promise<TestCase[]> {
    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      throw new Error(`Metamodel with ID ${metamodelId} not found`);
    }

    // Create a minimal model just to satisfy the required interface
    // This model is never stored, just used for the generation process
    const dummyModel: Model = {
      id: metamodelId, // Use metamodel ID as the model ID
      name: `Test Model for ${metamodel.name}`,
      conformsTo: metamodelId,
      metamodelId: metamodelId,
      elements: []
    };

    let newTestCases: TestCase[] = [];

    // Generate tests using AI for comprehensive coverage if available
    if (aiService.hasAI()) {
      try {
        newTestCases = await this.generateTestCasesWithAI(metamodel, dummyModel, options);
      } catch (error) {
        console.error('Error generating test cases with AI:', error);
        // Fall back to rule-based generation if AI fails
        newTestCases = this.generateTestCasesWithRules(metamodel, dummyModel, options);
      }
    } else {
      // Use rule-based generation if AI is not available
      newTestCases = this.generateTestCasesWithRules(metamodel, dummyModel, options);
    }

    // Store the generated test cases using the metamodel ID
    this.testCases.set(metamodelId, newTestCases);
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
      // Use the new dedicated test case generation method
      const result = await aiService.generateTestCases(prompt);
      
      if (!result.success || !result.response) {
        throw new Error(result.error || 'Failed to generate test cases with AI');
      }

      // Parse the AI response and convert it to TestCase objects
      return this.parseAIResponseToTestCases(result.response, metamodel, options, prompt);
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

    // Build a comprehensive prompt for the AI
    return `
I need to generate test cases for model validation based on this metamodel structure:

${metamodelDescription}

Test cases should cover the following areas (selected by the user):
${options.includeAttributeTests ? '- Attribute tests' : ''}
${options.includeReferenceTests ? '- Reference tests' : ''}
${options.includeConstraintTests ? '- Constraint tests' : ''}

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

IMPORTANT: ALWAYS RESPECT THE ATTRIBUTE TYPE AS DEFINED IN THE METAMODEL:
- If an attribute like "price" or "stockLevel" is defined as a STRING type in the metamodel, then ANY string value is valid regardless of its content. Do not treat it as a number for attribute tests.
- If an attribute like "age" is defined as a STRING type, then ANY string value is valid regardless of whether it contains numbers or letters.
- NEVER make assumptions about attribute validation based on attribute names - use only the declared type.

IMPORTANT: Attribute tests vs. Constraint tests:
- Attribute tests ONLY validate the basic type and required property - NOT specific value rules:
  - String attributes are only checked to be strings and non-empty if required - ANY non-empty string should be valid!
  - Number attributes are only checked to be numeric values - ANY number should be valid!
  - Date attributes are only checked to be valid dates - ANY valid date format should be valid!
  - Boolean attributes are only checked to be boolean values - both true and false should be valid!

- Constraint tests validate specific value conditions (which attributes do NOT validate):
  - For example, if "car" must be "fancy car" or "bad car", this is handled by a constraint test, NOT an attribute test
  - For attribute tests of "car", any string should be valid regardless of specific value
  - Create separate constraint tests to verify value-specific rules

Example of correct attribute test vs. constraint test for the "car" attribute:
1. Attribute test - tests only that the value is a valid string:
   {
     "name": "Patient.car Attribute Test",
     "type": "attribute",
     "testValues": [
       { "value": "any string", "expected": true, "description": "Any non-empty string is a valid string" },
       { "value": "", "expected": false, "description": "Empty string violates required constraint" },
       { "value": 123, "expected": false, "description": "Number is not a valid string" }
     ]
   }

2. Constraint test - tests specific value requirements:
   {
     "name": "Patient.ValidCarType Constraint Test",
     "type": "constraint",
     "constraintName": "ValidCarType",
     "testValues": [
       { "value": { "car": "fancy car" }, "expected": true, "description": "Valid car value" },
       { "value": { "car": "bad car" }, "expected": true, "description": "Another valid car value" },
       { "value": { "car": "other car" }, "expected": false, "description": "Invalid car value" }
     ]
   }

IMPORTANT FOR REFERENCE TESTS:
- Reference test values MUST be objects that specify the target class and a description
- DO NOT use string descriptions like "Valid Target" or "Invalid Target"
- ALWAYS use this format for reference test values:
  - For valid references: { "id": "example-id", "type": "TargetClassName", "description": "A valid reference" }
  - For invalid references: { "id": "non-existent-id", "type": "WrongClassName", "description": "Reference to wrong type" }
  - For null references: null
  - For cardinality violations: [] or [too many items]

Example of correct reference test:
{
  "name": "Patient.medicalRecords Reference Test",
  "description": "Tests if the medicalRecords reference accepts valid MedicalRecord objects and rejects invalid ones",
  "type": "reference",
  "targetMetaClassName": "Patient",
  "targetProperty": "medicalRecords",
  "testValues": [
    {
      "value": { "id": "valid-id", "type": "MedicalRecord", "description": "A valid medical record" },
      "expected": true,
      "description": "A valid reference to a MedicalRecord object"
    },
    {
      "value": { "id": "invalid-type-id", "type": "Doctor", "description": "Wrong reference type" },
      "expected": false,
      "description": "An invalid reference to an object of the wrong type"
    },
    {
      "value": null,
      "expected": true,  // if reference is optional (lowerBound = 0)
      "description": "A null reference (valid for optional references)"
    }
  ]
}

Focus on edge cases and boundary conditions that are likely to reveal bugs.

IMPORTANT: Generate test cases for ALL classes in the metamodel, not just a subset.

IMPORTANT: Your response MUST be a valid JSON array of test cases following exactly this schema:
[
  {
    "name": "Test case name",
    "description": "Detailed description",
    "type": "attribute|reference|constraint",
    "targetMetaClassName": "Name of metaclass",
    "targetProperty": "Name of attribute or reference",
    "constraintName": "Name of constraint (if type is constraint)",
    "testValues": [
      {
        "value": "Test value or description for attributes and constraints, or object for references",
        "expected": true|false,
        "description": "Explanation of what this test value is testing and why it's valid/invalid"
      }
    ]
  }
]

DO NOT include any additional explanations or text before or after the JSON array.
DO NOT use JavaScript comments in the JSON.
ENSURE that the "expected" field is always a boolean value (true or false), not a string.
INCLUDE approximately ${options.testCasesPerAttribute} test cases per attribute, ${options.testCasesPerReference} test cases per reference, and ${options.testCasesPerConstraint} test cases per constraint.
FORMAT your response with triple backticks:
\`\`\`json
[{...}]
\`\`\`
`;
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
      // Try different patterns to extract JSON
      const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) || 
                        aiResponse.match(/```\s*([\s\S]*?)\s*```/) ||
                        aiResponse.match(/\[\s*\{\s*"name"[\s\S]*\}\s*\]/); // Direct JSON array match
      
      let testCasesJson;
      
      if (jsonMatch && jsonMatch[1]) {
        // Clean up the extracted JSON string - handle potential markdown formatting issues
        const jsonString = jsonMatch[1].trim()
          .replace(/^```json\s*/gm, '')
          .replace(/\s*```$/gm, '');
        
        try {
          testCasesJson = JSON.parse(jsonString);
        } catch (parseError) {
          console.error('Failed to parse extracted JSON:', parseError);
          console.log('JSON string that failed to parse:', jsonString);
          
          // Final attempt: try to find and extract any valid JSON array in the response
          const anyJsonArrayMatch = aiResponse.match(/(\[\s*\{[\s\S]*\}\s*\])/);
          if (anyJsonArrayMatch && anyJsonArrayMatch[1]) {
            try {
              testCasesJson = JSON.parse(anyJsonArrayMatch[1]);
            } catch (finalError) {
              console.error('Final attempt to parse JSON failed:', finalError);
              // Fall back to rule-based generation if all parsing attempts fail
              return this.generateFallbackTestCases(metamodel, options);
            }
          } else {
            // Fall back to rule-based generation if all extraction attempts fail
            return this.generateFallbackTestCases(metamodel, options);
          }
        }
      } else if (aiResponse.includes('"name"') && (aiResponse.includes('"testValues"') || aiResponse.includes('"expected"'))) {
        // Response looks like it might contain test case data but isn't properly formatted as JSON
        // Try to extract any JSON-like structure
        
        const startBracket = aiResponse.indexOf('[');
        const endBracket = aiResponse.lastIndexOf(']');
        
        if (startBracket !== -1 && endBracket !== -1 && startBracket < endBracket) {
          try {
            const jsonString = aiResponse.substring(startBracket, endBracket + 1);
            testCasesJson = JSON.parse(jsonString);
          } catch (parseError) {
            console.error('Failed to parse JSON-like structure:', parseError);
            // Fall back to rule-based generation
            return this.generateFallbackTestCases(metamodel, options);
          }
        } else {
          // Fall back to rule-based generation
          return this.generateFallbackTestCases(metamodel, options);
        }
      } else {
        console.error('Failed to extract JSON from AI response');
        console.log('AI response:', aiResponse);
        // Fall back to rule-based generation
        return this.generateFallbackTestCases(metamodel, options);
      }
      
      if (!Array.isArray(testCasesJson)) {
        console.error('AI response is not an array of test cases:', testCasesJson);
        // Check if the response contains a nested array property that might hold the test cases
        if (testCasesJson && typeof testCasesJson === 'object' && 'testCases' in testCasesJson && Array.isArray(testCasesJson.testCases)) {
          testCasesJson = testCasesJson.testCases;
        } else if (testCasesJson && typeof testCasesJson === 'object' && 'tests' in testCasesJson && Array.isArray(testCasesJson.tests)) {
          testCasesJson = testCasesJson.tests;
        } else {
          // Fall back to rule-based generation
          return this.generateFallbackTestCases(metamodel, options);
        }
      }

      // Check if we have any test cases after all the extraction attempts
      if (!testCasesJson || testCasesJson.length === 0) {
        console.error('No test cases found in AI response');
        return this.generateFallbackTestCases(metamodel, options);
      }

      // Convert the JSON to TestCase objects
      const testCases: TestCase[] = [];
      
      for (const tc of testCasesJson) {
        try {
          if (!tc.name || !tc.type || !tc.targetMetaClassName) {
            console.warn('Skipping invalid test case object:', tc);
            continue;
          }
          
          // Find the target metaclass ID
          const targetMetaClass = metamodel.classes.find(c => c.name === tc.targetMetaClassName);
          if (!targetMetaClass) {
            console.warn(`Metaclass ${tc.targetMetaClassName} not found, skipping test case`);
            continue;
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

          // Ensure testValues is an array and process special cases
          const testValues = Array.isArray(tc.testValues) ? this.processTestValues(tc, targetMetaClass) : [];
          
          // Create the test case
          testCases.push({
            id: uuidv4(),
            name: tc.name,
            description: tc.description || `Test for ${tc.targetMetaClassName}.${tc.targetProperty || ''}`,
            type: tc.type as 'attribute' | 'reference' | 'constraint',
            targetMetaClassId: targetMetaClass.id,
            targetMetaClassName: targetMetaClass.name,
            targetProperty: tc.targetProperty,
            constraintId,
            constraintType,
            testValues: testValues.map((tv: any) => ({
              id: uuidv4(),
              value: tv.value,
              expected: tv.expected === true || tv.expected === 'true',
              result: undefined,
              errorMessage: undefined,
              description: tv.description || ''
            })),
            status: 'pending',
            aiPrompt: aiPrompt,
            aiResponse: aiResponse
          });
        } catch (testCaseError) {
          console.error('Error processing test case:', testCaseError);
          // Continue to the next test case
        }
      }

      // If we couldn't create any test cases, fall back to rule-based generation
      if (testCases.length === 0) {
        console.warn('Failed to create any test cases from AI response, falling back to rule-based generation');
        return this.generateFallbackTestCases(metamodel, options);
      }

      return testCases;
    } catch (error: unknown) {
      console.error('Error parsing AI response:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse AI response: ${errorMessage}`);
    }
  }

  /**
   * Process test values for special handling of constraint tests
   */
  private processTestValues(testCase: any, targetMetaClass: MetaClass): any[] {
    if (!Array.isArray(testCase.testValues)) {
      return [];
    }

    // Make a copy of the test values to avoid modifying the original
    const processedValues = [...testCase.testValues];

    // Special handling for constraint tests
    if (testCase.type === 'constraint' && testCase.constraintName === 'ValidCarType') {
      // Process car constraint test values
      for (let i = 0; i < processedValues.length; i++) {
        const tv = processedValues[i];
        
        // If the test value is an object with a 'car' property
        if (typeof tv.value === 'object' && 'car' in tv.value) {
          // No changes needed, the format is already good
        } 
        // If it's a string like "fancy car", convert it to the proper format for constraint testing
        else if (typeof tv.value === 'string') {
          processedValues[i] = {
            ...tv,
            value: { car: tv.value }
          };
        }
      }
    }

    return processedValues;
  }

  /**
   * Generates fallback test cases using rule-based methods when AI generation fails
   */
  private generateFallbackTestCases(
    metamodel: Metamodel,
    options: TestGenerationOptions
  ): TestCase[] {
    console.log('Falling back to rule-based test generation');
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