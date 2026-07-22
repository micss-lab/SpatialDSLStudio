// Barrel export for diagram services
export { diagramService } from './diagram.service';
export { diagramCrudService } from './diagram-crud.service';
export { diagramElementCrudService } from './diagram-element-crud.service';
export { diagramElementQueryService } from './diagram-element-query.service';
export { diagramMigrationService } from './diagram-migration.service';
export { diagramApiSyncService } from './diagram-api-sync.service';
export { diagramImportExportService } from './diagram-import-export.service';
export { viewProjectionService } from './view-projection.service';
export { appearanceService, defaultAppearance, pixelToMm, mmToPixel } from './appearance.service';
export { concreteSyntaxResolver, defaultResolvedAppearance2D } from './concrete-syntax.resolver';
export { diagramToolExecutionService } from './diagram-tool-execution.service';
export { viewValidationService } from './view-validation.service';
export type { ValidationSeverity } from './view-validation.service';
export {
  getExecutableToolType,
  getToolInitialAttributes,
  getToolOperations,
  normalizeToolType,
} from './tool-definition.utils';
