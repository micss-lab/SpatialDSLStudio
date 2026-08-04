import {
  CodeGenerationProject,
  Diagram,
  EPackage,
  Metamodel,
  Model,
  Viewpoint,
} from '../models/types';
import { apiClient, API_ENDPOINTS } from './core';
import { exampleDataService } from './metamodel/exampleData.service';
import { normalizeModelElementSpatial } from './spatial';

export interface SmartWarehouseImportSummary {
  metamodels: number;
  models: number;
  viewpoints: number;
  views: number;
  generatorConfigurations: number;
}

const existingIds = <T extends { id: string }>(items: T[]): Set<string> => (
  new Set(items.map(item => item.id))
);

/**
 * Installs the connected Smart Warehouse starter graph into one newly created
 * Studio Project. The operation is idempotent by stable remapped artifact ID,
 * which also makes retrying a partially interrupted import safe.
 */
class SmartWarehouseProjectImportService {
  async importInto(projectId: string): Promise<SmartWarehouseImportSummary> {
    const previousProjectId = apiClient.getProjectId();
    apiClient.setProjectId(projectId);

    try {
      const bundle = exampleDataService.getSmartWarehouseBundle();
      const corePackage = await apiClient.get<EPackage>(API_ENDPOINTS.EPACKAGES_CORE);
      const ePackageClassId = corePackage.classes.find(candidate => candidate.name === 'EPackage')?.id;

      const currentMetamodels = await apiClient.get<Metamodel[]>(API_ENDPOINTS.METAMODELS);
      const metamodelIds = existingIds(currentMetamodels);
      for (const source of bundle.metamodels) {
        if (metamodelIds.has(source.id)) continue;
        await apiClient.post<Metamodel>(API_ENDPOINTS.METAMODELS, {
          ...source,
          conformsTo: corePackage.id,
          ...(ePackageClassId ? { eClass: ePackageClassId } : {}),
        });
      }

      const currentViewpoints = await apiClient.get<Viewpoint[]>(API_ENDPOINTS.VIEWPOINTS);
      const viewpointIds = existingIds(currentViewpoints);
      for (const viewpoint of bundle.viewpoints) {
        if (viewpointIds.has(viewpoint.id)) continue;
        await apiClient.post<Viewpoint>(API_ENDPOINTS.VIEWPOINTS, viewpoint);
      }

      const currentModels = await apiClient.get<Model[]>(API_ENDPOINTS.MODELS);
      const modelIds = existingIds(currentModels);
      for (const source of bundle.models) {
        if (modelIds.has(source.id)) continue;
        await apiClient.post<Model>(API_ENDPOINTS.MODELS, {
          ...source,
          elements: source.elements.map(normalizeModelElementSpatial),
        });
      }

      const currentViews = await apiClient.get<Diagram[]>(API_ENDPOINTS.DIAGRAMS);
      const viewIds = existingIds(currentViews);
      for (const view of bundle.views) {
        if (viewIds.has(view.id)) continue;
        await apiClient.post<Diagram>(API_ENDPOINTS.DIAGRAMS, view);
      }

      const currentProjects = await apiClient.get<CodeGenerationProject[]>(API_ENDPOINTS.CODEGEN_PROJECTS);
      const generatorIds = existingIds(currentProjects);
      for (const project of bundle.projects) {
        if (generatorIds.has(project.id)) continue;
        await apiClient.post<CodeGenerationProject>(API_ENDPOINTS.CODEGEN_PROJECTS, {
          ...project,
          isExample: true,
        });
      }

      return {
        metamodels: bundle.metamodels.length,
        models: bundle.models.length,
        viewpoints: bundle.viewpoints.length,
        views: bundle.views.length,
        generatorConfigurations: bundle.projects.length,
      };
    } finally {
      apiClient.setProjectId(previousProjectId);
    }
  }
}

export const smartWarehouseProjectImportService = new SmartWarehouseProjectImportService();
