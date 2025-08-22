import { MetaClass, Metamodel, MetaAttribute, MetaReference } from '../models/types';
import { v4 as uuidv4 } from 'uuid';
import { metaMetamodelService } from './metametamodel.service';

class MetamodelService {
  private metamodels: Metamodel[] = [];
  private readonly STORAGE_KEY = 'obeo_like_tool_metamodels';

  constructor() {
    // Load metamodels from localStorage if available
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const storedData = localStorage.getItem(this.STORAGE_KEY);
      if (storedData) {
        this.metamodels = JSON.parse(storedData);

        // Ensure all metamodels have the new conformsTo property
        const corePackage = metaMetamodelService.getCoreEPackage();
        const eAttributeClass = corePackage.classes.find(c => c.name === 'EAttribute');
        
        this.metamodels.forEach(metamodel => {
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
              const nameAttribute: MetaAttribute = {
                id: uuidv4(),
                name: 'name',
                eClass: eAttributeClass.id,
                type: 'string',
                defaultValue: '',
                required: true,
                many: false
              };
              cls.attributes.push(nameAttribute);
            }

            // Update attributes
            cls.attributes.forEach(attr => {
              if (!attr.eClass) {
                const eAttributeClass = corePackage.classes.find(c => c.name === 'EAttribute');
                if (eAttributeClass) {
                  attr.eClass = eAttributeClass.id;
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

        // Save the updated metamodels
        this.saveToStorage();
      }
    } catch (error) {
      console.error('Error loading metamodels from localStorage:', error);
      this.metamodels = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.metamodels));
    } catch (error) {
      console.error('Error saving metamodels to localStorage:', error);
    }
  }

  getAllMetamodels(): Metamodel[] {
    return [...this.metamodels];
  }

  getMetamodelById(id: string): Metamodel | undefined {
    return this.metamodels.find(mm => mm.id === id);
  }

  createMetamodel(name: string): Metamodel {
    const corePackage = metaMetamodelService.getCoreEPackage();
    const ePackageClass = corePackage.classes.find(cls => cls.name === 'EPackage');
    
    const newMetamodel: Metamodel = {
      id: uuidv4(),
      name,
      eClass: ePackageClass ? ePackageClass.id : '',
      uri: `http://www.modeling-tool.com/${name.toLowerCase()}`,
      prefix: name.toLowerCase(),
      classes: [],
      conformsTo: corePackage.id,
      constraints: []
    };
    
    this.metamodels.push(newMetamodel);
    this.saveToStorage();
    return newMetamodel;
  }

  deleteMetamodel(id: string): boolean {
    const initialLength = this.metamodels.length;
    this.metamodels = this.metamodels.filter(mm => mm.id !== id);
    const result = initialLength !== this.metamodels.length;
    if (result) {
      this.saveToStorage();
    }
    return result;
  }

  addMetaClass(metamodelId: string, name: string, abstract: boolean = false): MetaClass | null {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) {
      console.error('Metamodel not found:', metamodelId);
      return null;
    }

    const corePackage = metaMetamodelService.getCoreEPackage();
    if (!corePackage) {
      console.error('Core package not found');
      return null;
    }
    
    const eClassClass = corePackage.classes.find(cls => cls.name === 'EClass');
    if (!eClassClass) {
      console.error('EClass not found in core package');
      return null;
    }
    
    const eAttributeClass = corePackage.classes.find(cls => cls.name === 'EAttribute');
    if (!eAttributeClass) {
      console.error('EAttribute not found in core package');
      return null;
    }

    // Create the class first
    const newClassId = uuidv4();
    const newClass: MetaClass = {
      id: newClassId,
      name,
      eClass: eClassClass.id,
      abstract,
      superTypes: [],
      attributes: [],
      references: [],
      constraints: []
    };

    // Create a name attribute
    const nameAttributeId = uuidv4();
    const nameAttribute: MetaAttribute = {
      id: nameAttributeId,
      name: 'name',
      eClass: eAttributeClass.id,
      type: 'string',
      defaultValue: '',
      required: true,
      many: false
    };
    
    // Add the name attribute to the class attributes
    newClass.attributes = [nameAttribute];
    
    console.log('Created metaclass with name attribute:', {
      class: newClass,
      nameAttribute: nameAttribute
    });

    // Add the new class to the metamodel
    metamodel.classes.push(newClass);
    
    // Save changes to storage
    this.saveToStorage();
    
    return newClass;
  }

  addMetaAttribute(
    metamodelId: string, 
    classId: string, 
    name: string, 
    type: 'string' | 'number' | 'boolean' | 'date', 
    defaultValue?: any,
    required?: boolean,
    many: boolean = false
  ): MetaAttribute | null {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return null;

    const targetClass = metamodel.classes.find(c => c.id === classId);
    if (!targetClass) return null;

    const corePackage = metaMetamodelService.getCoreEPackage();
    const eAttributeClass = corePackage.classes.find(cls => cls.name === 'EAttribute');

    const newAttribute: MetaAttribute = {
      id: uuidv4(),
      name,
      eClass: eAttributeClass ? eAttributeClass.id : '',
      type,
      defaultValue,
      required,
      many
    };

    targetClass.attributes.push(newAttribute);
    this.saveToStorage();
    return newAttribute;
  }

  addMetaReference(
    metamodelId: string,
    sourceClassId: string,
    name: string,
    targetClassId: string,
    containment: boolean = false,
    lowerBound: number = 0,
    upperBound: number | '*' = '*',
    opposite?: string,
    allowSelfReference: boolean = false
  ): MetaReference | null {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return null;

    const sourceClass = metamodel.classes.find(c => c.id === sourceClassId);
    if (!sourceClass) return null;

    const targetClass = metamodel.classes.find(c => c.id === targetClassId);
    if (!targetClass) return null;

    const corePackage = metaMetamodelService.getCoreEPackage();
    const eReferenceClass = corePackage.classes.find(cls => cls.name === 'EReference');
    if (!eReferenceClass) return null;

    const newReference: MetaReference = {
      id: uuidv4(),
      name,
      eClass: eReferenceClass.id,
      target: targetClassId,
      containment,
      cardinality: {
        lowerBound,
        upperBound
      },
      opposite,
      allowSelfReference,
      attributes: []
    };

    sourceClass.references.push(newReference);
    this.saveToStorage();
    return newReference;
  }

  // Add an attribute to a reference
  addReferenceAttribute(
    metamodelId: string,
    classId: string,
    referenceId: string,
    name: string,
    type: 'string' | 'number' | 'boolean' | 'date',
    defaultValue?: any,
    required?: boolean,
    many: boolean = false
  ): MetaAttribute | null {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return null;

    const targetClass = metamodel.classes.find(c => c.id === classId);
    if (!targetClass) return null;

    const targetReference = targetClass.references.find(r => r.id === referenceId);
    if (!targetReference) return null;

    const corePackage = metaMetamodelService.getCoreEPackage();
    const eAttributeClass = corePackage.classes.find(cls => cls.name === 'EAttribute');
    if (!eAttributeClass) return null;

    // Initialize attributes array if it doesn't exist
    if (!targetReference.attributes) {
      targetReference.attributes = [];
    }

    const newAttribute: MetaAttribute = {
      id: uuidv4(),
      name,
      eClass: eAttributeClass.id,
      type,
      defaultValue,
      required,
      many
    };

    targetReference.attributes.push(newAttribute);
    this.saveToStorage();
    return newAttribute;
  }

  // Delete a reference attribute
  deleteReferenceAttribute(
    metamodelId: string,
    classId: string,
    referenceId: string,
    attributeId: string
  ): boolean {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return false;

    const targetClass = metamodel.classes.find(c => c.id === classId);
    if (!targetClass) return false;

    const targetReference = targetClass.references.find(r => r.id === referenceId);
    if (!targetReference || !targetReference.attributes) return false;

    const initialLength = targetReference.attributes.length;
    targetReference.attributes = targetReference.attributes.filter(a => a.id !== attributeId);
    
    const result = initialLength !== targetReference.attributes.length;
    if (result) {
      this.saveToStorage();
    }
    return result;
  }

  // Update a reference attribute
  updateReferenceAttribute(
    metamodelId: string,
    classId: string,
    referenceId: string,
    attributeId: string,
    updates: Partial<MetaAttribute>
  ): boolean {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return false;

    const targetClass = metamodel.classes.find(c => c.id === classId);
    if (!targetClass) return false;

    const targetReference = targetClass.references.find(r => r.id === referenceId);
    if (!targetReference || !targetReference.attributes) return false;

    const attributeIndex = targetReference.attributes.findIndex(a => a.id === attributeId);
    if (attributeIndex === -1) return false;

    targetReference.attributes[attributeIndex] = {
      ...targetReference.attributes[attributeIndex],
      ...updates
    };

    this.saveToStorage();
    return true;
  }

  // Methods for updating and deleting classes, attributes, and references
  updateMetaClass(metamodelId: string, classId: string, updates: Partial<MetaClass>): boolean {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return false;

    const classIndex = metamodel.classes.findIndex(c => c.id === classId);
    if (classIndex === -1) return false;

    metamodel.classes[classIndex] = {
      ...metamodel.classes[classIndex],
      ...updates,
      id: classId // Ensure ID doesn't change
    };

    this.saveToStorage();
    return true;
  }

  updateMetaAttribute(
    metamodelId: string,
    classId: string,
    attributeId: string,
    updates: Partial<MetaAttribute>
  ): boolean {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return false;

    const targetClass = metamodel.classes.find(c => c.id === classId);
    if (!targetClass) return false;

    const attrIndex = targetClass.attributes.findIndex(a => a.id === attributeId);
    if (attrIndex === -1) return false;

    targetClass.attributes[attrIndex] = {
      ...targetClass.attributes[attrIndex],
      ...updates,
      id: attributeId // Ensure ID doesn't change
    };

    this.saveToStorage();
    return true;
  }

  updateMetaReference(
    metamodelId: string,
    classId: string,
    referenceId: string,
    updates: Partial<MetaReference>
  ): boolean {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return false;

    const targetClass = metamodel.classes.find(c => c.id === classId);
    if (!targetClass) return false;

    const refIndex = targetClass.references.findIndex(r => r.id === referenceId);
    if (refIndex === -1) return false;

    targetClass.references[refIndex] = {
      ...targetClass.references[refIndex],
      ...updates,
      id: referenceId // Ensure ID doesn't change
    };

    this.saveToStorage();
    return true;
  }

  deleteMetaClass(metamodelId: string, classId: string): boolean {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return false;

    const initialLength = metamodel.classes.length;
    metamodel.classes = metamodel.classes.filter(c => c.id !== classId);
    
    // Also remove references to this class
    metamodel.classes.forEach(cls => {
      cls.references = cls.references.filter(ref => ref.target !== classId);
      cls.superTypes = cls.superTypes.filter(st => st !== classId);
    });

    const result = initialLength !== metamodel.classes.length;
    if (result) {
      this.saveToStorage();
    }
    return result;
  }

  deleteMetaAttribute(metamodelId: string, classId: string, attributeId: string): boolean {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return false;

    const targetClass = metamodel.classes.find(c => c.id === classId);
    if (!targetClass) return false;

    const initialLength = targetClass.attributes.length;
    targetClass.attributes = targetClass.attributes.filter(a => a.id !== attributeId);
    
    const result = initialLength !== targetClass.attributes.length;
    if (result) {
      this.saveToStorage();
    }
    return result;
  }

  deleteMetaReference(metamodelId: string, classId: string, referenceId: string): boolean {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return false;

    const targetClass = metamodel.classes.find(c => c.id === classId);
    if (!targetClass) return false;

    const initialLength = targetClass.references.length;
    
    // Get the reference to delete to check for bidirectional references
    const referenceToDelete = targetClass.references.find(r => r.id === referenceId);
    targetClass.references = targetClass.references.filter(r => r.id !== referenceId);
    
    // If the reference has an opposite, also remove the opposite reference
    if (referenceToDelete && referenceToDelete.opposite) {
      for (const cls of metamodel.classes) {
        const oppositeRefIndex = cls.references.findIndex(r => r.id === referenceToDelete.opposite);
        if (oppositeRefIndex !== -1) {
          cls.references.splice(oppositeRefIndex, 1);
          break;
        }
      }
    }
    
    const result = initialLength !== targetClass.references.length;
    if (result) {
      this.saveToStorage();
    }
    return result;
  }

  // Check if a metamodel conforms to its meta-metamodel
  validateMetamodel(metamodelId: string): { valid: boolean; issues: string[] } {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) {
      return { valid: false, issues: ['Metamodel not found'] };
    }

    const issues: string[] = [];
    
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

  /**
   * Update an existing metamodel
   * @param id The ID of the metamodel to update
   * @param updatedMetamodel The new metamodel data
   * @returns The updated metamodel or undefined if not found
   */
  updateMetamodel(id: string, updatedMetamodel: Metamodel): Metamodel | undefined {
    const index = this.metamodels.findIndex(m => m.id === id);
    if (index === -1) return undefined;
    
    this.metamodels[index] = updatedMetamodel;
    this.saveToStorage();
    return updatedMetamodel;
  }

  /**
   * Download metamodel as JSON file
   * @param metamodelId The ID of the metamodel to download
   * @returns True if download was initiated, false otherwise
   */
  downloadMetamodelAsJson(metamodelId: string): boolean {
    const metamodel = this.getMetamodelById(metamodelId);
    if (!metamodel) return false;
    
    // Create a blob and trigger download
    const blob = new Blob([JSON.stringify(metamodel, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metamodel.name.replace(/\s+/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    return true;
  }
}

export const metamodelService = new MetamodelService(); 