import { Metamodel, MetaClass, MetaAttribute, MetaReference } from '../../models/types';

/**
 * Service for handling metamodel inheritance utilities
 */
export class CodegenInheritanceUtilsService {
  /**
   * Get all attributes including inherited ones
   */
  getAllAttributes(metaClass: MetaClass, metamodel: Metamodel): MetaAttribute[] {
    const allAttributes: MetaAttribute[] = [...(metaClass.attributes || [])];
    const processed = new Set<string>([metaClass.id]);
    const collect = (current: MetaClass) => {
      if (current.superTypes && current.superTypes.length > 0) {
        for (const superId of current.superTypes) {
          if (processed.has(superId)) continue;
          processed.add(superId);
          const superCls = metamodel.classes.find(c => c.id === superId);
          if (superCls) {
            allAttributes.push(...(superCls.attributes || []));
            collect(superCls);
          }
        }
      }
    };
    collect(metaClass);
    return allAttributes;
  }

  /**
   * Get all references including inherited ones
   */
  getAllReferences(metaClass: MetaClass, metamodel: Metamodel): MetaReference[] {
    const allReferences: MetaReference[] = [...(metaClass.references || [])];
    const processed = new Set<string>([metaClass.id]);
    const collect = (current: MetaClass) => {
      if (current.superTypes && current.superTypes.length > 0) {
        for (const superId of current.superTypes) {
          if (processed.has(superId)) continue;
          processed.add(superId);
          const superCls = metamodel.classes.find(c => c.id === superId);
          if (superCls) {
            allReferences.push(...(superCls.references || []));
            collect(superCls);
          }
        }
      }
    };
    collect(metaClass);
    return allReferences;
  }
}

export const codegenInheritanceUtilsService = new CodegenInheritanceUtilsService();
