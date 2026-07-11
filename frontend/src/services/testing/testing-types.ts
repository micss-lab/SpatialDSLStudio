// Shared type definitions for the testing module

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
  originalInput?: any;
  expectedOutput?: any;
  actualOutput?: any;
  isOwner?: boolean; // owner/permission metadata from the API listing
  ownerEmail?: string; // creator/owner email; absent when the current user owns it
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

export interface CoverageMetric {
  name: string;
  percentage: number;
  count: number;
  total: number;
}

export interface CoverageReport {
  overallCoverage: number;
  metrics: CoverageMetric[];
  elementsCoverage: {
    covered: { id: string; name: string }[];
    notCovered: { id: string; name: string }[];
  };
  attributesCoverage: {
    covered: { id: string; className: string; name: string }[];
    notCovered: { id: string; className: string; name: string }[];
  };
  referencesCoverage: {
    covered: { id: string; className: string; name: string }[];
    notCovered: { id: string; className: string; name: string }[];
  };
  constraintsCoverage: {
    covered: { id: string; className: string; name: string; type: string }[];
    notCovered: { id: string; className: string; name: string; type: string }[];
  };
  chartData: {
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      backgroundColor: string[];
    }[];
  };
}
