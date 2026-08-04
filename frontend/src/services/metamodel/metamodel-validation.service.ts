import { Metamodel } from '../../models/types';
import { metaMetamodelService } from '../metametamodel';
import { validateConcreteSyntaxVerticalPlacement } from '../spatial';

export function validateMetamodelVerticalPlacementPolicies(
  metamodel: Pick<Metamodel, 'classes'>
): string[] {
  return (metamodel.classes || []).flatMap((metaClass, index) => (
    metaClass.concreteSyntax === undefined
      ? []
      : validateConcreteSyntaxVerticalPlacement(
        metaClass.concreteSyntax,
        `classes[${index}].concreteSyntax`
      )
  ));
}

/**
 * Validates a metamodel for conformance to its meta-metamodel and internal consistency.
 * 
 * @param metamodel The metamodel to validate
 * @returns Validation result with boolean flag and list of issues
 */
export function validateMetamodel(metamodel: Metamodel): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  issues.push(...validateMetamodelVerticalPlacementPolicies(metamodel));
  
  // Check if the conformsTo refers to a valid meta-metamodel package
  const metaPackage = metaMetamodelService.getEPackageById(metamodel.conformsTo);
  if (!metaPackage) {
    issues.push(`Invalid meta-metamodel reference: ${metamodel.conformsTo}`);
  }

  // Additional validation for the metamodel
  if (!metamodel.name) {
    issues.push('Metamodel must have a name');
  }
  
  if (!metamodel.uri) {
    issues.push('Metamodel must have a URI');
  }
  
  // Check each class
  metamodel.classes.forEach(cls => {
    if (!cls.name) {
      issues.push(`Class ${cls.id} must have a name`);
    }
    
    // Check each attribute
    cls.attributes.forEach(attr => {
      if (!attr.name) {
        issues.push(`Attribute in class ${cls.name} must have a name`);
      }
      
      if (!attr.type) {
        issues.push(`Attribute ${attr.name} in class ${cls.name} must have a type`);
      }
    });
    
    // Check each reference
    cls.references.forEach(ref => {
      if (!ref.name) {
        issues.push(`Reference in class ${cls.name} must have a name`);
      }
      
      // Check if target class exists
      const targetClass = metamodel.classes.find(c => c.id === ref.target);
      if (!targetClass) {
        issues.push(`Reference ${ref.name} in class ${cls.name} points to non-existent class ${ref.target}`);
      }
      
      // Check if opposite reference exists and points back
      if (ref.opposite) {
        let oppositeFound = false;
        
        for (const c of metamodel.classes) {
          for (const r of c.references) {
            if (r.id === ref.opposite) {
              oppositeFound = true;
              
              // Check if opposite reference points back to this reference
              if (r.opposite !== ref.id) {
                issues.push(`Bidirectional reference ${ref.name} in class ${cls.name} has inconsistent opposite reference`);
              }
              
              // Check if opposite reference points to class containing this reference
              if (r.target !== cls.id) {
                issues.push(`Bidirectional reference ${ref.name} in class ${cls.name} has opposite reference pointing to wrong class`);
              }
              
              break;
            }
          }
          if (oppositeFound) break;
        }
        
        if (!oppositeFound) {
          issues.push(`Reference ${ref.name} in class ${cls.name} has non-existent opposite reference`);
        }
      }
    });
  });

  return {
    valid: issues.length === 0,
    issues
  };
}
