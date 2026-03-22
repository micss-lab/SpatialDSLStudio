import { EPackage, EClass } from '../../models/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Builds the complete Ecore meta-metamodel package.
 * Creates a simplified Ecore-like meta-metamodel with core classes:
 * - EClass, EAttribute, EReference, EPackage
 * - Pattern, PatternElement, TransformationRule (for transformations)
 * 
 * @returns The initialized Ecore package with all meta-classes
 */
export function buildEcorePackage(): EPackage {
  // Create a simplified Ecore-like meta-metamodel
  const ecorePackage: EPackage = {
    id: uuidv4(),
    name: 'Ecore',
    nsURI: 'http://www.modeling-tool.com/ecore',
    nsPrefix: 'ecore',
    classes: []
  };

  // Create the EClass for classes
  const eClassId = uuidv4();
  const eClass: EClass = {
    id: eClassId,
    name: 'EClass',
    abstract: false,
    superTypes: [],
    attributes: [],
    references: []
  };

  // Create the EClass for attributes
  const eAttributeId = uuidv4();
  const eAttribute: EClass = {
    id: eAttributeId,
    name: 'EAttribute',
    abstract: false,
    superTypes: [],
    attributes: [],
    references: []
  };

  // Create the EClass for references
  const eReferenceId = uuidv4();
  const eReference: EClass = {
    id: eReferenceId,
    name: 'EReference',
    abstract: false,
    superTypes: [],
    attributes: [],
    references: []
  };

  // Create the EClass for packages
  const ePackageId = uuidv4();
  const ePackage: EClass = {
    id: ePackageId,
    name: 'EPackage',
    abstract: false,
    superTypes: [],
    attributes: [],
    references: []
  };
  
  // Create the EClass for transformation patterns
  const patternId = uuidv4();
  const pattern: EClass = {
    id: patternId,
    name: 'Pattern',
    abstract: false,
    superTypes: [],
    attributes: [],
    references: []
  };
  
  // Create the EClass for pattern elements
  const patternElementId = uuidv4();
  const patternElement: EClass = {
    id: patternElementId,
    name: 'PatternElement',
    abstract: false,
    superTypes: [],
    attributes: [],
    references: []
  };
  
  // Create the EClass for transformation rules
  const transformationRuleId = uuidv4();
  const transformationRule: EClass = {
    id: transformationRuleId,
    name: 'TransformationRule',
    abstract: false,
    superTypes: [],
    attributes: [],
    references: []
  };

  // Add attributes to EClass
  eClass.attributes.push({
    id: uuidv4(),
    name: 'name',
    type: 'string',
    required: true,
    many: false
  });

  eClass.attributes.push({
    id: uuidv4(),
    name: 'abstract',
    type: 'boolean',
    defaultValue: false,
    required: false,
    many: false
  });

  // Add references to EClass (for superTypes and attributes)
  eClass.references.push({
    id: uuidv4(),
    name: 'superTypes',
    type: eClassId, // References itself
    containment: false,
    lowerBound: 0,
    upperBound: '*'
  });

  eClass.references.push({
    id: uuidv4(),
    name: 'attributes',
    type: eAttributeId,
    containment: true,
    lowerBound: 0,
    upperBound: '*'
  });

  eClass.references.push({
    id: uuidv4(),
    name: 'references',
    type: eReferenceId,
    containment: true,
    lowerBound: 0,
    upperBound: '*'
  });

  // Add attributes to EAttribute
  eAttribute.attributes.push({
    id: uuidv4(),
    name: 'name',
    type: 'string',
    required: true,
    many: false
  });

  eAttribute.attributes.push({
    id: uuidv4(),
    name: 'type',
    type: 'string',
    required: true,
    many: false
  });

  eAttribute.attributes.push({
    id: uuidv4(),
    name: 'defaultValue',
    type: 'string',
    required: false,
    many: false
  });

  eAttribute.attributes.push({
    id: uuidv4(),
    name: 'required',
    type: 'boolean',
    defaultValue: false,
    required: false,
    many: false
  });

  eAttribute.attributes.push({
    id: uuidv4(),
    name: 'many',
    type: 'boolean',
    defaultValue: false,
    required: false,
    many: false
  });

  // Add attributes to EReference
  eReference.attributes.push({
    id: uuidv4(),
    name: 'name',
    type: 'string',
    required: true,
    many: false
  });

  eReference.attributes.push({
    id: uuidv4(),
    name: 'containment',
    type: 'boolean',
    defaultValue: false,
    required: false,
    many: false
  });

  eReference.attributes.push({
    id: uuidv4(),
    name: 'lowerBound',
    type: 'number',
    defaultValue: 0,
    required: false,
    many: false
  });

  eReference.attributes.push({
    id: uuidv4(),
    name: 'upperBound',
    type: 'string', // Could be a number or '*'
    defaultValue: '*',
    required: false,
    many: false
  });

  // Add reference to EReference
  eReference.references.push({
    id: uuidv4(),
    name: 'type',
    type: eClassId,
    containment: false,
    lowerBound: 1,
    upperBound: 1
  });

  eReference.references.push({
    id: uuidv4(),
    name: 'opposite',
    type: eReferenceId,
    containment: false,
    lowerBound: 0,
    upperBound: 1
  });

  // Add attributes to EPackage
  ePackage.attributes.push({
    id: uuidv4(),
    name: 'name',
    type: 'string',
    required: true,
    many: false
  });

  ePackage.attributes.push({
    id: uuidv4(),
    name: 'nsURI',
    type: 'string',
    required: true,
    many: false
  });

  ePackage.attributes.push({
    id: uuidv4(),
    name: 'nsPrefix',
    type: 'string',
    required: true,
    many: false
  });

  // Add references to EPackage
  ePackage.references.push({
    id: uuidv4(),
    name: 'classes',
    type: eClassId,
    containment: true,
    lowerBound: 0,
    upperBound: '*'
  });
  
  // Add attributes to Pattern
  pattern.attributes.push({
    id: uuidv4(),
    name: 'name',
    type: 'string',
    required: true,
    many: false
  });
  
  pattern.attributes.push({
    id: uuidv4(),
    name: 'type',
    type: 'string', // 'LHS', 'RHS', or 'NAC'
    required: true,
    many: false
  });
  
  // Add references to Pattern
  pattern.references.push({
    id: uuidv4(),
    name: 'elements',
    type: patternElementId,
    containment: true,
    lowerBound: 0,
    upperBound: '*'
  });
  
  // Add attributes to PatternElement
  patternElement.attributes.push({
    id: uuidv4(),
    name: 'name',
    type: 'string',
    required: true,
    many: false
  });
  
  // Add references to PatternElement
  patternElement.references.push({
    id: uuidv4(),
    name: 'type',
    type: eClassId,
    containment: false,
    lowerBound: 1,
    upperBound: 1
  });
  
  patternElement.references.push({
    id: uuidv4(),
    name: 'attributes',
    type: eAttributeId,
    containment: true,
    lowerBound: 0,
    upperBound: '*'
  });
  
  patternElement.references.push({
    id: uuidv4(),
    name: 'references',
    type: eReferenceId,
    containment: true,
    lowerBound: 0,
    upperBound: '*'
  });
  
  // Add attributes to TransformationRule
  transformationRule.attributes.push({
    id: uuidv4(),
    name: 'name',
    type: 'string',
    required: true,
    many: false
  });
  
  transformationRule.attributes.push({
    id: uuidv4(),
    name: 'priority',
    type: 'number',
    defaultValue: 0,
    required: false,
    many: false
  });
  
  transformationRule.attributes.push({
    id: uuidv4(),
    name: 'enabled',
    type: 'boolean',
    defaultValue: true,
    required: false,
    many: false
  });
  
  // Add references to TransformationRule
  transformationRule.references.push({
    id: uuidv4(),
    name: 'lhs',
    type: patternId,
    containment: false,
    lowerBound: 1,
    upperBound: 1
  });
  
  transformationRule.references.push({
    id: uuidv4(),
    name: 'rhs',
    type: patternId,
    containment: false,
    lowerBound: 1,
    upperBound: 1
  });
  
  transformationRule.references.push({
    id: uuidv4(),
    name: 'nacs',
    type: patternId,
    containment: false,
    lowerBound: 0,
    upperBound: '*'
  });

  // Add all classes to the package
  ecorePackage.classes.push(eClass);
  ecorePackage.classes.push(eAttribute);
  ecorePackage.classes.push(eReference);
  ecorePackage.classes.push(ePackage);
  ecorePackage.classes.push(pattern);
  ecorePackage.classes.push(patternElement);
  ecorePackage.classes.push(transformationRule);

  return ecorePackage;
}
