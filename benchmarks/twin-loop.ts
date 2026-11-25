/**
 * Twin loop on the Smart Warehouse example: generate the scene, run it, record
 * what happens, lift the observations back onto the model, and re-evaluate the
 * design-time spatial rules on what was observed.
 *
 *   npm run twin-loop                                   # four stand-in scenarios, self-checking
 *   npm run twin-loop -- --observations <log.jsonl>     # analyse a log recorded by the Isaac Sim bridge
 *
 * The stand-in scenarios need no simulator. A log recorded in Isaac Sim
 * (run_warehouse_sim.py --scene ... --observe-out ...) must come from the
 * bundle this script generates in results/twin-loop/bundle; the bundle
 * fingerprint in the log is checked against it.
 */
import './lib/offline-env';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { CodeGenerationTemplate, Metamodel, Model } from '../shared/types';
import { codeGenerationEngine } from '../backend/src/services/pipeline/code-generation.engine';
import { contentHash } from '../backend/src/services/lifecycle/canonical';
import {
  GeneratedFileTrace, ObservationLog, TwinReport, analyzeRun, readObservationLog, renderReport, shortHash,
} from './lib/twin';

const repoRoot = path.resolve(__dirname, '..');
const resultsDir = path.join(__dirname, 'results');
const outDir = path.join(resultsDir, 'twin-loop');
const bundleDir = path.join(outDir, 'bundle');
const simDir = path.join(repoRoot, 'examples', 'omniverse-assets', 'warehouse_sim');
const python = path.join(__dirname, '.venv', 'bin', 'python');
const BUNDLE_FILES = [
  'warehouse_layout.usda', 'warehouse_assets.usda', 'warehouse_physics.usda', 'warehouse_simulation.usda',
  'warehouse_layout.json',
];
const RACK_AISLE_RULE = '10000000-0000-4000-8000-000000000302';

const readJson = (relativePath: string): any => JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
const metamodel = readJson('frontend/src/examples/data/smart-warehouse-metamodel.json') as Metamodel;
const model = readJson('frontend/src/examples/data/smart-warehouse-model.json') as Model;
const templates = readJson('examples/codegen-projects/smart-warehouse-omniverse-project.json').templates as CodeGenerationTemplate[];

interface Scenario {
  name: string;
  description: string;
  disturbances: string[];
  /** Returns the reasons the report differs from what the scenario injected. */
  check: (report: TwinReport) => string[];
}

const scenarios: Scenario[] = [
  {
    name: 'clean',
    description: 'Nothing disturbs the scene; only the robots move.',
    disturbances: [],
    check: report => [
      ...(report.deviations.length === 0 ? [] : [`expected no deviations, found ${report.deviations.length}`]),
      ...(report.summary.runtimeRuleViolations === 0 ? [] : ['expected no runtime-only rule violations']),
      ...(report.reconciliation.patch.length === 0 ? [] : ['expected an empty reconciliation patch']),
      ...(report.motion.length > 0 && report.motion.every(item => item.pathLengthMm > 0) ? [] : ['expected every robot to move']),
    ],
  },
  {
    name: 'runtime-drift',
    description: 'Storage Rack #2 is pushed 1.2 m towards Storage Rack at t = 20 s, closing the aisle.',
    disturbances: ['Storage Rack #2:-1.2,0@20'],
    check: report => {
      const failures: string[] = [];
      const [deviation] = report.deviations;
      if (report.deviations.length !== 1 || deviation.kind !== 'runtime-drift'
        || deviation.trace.elementName !== 'Storage Rack #2' || deviation.onsetT !== 20 || deviation.deltaMm.x !== -1200) {
        failures.push('expected one runtime drift of Storage Rack #2 by -1200 mm in x from t = 20 s');
      } else if (deviation.trace.generatedFile !== 'warehouse_layout.usda' || !deviation.trace.template?.id) {
        failures.push('expected the drift to trace to the layout layer and its template');
      }
      const aisle = report.ruleFindings.find(item => item.kind === 'runtime-rule-violation' && item.ruleId === RACK_AISLE_RULE);
      if (!aisle || aisle.firstT !== 20) failures.push('expected the rack aisle rule to fail at runtime from t = 20 s');
      const movedRack = aisle?.poses?.find(pose => pose.elementId === deviation?.trace.elementId);
      if (!movedRack || movedRack.observedPose.x - movedRack.designPose.x !== -1200) {
        failures.push('expected the first failing sample to report the moved rack pose');
      }
      if (!report.reconciliation.ruleImpact.introduced.some(text => text.startsWith('Storage rack aisle width'))) {
        failures.push('expected accepting the observed layout to introduce the rack aisle issue');
      }
      return failures;
    },
  },
  {
    name: 'realization-offset',
    description: 'Loading Dock rests 150 mm above its authored pose from the first sample on.',
    disturbances: ['Loading Dock:0,0,0.15@0'],
    check: report => {
      const [deviation] = report.deviations;
      return report.deviations.length === 1 && deviation.kind === 'realization-offset'
        && deviation.trace.elementName === 'Loading Dock' && deviation.deltaMm.z === 150 && deviation.onsetT === 0
        ? []
        : ['expected one realization offset of Loading Dock by 150 mm in z from t = 0 s'];
    },
  },
  {
    name: 'transient-drift',
    description: 'Storage Rack #2 is pushed into the aisle at t = 20 s and back to its place at t = 40 s.',
    disturbances: ['Storage Rack #2:-1.2,0@20', 'Storage Rack #2:1.2,0@40'],
    check: report => {
      const failures: string[] = [];
      const [deviation] = report.deviations;
      if (report.deviations.length !== 1 || deviation.kind !== 'runtime-drift' || deviation.onsetT !== 20
        || deviation.deltaMm.x !== -1200 || deviation.finalDeltaMm.x !== 0) {
        failures.push('expected one runtime drift of Storage Rack #2 by -1200 mm at t = 20 s, back in place at the end');
      }
      const aisle = report.ruleFindings.find(item => item.kind === 'runtime-rule-violation' && item.ruleId === RACK_AISLE_RULE);
      if (!aisle || aisle.firstT !== 20 || aisle.lastT !== 39.5) {
        failures.push('expected the rack aisle rule to fail at runtime from t = 20 s to t = 39.5 s only');
      }
      if (report.reconciliation.patch.length !== 0) failures.push('expected an empty reconciliation patch');
      return failures;
    },
  },
];

// Read a log given on the command line before the results folder is cleaned: it may live inside it.
const externalIndex = process.argv.indexOf('--observations');
const externalFile = externalIndex >= 0 ? path.resolve(process.argv[externalIndex + 1] || '') : undefined;
const external = externalFile ? readObservationLog(externalFile) : undefined;

const runPython = (args: string[]): void => {
  if (!fs.existsSync(python)) throw new Error(`Missing ${python}; see benchmarks/README.md for the venv setup`);
  execFileSync(python, args, { cwd: simDir, stdio: ['ignore', 'ignore', 'inherit'] });
};

// Generate the bundle once; every scenario runs against the same generation.
const generated = codeGenerationEngine.generate(model, metamodel, templates);
const generatedFiles: GeneratedFileTrace[] = generated.map((file, index) => ({
  filename: file.filename,
  contentHash: file.contentHash,
  templateId: templates[index].id,
  templateName: templates[index].name,
}));
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(bundleDir, { recursive: true });
BUNDLE_FILES.forEach(name => {
  fs.writeFileSync(path.join(bundleDir, name), generated.find(file => file.filename === name)!.content);
});
// Layers reference assets as @omniverse-assets/...@ relative to the bundle root.
fs.symlinkSync(path.join(repoRoot, 'examples', 'omniverse-assets'), path.join(bundleDir, 'omniverse-assets'), 'dir');
const layoutPath = path.join(bundleDir, 'warehouse_layout.json');
const authoredPath = path.join(bundleDir, 'authored.jsonl');
runPython([
  'observe.py', 'snapshot', '--scene', path.join(bundleDir, 'warehouse_simulation.usda'), '--layout', layoutPath,
  '--out', authoredPath,
]);
const authored = readObservationLog(authoredPath);
const bundleFingerprint = authored.header.bundleFingerprint;

const analyse = (name: string, title: string, observations: ObservationLog): TwinReport => {
  if (!bundleFingerprint || observations.header.bundleFingerprint !== bundleFingerprint) {
    const expected = authored.header.bundleFiles || {};
    const recorded = observations.header.bundleFiles || {};
    const differing = [...new Set([...Object.keys(expected), ...Object.keys(recorded)])]
      .filter(file => expected[file] !== recorded[file]);
    throw new Error(`${name}: the log was recorded against a different generation of the model; `
      + `generated files that differ: ${differing.join(', ') || 'unknown (the log carries no bundle fingerprint)'}`);
  }
  const { report, reconciledModel } = analyzeRun({
    model, metamodel, modelHash: contentHash(model), metamodelHash: contentHash(metamodel),
    generatedFiles, authored, observations,
  });
  const directory = path.join(outDir, name);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(directory, 'report.md'), renderReport(title, report));
  if (report.reconciliation.patch.length > 0) {
    fs.writeFileSync(path.join(directory, 'reconciled-model.json'), `${JSON.stringify(reconciledModel, null, 2)}\n`);
  }
  return report;
};

if (externalFile && external) {
  const report = analyse('external', path.basename(externalFile), external);
  process.stdout.write(`${renderReport(path.basename(externalFile), report)}\nReport written to ${path.join(outDir, 'external')}\n`);
  process.exit(0);
}

const started = Date.now();
const rows = scenarios.map(scenario => {
  const directory = path.join(outDir, scenario.name);
  fs.mkdirSync(directory, { recursive: true });
  const observationsPath = path.join(directory, 'observations.jsonl');
  runPython([
    'run_standin_sim.py', '--layout', layoutPath, '--authored', authoredPath, '--observe-out', observationsPath,
    ...scenario.disturbances.flatMap(disturbance => ['--disturb', disturbance]),
  ]);
  const report = analyse(scenario.name, scenario.name, readObservationLog(observationsPath));
  return { scenario, report, failures: scenario.check(report) };
});

const summary = {
  scenarios: rows.map(row => ({
    name: row.scenario.name,
    description: row.scenario.description,
    disturbances: row.scenario.disturbances,
    summary: row.report.summary,
    reconciliationPatchEntries: row.report.reconciliation.patch.length,
    passed: row.failures.length === 0,
    failures: row.failures,
  })),
  tracedElements: rows[0].report.provenance.observation.tracedElements,
  samplesPerRun: rows[0].report.provenance.observation.samples,
  modelHash: rows[0].report.provenance.modelHash,
  bundleFingerprint,
  seconds: Math.round((Date.now() - started) / 100) / 10,
};
fs.writeFileSync(path.join(resultsDir, 'twin-loop.json'), `${JSON.stringify(summary, null, 2)}\n`);
const lines = [
  '# Twin loop results',
  '',
  `Smart Warehouse model \`${shortHash(summary.modelHash)}\`, ${summary.tracedElements} traced elements, `
  + `${summary.samplesPerRun} samples per run, observation source: kinematic stand-in (no physics engine).`,
  '',
  '| Scenario | Injected | Offsets | Drifts | Runtime-only rule violations | Patch entries | Result |',
  '| --- | --- | ---: | ---: | ---: | ---: | --- |',
  ...summary.scenarios.map(row => (
    `| ${row.name} | ${row.disturbances.join('; ') || 'nothing'} | ${row.summary.realizationOffsets} | ${row.summary.runtimeDrifts} | `
    + `${row.summary.runtimeRuleViolations} | ${row.reconciliationPatchEntries} | ${row.passed ? 'as injected' : `MISMATCH: ${row.failures.join('; ')}`} |`
  )),
  '',
  `Per-scenario reports are in \`results/twin-loop/<scenario>/report.md\`. Runtime ${summary.seconds} s.`,
  '',
];
fs.writeFileSync(path.join(resultsDir, 'twin-loop.md'), lines.join('\n'));
process.stdout.write(`${lines.join('\n')}\n`);
process.exit(summary.scenarios.every(row => row.passed) ? 0 : 1);
