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
    nsURI: string;
    nsPrefix: string;
    classes: EClass[];
}
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
export interface MetamodelElement {
    id: string;
    name: string;
    eClass: string;
}
export interface MetaClass extends MetamodelElement {
    abstract: boolean;
    superTypes: string[];
    attributes: MetaAttribute[];
    references: MetaReference[];
    position?: {
        x: number;
        y: number;
    };
    constraints?: Constraint[];
}
export interface MetaAttribute extends MetamodelElement {
    type: 'string' | 'number' | 'boolean' | 'date';
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
    isMultiValued?: boolean;
    isInherited?: boolean;
    inheritedFrom?: string;
}
export interface Metamodel extends MetamodelElement {
    uri: string;
    prefix: string;
    classes: MetaClass[];
    conformsTo: string;
    constraints?: Constraint[];
}
export interface ModelElement {
    id: string;
    name?: string;
    type?: string;
    modelElementId: string;
    style: Record<string, any>;
    references: Record<string, string | string[] | null>;
}
export interface ModelConnection {
    id: string;
    sourceId: string;
    targetId: string;
    type?: string;
}
export interface Model {
    id: string;
    name: string;
    metamodelId: string;
    elements: ModelElement[];
    connections?: ModelConnection[];
    conformsTo: string;
}
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
    style: Record<string, any>;
    referenceAttributes?: Record<string, any>;
    points?: Array<{
        x: number;
        y: number;
    }>;
}
export interface GridSettings {
    sizeX: number;
    sizeY: number;
}
export interface Diagram {
    id: string;
    name: string;
    modelId: string;
    elements: DiagramElement[];
    gridSettings?: GridSettings;
}
export type PatternType = 'LHS' | 'RHS' | 'NAC';
export interface PatternElement {
    id: string;
    name: string;
    type: string;
    attributes?: Record<string, string | Expression>;
    position?: {
        x: number;
        y: number;
    };
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
    id: string;
    name: string;
    description?: string;
    lhs: string;
    rhs: string;
    nacs: string[];
    conditions?: string[];
    priority: number;
    enabled: boolean;
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
export interface CodeGenerationTemplate {
    id: string;
    name: string;
    language: 'java' | 'python';
    templateContent: string;
    targetMetamodelId: string;
    outputPattern: string;
}
export interface CodeGenerationProject {
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
    testedMetaClasses: {
        id: string;
        name: string;
    }[];
    untestedMetaClasses: {
        id: string;
        name: string;
    }[];
}
export interface TestGenerationOptions {
    includeAttributeTests: boolean;
    includeReferenceTests: boolean;
    includeConstraintTests: boolean;
    testCasesPerAttribute: number;
    testCasesPerReference: number;
    testCasesPerConstraint: number;
}
export type FileType = 'image' | 'model' | 'other';
export interface StoredFile {
    id: string;
    filename: string;
    mimetype: string;
    size: number;
    type: FileType;
    data?: string;
    metadata?: Record<string, any>;
    createdAt?: Date | string;
    updatedAt?: Date | string;
}
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
export declare enum ExpressionType {
    LITERAL = "LITERAL",
    REFERENCE = "REFERENCE",
    OPERATION = "OPERATION",
    COMPOUND = "COMPOUND"
}
export declare enum ExpressionOperator {
    ADD = "ADD",
    SUBTRACT = "SUBTRACT",
    MULTIPLY = "MULTIPLY",
    DIVIDE = "DIVIDE",
    INCREMENT = "INCREMENT",
    DECREMENT = "DECREMENT",
    EQUALS = "EQUALS",
    NOT_EQUALS = "NOT_EQUALS",
    GREATER_THAN = "GREATER_THAN",
    LESS_THAN = "LESS_THAN",
    GREATER_EQUALS = "GREATER_EQUALS",
    LESS_EQUALS = "LESS_EQUALS",
    AND = "AND",
    OR = "OR",
    NOT = "NOT"
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
export interface CreateMetamodelRequest {
    name: string;
    uri: string;
    prefix: string;
    conformsTo: string;
    classes?: MetaClass[];
    constraints?: Constraint[];
}
export interface UpdateMetamodelRequest {
    name?: string;
    uri?: string;
    prefix?: string;
    classes?: MetaClass[];
    constraints?: Constraint[];
}
export interface CreateModelRequest {
    name: string;
    metamodelId: string;
    conformsTo: string;
    elements?: ModelElement[];
    connections?: ModelConnection[];
}
export interface UpdateModelRequest {
    name?: string;
    elements?: ModelElement[];
    connections?: ModelConnection[];
}
export interface CreateDiagramRequest {
    name: string;
    modelId: string;
    elements?: DiagramElement[];
    gridSettings?: GridSettings;
}
export interface UpdateDiagramRequest {
    name?: string;
    elements?: DiagramElement[];
    gridSettings?: GridSettings;
}
export interface CreatePatternRequest {
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
//# sourceMappingURL=index.d.ts.map