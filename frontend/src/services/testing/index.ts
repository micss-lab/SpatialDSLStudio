// Barrel export for the testing module
// Maintains backward-compatible names for all consumers

export type {
  TestCase,
  TestValue,
  TestCoverage,
  TestGenerationOptions,
  CoverageMetric,
  CoverageReport
} from './testing-types';

export { testGenerationService } from './testing.service';
export { testRunnerService } from './testing-execution.service';
export { testCoverageService } from './testing-coverage.service';
