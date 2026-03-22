// Types for Meta-metamodel (similar to Ecore/MOF)

export interface MetaMetaElement {
  id: string;
  name: string;
}

export interface EClass extends MetaMetaElement {
  abstract: boolean;
  superTypes: string[]; // IDs of parent EClasses
  attributes: EAttribute[];
  references: EReference[];
}

export interface EAttribute extends MetaMetaElement {
  type: 'string' | 'number' | 'boolean' | 'date';
  defaultValue?: any;
  required?: boolean;
  many: boolean; // For collection attributes
}

export interface EReference extends MetaMetaElement {
  type: string; // ID of target EClass
  containment: boolean;
  opposite?: string; // ID of opposite reference (bidirectional)
  lowerBound: number;
  upperBound: number | '*';
  allowSelfReference?: boolean; // Whether this reference can target its own source
  attributes?: EAttribute[]; // Reference can have attributes (new)
}

export interface EPackage extends MetaMetaElement {
  nsURI: string;
  nsPrefix: string;
  classes: EClass[];
}

// Transformation-specific Meta-metamodel extensions
export interface TransformationMetaModel extends MetaMetaElement {
  patterns: PatternMetaModel[];
  rules: TransformationRuleMetaModel[];
}

export interface PatternMetaModel extends MetaMetaElement {
  type: 'LHS' | 'RHS' | 'NAC';
  elements: PatternElementMetaModel[];
}

export interface PatternElementMetaModel extends MetaMetaElement {
  type: string; // ID of corresponding EClass
  constraints: string[]; // OCL or JavaScript constraints
}

export interface TransformationRuleMetaModel extends MetaMetaElement {
  lhs: string; // ID of LHS pattern
  rhs: string; // ID of RHS pattern
  nacs: string[]; // IDs of NAC patterns
  conditions: string[]; // Additional conditions for rule application
  priority: number; // Execution priority
}

// Types for Metamodel (instances of meta-metamodel elements)

export interface MetamodelElement {
  id: string;
  name: string;
  eClass: string; // ID of corresponding EClass in meta-metamodel
}

// OCL Constraint interface for metamodel elements
export interface OCLConstraint {
  id: string;
  name: string;
  contextClassName: string; // Name of the metaclass this constraint applies to
  contextClassId: string;   // ID of the metaclass this constraint applies to
  expression: string;       // The OCL expression text
  description?: string;     // Optional description explaining the constraint
  isValid: boolean;         // Whether the constraint syntax is valid
  errorMessage?: string;    // Error message if constraint is invalid
  severity: 'error' | 'warning' | 'info'; // Severity level of the constraint
  type: 'ocl';             // Type of constraint (MUST be 'ocl')
}

// JavaScript Constraint interface for metamodel elements
export interface JSConstraint {
  id: string;
  name: string;
  contextClassName: string;
  contextClassId: string;
  expression: string;       // The JavaScript expression text
  description?: string;
  isValid: boolean;
  errorMessage?: string;
  severity: 'error' | 'warning' | 'info';
  type: 'javascript';       // Type of constraint to distinguish from OCL constraints
}

// Common constraint type that can be either OCL or JavaScript
export type Constraint = OCLConstraint | JSConstraint;

export interface MetaClass extends MetamodelElement {
  abstract: boolean;
  superTypes: string[]; // IDs of parent metaclasses
  attributes: MetaAttribute[];
  references: MetaReference[];
  position?: { x: number, y: number }; // For visual editor positioning
  constraints?: Constraint[]; // Both OCL and JavaScript constraints for this metaclass
}

export interface MetaAttribute extends MetamodelElement {
  type: 'string' | 'number' | 'boolean' | 'date';
  defaultValue?: any;
  required?: boolean;
  many: boolean;
  // Inheritance tracking properties
  isInherited?: boolean;
  inheritedFrom?: string; // ID of the superclass this attribute is inherited from
}

export interface MetaReference extends MetamodelElement {
  target: string; // ID of target metaclass
  containment: boolean;
  opposite?: string; // ID of opposite reference (bidirectional)
  cardinality: {
    lowerBound: number;
    upperBound: number | '*';
  };
  allowSelfReference?: boolean; // Whether this reference can target its own source
  attributes?: MetaAttribute[]; // Reference can have attributes (new)
  isMultiValued?: boolean; // Whether this reference can have multiple targets
  // Inheritance tracking properties
  isInherited?: boolean;
  inheritedFrom?: string; // ID of the superclass this reference is inherited from
}

export interface Metamodel extends MetamodelElement {
  uri: string;
  prefix: string;
  classes: MetaClass[];
  conformsTo: string; // ID of the meta-metamodel package it conforms to
  constraints?: Constraint[]; // Global OCL and JavaScript constraints for the metamodel
}

// Types for Model (instances of metamodel elements)

export interface ModelElement {
  id: string;
  name?: string;
  type?: string;
  modelElementId: string; // ID of the metaclass this element is an instance of
  style: Record<string, any>; // Values for attributes
  references: Record<string, string | string[] | null>; // References to other model elements (null for unset single refs)
}

export interface Model {
  id: string;
  name: string;
  metamodelId: string;
  elements: ModelElement[];
  connections?: Array<{
    id: string;
    sourceId: string;
    targetId: string;
    type?: string;
  }>;
  conformsTo: string; // ID of the metamodel it conforms to
}

// Types for Transformation System

export interface TransformationPattern {
  id: string;
  name: string;
  type: 'LHS' | 'RHS' | 'NAC';
  elements: PatternElement[];
  diagramId?: string; // Optional reference to diagram visualization
  globalExpression?: Expression | string; // Global expression for the pattern
  globalExpressionTarget?: string; // Target for the global expression (e.g., "elementName.attributeName")
}

export interface PatternElement {
  id: string;
  name: string;
  type: string; // ID of the metaclass this element is an instance of
  attributes?: Record<string, string | Expression>; // Values for attributes - now supporting expressions
  position?: { x: number; y: number }; // Position in the visualization
  references: Record<string, string | string[] | null>; // References to other pattern elements
  constraints?: string[]; // Additional constraints
}

export interface TransformationRule {
  id: string;
  name: string;
  description?: string;
  lhs: string; // ID of LHS pattern
  rhs: string; // ID of RHS pattern
  nacs: string[]; // IDs of NAC patterns
  conditions?: string[]; // Additional application conditions
  priority: number; // Execution priority
  enabled: boolean; // Whether the rule is enabled
}

export interface TransformationExecution {
  id: string;
  name: string;
  ruleIds: string[];
  sourceModelId: string;
  targetModelId?: string;
  resultModelId?: string;
  inPlace: boolean;
  maxIterations: number;
  strategy: 'sequential' | 'priority' | 'interactive';
  status: 'created' | 'in_progress' | 'completed' | 'failed';
  stepResults?: TransformationStep[];
}

export interface TransformationStep {
  id: string;
  ruleId: string;
  timestamp: number;
  success: boolean;
  appliedElements: string[]; // Element IDs matched by the LHS pattern
  resultElements?: string[]; // Element IDs created/modified by the RHS pattern  
  diagramElements?: string[]; // Diagram element IDs affected by the transformation
}

export interface PatternMatch {
  patternId: string; // ID of the matched pattern
  matches: {[elementId: string]: string}; // Map from pattern element ID to model element ID
  valid: boolean; // Whether the match is valid
}

// Types for Diagram (visualization of model)

export interface DiagramElement {
  id: string;
  type: 'node' | 'edge';
  modelElementId: string; // References a ModelElement
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  sourceId?: string; // For edges
  targetId?: string; // For edges
  style: Record<string, any>; // Visual styling - make it required
  referenceAttributes?: Record<string, any>; // Attributes for references (new)
  points?: Array<{x: number, y: number}>; // Control points for edge routing (new)
}

export interface Diagram {
  id: string;
  name: string;
  modelId: string; // References a Model
  elements: DiagramElement[];
  // 3D-specific settings
  gridSettings?: {
    sizeX: number; // Grid size on X axis in mm
    sizeY: number; // Grid size on Y axis in mm
  };
}

// Types for Code Generation

export interface CodeGenerationTemplate {
  id: string;
  name: string;
  language: 'java' | 'python';
  templateContent: string; // Handlebars template
  targetMetamodelId: string;
  outputPattern: string; // E.g., "{{name}}.java"
}

export interface CodeGenerationProject {
  id: string;
  name: string;
  description?: string;
  targetMetamodelId: string;
  templates: CodeGenerationTemplate[];
  createdAt: number;
  updatedAt: number;
  isExample?: boolean; // Flag to identify example projects
}

export interface CodeGenerationResult {
  filename: string;
  content: string;
}

// Types for Validation Results

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  elementId?: string; // ID of the problematic element
  location?: string; // Additional location info
  constraintId?: string; // ID of the OCL constraint that caused this issue
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

// Types for OCL Validation Results

export interface OCLValidationContext {
  metamodel: Metamodel;
  contextClass: MetaClass;
  model?: Model;
  modelElement?: ModelElement;
}

export interface OCLValidationIssue extends ValidationIssue {
  constraintId: string; // ID of the OCL constraint that caused this issue
  expression: string;   // The OCL expression that failed
}

export interface OCLValidationResult {
  valid: boolean;
  issues: OCLValidationIssue[];
}

// Types for JavaScript Validation Results

export interface JSValidationContext extends OCLValidationContext {
  // JavaScript-specific context properties can be added here
}

export interface JSValidationIssue extends ValidationIssue {
  constraintId: string; // ID of the JS constraint that caused this issue
  expression: string;   // The JS expression that failed
}

export interface JSValidationResult {
  valid: boolean;
  issues: JSValidationIssue[];
}

// New interfaces for Expression system
export interface Expression {
  type: ExpressionType;
  value: any; // Actual value or reference
  operator?: ExpressionOperator;
  leftOperand?: Expression;
  rightOperand?: Expression | null;
  references?: ElementReference[];
  isNested?: boolean;
}

export enum ExpressionType {
  LITERAL = 'LITERAL',           // Direct value (5, "hello", etc.)
  REFERENCE = 'REFERENCE',       // Reference to another element's attribute
  OPERATION = 'OPERATION',       // Mathematical/logical operation
  COMPOUND = 'COMPOUND'          // AND/OR compound expression
}

export enum ExpressionOperator {
  // Mathematical operators
  ADD = 'ADD',                   // +
  SUBTRACT = 'SUBTRACT',         // -
  MULTIPLY = 'MULTIPLY',         // *
  DIVIDE = 'DIVIDE',             // /
  INCREMENT = 'INCREMENT',       // ++
  DECREMENT = 'DECREMENT',       // --
  
  // Comparison operators
  EQUALS = 'EQUALS',             // ==
  NOT_EQUALS = 'NOT_EQUALS',     // !=
  GREATER_THAN = 'GREATER_THAN', // >
  LESS_THAN = 'LESS_THAN',       // <
  GREATER_EQUALS = 'GREATER_EQUALS', // >=
  LESS_EQUALS = 'LESS_EQUALS',   // <=
  
  // Logical operators
  AND = 'AND',                   // &&
  OR = 'OR',                     // ||
  NOT = 'NOT'                    // !
}

export interface ElementReference {
  elementName: string;          // Name of the referenced element (e.g., "arc")
  attributeName: string;        // Name of the referenced attribute (e.g., "weight")
} 