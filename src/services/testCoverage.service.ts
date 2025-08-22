import { Metamodel, MetaClass, Model } from '../models/types';
import { TestCase, TestCoverage } from './testGeneration.service';
import { metamodelService } from './metamodel.service';
import { modelService } from './model.service';

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

class TestCoverageService {
  /**
   * Generate a detailed coverage report from test cases and a model
   */
  generateCoverageReport(modelId: string, testCases: TestCase[]): CoverageReport {
    const model = modelService.getModelById(modelId);
    if (!model) {
      throw new Error(`Model with ID ${modelId} not found`);
    }

    const metamodel = metamodelService.getMetamodelById(model.metamodelId);
    if (!metamodel) {
      throw new Error(`Metamodel with ID ${model.metamodelId} not found`);
    }

    return this.generateCoverageReportFromMetamodel(metamodel, testCases);
  }

  /**
   * Generate a detailed coverage report from test cases and a metamodel
   */
  generateCoverageReportFromMetamodel(metamodel: Metamodel, testCases: TestCase[]): CoverageReport {
    // Extract coverage information
    const { 
      elementsCoverage, 
      attributesCoverage, 
      referencesCoverage, 
      constraintsCoverage 
    } = this.extractCoverageInfo(metamodel, testCases);

    // Calculate coverage metrics
    const metrics = this.calculateCoverageMetrics(
      metamodel,
      elementsCoverage,
      attributesCoverage,
      referencesCoverage,
      constraintsCoverage
    );

    // Calculate overall coverage
    const overallCoverage = this.calculateOverallCoverage(metrics);

    // Generate chart data
    const chartData = this.generateChartData(metrics);

    return {
      overallCoverage,
      metrics,
      elementsCoverage,
      attributesCoverage,
      referencesCoverage,
      constraintsCoverage,
      chartData
    };
  }

  /**
   * Extract coverage information from test cases
   */
  private extractCoverageInfo(
    metamodel: Metamodel,
    testCases: TestCase[]
  ): {
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
  } {
    // Track covered elements, attributes, references, and constraints
    const coveredElementIds = new Set<string>();
    const coveredAttributeIds = new Set<string>();
    const coveredReferenceIds = new Set<string>();
    const coveredConstraintIds = new Set<string>();

    // Map test cases to covered items
    testCases.forEach(testCase => {
      // Track covered elements
      coveredElementIds.add(testCase.targetMetaClassId);

      // Track covered attributes
      if (testCase.type === 'attribute' && testCase.targetProperty) {
        const metaClass = metamodel.classes.find(cls => cls.id === testCase.targetMetaClassId);
        if (metaClass) {
          const attribute = metaClass.attributes.find(attr => attr.name === testCase.targetProperty);
          if (attribute) {
            coveredAttributeIds.add(attribute.id);
          }
        }
      }

      // Track covered references
      if (testCase.type === 'reference' && testCase.targetProperty) {
        const metaClass = metamodel.classes.find(cls => cls.id === testCase.targetMetaClassId);
        if (metaClass) {
          const reference = metaClass.references.find(ref => ref.name === testCase.targetProperty);
          if (reference) {
            coveredReferenceIds.add(reference.id);
          }
        }
      }

      // Track covered constraints
      if (testCase.type === 'constraint' && testCase.constraintId) {
        coveredConstraintIds.add(testCase.constraintId);
      }
    });

    // Prepare coverage data
    const elementsCoverage = {
      covered: metamodel.classes
        .filter(cls => coveredElementIds.has(cls.id))
        .map(cls => ({ id: cls.id, name: cls.name })),
      notCovered: metamodel.classes
        .filter(cls => !coveredElementIds.has(cls.id))
        .map(cls => ({ id: cls.id, name: cls.name }))
    };

    const attributesCoverage = {
      covered: [] as { id: string; className: string; name: string }[],
      notCovered: [] as { id: string; className: string; name: string }[]
    };

    const referencesCoverage = {
      covered: [] as { id: string; className: string; name: string }[],
      notCovered: [] as { id: string; className: string; name: string }[]
    };

    const constraintsCoverage = {
      covered: [] as { id: string; className: string; name: string; type: string }[],
      notCovered: [] as { id: string; className: string; name: string; type: string }[]
    };

    // Process each metaclass for attributes, references, and constraints
    metamodel.classes.forEach(cls => {
      // Process attributes
      cls.attributes.forEach(attr => {
        if (coveredAttributeIds.has(attr.id)) {
          attributesCoverage.covered.push({
            id: attr.id,
            className: cls.name,
            name: attr.name
          });
        } else {
          attributesCoverage.notCovered.push({
            id: attr.id,
            className: cls.name,
            name: attr.name
          });
        }
      });

      // Process references
      cls.references.forEach(ref => {
        if (coveredReferenceIds.has(ref.id)) {
          referencesCoverage.covered.push({
            id: ref.id,
            className: cls.name,
            name: ref.name
          });
        } else {
          referencesCoverage.notCovered.push({
            id: ref.id,
            className: cls.name,
            name: ref.name
          });
        }
      });

      // Process constraints
      if (cls.constraints) {
        cls.constraints.forEach(constraint => {
          const constraintType = 'type' in constraint ? constraint.type : 'unknown';
          if (coveredConstraintIds.has(constraint.id)) {
            constraintsCoverage.covered.push({
              id: constraint.id,
              className: cls.name,
              name: constraint.name,
              type: constraintType
            });
          } else {
            constraintsCoverage.notCovered.push({
              id: constraint.id,
              className: cls.name,
              name: constraint.name,
              type: constraintType
            });
          }
        });
      }
    });

    // Include global constraints if any
    if (metamodel.constraints) {
      metamodel.constraints.forEach(constraint => {
        const constraintType = 'type' in constraint ? constraint.type : 'unknown';
        if (coveredConstraintIds.has(constraint.id)) {
          constraintsCoverage.covered.push({
            id: constraint.id,
            className: 'Global',
            name: constraint.name,
            type: constraintType
          });
        } else {
          constraintsCoverage.notCovered.push({
            id: constraint.id,
            className: 'Global',
            name: constraint.name,
            type: constraintType
          });
        }
      });
    }

    return {
      elementsCoverage,
      attributesCoverage,
      referencesCoverage,
      constraintsCoverage
    };
  }

  /**
   * Calculate coverage metrics
   */
  private calculateCoverageMetrics(
    metamodel: Metamodel,
    elementsCoverage: { covered: any[]; notCovered: any[] },
    attributesCoverage: { covered: any[]; notCovered: any[] },
    referencesCoverage: { covered: any[]; notCovered: any[] },
    constraintsCoverage: { covered: any[]; notCovered: any[] }
  ): CoverageMetric[] {
    const metrics: CoverageMetric[] = [];

    // Calculate element coverage
    const totalElements = elementsCoverage.covered.length + elementsCoverage.notCovered.length;
    const elementsCoveragePercentage = totalElements > 0
      ? Math.round((elementsCoverage.covered.length / totalElements) * 100)
      : 0;

    metrics.push({
      name: 'Elements',
      percentage: elementsCoveragePercentage,
      count: elementsCoverage.covered.length,
      total: totalElements
    });

    // Calculate attribute coverage
    const totalAttributes = attributesCoverage.covered.length + attributesCoverage.notCovered.length;
    const attributesCoveragePercentage = totalAttributes > 0
      ? Math.round((attributesCoverage.covered.length / totalAttributes) * 100)
      : 0;

    metrics.push({
      name: 'Attributes',
      percentage: attributesCoveragePercentage,
      count: attributesCoverage.covered.length,
      total: totalAttributes
    });

    // Calculate reference coverage
    const totalReferences = referencesCoverage.covered.length + referencesCoverage.notCovered.length;
    const referencesCoveragePercentage = totalReferences > 0
      ? Math.round((referencesCoverage.covered.length / totalReferences) * 100)
      : 0;

    metrics.push({
      name: 'References',
      percentage: referencesCoveragePercentage,
      count: referencesCoverage.covered.length,
      total: totalReferences
    });

    // Calculate constraint coverage
    const totalConstraints = constraintsCoverage.covered.length + constraintsCoverage.notCovered.length;
    const constraintsCoveragePercentage = totalConstraints > 0
      ? Math.round((constraintsCoverage.covered.length / totalConstraints) * 100)
      : 0;

    metrics.push({
      name: 'Constraints',
      percentage: constraintsCoveragePercentage,
      count: constraintsCoverage.covered.length,
      total: totalConstraints
    });

    return metrics;
  }

  /**
   * Calculate overall coverage percentage
   */
  private calculateOverallCoverage(metrics: CoverageMetric[]): number {
    if (metrics.length === 0) return 0;

    // Weight the metrics - all metrics are equally important
    const totalCovered = metrics.reduce((sum, metric) => sum + metric.count, 0);
    const totalItems = metrics.reduce((sum, metric) => sum + metric.total, 0);

    return totalItems > 0
      ? Math.round((totalCovered / totalItems) * 100)
      : 0;
  }

  /**
   * Generate chart data for visualization
   */
  private generateChartData(metrics: CoverageMetric[]): {
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      backgroundColor: string[];
    }[];
  } {
    // Generate labels from metric names
    const labels = metrics.map(metric => metric.name);

    // Generate percentage data
    const percentageData = metrics.map(metric => metric.percentage);

    // Generate background colors (green for high coverage, yellow for medium, red for low)
    const backgroundColors = percentageData.map(percentage => {
      if (percentage >= 75) return 'rgba(75, 192, 192, 0.6)'; // Green
      if (percentage >= 40) return 'rgba(255, 206, 86, 0.6)'; // Yellow
      return 'rgba(255, 99, 132, 0.6)'; // Red
    });

    return {
      labels,
      datasets: [
        {
          label: 'Coverage Percentage',
          data: percentageData,
          backgroundColor: backgroundColors
        }
      ]
    };
  }
}

export const testCoverageService = new TestCoverageService(); 