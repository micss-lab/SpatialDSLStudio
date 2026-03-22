import { 
  Model, 
  Metamodel, 
  JSConstraint 
} from '../../../models/types';

/**
 * Interface for model service dependency
 */
export interface IModelService {
  getModelById(id: string): Model | undefined;
}

/**
 * Interface for metamodel service dependency
 */
export interface IMetamodelService {
  getMetamodelById(id: string): Metamodel | undefined;
  updateMetamodel(id: string, metamodel: Metamodel): void;
}

/**
 * Context object passed to JS service functions
 */
export interface JSServiceContext {
  metamodelService: IMetamodelService;
  modelService: IModelService | null;
}

/**
 * Organized constraints by metaclass ID
 */
export interface ConstraintsByClass {
  [metaClassId: string]: JSConstraint[];
}
