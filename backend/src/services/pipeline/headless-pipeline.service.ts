import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../middleware';
import {
  CodeGenerationTemplate,
  HeadlessPipelineDefinition,
  HeadlessPipelineRun,
  HeadlessPipelineStep,
  HeadlessPipelineStepResult,
  Metamodel,
  Model,
} from '../../../../shared/types';
import { contentHash } from '../lifecycle/canonical';
import { projectCheckpointService } from '../lifecycle/project-checkpoint.service';
import { codeGenerationEngine } from './code-generation.engine';
import { modelValidationEngine } from './model-validation.engine';
import { testExecutionEngine } from './test-execution.engine';
import { transformationEngine } from './transformation.engine';

class PipelineStepFailure extends Error {
  constructor(message: string, readonly output?: Record<string, any>) {
    super(message);
  }
}

const mapModel = (row: any): Model => ({
  id: row.id,
  projectId: row.projectId || undefined,
  name: row.name,
  description: row.description || undefined,
  metamodelId: row.metamodelId,
  conformsTo: row.conformsToId,
  elements: Array.isArray(row.elements) ? row.elements : [],
  connections: Array.isArray(row.connections) ? row.connections : [],
});

const mapMetamodel = (row: any): Metamodel => ({
  id: row.id,
  projectId: row.projectId || undefined,
  name: row.name,
  description: row.description || undefined,
  eClass: row.eClass || '',
  uri: row.uri,
  prefix: row.prefix,
  conformsTo: row.conformsToId,
  classes: Array.isArray(row.classes) ? row.classes : [],
  enums: Array.isArray(row.enums) ? row.enums : [],
  constraints: Array.isArray(row.constraints) ? row.constraints : [],
});

const mapRun = (row: any): HeadlessPipelineRun => {
  const result = row.result && typeof row.result === 'object' ? row.result as any : {};
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    status: row.status,
    definition: row.definition as HeadlessPipelineDefinition,
    sourceCheckpointId: row.sourceCheckpointId || undefined,
    contentHash: row.contentHash || undefined,
    results: Array.isArray(result.steps) ? result.steps : [],
    failureMessage: row.failureMessage || undefined,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
  };
};

export class HeadlessPipelineService {
  private assertDefinition(definition: HeadlessPipelineDefinition): void {
    if (!definition || typeof definition !== 'object' || !definition.name?.trim()) {
      throw new ApiError(400, 'Pipeline name is required');
    }
    if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
      throw new ApiError(400, 'Pipeline must contain at least one step');
    }
    const ids = new Set<string>();
    definition.steps.forEach((step, index) => {
      if (!step?.id?.trim()) throw new ApiError(400, `steps[${index}].id is required`);
      if (ids.has(step.id)) throw new ApiError(400, `Duplicate pipeline step ID ${step.id}`);
      ids.add(step.id);
      if (!['validate-model', 'generate', 'run-tests', 'apply-transformation'].includes(step.kind)) {
        throw new ApiError(400, `Unsupported pipeline step kind ${(step as any).kind}`);
      }
      if (!(step as any).modelId) throw new ApiError(400, `steps[${index}].modelId is required`);
      if (step.kind === 'generate' && !step.codegenProjectId) {
        throw new ApiError(400, `steps[${index}].codegenProjectId is required`);
      }
      if (step.kind === 'apply-transformation' && !step.ruleId) {
        throw new ApiError(400, `steps[${index}].ruleId is required`);
      }
    });
  }

  private async loadModelContext(projectId: string, modelId: string): Promise<{
    model: Model;
    metamodel: Metamodel;
  }> {
    const modelRow = await prisma.model.findFirst({ where: { id: modelId, projectId } });
    if (!modelRow) throw new ApiError(404, `Model ${modelId} not found in this project`);
    const metamodelRow = await prisma.metamodel.findFirst({
      where: { id: modelRow.conformsToId, projectId },
    });
    if (!metamodelRow) throw new ApiError(409, `Model ${modelId} has no project-local metamodel`);
    return { model: mapModel(modelRow), metamodel: mapMetamodel(metamodelRow) };
  }

  private async executeStep(
    projectId: string,
    step: HeadlessPipelineStep
  ): Promise<Record<string, any>> {
    const { model, metamodel } = await this.loadModelContext(projectId, step.modelId);
    if (step.kind === 'validate-model') {
      const validation = modelValidationEngine.validate(model, metamodel);
      if (!validation.valid) throw new PipelineStepFailure('Model validation failed', validation as any);
      return validation as any;
    }
    if (step.kind === 'generate') {
      const generator = await prisma.codeGenerationProject.findFirst({
        where: { id: step.codegenProjectId, projectId },
      });
      if (!generator) throw new ApiError(404, 'Code-generation project not found in this project');
      if (generator.targetMetamodelId && generator.targetMetamodelId !== metamodel.id) {
        throw new ApiError(409, 'Code-generation project targets a different metamodel');
      }
      const files = codeGenerationEngine.generate(
        model,
        metamodel,
        Array.isArray(generator.templates) ? generator.templates as unknown as CodeGenerationTemplate[] : []
      );
      return { files };
    }
    if (step.kind === 'run-tests') {
      const output = await testExecutionEngine.run(projectId, model, metamodel);
      if (output.failed > 0) throw new PipelineStepFailure(`${output.failed} model test(s) failed`, output);
      return output;
    }
    return transformationEngine.apply(
      projectId,
      model,
      metamodel,
      step.ruleId,
      step.maxIterations || 1
    );
  }

  async run(
    projectId: string,
    definition: HeadlessPipelineDefinition,
    userId: string
  ): Promise<HeadlessPipelineRun> {
    this.assertDefinition(definition);
    const normalizedDefinition: HeadlessPipelineDefinition = {
      ...definition,
      name: definition.name.trim(),
      steps: definition.steps.map(step => ({ ...step })),
    };
    const checkpoint = await projectCheckpointService.create(projectId, userId, {
      tag: definition.checkpointTag,
      message: `Pipeline source: ${normalizedDefinition.name}`,
    });
    const startedAt = new Date();
    const runRow = await prisma.pipelineRun.create({
      data: {
        projectId,
        name: normalizedDefinition.name,
        status: 'RUNNING',
        definition: normalizedDefinition as any,
        sourceCheckpointId: checkpoint.id,
        createdById: userId,
        startedAt,
      },
    });
    const results: HeadlessPipelineStepResult[] = [];
    let failureMessage: string | undefined;

    for (const step of normalizedDefinition.steps) {
      try {
        const output = await this.executeStep(projectId, step);
        results.push({ stepId: step.id, kind: step.kind, status: 'SUCCEEDED', output });
      } catch (error) {
        failureMessage = error instanceof Error ? error.message : String(error);
        results.push({
          stepId: step.id,
          kind: step.kind,
          status: 'FAILED',
          ...((error as PipelineStepFailure).output && { output: (error as PipelineStepFailure).output }),
          error: failureMessage,
        });
        break;
      }
    }

    const status = failureMessage ? 'FAILED' as const : 'SUCCEEDED' as const;
    const completedAt = new Date();
    const deterministicResult = {
      sourceCheckpointHash: checkpoint.contentHash,
      definition: normalizedDefinition,
      steps: results,
    };
    const runHash = contentHash(deterministicResult);
    await prisma.pipelineRun.update({
      where: { id: runRow.id },
      data: {
        status,
        result: deterministicResult as unknown as Prisma.InputJsonValue,
        contentHash: runHash,
        failureMessage: failureMessage || null,
        completedAt,
      },
    });

    return {
      id: runRow.id,
      projectId,
      name: normalizedDefinition.name,
      status,
      definition: normalizedDefinition,
      sourceCheckpointId: checkpoint.id,
      contentHash: runHash,
      results,
      failureMessage,
      createdById: userId,
      createdAt: runRow.createdAt.toISOString(),
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
    };
  }

  async list(projectId: string): Promise<HeadlessPipelineRun[]> {
    const rows = await prisma.pipelineRun.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapRun);
  }

  async get(projectId: string, runId: string): Promise<HeadlessPipelineRun> {
    const row = await prisma.pipelineRun.findFirst({ where: { id: runId, projectId } });
    if (!row) throw new ApiError(404, 'Pipeline run not found');
    return mapRun(row);
  }
}

export const headlessPipelineService = new HeadlessPipelineService();
