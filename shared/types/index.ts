// ===========================================
// Shared Types between Frontend and Backend
// ===========================================
// This file contains all the TypeScript interfaces
// that are shared between the frontend and backend.
// ===========================================

// ============ Role-Based Access Control Types ============

export type UserRole = 'ADMIN' | 'DSL_DESIGNER' | 'MODELER' | 'VIEWER';

export type ResourceType = 
  | 'METAMODEL' 
  | 'MODEL' 
  | 'DIAGRAM' 
  | 'TRANSFORMATION_RULE' 
  | 'CODEGEN_PROJECT' 
  | 'TEST_CASE';

export type SharePermission = 'VIEWER' | 'EDITOR';

// Project roles are intentionally separate from the platform-wide UserRole.
// ADMIN remains a platform concern; content authority comes from membership.
export type ProjectRole = 'OWNER' | 'DSL_DESIGNER' | 'MODELER' | 'VIEWER';
export type ProjectStatus = 'ACTIVE' | 'ARCHIVED';

export type ProjectCapability =
  | 'project.read'
  | 'project.settings.update'
  | 'project.members.manage'
  | 'project.archive'
  | 'metamodel.create'
  | 'metamodel.update'
  | 'metamodel.delete'
  | 'viewpoint.create'
  | 'viewpoint.update'
  | 'viewpoint.delete'
  | 'model.create'
  | 'model.update'
  | 'model.delete'
  | 'view.create'
  | 'view.update'
  | 'view.delete'
  | 'transformation.author'
  | 'transformation.execute'
  | 'codegen.author'
  | 'codegen.execute'
  | 'test.author'
  | 'test.execute'
  | 'checkpoint.create'
  | 'checkpoint.restore'
  | 'metamodel.evolve'
  | 'pipeline.execute';

export interface ProjectArtifactCounts {
  metamodels: number;
  viewpoints: number;
  models: number;
  views: number;
  transformations: number;
  generatorConfigurations: number;
  tests: number;
  files: number;
}

export interface ProjectMember {
  id: string;
  userId: string;
  email: string;
  role: ProjectRole;
  createdAt: string;
}

export interface StudioProject {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  ownerId: string;
  ownerEmail: string;
  role: ProjectRole;
  isPlatformAdmin: boolean;
  capabilities: ProjectCapability[];
  memberCount: number;
  artifactCounts?: ProjectArtifactCounts;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStudioProjectRequest {
  name: string;
  description?: string;
}

export interface UpdateStudioProjectRequest {
  name?: string;
  description?: string;
}

export interface AddProjectMemberRequest {
  email: string;
  role: Exclude<ProjectRole, 'OWNER'>;
}

export interface UpdateProjectMemberRequest {
  role: Exclude<ProjectRole, 'OWNER'>;
}

// ============ Versioned MDE Lifecycle Types ============

export type ProjectArtifactType =
  | 'epackage'
  | 'metamodel'
  | 'viewpoint'
  | 'model'
  | 'view'
  | 'transformation'
  | 'generator'
  | 'test'
  | 'file';

export interface ProjectArtifactRef {
  type: ProjectArtifactType;
  id: string;
}

export interface ProjectArtifactSnapshot extends ProjectArtifactRef {
  name: string;
  contentHash: string;
  dependencies: ProjectArtifactRef[];
  data: Record<string, any>;
}

export interface ProjectArtifactManifest {
  schemaVersion: 1;
  projectId: string;
  project: { name: string; description?: string };
  artifacts: ProjectArtifactSnapshot[];
  contentHash: string;
}

export interface ProjectCheckpoint {
  id: string;
  projectId: string;
  sequence: number;
  tag?: string;
  message?: string;
  contentHash: string;
  manifest?: ProjectArtifactManifest;
  createdById: string;
  createdAt: string;
}

export interface ProjectCheckpointDiff {
  fromHash: string;
  toHash: string;
  added: ProjectArtifactRef[];
  removed: ProjectArtifactRef[];
  changed: ProjectArtifactRef[];
  unchanged: number;
}

export type MetamodelEvolutionChangeKind =
  | 'class-added'
  | 'class-removed'
  | 'class-renamed'
  | 'attribute-added'
  | 'attribute-removed'
  | 'attribute-renamed'
  | 'attribute-type-changed'
  | 'attribute-cardinality-changed'
  | 'reference-added'
  | 'reference-removed'
  | 'reference-renamed'
  | 'reference-target-changed'
  | 'reference-cardinality-changed';

export interface MetamodelEvolutionChange {
  kind: MetamodelEvolutionChangeKind;
  classId: string;
  featureId?: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
  breaking: boolean;
}

export interface MetamodelEvolutionImpact {
  artifact: ProjectArtifactRef;
  reasons: string[];
  affectedElementIds?: string[];
}

export interface MetamodelEvolutionReport {
  metamodelId: string;
  sourceHash: string;
  targetHash: string;
  changes: MetamodelEvolutionChange[];
  impacts: MetamodelEvolutionImpact[];
  blockers: string[];
  warnings: string[];
}

export interface MetamodelMigrationRule {
  kind: 'rename-attribute' | 'remove-attribute' | 'remove-class';
  classId: string;
  fromName?: string;
  toName?: string;
  featureId?: string;
  deleteInstances?: boolean;
}

export interface ApplyMetamodelEvolutionRequest {
  nextMetamodel: Metamodel;
  expectedSourceHash: string;
  rules?: MetamodelMigrationRule[];
  checkpointTag?: string;
  message?: string;
}

export interface MetamodelMigrationResult {
  id: string;
  projectId: string;
  metamodelId: string;
  sourceCheckpointId: string;
  sourceHash: string;
  targetHash: string;
  status: 'APPLIED' | 'FAILED';
  report: MetamodelEvolutionReport;
  migratedModels: Array<{ modelId: string; changedElements: number; deletedElements: number }>;
  createdAt: string;
  appliedAt?: string;
}

export type HeadlessPipelineStep =
  | { id: string; kind: 'validate-model'; modelId: string }
  | { id: string; kind: 'generate'; modelId: string; codegenProjectId: string }
  | { id: string; kind: 'run-tests'; modelId: string }
  | { id: string; kind: 'apply-transformation'; modelId: string; ruleId: string; maxIterations?: number };

export interface HeadlessPipelineDefinition {
  name: string;
  checkpointTag?: string;
  steps: HeadlessPipelineStep[];
}

export interface HeadlessPipelineStepResult {
  stepId: string;
  kind: HeadlessPipelineStep['kind'];
  status: 'SUCCEEDED' | 'FAILED';
  output?: Record<string, any>;
  error?: string;
}

export interface HeadlessPipelineRun {
  id: string;
  projectId: string;
  name: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  definition: HeadlessPipelineDefinition;
  sourceCheckpointId?: string;
  contentHash?: string;
  results: HeadlessPipelineStepResult[];
  failureMessage?: string;
  createdById: string;
  createdAt: string;
  startedAt: string;
  completedAt?: string;
}

export interface SharedResource {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  permission: SharePermission;
  ownerId: string;
  ownerEmail?: string;
  sharedWithId: string;
  sharedWithEmail?: string;
  createdAt?: string;
}

export interface ShareRequest {
  email: string;
  permission: SharePermission;
}

export interface ResourceWithPermission {
  isOwner: boolean;
  permission?: SharePermission;
  ownerEmail?: string;
}

// ============ Meta-metamodel Types ============

export interface MetaMetaElement {
  id: string;
  name: string;
}

export interface EClass extends MetaMetaElement {
  abstract: boolean;
  superTypes: string[];
  attributes: EAttribute[];
  references: EReference[];
}

export interface EAttribute extends MetaMetaElement {
  type: 'string' | 'number' | 'boolean' | 'date';
  defaultValue?: any;
  required?: boolean;
  many: boolean;
}

export interface EReference extends MetaMetaElement {
  type: string;
  containment: boolean;
  opposite?: string;
  lowerBound: number;
  upperBound: number | '*';
  allowSelfReference?: boolean;
  attributes?: EAttribute[];
}

export interface EPackage extends MetaMetaElement {
  projectId?: string;
  nsURI: string;
  nsPrefix: string;
  classes: EClass[];
}

// ============ Constraint Types ============

export interface OCLConstraint {
  id: string;
  name: string;
  contextClassName: string;
  contextClassId: string;
  expression: string;
  description?: string;
  isValid: boolean;
  errorMessage?: string;
  severity: 'error' | 'warning' | 'info';
  type: 'ocl';
}

export interface JSConstraint {
  id: string;
  name: string;
  contextClassName: string;
  contextClassId: string;
  expression: string;
  description?: string;
  isValid: boolean;
  errorMessage?: string;
  severity: 'error' | 'warning' | 'info';
  type: 'javascript';
}

export type Constraint = OCLConstraint | JSConstraint;

// ============ Metamodel Types ============

export interface MetamodelElement {
  id: string;
  name: string;
  description?: string;
  eClass: string;
}

export interface MetaClass extends MetamodelElement {
  abstract: boolean;
  superTypes: string[];
  attributes: MetaAttribute[];
  references: MetaReference[];
  position?: { x: number; y: number };
  constraints?: Constraint[];
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
  isInherited?: boolean;
  inheritedFrom?: string;
}

export interface MetaReference extends MetamodelElement {
  target: string;
  containment: boolean;
  opposite?: string;
  cardinality: {
    lowerBound: number;
    upperBound: number | '*';
  };
  allowSelfReference?: boolean;
  attributes?: MetaAttribute[];
  concreteSyntax?: ConcreteSyntaxEdge;
  isMultiValued?: boolean;
  isInherited?: boolean;
  inheritedFrom?: string;
}

export interface Metamodel extends MetamodelElement {
  projectId?: string;
  uri: string;
  prefix: string;
  classes: MetaClass[];
  enums?: MetaEnum[];
  conformsTo: string;
  constraints?: Constraint[];
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

/**
 * Representation-level authoring policy for the base elevation of a 3D item.
 * A missing policy is interpreted as grounded for backwards compatibility.
 */
export interface VerticalPlacement3D {
  mode: 'grounded' | 'adjustable';
  defaultBaseZMm?: number;
  minBaseZMm?: number;
  maxBaseZMm?: number;
  stepMm?: number;
}

export interface ConcreteSyntax3D {
  modelFileId?: string;
  modelUrl?: string;
  modelSrc?: string;
  fallbackShape?: 'box' | 'sphere' | 'cylinder';
  fallbackColor?: string;
  defaultSizeMm?: { widthMm: number; heightMm: number; depthMm: number };
  verticalPlacement?: VerticalPlacement3D;
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

// ============ Viewpoint / Representation Specification Types ============

export type RepresentationKind = 'diagram' | 'table' | 'tree';

export type ToolOperationValue = string | number | boolean | null;

export interface SetAttributeToolOperation {
  type: 'set-attribute';
  attributeName: string;
  value: ToolOperationValue;
}

export type ToolOperation = SetAttributeToolOperation;

export interface ToolDefinitionPayload {
  operations?: ToolOperation[];
  sourcePath?: string;
  [key: string]: unknown;
}

export interface ToolDefinition {
  id: string;
  name: string;
  type?: string;
  metaClassId?: string;
  referenceId?: string;
  payload?: ToolDefinitionPayload;
}

export interface RepresentationEdgeMapping {
  id: string;
  referenceId?: string;
  referenceName?: string;
  sourceMetaClassIds?: string[];
  targetMetaClassIds?: string[];
  concreteSyntax?: ConcreteSyntaxEdge;
}

export interface RepresentationContainerMapping {
  id: string;
  containerMetaClassId: string;
  containmentReferenceId: string;
  childMetaClassIds?: string[];
  concreteSyntax?: ConcreteSyntax;
}

export interface RepresentationPropertySection {
  id: string;
  name: string;
  metaClassIds?: string[];
  attributeNames?: string[];
  referenceNames?: string[];
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

export type RepresentationLayerMappingKind = 'node' | 'container' | 'bordered-node' | 'edge';

export interface RepresentationLayerMapping {
  id: string;
  name: string;
  kind: RepresentationLayerMappingKind;
  parentMappingId?: string;
  metaClassId?: string;
  referenceId?: string;
  semanticCandidatesExpression?: string;
  targetFinderExpression?: string;
  concreteSyntax?: ConcreteSyntax;
  edgeConcreteSyntax?: ConcreteSyntaxEdge;
}

export interface RepresentationLayer {
  id: string;
  name: string;
  label?: string;
  optional?: boolean;
  activeByDefault?: boolean;
  enabled?: boolean;
  mappings?: RepresentationLayerMapping[];
}

export type RepresentationConditionalStyleMappingKind = 'node' | 'container' | 'bordered-node' | 'edge';

export interface RepresentationConditionalStyle {
  id: string;
  mappingId: string;
  mappingKind: RepresentationConditionalStyleMappingKind;
  metaClassId?: string;
  referenceId?: string;
  predicateExpression: string;
  enabled?: boolean;
  concreteSyntax?: ConcreteSyntax;
  edgeConcreteSyntax?: ConcreteSyntaxEdge;
}

export type RepresentationFilterRuleKind = 'mapping' | 'variable';

export interface RepresentationFilterRule {
  id: string;
  kind: RepresentationFilterRuleKind;
  filterKind?: 'hide' | 'collapse';
  mappingIds?: string[];
  mappingReferences?: string[];
  semanticConditionExpression?: string;
  viewConditionExpression?: string;
}

export interface RepresentationFilter {
  id: string;
  name: string;
  enabled?: boolean;
  rules: RepresentationFilterRule[];
}

export interface RepresentationDescription {
  id: string;
  name: string;
  description?: string;
  viewpointId: string;
  kind: RepresentationKind;
  visibleMetaClassIds: string[];
  creatableMetaClassIds: string[];
  tableColumns?: string[];
  concreteSyntaxByMetaClassId?: Record<string, ConcreteSyntax>;
  concreteSyntaxByReferenceId?: Record<string, ConcreteSyntaxEdge>;
  containerMappings?: RepresentationContainerMapping[];
  propertySections?: RepresentationPropertySection[];
  edgeMappings?: RepresentationEdgeMapping[];
  pinMappings?: RepresentationPinMapping[];
  layers?: RepresentationLayer[];
  filters?: RepresentationFilter[];
  conditionalStyles?: RepresentationConditionalStyle[];
  toolDefinitions?: ToolDefinition[];
  isDefault?: boolean;
}

export interface Viewpoint {
  projectId?: string;
  id: string;
  name: string;
  description?: string;
  metamodelId: string;
  representationDescriptions: RepresentationDescription[];
  sharedConcreteSyntaxByMetaClassId?: Record<string, ConcreteSyntax>;
  isDefault?: boolean;
}

// ============ Model Types ============

export interface ModelElement {
  id: string;
  name?: string;
  type?: string;
  modelElementId: string;
  style: Record<string, any>;
  references: Record<string, string | string[] | null>;
  presentation?: ModelElementPresentation;
}

/** Right-handed, Z-up domain position in millimetres. Z is base elevation. */
export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface Size3D {
  /** Domain X extent in millimetres. */
  widthMm: number;
  /** Domain Y extent in millimetres. */
  heightMm: number;
  /** Domain Z extent in millimetres. */
  depthMm: number;
}

export interface ModelElementPresentation {
  position2D?: { x: number; y: number };
  position3D?: Position3D;
  size2D?: { width: number; height: number };
  size3D?: Size3D;
  rotationZ?: number;
  appearance?: Record<string, any>;
  attachedToElementId?: string;
  attachmentSide?: 'top' | 'right' | 'bottom' | 'left';
  attachmentOffsetRatio?: number;
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

export interface Model {
  projectId?: string;
  id: string;
  name: string;
  description?: string;
  metamodelId: string;
  elements: ModelElement[];
  connections?: ModelConnection[];
  conformsTo: string;
}

// ============ Diagram Types ============

export interface DiagramElement {
  id: string;
  type: 'node' | 'edge';
  modelElementId: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  sourceId?: string;
  targetId?: string;
  parentId?: string;
  containerMappingId?: string;
  style: Record<string, any>;
  referenceAttributes?: Record<string, any>;
  points?: Array<{ x: number; y: number }>;
}

export interface GridSettings {
  sizeX: number;
  sizeY: number;
}

export interface Diagram {
  projectId?: string;
  id: string;
  name: string;
  description?: string;
  modelId: string;
  viewpointId?: string;
  representationDescriptionId?: string;
  elements: DiagramElement[];
  includedElementIds?: string[];
  gridSettings?: GridSettings;
  schemaVersion?: number;
  migrationWarnings?: string[];
}

// ============ Transformation Types ============

export type PatternType = 'LHS' | 'RHS' | 'NAC';

export interface PatternElement {
  id: string;
  name: string;
  type: string;
  attributes?: Record<string, string | Expression>;
  position?: { x: number; y: number };
  references: Record<string, string | string[] | null>;
  constraints?: string[];
}

export interface TransformationPattern {
  id: string;
  name: string;
  type: PatternType;
  elements: PatternElement[];
  diagramId?: string;
  globalExpression?: Expression | string;
  globalExpressionTarget?: string;
}

export interface TransformationRule {
  projectId?: string;
  id: string;
  name: string;
  description?: string;
  lhs: string;
  rhs: string;
  nacs: string[];
  conditions?: string[];
  priority: number;
  enabled: boolean;
  // Optional embedded pattern data for convenience
  lhsPattern?: TransformationPattern;
  rhsPattern?: TransformationPattern;
  nacPatterns?: TransformationPattern[];
}

export type TransformationStrategy = 'sequential' | 'priority' | 'interactive';
export type TransformationStatus = 'created' | 'in_progress' | 'completed' | 'failed';

export interface TransformationStep {
  id: string;
  ruleId: string;
  timestamp: number;
  success: boolean;
  appliedElements: string[];
  resultElements?: string[];
  diagramElements?: string[];
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
  strategy: TransformationStrategy;
  status: TransformationStatus;
  stepResults?: TransformationStep[];
}

// ============ Code Generation Types ============

export interface CodeGenerationTemplate {
  id: string;
  name: string;
  language: 'java' | 'python' | 'json' | 'xml' | 'plaintext';
  templateContent: string;
  targetMetamodelId: string;
  outputPattern: string;
}

export interface CodeGenerationProject {
  projectId?: string;
  id: string;
  name: string;
  description?: string;
  targetMetamodelId: string;
  templates: CodeGenerationTemplate[];
  createdAt: number;
  updatedAt: number;
  isExample?: boolean;
}

export interface CodeGenerationResult {
  filename: string;
  content: string;
}

// ============ Test Types ============

export type TestCaseType = 'attribute' | 'reference' | 'constraint' | 'reference_attribute';
export type TestCaseStatus = 'pending' | 'running' | 'passed' | 'failed';
export type ConstraintType = 'ocl' | 'javascript';

export interface TestValue {
  id: string;
  value: any;
  expected: boolean;
  result?: boolean;
  errorMessage?: string;
  description?: string;
}

export interface TestCase {
  projectId?: string;
  modelId?: string;
  id: string;
  name: string;
  description: string;
  type: TestCaseType;
  targetMetaClassId: string;
  targetMetaClassName: string;
  targetProperty?: string;
  testValues: TestValue[];
  constraintId?: string;
  constraintType?: ConstraintType;
  status: TestCaseStatus;
  errorMessage?: string;
  originalInput?: any;
  expectedOutput?: any;
  actualOutput?: any;
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

// ============ File Storage Types ============

export type FileType = 'image' | 'model' | 'other';

export interface StoredFile {
  projectId?: string;
  id: string;
  filename: string;
  mimetype: string;
  size: number;
  type: FileType;
  data?: string; // Base64 encoded for API transport
  metadata?: Record<string, any>;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

// ============ Validation Types ============

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  elementId?: string;
  location?: string;
  constraintId?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface OCLValidationIssue extends ValidationIssue {
  constraintId: string;
  expression: string;
}

export interface OCLValidationResult {
  valid: boolean;
  issues: OCLValidationIssue[];
}

// ============ Expression Types ============

export enum ExpressionType {
  LITERAL = 'LITERAL',
  REFERENCE = 'REFERENCE',
  OPERATION = 'OPERATION',
  COMPOUND = 'COMPOUND'
}

export enum ExpressionOperator {
  ADD = 'ADD',
  SUBTRACT = 'SUBTRACT',
  MULTIPLY = 'MULTIPLY',
  DIVIDE = 'DIVIDE',
  INCREMENT = 'INCREMENT',
  DECREMENT = 'DECREMENT',
  EQUALS = 'EQUALS',
  NOT_EQUALS = 'NOT_EQUALS',
  GREATER_THAN = 'GREATER_THAN',
  LESS_THAN = 'LESS_THAN',
  GREATER_EQUALS = 'GREATER_EQUALS',
  LESS_EQUALS = 'LESS_EQUALS',
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT'
}

export interface ElementReference {
  elementName: string;
  attributeName: string;
}

export interface Expression {
  type: ExpressionType;
  value: any;
  operator?: ExpressionOperator;
  leftOperand?: Expression;
  rightOperand?: Expression | null;
  references?: ElementReference[];
  isNested?: boolean;
}

// ============ API Response Types ============

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============ API Request Types ============

export interface CreateMetamodelRequest {
  id?: string; // Optional: frontend can provide ID to prevent duplicates
  name: string;
  description?: string;
  uri: string;
  prefix: string;
  conformsTo: string;
  classes?: MetaClass[];
  enums?: MetaEnum[];
  constraints?: Constraint[];
}

export interface UpdateMetamodelRequest {
  name?: string;
  description?: string;
  uri?: string;
  prefix?: string;
  classes?: MetaClass[];
  enums?: MetaEnum[];
  constraints?: Constraint[];
}

export interface CreateModelRequest {
  id?: string; // Optional: frontend can provide ID to prevent duplicates
  name: string;
  description?: string;
  metamodelId: string;
  conformsTo: string;
  elements?: ModelElement[];
  connections?: ModelConnection[];
}

export interface UpdateModelRequest {
  name?: string;
  description?: string;
  elements?: ModelElement[];
  connections?: ModelConnection[];
}

export interface CreateDiagramRequest {
  id?: string; // Optional: frontend can provide ID to prevent duplicates
  name: string;
  description?: string;
  modelId: string;
  viewpointId?: string;
  representationDescriptionId?: string;
  elements?: DiagramElement[];
  includedElementIds?: string[];
  gridSettings?: GridSettings;
}

export interface UpdateDiagramRequest {
  name?: string;
  description?: string;
  viewpointId?: string;
  representationDescriptionId?: string;
  elements?: DiagramElement[];
  includedElementIds?: string[];
  gridSettings?: GridSettings;
  schemaVersion?: number;
  migrationWarnings?: string[];
}

export interface CreateViewpointRequest {
  id?: string;
  name: string;
  description?: string;
  metamodelId: string;
  representationDescriptions?: RepresentationDescription[];
  sharedConcreteSyntaxByMetaClassId?: Record<string, ConcreteSyntax>;
  isDefault?: boolean;
}

export interface UpdateViewpointRequest {
  name?: string;
  description?: string;
  representationDescriptions?: RepresentationDescription[];
  sharedConcreteSyntaxByMetaClassId?: Record<string, ConcreteSyntax>;
  isDefault?: boolean;
}

// ============ Sirius Desktop Interoperability Types ============

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

/**
 * One Sirius diagram representation (`DSemanticDiagram`) resolved against an
 * already-imported SpatialDSL model and viewpoint, ready to be created as a View.
 */
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

export interface SiriusProjectExportResult {
  filename: string;
  /** Base64-encoded ZIP payload. */
  content: string;
  entries: string[];
  report: SiriusCompatibilityReport;
}

export interface CreatePatternRequest {
  id?: string; // Frontend-provided ID
  name: string;
  type: PatternType;
  elements?: PatternElement[];
  diagramId?: string;
  globalExpression?: Expression | string;
  globalExpressionTarget?: string;
}

export interface UpdatePatternRequest {
  name?: string;
  type?: PatternType;
  elements?: PatternElement[];
  diagramId?: string;
  globalExpression?: Expression | string;
  globalExpressionTarget?: string;
}

export interface CreateRuleRequest {
  name: string;
  description?: string;
  lhsId: string;
  rhsId: string;
  nacIds?: string[];
  conditions?: string[];
  priority?: number;
  enabled?: boolean;
}

export interface UpdateRuleRequest {
  name?: string;
  description?: string;
  lhsId?: string;
  rhsId?: string;
  nacIds?: string[];
  conditions?: string[];
  priority?: number;
  enabled?: boolean;
}

export interface CreateExecutionRequest {
  name: string;
  ruleIds: string[];
  sourceModelId: string;
  targetModelId?: string;
  inPlace?: boolean;
  maxIterations?: number;
  strategy?: TransformationStrategy;
}

export interface CreateProjectRequest {
  id?: string;
  name: string;
  description?: string;
  targetMetamodelId: string;
  templates?: CodeGenerationTemplate[];
  isExample?: boolean;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  templates?: CodeGenerationTemplate[];
}

export interface FileUploadResponse {
  id: string;
  filename: string;
  mimetype: string;
  size: number;
  type: FileType;
}
