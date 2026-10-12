/**
 * Scalability benchmark: spatial rule evaluation, backend model validation,
 * and OpenUSD code generation on seeded synthetic Smart Warehouse models.
 *
 * Runs in-process (no HTTP, no browser, no database):
 *   cd benchmarks && npm run scalability
 *
 * Writes benchmarks/results/scalability.csv, scalability.md, and scalability.json.
 */
import './lib/offline-env';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CodeGenerationTemplate, Metamodel } from '../shared/types';
import { evaluateSpatialRules } from '../shared/spatial-rules';
import { modelValidationEngine } from '../backend/src/services/pipeline/model-validation.engine';
import { codeGenerationEngine } from '../backend/src/services/pipeline/code-generation.engine';
import { generateSyntheticWarehouse } from './lib/synthetic-warehouse';

const SIZES = [100, 500, 1000, 2500, 5000, 10000];
const RUNS = 5;
const SEED = 20261011;

const repoRoot = path.resolve(__dirname, '..');
const resultsDir = path.join(__dirname, 'results');
const readJson = (relativePath: string): any => JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));

const metamodel = readJson('frontend/src/examples/data/smart-warehouse-metamodel.json') as Metamodel;
const omniverseProject = readJson('examples/codegen-projects/smart-warehouse-omniverse-project.json');
const templates = omniverseProject.templates as CodeGenerationTemplate[];

const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const timeMs = <T>(operation: () => T): { result: T; ms: number } => {
  const start = process.hrtime.bigint();
  const result = operation();
  return { result, ms: Number(process.hrtime.bigint() - start) / 1e6 };
};

const round = (value: number, digits = 2): number => Math.round(value * 10 ** digits) / 10 ** digits;

const machine = {
  cpu: os.cpus()[0]?.model || 'unknown',
  logicalCores: os.cpus().length,
  memoryGiB: round(os.totalmem() / 1024 ** 3, 1),
  os: `${os.type()} ${os.release()} (${os.platform()}/${os.arch()})`,
  node: process.version,
  date: new Date().toISOString(),
};

interface Row {
  elements: number;
  violatingElements: number;
  seededViolations: number;
  spatialIssues: number;
  ruleEvaluationMs: number;
  validationMs: number;
  codeGenerationMs: number;
  modelJsonBytes: number;
  generatedBytes: number;
}

const ruleIds = new Set((metamodel.spatialRules || []).map(rule => rule.id));
const rows: Row[] = [];
const started = Date.now();

for (const size of SIZES) {
  const { model, violatingElementIds, violationCells } = generateSyntheticWarehouse(metamodel, size, SEED);
  // Every seeded violation cell breaks exactly one rule once; normal cells break none.
  const seededViolations = Object.values(violationCells).reduce((sum, count) => sum + count, 0);
  const ruleTimes: number[] = [];
  const validationTimes: number[] = [];
  const generationTimes: number[] = [];
  let spatialIssues = 0;
  let generatedBytes = 0;

  // One warm-up pass (JIT, Handlebars template compilation caches) before the timed runs.
  evaluateSpatialRules(metamodel, model);
  modelValidationEngine.validate(model, metamodel);
  codeGenerationEngine.generate(model, metamodel, templates);

  for (let run = 0; run < RUNS; run += 1) {
    const rules = timeMs(() => evaluateSpatialRules(metamodel, model));
    ruleTimes.push(rules.ms);
    spatialIssues = rules.result.length;

    const validation = timeMs(() => modelValidationEngine.validate(model, metamodel));
    validationTimes.push(validation.ms);
    const ruleIssueCount = validation.result.issues.filter(issue => ruleIds.has(issue.constraintId || '')).length;
    if (ruleIssueCount !== spatialIssues) {
      throw new Error(`Validation engine reported ${ruleIssueCount} rule issues, evaluator ${spatialIssues}`);
    }

    const generation = timeMs(() => codeGenerationEngine.generate(model, metamodel, templates));
    generationTimes.push(generation.ms);
    generatedBytes = generation.result.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0);
  }

  const row: Row = {
    elements: model.elements.length,
    violatingElements: violatingElementIds.size,
    seededViolations,
    spatialIssues,
    ruleEvaluationMs: round(median(ruleTimes)),
    validationMs: round(median(validationTimes)),
    codeGenerationMs: round(median(generationTimes)),
    modelJsonBytes: Buffer.byteLength(JSON.stringify(model)),
    generatedBytes,
  };
  if (row.spatialIssues !== seededViolations) {
    throw new Error(`N=${size}: ${row.spatialIssues} rule issues, but ${seededViolations} violations were seeded`);
  }
  rows.push(row);
  process.stdout.write(`N=${row.elements}: rules ${row.ruleEvaluationMs} ms, validation ${row.validationMs} ms, `
    + `codegen ${row.codeGenerationMs} ms, ${row.spatialIssues} rule issues\n`);
}

fs.mkdirSync(resultsDir, { recursive: true });
const columns: Array<keyof Row> = [
  'elements', 'violatingElements', 'seededViolations', 'spatialIssues', 'ruleEvaluationMs',
  'validationMs', 'codeGenerationMs', 'modelJsonBytes', 'generatedBytes',
];
fs.writeFileSync(
  path.join(resultsDir, 'scalability.csv'),
  `${columns.join(',')}\n${rows.map(row => columns.map(column => row[column]).join(',')).join('\n')}\n`
);
fs.writeFileSync(path.join(resultsDir, 'scalability.json'), `${JSON.stringify({
  machine, seed: SEED, runs: RUNS, sizes: SIZES, rules: metamodel.spatialRules, rows,
}, null, 2)}\n`);

const kib = (bytes: number): string => `${round(bytes / 1024, 1)}`;
const markdown = [
  '# Scalability results',
  '',
  `Median of ${RUNS} runs after one warm-up run; seed ${SEED}; ${(metamodel.spatialRules || []).length} spatial rules from the Smart Warehouse example.`,
  '',
  '| Elements | Violating elements | Seeded violations | Rule issues | Rule evaluation (ms) | Model validation (ms) | OpenUSD generation (ms) | Model JSON (KiB) | Generated (KiB) |',
  '| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...rows.map(row => `| ${row.elements} | ${row.violatingElements} | ${row.seededViolations} | ${row.spatialIssues} | ${row.ruleEvaluationMs} | `
    + `${row.validationMs} | ${row.codeGenerationMs} | ${kib(row.modelJsonBytes)} | ${kib(row.generatedBytes)} |`),
  '',
  'Every seeded violation cell (two overlapping conveyors, a 200 mm rack aisle, a charging station off any pathway, or a drone 500 mm above a rack) yields exactly one rule issue, and the script fails otherwise.',
  'Model validation is the full backend engine (conformance, references, presentation, and spatial rules); its timings come from separate runs, so it can be slightly below the rule evaluation median.',
  'OpenUSD generation renders all templates of `examples/codegen-projects/smart-warehouse-omniverse-project.json`.',
  '',
  '## Machine',
  '',
  `- CPU: ${machine.cpu} (${machine.logicalCores} logical cores)`,
  `- RAM: ${machine.memoryGiB} GiB`,
  `- OS: ${machine.os}`,
  `- Node.js: ${machine.node}`,
  `- Date: ${machine.date}`,
  `- Total benchmark wall time: ${round((Date.now() - started) / 1000, 1)} s`,
  '',
].join('\n');
fs.writeFileSync(path.join(resultsDir, 'scalability.md'), markdown);
process.stdout.write(`\n${markdown}`);
