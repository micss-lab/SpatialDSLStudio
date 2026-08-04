import { metamodelService } from './metamodel';
import { modelService } from './model';
import { diagramService } from './diagram';
import { metaMetamodelService } from './metametamodel';
import { codeGenerationService } from './codegeneration';
import { transformationService } from './transformation';
import { testGenerationService } from './testing';
import { viewpointService } from './viewpoint.service';

export const clearProjectCachesLocal = (): void => {
  metamodelService.clearCacheLocal();
  modelService.clearCacheLocal();
  diagramService.clearCacheLocal();
  metaMetamodelService.clearCacheLocal();
  codeGenerationService.clearCacheLocal();
  transformationService.clearCacheLocal();
  testGenerationService.clearCacheLocal();
  viewpointService.clearCacheLocal();
};

/** Load singleton editor services only after ApiClient has an active project. */
export const initializeProjectSession = async (): Promise<void> => {
  await metaMetamodelService.clearCacheAndReinitialize();
  await metamodelService.clearCacheAndReinitialize();
  await viewpointService.clearCacheAndReinitialize();
  await Promise.all([
    modelService.clearCacheAndReinitialize(),
    diagramService.clearCacheAndReinitialize(),
    codeGenerationService.clearCacheAndReinitialize(),
    transformationService.clearCacheAndReinitialize(),
    testGenerationService.clearCacheAndReinitialize(),
  ]);
};
