/**
 * Twin loop analysis: bring what a simulator observed back into the model's
 * own terms, then reuse the design-time rule engine on it.
 *
 * Three states of every placed element are compared:
 *   design    the pose in the model (millimetres, degrees);
 *   authored  the pose of the generated prim before the simulation starts;
 *   observed  the pose of the same prim while the simulation runs.
 *
 * The generator stamps each prim with the ID of its model element, so the
 * three states line up without matching names. Observations are lifted by
 * residual: the observed model pose is the design pose plus the difference
 * between the observed and the authored scene pose. This needs the scene's
 * unit (metres) and nothing else about how a template placed the prim.
 */
import fs from 'fs';
import { Metamodel, Model, ModelElement, ValidationIssue } from '../../shared/types';
import { evaluateSpatialRules } from '../../shared/spatial-rules';

export const OBSERVATION_SCHEMA = 'spatialdsl.observations/1';
const MM_PER_M = 1000;

export interface ObservedPose {
  elementId: string;
  prim: string;
  layer?: string | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface ObservationHeader {
  schema: string;
  source: string;
  layoutSha256?: string | null;
  scene?: string | null;
  controlledElementIds: string[];
}

export interface ObservationSample {
  t: number;
  poses: Map<string, ObservedPose>;
}

export interface ObservationLog {
  header: ObservationHeader;
  samples: ObservationSample[];
}

export interface GeneratedFileTrace {
  filename: string;
  contentHash: string;
  templateId?: string;
  templateName: string;
}

/** Where a finding comes from: model element, generated prim, generated file, generating template. */
export interface TraceChain {
  elementId: string;
  elementName: string;
  className: string;
  prim: string;
  generatedFile?: string;
  template?: { id?: string; name: string };
}

export interface PoseMm {
  x: number;
  y: number;
  z: number;
  rotationZ: number;
}

export interface DeviationFinding {
  /** realization-offset: never at its authored pose. runtime-drift: moved during the run. */
  kind: 'realization-offset' | 'runtime-drift';
  trace: TraceChain;
  onsetT: number;
  deltaMm: { x: number; y: number; z: number };
  deltaYawDeg: number;
  designPose: PoseMm;
  observedPose: PoseMm;
}

export interface RuleFinding {
  /** runtime-rule-violation: holds at runtime only. design-violation-not-observed: holds in the model only. */
  kind: 'runtime-rule-violation' | 'design-violation-not-observed';
  ruleId: string;
  ruleName: string;
  severity: ValidationIssue['severity'];
  message: string;
  firstT?: number;
  lastT?: number;
  samples: number;
  elements: TraceChain[];
}

export interface ModelPatchEntry {
  elementId: string;
  elementName: string;
  path: 'presentation.position3D' | 'presentation.rotationZ';
  from: unknown;
  to: unknown;
}

export interface TwinReport {
  provenance: {
    modelId: string;
    modelHash: string;
    metamodelHash: string;
    generatedFiles: GeneratedFileTrace[];
    observation: {
      source: string;
      scene?: string | null;
      layoutSha256?: string | null;
      samples: number;
      durationS: number;
      tracedElements: number;
      controlledElements: number;
    };
    tolerances: TwinTolerances;
  };
  summary: {
    realizationOffsets: number;
    runtimeDrifts: number;
    runtimeRuleViolations: number;
    designViolationsNotObserved: number;
    designRuleIssues: number;
  };
  deviations: DeviationFinding[];
  ruleFindings: RuleFinding[];
  motion: Array<{ trace: TraceChain; pathLengthMm: number }>;
  reconciliation: {
    patch: ModelPatchEntry[];
    /** Rule issues the model would gain or lose if the patch were accepted. */
    ruleImpact: { introduced: string[]; resolved: string[] };
  };
}

export interface TwinTolerances {
  positionMm: number;
  angleDeg: number;
}

export const DEFAULT_TOLERANCES: TwinTolerances = { positionMm: 1, angleDeg: 0.1 };

const round = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const wrapDegrees = (value: number): number => (((value + 180) % 360) + 360) % 360 - 180;

export function readObservationLog(file: string): ObservationLog {
  const records = fs.readFileSync(file, 'utf8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
  const header = records[0] as ObservationHeader | undefined;
  if (!header || header.schema !== OBSERVATION_SCHEMA) {
    throw new Error(`${file} is not a ${OBSERVATION_SCHEMA} log`);
  }
  const samples: ObservationSample[] = [];
  records.slice(1).forEach(record => {
    const { t, ...pose } = record;
    if (samples.length === 0 || samples[samples.length - 1].t !== t) samples.push({ t, poses: new Map() });
    samples[samples.length - 1].poses.set(pose.elementId, pose as ObservedPose);
  });
  if (samples.length === 0) throw new Error(`${file} holds no samples`);
  return { header: { ...header, controlledElementIds: header.controlledElementIds || [] }, samples };
}

const designPose = (element: ModelElement): PoseMm => ({
  x: element.presentation!.position3D!.x,
  y: element.presentation!.position3D!.y,
  z: element.presentation!.position3D!.z,
  rotationZ: element.presentation!.rotationZ ?? 0,
});

/** Residual between two scene poses, in model units. */
const residual = (from: ObservedPose, to: ObservedPose) => ({
  x: round((to.x - from.x) * MM_PER_M, 3),
  y: round((to.y - from.y) * MM_PER_M, 3),
  z: round((to.z - from.z) * MM_PER_M, 3),
  yaw: round(wrapDegrees(to.yaw - from.yaw), 6),
});

const exceeds = (delta: ReturnType<typeof residual>, tolerances: TwinTolerances): boolean => (
  Math.hypot(delta.x, delta.y, delta.z) > tolerances.positionMm || Math.abs(delta.yaw) > tolerances.angleDeg
);

/** The model pose an observation implies; components with no residual keep the design value exactly. */
export function liftPose(element: ModelElement, authored: ObservedPose, observed: ObservedPose): PoseMm {
  const design = designPose(element);
  const delta = residual(authored, observed);
  const shifted = (value: number, by: number): number => by === 0 ? value : round(value + by, 6);
  return {
    x: shifted(design.x, delta.x),
    y: shifted(design.y, delta.y),
    z: shifted(design.z, delta.z),
    rotationZ: delta.yaw === 0 ? design.rotationZ : round(wrapDegrees(design.rotationZ + delta.yaw), 6),
  };
}

/** A copy of the model in which every observed element sits where the simulator saw it. */
export function liftModel(
  model: Model,
  authored: Map<string, ObservedPose>,
  observed: Map<string, ObservedPose>,
  skip: Set<string> = new Set()
): Model {
  return {
    ...model,
    elements: model.elements.map(element => {
      const from = authored.get(element.id);
      const to = observed.get(element.id);
      if (!from || !to || skip.has(element.id) || !element.presentation?.position3D) return element;
      const pose = liftPose(element, from, to);
      return {
        ...element,
        presentation: {
          ...element.presentation,
          position3D: { ...element.presentation.position3D, x: pose.x, y: pose.y, z: pose.z },
          rotationZ: pose.rotationZ,
        },
      };
    }),
  };
}

const issueKey = (issue: ValidationIssue): string => (
  [issue.constraintId, issue.elementId, ...(issue.relatedElementIds || [])].join('|')
);

export function analyzeRun(input: {
  model: Model;
  metamodel: Metamodel;
  modelHash: string;
  metamodelHash: string;
  generatedFiles: GeneratedFileTrace[];
  authored: ObservationLog;
  observations: ObservationLog;
  tolerances?: TwinTolerances;
}): { report: TwinReport; reconciledModel: Model } {
  const { model, metamodel, observations } = input;
  const tolerances = input.tolerances || DEFAULT_TOLERANCES;
  const authored = input.authored.samples[0].poses;
  const first = observations.samples[0];
  const last = observations.samples[observations.samples.length - 1];
  const controlled = new Set(observations.header.controlledElementIds);
  const classNames = new Map(metamodel.classes.map(metaClass => [metaClass.id, metaClass.name]));
  const ruleNames = new Map((metamodel.spatialRules || []).map(rule => [rule.id, rule.name]));
  const elements = new Map(model.elements.map(element => [element.id, element]));
  const filesByName = new Map(input.generatedFiles.map(file => [file.filename, file]));

  const traceOf = (elementId: string): TraceChain => {
    const element = elements.get(elementId);
    const pose = authored.get(elementId);
    const file = pose?.layer ? filesByName.get(pose.layer) : undefined;
    return {
      elementId,
      elementName: String(element?.name || element?.style?.name || elementId),
      className: element ? classNames.get(element.modelElementId) || element.modelElementId : 'unknown',
      prim: pose?.prim || 'unknown',
      ...(pose?.layer ? { generatedFile: pose.layer } : {}),
      ...(file ? { template: { id: file.templateId, name: file.templateName } } : {}),
    };
  };

  const traced = model.elements.filter(element => (
    element.presentation?.position3D && authored.has(element.id) && first.poses.has(element.id)
  ));

  // Elements the simulator does not drive are expected to stay where the model put them.
  const deviations: DeviationFinding[] = [];
  const finding = (
    kind: DeviationFinding['kind'], element: ModelElement, onsetT: number, from: ObservedPose, to: ObservedPose
  ): DeviationFinding => {
    const delta = residual(from, to);
    return {
      kind,
      trace: traceOf(element.id),
      onsetT,
      deltaMm: { x: delta.x, y: delta.y, z: delta.z },
      deltaYawDeg: delta.yaw,
      designPose: designPose(element),
      observedPose: liftPose(element, authored.get(element.id)!, to),
    };
  };
  traced.filter(element => !controlled.has(element.id)).forEach(element => {
    const start = first.poses.get(element.id)!;
    if (exceeds(residual(authored.get(element.id)!, start), tolerances)) {
      deviations.push(finding('realization-offset', element, first.t, authored.get(element.id)!, start));
    }
    const onset = observations.samples.find(sample => {
      const pose = sample.poses.get(element.id);
      return pose !== undefined && exceeds(residual(start, pose), tolerances);
    });
    const end = last.poses.get(element.id);
    if (onset && end) deviations.push(finding('runtime-drift', element, onset.t, start, end));
  });

  const motion = traced.filter(element => controlled.has(element.id)).map(element => {
    let pathLengthMm = 0;
    let previous = first.poses.get(element.id)!;
    observations.samples.forEach(sample => {
      const pose = sample.poses.get(element.id);
      if (!pose) return;
      pathLengthMm += Math.hypot(pose.x - previous.x, pose.y - previous.y, pose.z - previous.z) * MM_PER_M;
      previous = pose;
    });
    return { trace: traceOf(element.id), pathLengthMm: round(pathLengthMm, 1) };
  });

  // The design-time rules, evaluated unchanged on the lifted model of every sample.
  const designIssues = new Map(evaluateSpatialRules(metamodel, model).map(issue => [issueKey(issue), issue]));
  const seen = new Map<string, { issue: ValidationIssue; firstT: number; lastT: number; samples: number }>();
  observations.samples.forEach(sample => {
    evaluateSpatialRules(metamodel, liftModel(model, authored, sample.poses)).forEach(issue => {
      const entry = seen.get(issueKey(issue));
      if (entry) {
        entry.lastT = sample.t;
        entry.samples += 1;
      } else {
        seen.set(issueKey(issue), { issue, firstT: sample.t, lastT: sample.t, samples: 1 });
      }
    });
  });
  const ruleFinding = (kind: RuleFinding['kind'], issue: ValidationIssue, span?: {
    firstT: number; lastT: number; samples: number;
  }): RuleFinding => ({
    kind,
    ruleId: issue.constraintId || 'unknown',
    ruleName: ruleNames.get(issue.constraintId || '') || issue.constraintId || 'unknown',
    severity: issue.severity,
    message: issue.message,
    ...(span ? { firstT: span.firstT, lastT: span.lastT } : {}),
    samples: span?.samples || 0,
    elements: [issue.elementId, ...(issue.relatedElementIds || [])]
      .filter((id): id is string => Boolean(id)).map(traceOf),
  });
  const ruleFindings: RuleFinding[] = [
    ...[...seen.entries()].filter(([key]) => !designIssues.has(key))
      .map(([, entry]) => ruleFinding('runtime-rule-violation', entry.issue, entry)),
    ...[...designIssues.entries()].filter(([key]) => !seen.has(key))
      .map(([, issue]) => ruleFinding('design-violation-not-observed', issue)),
  ];

  // Reconciliation proposal: adopt the final observed pose of every element that
  // deviated. Driven elements keep their design pose, which is where they start.
  const deviated = new Set(deviations.map(item => item.trace.elementId));
  const keep = new Set(model.elements.filter(element => !deviated.has(element.id)).map(element => element.id));
  const reconciledModel = liftModel(model, authored, last.poses, keep);
  const patch: ModelPatchEntry[] = [];
  reconciledModel.elements.forEach(element => {
    const before = elements.get(element.id)!;
    if (element === before) return;
    const elementName = traceOf(element.id).elementName;
    const from = before.presentation!.position3D!;
    const to = element.presentation!.position3D!;
    if (from.x !== to.x || from.y !== to.y || from.z !== to.z) {
      patch.push({ elementId: element.id, elementName, path: 'presentation.position3D', from, to });
    }
    if ((before.presentation!.rotationZ ?? 0) !== element.presentation!.rotationZ) {
      patch.push({
        elementId: element.id, elementName, path: 'presentation.rotationZ',
        from: before.presentation!.rotationZ ?? 0, to: element.presentation!.rotationZ,
      });
    }
  });
  const reconciledIssues = new Map(evaluateSpatialRules(metamodel, reconciledModel).map(issue => [issueKey(issue), issue]));

  const report: TwinReport = {
    provenance: {
      modelId: model.id,
      modelHash: input.modelHash,
      metamodelHash: input.metamodelHash,
      generatedFiles: input.generatedFiles,
      observation: {
        source: observations.header.source,
        scene: observations.header.scene,
        layoutSha256: observations.header.layoutSha256,
        samples: observations.samples.length,
        durationS: round(last.t - first.t, 3),
        tracedElements: traced.length,
        controlledElements: motion.length,
      },
      tolerances,
    },
    summary: {
      realizationOffsets: deviations.filter(item => item.kind === 'realization-offset').length,
      runtimeDrifts: deviations.filter(item => item.kind === 'runtime-drift').length,
      runtimeRuleViolations: ruleFindings.filter(item => item.kind === 'runtime-rule-violation').length,
      designViolationsNotObserved: ruleFindings.filter(item => item.kind === 'design-violation-not-observed').length,
      designRuleIssues: designIssues.size,
    },
    deviations,
    ruleFindings,
    motion,
    reconciliation: {
      patch,
      ruleImpact: {
        introduced: [...reconciledIssues.entries()].filter(([key]) => !designIssues.has(key)).map(([, issue]) => issue.message),
        resolved: [...designIssues.entries()].filter(([key]) => !reconciledIssues.has(key)).map(([, issue]) => issue.message),
      },
    },
  };
  return { report, reconciledModel };
}

export const shortHash = (hash: string): string => hash.replace(/^sha256:/, '').slice(0, 12);

const traceCell = (trace: TraceChain): string => (
  `${trace.elementName} (${trace.className})<br>\`${trace.prim}\`<br>${trace.generatedFile || 'unknown file'}`
  + ` from template "${trace.template?.name || 'unknown'}"`
);

export function renderReport(title: string, report: TwinReport): string {
  const { provenance, summary } = report;
  const lines = [
    `# Twin loop report: ${title}`,
    '',
    `Observation source **${provenance.observation.source}**: ${provenance.observation.samples} samples over `
    + `${provenance.observation.durationS} s, ${provenance.observation.tracedElements} traced elements `
    + `(${provenance.observation.controlledElements} driven by the simulator). Model \`${shortHash(provenance.modelHash)}\`, `
    + `tolerance ${provenance.tolerances.positionMm} mm / ${provenance.tolerances.angleDeg} deg.`,
    '',
    '| Finding | Count |',
    '| --- | ---: |',
    `| Realization offsets (authored pose never reached) | ${summary.realizationOffsets} |`,
    `| Runtime drifts (undriven element moved) | ${summary.runtimeDrifts} |`,
    `| Rule violations at runtime only | ${summary.runtimeRuleViolations} |`,
    `| Design-time rule issues not observed at runtime | ${summary.designViolationsNotObserved} |`,
    `| Design-time rule issues | ${summary.designRuleIssues} |`,
    '',
  ];
  if (report.deviations.length > 0) {
    lines.push('## Deviations', '', '| Kind | Onset (s) | Delta x, y, z (mm) / yaw (deg) | Traced to |', '| --- | ---: | --- | --- |');
    report.deviations.forEach(item => lines.push(
      `| ${item.kind} | ${item.onsetT} | ${item.deltaMm.x}, ${item.deltaMm.y}, ${item.deltaMm.z} / ${item.deltaYawDeg} | ${traceCell(item.trace)} |`
    ));
    lines.push('');
  }
  if (report.ruleFindings.length > 0) {
    lines.push('## Rule verdicts that differ between model and run', '', '| Kind | Rule | First to last (s) | Message | Elements |', '| --- | --- | --- | --- | --- |');
    report.ruleFindings.forEach(item => lines.push(
      `| ${item.kind} | ${item.ruleName} (${item.severity}) | ${item.firstT === undefined ? 'n/a' : `${item.firstT} to ${item.lastT}`} | ${item.message} | ${item.elements.map(trace => trace.elementName).join(', ')} |`
    ));
    lines.push('');
  }
  if (report.motion.length > 0) {
    lines.push('## Driven elements', '', '| Element | Path length (mm) |', '| --- | ---: |');
    report.motion.forEach(item => lines.push(`| ${item.trace.elementName} | ${item.pathLengthMm} |`));
    lines.push('');
  }
  lines.push('## Reconciliation proposal', '');
  if (report.reconciliation.patch.length === 0) {
    lines.push('The run agrees with the model; nothing to reconcile.', '');
  } else {
    lines.push('Accepting the observed state would change the model as follows (`reconciled-model.json`):', '',
      '| Element | Attribute | From | To |', '| --- | --- | --- | --- |');
    report.reconciliation.patch.forEach(entry => lines.push(
      `| ${entry.elementName} | ${entry.path} | \`${JSON.stringify(entry.from)}\` | \`${JSON.stringify(entry.to)}\` |`
    ));
    lines.push('');
    const { introduced, resolved } = report.reconciliation.ruleImpact;
    if (introduced.length > 0) lines.push('Rule issues the accepted model would gain:', '', ...introduced.map(text => `- ${text}`), '');
    if (resolved.length > 0) lines.push('Rule issues the accepted model would lose:', '', ...resolved.map(text => `- ${text}`), '');
    if (introduced.length === 0 && resolved.length === 0) lines.push('The accepted model has the same rule verdicts as the design model.', '');
  }
  return lines.join('\n');
}
