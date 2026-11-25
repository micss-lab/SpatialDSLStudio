import warehouseModel from '../examples/data/smart-warehouse-model.json';
import warehouseMetamodel from '../examples/data/smart-warehouse-metamodel.json';
import { Metamodel, Model, ModelElement, Position3D, ValidationIssue } from '../models/types';
import { apiClient } from './core';

interface ReportElement {
  elementId: string;
  elementName: string;
  className: string;
  prim: string;
}

export interface ReportPose extends Position3D {
  rotationZ: number;
}

interface PoseComparison {
  designPose: ReportPose;
  observedPose: ReportPose;
}

interface RuleFinding {
  kind: 'runtime-rule-violation' | 'design-violation-not-observed';
  ruleId: string;
  ruleName: string;
  message: string;
  severity: ValidationIssue['severity'];
  firstT: number;
  lastT: number;
  samples: number;
  elements: ReportElement[];
  poses?: Array<PoseComparison & { elementId: string }>;
}

interface Deviation extends PoseComparison {
  kind: 'realization-offset' | 'runtime-drift';
  trace: ReportElement;
  onsetT: number;
  finalPose: ReportPose;
}

export interface SimulationReport {
  provenance: {
    modelId: string;
    modelHash: string;
    observation: { source: string; durationS: number; samples: number };
  };
  ruleFindings: RuleFinding[];
  deviations: Deviation[];
}

interface StoredReport {
  id: string;
  filename: string;
  createdAt?: string;
  metadata: { kind: string; modelId: string; elementIds?: Record<string, string> };
}

const REPORT_KIND = 'spatialdsl.twin-report';
const record = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const count = (value: unknown): value is number => finite(value) && Number.isInteger(value) && value > 0;

function isElement(value: unknown): value is ReportElement {
  return record(value) && [value.elementId, value.elementName, value.className, value.prim].every(text);
}

function isPose(value: unknown): value is ReportPose {
  return record(value) && [value.x, value.y, value.z, value.rotationZ].every(finite);
}

function isRuleFinding(value: unknown): value is RuleFinding {
  if (!record(value)) return false;
  return (value.kind === 'runtime-rule-violation' || value.kind === 'design-violation-not-observed')
    && (value.severity === 'error' || value.severity === 'warning' || value.severity === 'info')
    && [value.ruleId, value.ruleName, value.message].every(text)
    && finite(value.firstT) && finite(value.lastT) && value.firstT >= 0 && value.lastT >= value.firstT
    && count(value.samples) && Array.isArray(value.elements) && value.elements.every(isElement)
    && (value.poses === undefined || (Array.isArray(value.poses) && value.poses.every(pose => (
      record(pose) && text(pose.elementId) && isPose(pose.designPose) && isPose(pose.observedPose)
    ))));
}

function isDeviation(value: unknown): value is Deviation {
  return record(value) && (value.kind === 'realization-offset' || value.kind === 'runtime-drift')
    && isElement(value.trace) && finite(value.onsetT) && value.onsetT >= 0
    && isPose(value.designPose) && isPose(value.observedPose) && isPose(value.finalPose);
}

export function parseSimulationReport(raw: string): SimulationReport {
  let data: unknown;
  try {
    data = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('This file contains invalid JSON. Choose a twin-loop report.json file.');
  }

  if (record(data) && record(data.provenance) && record(data.provenance.observation)) {
    const { provenance, ruleFindings, deviations } = data;
    const { observation } = data.provenance;
    if (text(provenance.modelId) && text(provenance.modelHash) && text(observation.source)
      && finite(observation.durationS) && observation.durationS >= 0 && count(observation.samples)
      && Array.isArray(ruleFindings) && ruleFindings.every(isRuleFinding)
      && Array.isArray(deviations) && deviations.every(isDeviation)) {
      return {
        provenance: {
          modelId: provenance.modelId,
          modelHash: provenance.modelHash,
          observation: { source: observation.source, durationS: observation.durationS, samples: observation.samples },
        },
        ruleFindings,
        deviations,
      };
    }
  }
  throw new Error('Choose a twin-loop report.json file with model provenance and valid findings.');
}

export function matchingSimulationModels(report: SimulationReport, models: Model[], metamodels: Metamodel[]): Model[] {
  const direct = models.find(model => model.id === report.provenance.modelId);
  if (direct) return [direct];
  if (report.provenance.modelId !== warehouseModel.id) return [];

  const warehouseMetamodelIds = new Set(metamodels
    .filter(metamodel => metamodel.name === warehouseMetamodel.name)
    .map(metamodel => metamodel.id));
  return models.filter(model => model.name === warehouseModel.name && warehouseMetamodelIds.has(model.conformsTo || model.metamodelId));
}

const elementName = (element: Pick<ModelElement, 'name' | 'style' | 'id'>) => String(element.name || element.style.name || element.id);

export function resolveSimulationElementId(
  report: SimulationReport, trace: ReportElement, model: Model, metamodel?: Metamodel, savedIds?: Record<string, string>
): string | undefined {
  if (model.id === report.provenance.modelId) {
    return model.elements.find(element => element.id === trace.elementId)?.id;
  }
  if (report.provenance.modelId !== warehouseModel.id) return undefined;
  const savedId = savedIds?.[trace.elementId];
  if (savedId) return model.elements.find(element => element.id === savedId)?.id;

  // Starter imports remap fixture UUIDs. Only the known warehouse fixture can use name and class matching.
  if (metamodel?.name !== warehouseMetamodel.name) return undefined;
  const original = warehouseModel.elements.find(element => element.id === trace.elementId);
  const originalClass = warehouseMetamodel.classes.find(metaClass => metaClass.id === original?.modelElementId);
  if (!original || originalClass?.name !== trace.className || elementName(original) !== trace.elementName) return undefined;

  const classIds = new Set(metamodel.classes.filter(metaClass => metaClass.name === trace.className).map(metaClass => metaClass.id));
  const matches = model.elements.filter(element => classIds.has(element.modelElementId) && elementName(element) === trace.elementName);
  return matches.length === 1 ? matches[0].id : undefined;
}

const filesEndpoint = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/files`;

export const simulationResultsService = {
  async list(projectId: string): Promise<StoredReport[]> {
    const files = await apiClient.get<StoredReport[]>(`${filesEndpoint(projectId)}?type=other`);
    return files.filter(file => file.metadata?.kind === REPORT_KIND && text(file.metadata.modelId));
  },

  async get(projectId: string, id: string): Promise<SimulationReport> {
    const file = await apiClient.get<{ data: string }>(`${filesEndpoint(projectId)}/${encodeURIComponent(id)}/data`);
    const bytes = Uint8Array.from(atob(file.data), character => character.charCodeAt(0));
    return parseSimulationReport(new TextDecoder().decode(bytes));
  },

  async store(projectId: string, file: File, report: SimulationReport, model: Model, metamodel?: Metamodel): Promise<StoredReport> {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('Could not read the report file.'));
      reader.readAsDataURL(file);
    });
    const metadata: StoredReport['metadata'] = { kind: REPORT_KIND, modelId: model.id };
    if (model.id !== report.provenance.modelId) {
      const traces = [...report.ruleFindings.flatMap(finding => finding.elements), ...report.deviations.map(finding => finding.trace)];
      metadata.elementIds = Object.fromEntries(traces.flatMap(trace => {
        const id = resolveSimulationElementId(report, trace, model, metamodel);
        return id ? [[trace.elementId, id]] : [];
      }));
    }
    const saved = await apiClient.post<{ id: string; filename: string }>(`${filesEndpoint(projectId)}/upload-base64`, {
      data, filename: file.name, mimetype: 'application/json', type: 'other', metadata,
    });
    return { ...saved, metadata };
  },
};
