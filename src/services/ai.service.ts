import { GoogleGenerativeAI } from "@google/generative-ai";
import { Metamodel, MetaClass, MetaAttribute, MetaReference } from '../models/types';
import { metamodelService } from './metamodel.service';
import { v4 as uuidv4 } from 'uuid';

export interface AIResult {
  success: boolean;
  response?: string;
  error?: string;
}

class AIService {
  private ai: any;
  private apiKey: string = ''; // Hardcoded API key
  private readonly DEFAULT_MODEL = 'gemini-1.5-flash';
  
  // Store the full AI response for display
  private lastAIResponse: string = '';
  
  // System prompt that explains how the modeling tool works
  private readonly SYSTEM_PROMPT = `
You are an AI assistant that helps with metamodel creation for a modeling tool.

The tool uses these key concepts:
1. Meta-metamodel (similar to Ecore/MOF): The foundational structure for defining metamodels
2. Metamodel: Defines the concepts, attributes, and relationships for a specific domain
3. Model: An instance of a metamodel representing a concrete system
4. Diagram: Visual representation of a model

A metamodel consists of:
- MetaClass: Represents a concept in the domain
- MetaAttribute: Properties of a metaclass (string, number, boolean, date)
- MetaReference: Relationships between metaclasses (may be containment references)
- Constraints: OCL or JavaScript expressions that validate model elements

Your task is to generate a complete metamodel as a JSON structure based on user requirements.
The metamodel should follow this format:
{
  "id": "unique-id", 
  "name": "DomainName",
  "eClass": "eclass-id",
  "uri": "http://www.modeling-tool.com/domainname",
  "prefix": "domainname",
  "classes": [
    {
      "id": "class-id",
      "name": "ClassName",
      "eClass": "eclass-class-id",
      "abstract": false,
      "superTypes": [],
      "attributes": [
        {
          "id": "attr-id",
          "name": "attributeName",
          "eClass": "eclass-attr-id",
          "type": "string",
          "defaultValue": "",
          "required": true,
          "many": false
        }
      ],
      "references": [
        {
          "id": "ref-id",
          "name": "referenceName",
          "targetClassName": "TargetClassName",
          "eClass": "eclass-ref-id",
          "containment": true,
          "cardinality": {
            "lowerBound": 0,
            "upperBound": "*"
          },
          "allowSelfReference": false,
          "attributes": [
            {
              "id": "ref-attr-id",
              "name": "referenceAttributeName",
              "type": "string",
              "defaultValue": "",
              "required": false,
              "many": false
            }
          ]
        }
      ],
      "constraints": [
        {
          "name": "ConstraintName",
          "description": "Description of the constraint",
          "expression": "self.attributeName.length > 0",
          "type": "javascript",
          "severity": "error"
        },
        {
          "name": "OCLConstraintName",
          "description": "Description of OCL constraint",
          "expression": "self.attributeName.size() > 0",
          "type": "ocl",
          "severity": "error"
        }
      ]
    }
  ],
  "conformsTo": "core-package-id"
}

IMPORTANT: 
- Create references between classes when needed for the domain (e.g., containment relationships, bidirectional associations, etc.)
- Analyze the domain carefully to determine what references are needed
- Make sure to set appropriate "containment" and "cardinality" values for each reference
- ALWAYS include "targetClassName" in each reference to explicitly indicate the target class by name
- For references that should allow an element to reference itself, set "allowSelfReference" to true
- References can have their own attributes - add them when the reference itself needs properties

REFERENCE FEATURES - HIGH PRIORITY:
- Self-references: When a class needs to reference its own instances (e.g., Person having a "manager" reference to another Person)
  - Set "allowSelfReference": true for these references
  - Example: A Person can be a manager of another Person
  - Example: A Task can have prerequisite Tasks

- Reference attributes: When a reference itself needs properties
  - Example: An Employee "worksAt" Department reference might have "startDate" and "position" attributes
  - Example: A Student "enrolledIn" Course reference might have "grade" and "semester" attributes
  - Add these as an "attributes" array inside the reference definition

CONSTRAINTS - HIGH PRIORITY:
- YOU MUST THOROUGHLY ANALYZE USER REQUIREMENTS FOR CONSTRAINTS, even when not explicitly labeled as "constraints"
- Add constraints whenever:
  1. Attributes should have specific value ranges (min/max values, patterns, allowed values)
  2. Numerical attributes have limits (e.g., age limits, price ranges, percentage values)
  3. Relationships have quantitative or qualitative restrictions
  4. The description mentions validation rules, business rules, or integrity checks
  5. The description includes words like "must", "should", "only", "required", "at least", "at most", etc.

- The system supports two types of constraints: OCL and JavaScript

- OCL (Object Constraint Language) constraints (use "type": "ocl"):
  - Example 1: "context Patient inv ValidAge: self.age >= 18 and self.age <= 75"
  - Example 2: "context Order inv NonEmptyItems: self.items->notEmpty()"
  - Example 3: "context Employee inv ValidSalary: self.salary > 0"

- JavaScript constraints (use "type": "javascript"):
  - Example 1: "if (self.age < 18 || self.age > 75) { return { valid: false, message: 'Age must be between 18 and 75' }; }"
  - Example 2: "if (self.items.length === 0) { return false; } return true;"
  - Example 3: "return self.salary > 0 && self.salary < self.manager.salary;"

- Each constraint needs:
  - "name": A short descriptive name
  - "description": Human-readable explanation
  - "expression": The actual validation rule
  - "type": Either "ocl" or "javascript"
  - "severity": Usually "error", can be "warning" or "info"

- If users mention validation rules and/or constraints in their requirements, you MUST implement them as constraints
`;

  constructor() {
    this.initializeAI();
  }

  private initializeAI(): void {
    try {
      this.ai = new GoogleGenerativeAI(this.apiKey);
    } catch (error) {
      console.error('Error initializing AI:', error);
      this.ai = null;
    }
  }

  getLastAIResponse(): string {
    return this.lastAIResponse;
  }

  hasAI(): boolean {
    return !!this.ai;
  }

  /**
   * Maps attribute type from AI response to valid metamodel type
   * @param type The type string from AI response
   * @returns A valid attribute type (string, number, boolean, date)
   */
  private mapAttributeType(type: string): 'string' | 'number' | 'boolean' | 'date' {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('int') || lowerType.includes('float') || 
        lowerType.includes('double') || lowerType.includes('decimal') || 
        lowerType === 'real' || lowerType === 'long') {
      return 'number';
    } else if (lowerType === 'bool' || lowerType === 'boolean') {
      return 'boolean';
    } else if (lowerType.includes('date') || lowerType.includes('time')) {
      return 'date';
    }
    // Default to string for any other type
    return 'string';
  }

  /**
   * Generate a metamodel using the AI
   * @param domainDescription User's description of the domain to model
   * @param existingMetamodelId Optional ID of an existing metamodel to update
   * @returns A promise resolving to the generated/updated metamodel, tracked changes, and any errors
   */
  async generateMetamodel(
    domainDescription: string, 
    existingMetamodelId?: string
  ): Promise<{ 
    metamodel: Metamodel | null; 
    changes?: {
      addedClasses: string[];
      modifiedClasses: string[];
      addedAttributes: { className: string; attrName: string }[];
      modifiedAttributes: { className: string; attrName: string }[];
      addedReferences: { className: string; refName: string }[];
      modifiedReferences: { className: string; refName: string }[];
      addedConstraints: { className: string; constraintName: string; type: string }[];
    };
    error?: string 
  }> {
    if (!this.ai) {
      console.error('AI not initialized properly.');
      return { metamodel: null, error: 'AI not initialized properly.' };
    }

    try {
      // Get the model
      const model = this.ai.getGenerativeModel({ model: this.DEFAULT_MODEL });
      
      // Check if we're updating an existing metamodel
      let existingMetamodel: Metamodel | undefined;
      let existingMetamodelInfo = '';
      let existingClassesMap: Record<string, any> = {};
      
      // Track changes for highlighting
      const changes = {
        addedClasses: [] as string[],
        modifiedClasses: [] as string[],
        addedAttributes: [] as { className: string; attrName: string }[],
        modifiedAttributes: [] as { className: string; attrName: string }[],
        addedReferences: [] as { className: string; refName: string }[],
        modifiedReferences: [] as { className: string; refName: string }[],
        addedConstraints: [] as { className: string; constraintName: string; type: string }[],
      };
      
      if (existingMetamodelId) {
        existingMetamodel = metamodelService.getMetamodelById(existingMetamodelId);
        
        if (existingMetamodel) {
          // Store existing class details for preservation
          existingMetamodel.classes.forEach(cls => {
            existingClassesMap[cls.name] = {
              id: cls.id,
              class: cls,
            };
          });
          
          // Create a description of the existing metamodel to include in the prompt
          existingMetamodelInfo = `
You are updating an existing metamodel named "${existingMetamodel.name}".

The metamodel has the following classes:
${existingMetamodel.classes.map(cls => {
  const attributes = cls.attributes.map(attr => 
    `    - ${attr.name}: ${attr.type}${attr.many ? '[]' : ''}${attr.required ? ' (required)' : ''}`
  ).join('\n');
  
  // Include references to preserve them
  const references = cls.references.map(ref => {
    const targetClass = existingMetamodel?.classes.find(c => c.id === ref.target);
    return `    - ${ref.name}: ${targetClass?.name || 'Unknown'}${ref.containment ? ' (containment)' : ''}`;
  }).join('\n');
  
  // Include constraints if they exist
  const constraints = cls.constraints ? cls.constraints.map(constraint => {
    // Skip constraint type check since we've already verified at this point
    const constraintType = 'type' in constraint ? constraint.type : 'unknown';
    return `    - ${constraint.name}: ${constraintType} constraint - ${constraint.description || 'No description'}`;
  }).join('\n') : '';
  
  return `- ${cls.name}${cls.abstract ? ' (abstract)' : ''}
  Attributes:
${attributes}
  References:
${references || '    (none)'}
  Constraints:
${constraints || '    (none)'}`;
}).join('\n\n')}

IMPORTANT: Preserve all existing classes, attributes, references, and constraints UNLESS explicitly instructed to remove or modify them.
When returning the updated metamodel JSON, include ALL elements from the existing metamodel, not just the new or modified ones.
For any modifications, return the complete metamodel structure with both existing and new elements.
If adding new constraints, choose the appropriate constraint type (OCL or JavaScript) based on the complexity of the rule.
`;
        } else {
          console.warn(`Existing metamodel with ID ${existingMetamodelId} not found.`);
        }
      }
      
      // Combine the system prompt with the user query
      const fullPrompt = `${this.SYSTEM_PROMPT}
${existingMetamodelInfo}

${existingMetamodelInfo ? 'Update the metamodel based on these requirements:' : 'Create a detailed metamodel for the following domain:'}

${domainDescription}

Please include appropriate metaclasses, attributes, and references.
Ensure that containment relationships are properly modeled.
Include necessary attributes with appropriate types.
IMPORTANT: Carefully analyze the requirements for any constraints that should be added. A constraint is a validation rule that restricts values of attributes or relationships between elements.
- If the request mentions any rules, restrictions, or validation criteria (such as age limits, value ranges, required conditions, etc.), implement these as appropriate constraints.
- Use OCL constraints for simple conditions and JavaScript constraints for more complex rules.
- Make sure to add explicit constraints whenever attributes should have value restrictions or relationships have specific requirements.
${existingMetamodelInfo ? 'IMPORTANT: Return the complete metamodel including ALL existing elements unless explicitly instructed to remove them.' : ''}
Generate the metamodel as valid JSON.
`;

      // Set generation configuration
      const generationConfig = {
        temperature: 0.2,
        maxOutputTokens: 8192,
      };

      // Generate the content
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        generationConfig
      });
      
      const responseText = result.response.text();
      
      // Store the full response for display
      this.lastAIResponse = responseText;
      
      // Extract the JSON from the response
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                         responseText.match(/```\s*([\s\S]*?)\s*```/) ||
                         [null, responseText];
      
      if (!jsonMatch || !jsonMatch[1]) {
        console.error('Failed to extract JSON from AI response');
        return { metamodel: null, error: 'Failed to extract valid JSON from AI response.' };
      }
      
      let metamodelJson = jsonMatch[1].trim();
      
      try {
        // Parse the JSON
        const metamodelData = JSON.parse(metamodelJson);
        
        if (!metamodelData.name || !Array.isArray(metamodelData.classes)) {
          return { 
            metamodel: null, 
            error: 'AI generated invalid metamodel structure. Please try again with a clearer description.' 
          };
        }
        
        let newMetamodel: Metamodel;
        
        // If we're updating an existing metamodel
        if (existingMetamodelId && existingMetamodel) {
          // Preserve the existing metamodel ID and structure
          newMetamodel = existingMetamodel;
          
          // Update the metamodel name if it changed
          if (metamodelData.name !== existingMetamodel.name) {
            const updatedMetamodel = {
              ...existingMetamodel,
              name: metamodelData.name
            };
            metamodelService.updateMetamodel(existingMetamodelId, updatedMetamodel);
          }
          
          // Track which existing classes are found in the AI response
          const existingClassesInResponse = new Set<string>();
          
          // Create a mapping of class names to their data for easy access during reference creation
          const newClassesMap: Record<string, any> = {};
          
          // First pass: Process all classes from the AI response
          for (const classData of metamodelData.classes) {
            if (!classData.name) continue; // Skip invalid classes
            
            let classId: string;
            
            // Check if this class already exists in the metamodel
            const existingClass = existingMetamodel ? 
              existingClassesMap[classData.name] : null;
              
            if (existingClass) {
              // Class already exists, preserve its ID
              classId = existingClass.id;
              existingClassesInResponse.add(classData.name);
              
              // Update class properties if needed
              if (classData.abstract !== existingClass.class.abstract) {
                // Abstract property changed
                metamodelService.updateMetaClass(
                  existingMetamodelId!,
                  classId,
                  { abstract: classData.abstract }
                );
                // Track modified class
                changes.modifiedClasses.push(classData.name);
              }
            } else {
              // Create a new metaclass
              const newClass = metamodelService.addMetaClass(
                existingMetamodelId || newMetamodel.id,
                classData.name,
                classData.abstract || false
              );
              
              if (!newClass) {
                console.error('Failed to create metaclass:', classData.name);
                continue; // Skip if class creation failed
              }
              
              classId = newClass.id;
              // Track added class
              changes.addedClasses.push(classData.name);
            }
            
            // Store the class ID for references
            newClassesMap[classData.name] = {
              id: classId,
              data: classData
            };
            
            // Process attributes for this class
            if (Array.isArray(classData.attributes)) {
              for (const attrData of classData.attributes) {
                if (!attrData.name || !attrData.type) continue;
                
                // Map attribute type to valid type
                const mappedType = this.mapAttributeType(attrData.type);
                
                // Check if attribute already exists
                let attributeExists = false;
                let attributeChanged = false;
                
                if (existingClass) {
                  const existingAttr = existingClass.class.attributes.find((a: MetaAttribute) => a.name === attrData.name);
                  if (existingAttr) {
                    attributeExists = true;
                    
                    // Check if attribute properties need updating
                    attributeChanged = existingAttr.type !== mappedType ||
                                      existingAttr.many !== (attrData.many || false) ||
                                      existingAttr.required !== (attrData.required || false);
                    
                    if (attributeChanged) {
                      // Update the attribute
                      metamodelService.updateMetaAttribute(
                        existingMetamodelId!,
                        classId,
                        existingAttr.id,
                        {
                          type: mappedType,
                          many: attrData.many || false,
                          required: attrData.required || false,
                          defaultValue: attrData.defaultValue
                        }
                      );
                      // Track modified attribute
                      changes.modifiedAttributes.push({
                        className: classData.name,
                        attrName: attrData.name
                      });
                    }
                  }
                }
                
                if (!attributeExists) {
                  // Create a new attribute
                  metamodelService.addMetaAttribute(
                    existingMetamodelId || newMetamodel.id,
                    classId,
                    attrData.name,
                    mappedType,
                    attrData.defaultValue,
                    attrData.required || false,
                    attrData.many || false
                  );
                  // Track added attribute
                  changes.addedAttributes.push({
                    className: classData.name,
                    attrName: attrData.name
                  });
                }
              }
            }
            
            // Process constraints if provided and only if the user requested them
            if (Array.isArray(classData.constraints) && 
                domainDescription.toLowerCase().includes('constraint')) {
              const oclService = require('./ocl.service').oclService;
              const jsService = require('./js.service').jsService;
              
              for (const constraintData of classData.constraints) {
                if (!constraintData.name || !constraintData.expression) continue;
                
                // Set defaults for missing properties
                const constraintType = constraintData.type?.toLowerCase() === 'ocl' ? 'ocl' : 'javascript';
                const severity = constraintData.severity || 'error';
                const description = constraintData.description || '';
                
                // Create constraint based on its type
                try {
                  if (constraintType === 'ocl') {
                    oclService.createConstraint(
                      existingMetamodelId || newMetamodel.id,
                      classId,
                      constraintData.name,
                      constraintData.expression,
                      description,
                      severity
                    );
                  } else {
                    jsService.createConstraint(
                      existingMetamodelId || newMetamodel.id,
                      classId,
                      constraintData.name,
                      constraintData.expression,
                      description,
                      severity
                    );
                  }
                  // Track added constraint
                  changes.addedConstraints.push({
                    className: classData.name,
                    constraintName: constraintData.name,
                    type: constraintType
                  });
                } catch (constraintError) {
                  console.error(`Error creating ${constraintType} constraint:`, constraintError);
                }
              }
            }
          }
          
          // Second pass: Process references for all classes
          for (const className in newClassesMap) {
            const classInfo = newClassesMap[className];
            const classData = classInfo.data;
            const sourceClassId = classInfo.id;
            
            if (classData.references && Array.isArray(classData.references)) {
              // If this is an existing class, get its current references
              const existingReferences = new Set<string>();
              if (existingClassesMap[className]) {
                const existingClass = existingClassesMap[className].class;
                existingClass.references.forEach((ref: MetaReference) => {
                  existingReferences.add(ref.name);
                });
              }
              
              // Process each reference
              classData.references.forEach((refData: any) => {
                if (!refData.name) return; // Skip invalid references
                
                // Get the target class name - try multiple possible property names
                const targetClassName = refData.targetClassName || refData.target || refData.targetClass || refData.name;
                
                if (!targetClassName) {
                  console.warn(`Missing target class name for reference ${refData.name}`);
                  return;
                }
                
                // Find the target class
                const targetClassInfo = newClassesMap[targetClassName];
                
                if (targetClassInfo) {
                  const targetClassId = targetClassInfo.id;
                  
                  // If it's a new reference or a new class, add the reference
                  if (!existingClassesMap[className] || !existingReferences.has(refData.name)) {
                    // Create the reference
                    const newReference = metamodelService.addMetaReference(
                      existingMetamodelId,
                      sourceClassId,
                      refData.name,
                      targetClassId,
                      refData.containment || false,
                      refData.cardinality?.lowerBound || 0,
                      refData.cardinality?.upperBound || '*',
                      refData.opposite,
                      refData.allowSelfReference || false
                    );
                    
                    // Track added reference
                    changes.addedReferences.push({
                      className: className,
                      refName: refData.name
                    });
                    
                    // Process reference attributes if any
                    if (newReference && refData.attributes && Array.isArray(refData.attributes)) {
                      refData.attributes.forEach((attrData: any) => {
                        if (!attrData.name || !attrData.type) return; // Skip invalid attributes
                        
                        // Map attribute type to valid type
                        const mappedType = this.mapAttributeType(attrData.type);
                        
                        // Add reference attribute
                        metamodelService.addReferenceAttribute(
                          existingMetamodelId,
                          sourceClassId,
                          newReference.id,
                          attrData.name,
                          mappedType,
                          attrData.defaultValue,
                          attrData.required || false,
                          attrData.many || false
                        );
                      });
                    }
                  }
                  // Otherwise, check if we need to update an existing reference
                  else {
                    const existingClass = existingClassesMap[className].class;
                    const existingRef = existingClass.references.find((r: MetaReference) => r.name === refData.name);
                    
                    if (existingRef) {
                      // Check if the reference needs updating
                      const needsUpdate = 
                        existingRef.target !== targetClassId ||
                        existingRef.containment !== (refData.containment || false) ||
                        existingRef.allowSelfReference !== (refData.allowSelfReference || false);
                        
                      if (needsUpdate) {
                        metamodelService.updateMetaReference(
                          existingMetamodelId,
                          sourceClassId,
                          existingRef.id,
                          {
                            target: targetClassId,
                            containment: refData.containment || false,
                            cardinality: {
                              lowerBound: refData.cardinality?.lowerBound || 0,
                              upperBound: refData.cardinality?.upperBound || '*'
                            },
                            allowSelfReference: refData.allowSelfReference || false
                          }
                        );
                        
                        // Track modified reference
                        changes.modifiedReferences.push({
                          className: className,
                          refName: refData.name
                        });
                      }
                      
                      // Process reference attributes if any
                      if (refData.attributes && Array.isArray(refData.attributes)) {
                        // Check for existing reference attributes
                        const existingAttrNames = new Set<string>();
                        
                        if (existingRef.attributes) {
                          existingRef.attributes.forEach((attr: MetaAttribute) => {
                            existingAttrNames.add(attr.name);
                          });
                        }
                        
                        refData.attributes.forEach((attrData: any) => {
                          if (!attrData.name || !attrData.type) return; // Skip invalid attributes
                          
                          // Map attribute type to valid type
                          const mappedType = this.mapAttributeType(attrData.type);
                          
                          // Check if attribute exists
                          if (!existingAttrNames.has(attrData.name)) {
                            // Add new reference attribute
                            metamodelService.addReferenceAttribute(
                              existingMetamodelId,
                              sourceClassId,
                              existingRef.id,
                              attrData.name,
                              mappedType,
                              attrData.defaultValue,
                              attrData.required || false,
                              attrData.many || false
                            );
                          } else if (existingRef.attributes) {
                            // Check if we need to update an existing attribute
                            const existingAttr = existingRef.attributes.find((a: MetaAttribute) => a.name === attrData.name);
                            if (existingAttr) {
                              const attributeChanged = 
                                existingAttr.type !== mappedType ||
                                existingAttr.many !== (attrData.many || false) ||
                                existingAttr.required !== (attrData.required || false);
                                
                              if (attributeChanged) {
                                // Update reference attribute
                                metamodelService.updateReferenceAttribute(
                                  existingMetamodelId,
                                  sourceClassId,
                                  existingRef.id,
                                  existingAttr.id,
                                  {
                                    type: mappedType,
                                    many: attrData.many || false,
                                    required: attrData.required || false,
                                    defaultValue: attrData.defaultValue
                                  }
                                );
                              }
                            }
                          }
                        });
                      }
                    }
                  }
                } else {
                  console.warn(`Target class "${targetClassName}" not found for reference "${refData.name}"`);
                }
              });
            }
          }
          
          // Refresh the metamodel after all changes
          newMetamodel = metamodelService.getMetamodelById(existingMetamodelId) || existingMetamodel;
        } else {
          // Creating a new metamodel - use the original implementation
          newMetamodel = metamodelService.createMetamodel(metamodelData.name);
          
          // Add all the classes from the AI-generated metamodel
          const createdClasses: { [name: string]: any } = {};
          
          // First pass: create all classes
          metamodelData.classes.forEach((classData: any) => {
            if (!classData.name) return; // Skip invalid classes
            
            const newClass = metamodelService.addMetaClass(
              newMetamodel.id,
              classData.name,
              classData.abstract || false
            );
            
            if (newClass) {
              // Store the created class for reference during second pass
              createdClasses[classData.name] = {
                id: newClass.id,
                data: classData
              };
              
              // Skip the built-in 'name' attribute since it's already added by default
              const attributesToAdd = Array.isArray(classData.attributes) 
                ? classData.attributes.filter((attr: any) => attr.name && attr.name !== 'name')
                : [];
              
              // Add attributes to the class
              attributesToAdd.forEach((attrData: any) => {
                metamodelService.addMetaAttribute(
                  newMetamodel.id,
                  newClass.id,
                  attrData.name,
                  attrData.type || 'string',
                  attrData.defaultValue,
                  attrData.required,
                  attrData.many || false
                );
              });
            }
          });
          
          // Second pass: add references between classes
          Object.values(createdClasses).forEach((createdClass: any) => {
            const classData = createdClass.data;
            const sourceClassId = createdClass.id;
            
            if (classData.references && Array.isArray(classData.references)) {
              classData.references.forEach((refData: any) => {
                if (!refData.name) return; // Skip invalid references
                
                // Get the target class name - try multiple possible property names
                const targetClassName = refData.targetClassName || refData.target || refData.targetClass || refData.name;
                
                if (!targetClassName) {
                  console.warn(`Missing target class name for reference ${refData.name}`);
                  return;
                }
                
                // Find the target class by name
                const targetCreatedClass = createdClasses[targetClassName];
                
                if (targetCreatedClass) {
                  const targetClassId = targetCreatedClass.id;
                  
                  // Create the reference
                  const newReference = metamodelService.addMetaReference(
                    newMetamodel.id,
                    sourceClassId,
                    refData.name,
                    targetClassId,
                    refData.containment || false,
                    refData.cardinality?.lowerBound || 0,
                    refData.cardinality?.upperBound || '*',
                    refData.opposite,
                    refData.allowSelfReference || false
                  );
                  
                  // Process reference attributes if any
                  if (newReference && refData.attributes && Array.isArray(refData.attributes)) {
                    refData.attributes.forEach((attrData: any) => {
                      if (!attrData.name || !attrData.type) return; // Skip invalid attributes
                      
                      // Map attribute type to valid type
                      const mappedType = this.mapAttributeType(attrData.type);
                      
                      // Add reference attribute
                      metamodelService.addReferenceAttribute(
                        newMetamodel.id,
                        sourceClassId,
                        newReference.id,
                        attrData.name,
                        mappedType,
                        attrData.defaultValue,
                        attrData.required || false,
                        attrData.many || false
                      );
                    });
                  }
                } else {
                  console.warn(`Target class "${targetClassName}" not found for reference "${refData.name}"`);
                }
              });
            }
          });
        }
        
        // Get the updated metamodel after all changes
        const finalMetamodel = metamodelService.getMetamodelById(newMetamodel.id);
        
        // Return the metamodel and changes (for highlighting) 
        return { 
          metamodel: finalMetamodel || newMetamodel,
          changes: existingMetamodelId ? changes : undefined  // Only return changes for updates
        };
      } catch (parseError) {
        console.error('Error parsing JSON:', parseError);
        return { metamodel: null, error: 'Failed to parse AI generated JSON. Please try again.' };
      }
    } catch (error: any) {
      console.error('Error generating metamodel with AI:', error);
      return { 
        metamodel: null, 
        error: `AI error: ${error.message || 'Unknown error occurred'}`
      };
    }
  }

  /**
   * Generate test cases using AI specifically for model validation
   * @param prompt Detailed prompt describing the test cases needed
   * @returns Generated test cases or an error message
   */
  async generateTestCases(prompt: string): Promise<AIResult> {
    if (!this.ai) {
      console.error('AI not initialized properly.');
      return {
        success: false,
        error: 'AI not initialized properly.'
      };
    }

    try {
      // Get the model
      const model = this.ai.getGenerativeModel({ model: this.DEFAULT_MODEL });
      
      // Set generation configuration
      const generationConfig = {
        temperature: 0.2,
        maxOutputTokens: 8192,
      };

      // Add specific test generation system prompt
      const testSystemPrompt = `
You are a test case generation assistant for a model-driven engineering tool.

Your task is to generate test cases for validating models against their metamodel constraints.

IMPORTANT: Your response MUST be a valid JSON array of test case objects following EXACTLY this format:
[
  {
    "name": "Test case name",
    "description": "Detailed description of what this test validates",
    "type": "attribute", // One of: "attribute", "reference", or "constraint"
    "targetMetaClassName": "MetaClassName", // The name of the metaclass being tested
    "targetProperty": "attributeName", // For attribute or reference tests
    "constraintName": "ConstraintName", // Only for constraint tests
    "testValues": [
      {
        "value": "Test value", // The value to test
        "expected": true // true = should pass validation, false = should fail validation
      },
      // more test values...
    ]
  },
  // more test cases...
]

Focus on these test types:
1. Attribute tests - checking if attribute values conform to their type and other constraints
2. Reference tests - validating references point to valid target elements
3. Constraint tests - testing custom OCL or JavaScript constraints

IMPORTANT: Your response MUST be valid JSON. Format it with the triple backtick syntax like:
\`\`\`json
[{...test cases...}]
\`\`\`
`;

      // Combine with the user prompt
      const fullPrompt = `${testSystemPrompt}\n\n${prompt}`;

      // Generate the content
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        generationConfig
      });
      
      const responseText = result.response.text();
      
      // Store the full response for debugging
      this.lastAIResponse = responseText;
      
      return {
        success: true,
        response: responseText
      };
    } catch (error: any) {
      console.error('Error generating test cases with AI:', error);
      return {
        success: false,
        error: error.message || 'Unknown error generating test cases'
      };
    }
  }

  async generateText(prompt: string): Promise<AIResult> {
    if (!this.ai) {
      console.error('AI not initialized properly.');
      return {
        success: false,
        error: 'AI not initialized properly.'
      };
    }

    try {
      // Get the model
      const model = this.ai.getGenerativeModel({ model: this.DEFAULT_MODEL });
      
      // Set generation configuration
      const generationConfig = {
        temperature: 0.7, // Higher temperature for more creative responses
        maxOutputTokens: 4096,
      };

      // Generate the content
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig
      });
      
      const responseText = result.response.text();
      
      // Store the full response for debugging
      this.lastAIResponse = responseText;
      
      return {
        success: true,
        response: responseText
      };
    } catch (error: any) {
      console.error('Error generating text with AI:', error);
      return {
        success: false,
        error: error.message || 'Unknown error generating text'
      };
    }
  }
}

export const aiService = new AIService();