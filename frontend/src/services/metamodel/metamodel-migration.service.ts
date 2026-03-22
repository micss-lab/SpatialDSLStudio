import { Metamodel, EPackage } from '../../models/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Migrates metamodels to ensure backward compatibility with newer schema versions.
 * Adds missing properties and ensures all metamodels conform to the latest structure.
 * 
 * @param metamodels Array of metamodels to migrate
 * @param corePackage The core EPackage to reference
 */
export function migrateMetamodels(metamodels: Metamodel[], corePackage: EPackage): void {
  // Guard against undefined corePackage (API not yet initialized)
  if (!corePackage || !corePackage.classes) {
    console.log('Core package not yet available, skipping migration');
    return;
  }
  
  const eAttributeClass = corePackage.classes.find(c => c.name === 'EAttribute');
  
  metamodels.forEach(metamodel => {
    if (!metamodel.conformsTo) {
      metamodel.conformsTo = corePackage.id;
    }
    if (!metamodel.uri) {
      metamodel.uri = `http://www.modeling-tool.com/${metamodel.name.toLowerCase()}`;
    }
    if (!metamodel.prefix) {
      metamodel.prefix = metamodel.name.toLowerCase();
    }
    if (!metamodel.eClass) {
      const ePackageClass = corePackage.classes.find(cls => cls.name === 'EPackage');
      if (ePackageClass) {
        metamodel.eClass = ePackageClass.id;
      }
    }
    
    // Initialize metamodel constraints array if not present
    if (!metamodel.constraints) {
      metamodel.constraints = [];
    }

    // Update metaclasses
    metamodel.classes.forEach(cls => {
      if (!cls.eClass) {
        const eClassClass = corePackage.classes.find(c => c.name === 'EClass');
        if (eClassClass) {
          cls.eClass = eClassClass.id;
        }
      }
      if (!cls.abstract) {
        cls.abstract = false;
      }
      if (!cls.superTypes) {
        cls.superTypes = [];
      }
      
      // Initialize metaclass constraints array if not present
      if (!cls.constraints) {
        cls.constraints = [];
      }

      // Ensure each metaclass has a 'name' attribute
      const hasNameAttribute = cls.attributes.some(attr => attr.name === 'name');
      console.log(`Checking class ${cls.name} for name attribute: ${hasNameAttribute ? 'found' : 'not found'}`);
      
      if (eAttributeClass && !hasNameAttribute) {
        console.log(`Adding missing name attribute to existing class: ${cls.name}`);
        const nameAttribute = {
          id: uuidv4(),
          name: 'name',
          eClass: eAttributeClass.id,
          type: 'string' as const,
          defaultValue: '',
          required: true,
          many: false
        };
        cls.attributes.push(nameAttribute);
      }

      // Update attributes
      cls.attributes.forEach(attr => {
        if (!attr.eClass) {
          const eAttrClass = corePackage.classes.find(c => c.name === 'EAttribute');
          if (eAttrClass) {
            attr.eClass = eAttrClass.id;
          }
        }
        if (attr.many === undefined) {
          attr.many = false;
        }
      });

      // Update references
      cls.references.forEach(ref => {
        if (!ref.eClass) {
          const eReferenceClass = corePackage.classes.find(c => c.name === 'EReference');
          if (eReferenceClass) {
            ref.eClass = eReferenceClass.id;
          }
        }
        if (!ref.opposite) {
          ref.opposite = undefined;
        }
      });
    });
  });
}
