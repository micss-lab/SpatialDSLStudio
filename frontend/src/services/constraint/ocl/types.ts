import { 
  Model, 
  Metamodel, 
  OCLConstraint,
  MetaClass
} from '../../../models/types';
import { OclEngine } from '@stekoe/ocl.js';

/**
 * Context object passed to OCL service functions
 */
export interface OCLServiceContext {
  oclEngine: OclEngine;
  registeredMetamodels: Set<string>;
  modelService: any;
}

/**
 * Organized constraints by metaclass ID
 */
export interface ConstraintsByClass {
  [metaClassId: string]: OCLConstraint[];
}

/**
 * Interface for metamodel service dependency
 */
export interface IMetamodelService {
  getMetamodelById(id: string): Metamodel | undefined;
  updateMetamodel(id: string, metamodel: Metamodel): void;
}
