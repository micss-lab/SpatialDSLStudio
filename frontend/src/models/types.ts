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
  description?: string;
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
  concreteSyntax?: ConcreteSyntax;
}

export interface MetaEnumLiteral {
  name: string;
  value?: number;
  literal?: string;
}

export interface MetaEnum extends MetamodelElement {
  literals: MetaEnumLiteral[];
}

export type MetaAttributeType = 'string' | 'number' | 'boolean' | 'date' | { enumId: string };

export interface MetaAttribute extends MetamodelElement {
  type: MetaAttributeType;
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
  concreteSyntax?: ConcreteSyntaxEdge;
  isMultiValued?: boolean; // Whether this reference can have multiple targets
  // Inheritance tracking properties
  isInherited?: boolean;
  inheritedFrom?: string; // ID of the superclass this reference is inherited from
}

export interface Metamodel extends MetamodelElement {
  uri: string;
  prefix: string;
  classes: MetaClass[];
  enums?: MetaEnum[];
  conformsTo: string; // ID of the meta-metamodel package it conforms to
  constraints?: Constraint[]; // Global OCL and JavaScript constraints for the metamodel
  isOwner?: boolean; // owner/permission metadata from the API listing
  ownerEmail?: string; // creator/owner email; absent when the current user owns it
}

export interface ConcreteSyntax2D {
  shape?: 'default' | 'square' | 'rectangle' | 'circle' | 'ellipse' | 'diamond' | 'triangle' | 'star' | 'cylinder' | 'sphere' | 'cone' | 'custom-image' | 'custom-3d-model';
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  imageFileId?: string;
  imageUrl?: string;
  imageSrc?: string;
  fontSize?: number;
  fontFamily?: string;
  fontColor?: string;
  defaultSize?: { width: number; height: number };
}

export interface ConcreteSyntax3D {
  modelFileId?: string;
  modelUrl?: string;
  modelSrc?: string;
  fallbackShape?: 'box' | 'sphere' | 'cylinder';
  fallbackColor?: string;
  defaultSizeMm?: { widthMm: number; heightMm: number; depthMm: number };
}

export interface ConcreteSyntaxEdge {
  lineColor?: string;
  lineWidth?: number;
  lineDash?: number[];
  arrowHead?: 'none' | 'open' | 'filled' | 'diamond';
  labelFormat?: string;
}

export interface ConcreteSyntax {
  two_d?: ConcreteSyntax2D;
  three_d?: ConcreteSyntax3D;
}

// Viewpoint and representation specification types

export type RepresentationKind = 'diagram' | 'table' | 'tree';

export interface ToolDefinition {
  id: string;
  name: string;
  type?: string;
  metaClassId?: string;
  referenceId?: string;
  payload?: Record<string, any>;
}

export interface RepresentationEdgeMapping {
  id: string;
  referenceId?: string;
  referenceName?: string;
  sourceMetaClassIds?: string[];
  targetMetaClassIds?: string[];
  concreteSyntax?: ConcreteSyntaxEdge;
}

export interface RepresentationPinMapping {
  id: string;
  pinMetaClassIds: string[];
  ownerMetaClassIds: string[];
  attachmentReferenceName?: string;
  direction?: 'input' | 'output' | 'inout';
  allowedSides?: Array<'top' | 'right' | 'bottom' | 'left'>;
  defaultSide?: 'top' | 'right' | 'bottom' | 'left';
  defaultOffsetRatio?: number;
}

export interface RepresentationDescription {
  id: string;
  name: string;
  description?: string;
  viewpointId: string;
  kind: RepresentationKind;
  visibleMetaClassIds: string[];
  creatableMetaClassIds: string[];
  concreteSyntaxByMetaClassId?: Record<string, ConcreteSyntax>;
  concreteSyntaxByReferenceId?: Record<string, ConcreteSyntaxEdge>;
  edgeMappings?: RepresentationEdgeMapping[];
  pinMappings?: RepresentationPinMapping[];
  toolDefinitions?: ToolDefinition[];
  isDefault?: boolean;
}

export interface Viewpoint {
  id: string;
  name: string;
  description?: string;
  metamodelId: string;
  representationDescriptions: RepresentationDescription[];
  sharedConcreteSyntaxByMetaClassId?: Record<string, ConcreteSyntax>;
  isDefault?: boolean;
  isOwner?: boolean; // owner/permission metadata from the API listing
  ownerEmail?: string; // creator/owner email; absent when the current user owns it
}

// Sirius Desktop interoperability types

export type SiriusSourceFormat = 'ecore' | 'xmi' | 'odesign' | 'aird' | 'project-zip';

export type SiriusTargetFormat = 'spatialdsl' | 'sirius-project';

export interface SiriusInteropWarning {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  sourcePath?: string;
  sourceElementId?: string;
  spatialElementId?: string;
}

export interface SiriusCompatibilityReport {
  sourceFormat: SiriusSourceFormat;
  targetFormat: SiriusTargetFormat;
  supported: boolean;
  warnings: SiriusInteropWarning[];
  droppedFeatures: SiriusInteropWarning[];
  unresolvedReferences: SiriusInteropWarning[];
}

export interface SiriusImportOptions {
  importEcore: boolean;
  importXmi: boolean;
  importOdesign: boolean;
  importAird: boolean;
  failOnUnsupportedFeatures: boolean;
  preserveSiriusIds: boolean;
}

export interface SiriusExportOptions {
  includeEcore: boolean;
  includeXmi: boolean;
  includeOdesign: boolean;
  includeAird: boolean;
  includeSpatialDslSidecar: boolean;
  failOnUnsupportedFeatures: boolean;
}

export interface SiriusOdesignPreview {
  groupName?: string;
  viewpoints: Viewpoint[];
  report: SiriusCompatibilityReport;
}

export interface SiriusImportResult {
  viewpoints: Viewpoint[];
  report: SiriusCompatibilityReport;
}

export interface SiriusAirdDiagramPreview {
  name: string;
  modelId: string;
  viewpointId?: string;
  representationDescriptionId?: string;
  elements: DiagramElement[];
  sourceRepresentationId?: string;
}

export interface SiriusAirdPreview {
  diagrams: SiriusAirdDiagramPreview[];
  report: SiriusCompatibilityReport;
}

export interface SiriusAirdImportResult {
  diagrams: Diagram[];
  report: SiriusCompatibilityReport;
}

export interface SiriusExportResult {
  filename: string;
  content: string;
  report: SiriusCompatibilityReport;
}

// Types for Model (instances of metamodel elements)

export interface ModelElement {
  id: string;
  name?: string;
  type?: string;
  modelElementId: string; // ID of the metaclass this element is an instance of
  style: Record<string, any>; // Values for attributes
  references: Record<string, string | string[] | null>; // References to other model elements (null for unset single refs)
  presentation?: ModelElementPresentation;
}

export interface ModelElementPresentation {
  position2D?: { x: number; y: number };
  position3D?: { x: number; y: number };
  size2D?: { width: number; height: number };
  size3D?: { widthMm: number; heightMm: number; depthMm: number };
  rotationZ?: number;
  appearance?: Record<string, any>;
  attachedToElementId?: string;
  attachmentSide?: 'top' | 'right' | 'bottom' | 'left';
  attachmentOffsetRatio?: number;
}

export interface Model {
  id: string;
  name: string;
  description?: string;
  metamodelId: string;
  elements: ModelElement[];
  connections?: ModelConnection[];
  conformsTo: string; // ID of the metamodel it conforms to
  isOwner?: boolean; // owner/permission metadata from the API listing
  ownerEmail?: string; // creator/owner email; absent when the current user owns it
}

export interface ModelConnection {
  id: string;
  sourceId: string;
  targetId: string;
  referenceId?: string;
  referenceName?: string;
  type?: string;
  attributes?: Record<string, any>;
  bendPoints2D?: Array<{ x: number; y: number }>;
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
  isOwner?: boolean; // owner/permission metadata from the API listing
  ownerEmail?: string; // creator/owner email; absent when the current user owns it
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
  description?: string;
  modelId: string; // References a Model
  viewpointId?: string;
  representationDescriptionId?: string;
  elements: DiagramElement[];
  includedElementIds?: string[];
  // 3D-specific settings
  gridSettings?: {
    sizeX: number; // Grid size on X axis in mm
    sizeY: number; // Grid size on Y axis in mm
  };
  schemaVersion?: number;
  migrationWarnings?: string[];
  isOwner?: boolean; // owner/permission metadata from the API listing
  ownerEmail?: string; // creator/owner email; absent when the current user owns it
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
  isOwner?: boolean; // owner/permission metadata from the API listing
  ownerEmail?: string; // creator/owner email; absent when the current user owns it
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
