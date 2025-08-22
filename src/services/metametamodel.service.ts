import { EPackage, EClass, EAttribute, EReference } from '../models/types';
import { v4 as uuidv4 } from 'uuid';

class MetaMetamodelService {
  private ePackages: EPackage[] = [];
  private readonly STORAGE_KEY = 'obeo_like_tool_metametamodel';
  private coreEPackage: EPackage;

  constructor() {
    // Load meta-metamodel from localStorage or initialize default
    this.loadFromStorage();
    
    // If no packages exist, create the core Ecore-like package
    if (this.ePackages.length === 0) {
      this.initializeEcore();
    }
    
    // Get the core package for reference
    this.coreEPackage = this.ePackages.find(pkg => pkg.nsURI === 'http://www.modeling-tool.com/ecore') || this.ePackages[0];
  }

  private loadFromStorage(): void {
    try {
      const storedData = localStorage.getItem(this.STORAGE_KEY);
      if (storedData) {
        this.ePackages = JSON.parse(storedData);
      }
    } catch (error) {
      console.error('Error loading meta-metamodel from localStorage:', error);
      this.ePackages = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.ePackages));
    } catch (error) {
      console.error('Error saving meta-metamodel to localStorage:', error);
    }
  }

  private initializeEcore(): void {
    // Create a simplified Ecore-like meta-metamodel
    const ecorePackage: EPackage = {
      id: uuidv4(),
      name: 'Ecore',
      nsURI: 'http://www.modeling-tool.com/ecore',
      nsPrefix: 'ecore',
      classes: []
    };

    // Create the EClass for classes
    const eClassId = uuidv4();
    const eClass: EClass = {
      id: eClassId,
      name: 'EClass',
      abstract: false,
      superTypes: [],
      attributes: [],
      references: []
    };

    // Create the EClass for attributes
    const eAttributeId = uuidv4();
    const eAttribute: EClass = {
      id: eAttributeId,
      name: 'EAttribute',
      abstract: false,
      superTypes: [],
      attributes: [],
      references: []
    };

    // Create the EClass for references
    const eReferenceId = uuidv4();
    const eReference: EClass = {
      id: eReferenceId,
      name: 'EReference',
      abstract: false,
      superTypes: [],
      attributes: [],
      references: []
    };

    // Create the EClass for packages
    const ePackageId = uuidv4();
    const ePackage: EClass = {
      id: ePackageId,
      name: 'EPackage',
      abstract: false,
      superTypes: [],
      attributes: [],
      references: []
    };
    
    // Create the EClass for transformation patterns
    const patternId = uuidv4();
    const pattern: EClass = {
      id: patternId,
      name: 'Pattern',
      abstract: false,
      superTypes: [],
      attributes: [],
      references: []
    };
    
    // Create the EClass for pattern elements
    const patternElementId = uuidv4();
    const patternElement: EClass = {
      id: patternElementId,
      name: 'PatternElement',
      abstract: false,
      superTypes: [],
      attributes: [],
      references: []
    };
    
    // Create the EClass for transformation rules
    const transformationRuleId = uuidv4();
    const transformationRule: EClass = {
      id: transformationRuleId,
      name: 'TransformationRule',
      abstract: false,
      superTypes: [],
      attributes: [],
      references: []
    };

    // Add attributes to EClass
    eClass.attributes.push({
      id: uuidv4(),
      name: 'name',
      type: 'string',
      required: true,
      many: false
    });

    eClass.attributes.push({
      id: uuidv4(),
      name: 'abstract',
      type: 'boolean',
      defaultValue: false,
      required: false,
      many: false
    });

    // Add references to EClass (for superTypes and attributes)
    eClass.references.push({
      id: uuidv4(),
      name: 'superTypes',
      type: eClassId, // References itself
      containment: false,
      lowerBound: 0,
      upperBound: '*'
    });

    eClass.references.push({
      id: uuidv4(),
      name: 'attributes',
      type: eAttributeId,
      containment: true,
      lowerBound: 0,
      upperBound: '*'
    });

    eClass.references.push({
      id: uuidv4(),
      name: 'references',
      type: eReferenceId,
      containment: true,
      lowerBound: 0,
      upperBound: '*'
    });

    // Add attributes to EAttribute
    eAttribute.attributes.push({
      id: uuidv4(),
      name: 'name',
      type: 'string',
      required: true,
      many: false
    });

    eAttribute.attributes.push({
      id: uuidv4(),
      name: 'type',
      type: 'string',
      required: true,
      many: false
    });

    eAttribute.attributes.push({
      id: uuidv4(),
      name: 'defaultValue',
      type: 'string',
      required: false,
      many: false
    });

    eAttribute.attributes.push({
      id: uuidv4(),
      name: 'required',
      type: 'boolean',
      defaultValue: false,
      required: false,
      many: false
    });

    eAttribute.attributes.push({
      id: uuidv4(),
      name: 'many',
      type: 'boolean',
      defaultValue: false,
      required: false,
      many: false
    });

    // Add attributes to EReference
    eReference.attributes.push({
      id: uuidv4(),
      name: 'name',
      type: 'string',
      required: true,
      many: false
    });

    eReference.attributes.push({
      id: uuidv4(),
      name: 'containment',
      type: 'boolean',
      defaultValue: false,
      required: false,
      many: false
    });

    eReference.attributes.push({
      id: uuidv4(),
      name: 'lowerBound',
      type: 'number',
      defaultValue: 0,
      required: false,
      many: false
    });

    eReference.attributes.push({
      id: uuidv4(),
      name: 'upperBound',
      type: 'string', // Could be a number or '*'
      defaultValue: '*',
      required: false,
      many: false
    });

    // Add reference to EReference
    eReference.references.push({
      id: uuidv4(),
      name: 'type',
      type: eClassId,
      containment: false,
      lowerBound: 1,
      upperBound: 1
    });

    eReference.references.push({
      id: uuidv4(),
      name: 'opposite',
      type: eReferenceId,
      containment: false,
      lowerBound: 0,
      upperBound: 1
    });

    // Add attributes to EPackage
    ePackage.attributes.push({
      id: uuidv4(),
      name: 'name',
      type: 'string',
      required: true,
      many: false
    });

    ePackage.attributes.push({
      id: uuidv4(),
      name: 'nsURI',
      type: 'string',
      required: true,
      many: false
    });

    ePackage.attributes.push({
      id: uuidv4(),
      name: 'nsPrefix',
      type: 'string',
      required: true,
      many: false
    });

    // Add references to EPackage
    ePackage.references.push({
      id: uuidv4(),
      name: 'classes',
      type: eClassId,
      containment: true,
      lowerBound: 0,
      upperBound: '*'
    });
    
    // Add attributes to Pattern
    pattern.attributes.push({
      id: uuidv4(),
      name: 'name',
      type: 'string',
      required: true,
      many: false
    });
    
    pattern.attributes.push({
      id: uuidv4(),
      name: 'type',
      type: 'string', // 'LHS', 'RHS', or 'NAC'
      required: true,
      many: false
    });
    
    // Add references to Pattern
    pattern.references.push({
      id: uuidv4(),
      name: 'elements',
      type: patternElementId,
      containment: true,
      lowerBound: 0,
      upperBound: '*'
    });
    
    // Add attributes to PatternElement
    patternElement.attributes.push({
      id: uuidv4(),
      name: 'name',
      type: 'string',
      required: true,
      many: false
    });
    
    // Add references to PatternElement
    patternElement.references.push({
      id: uuidv4(),
      name: 'type',
      type: eClassId,
      containment: false,
      lowerBound: 1,
      upperBound: 1
    });
    
    patternElement.references.push({
      id: uuidv4(),
      name: 'attributes',
      type: eAttributeId,
      containment: true,
      lowerBound: 0,
      upperBound: '*'
    });
    
    patternElement.references.push({
      id: uuidv4(),
      name: 'references',
      type: eReferenceId,
      containment: true,
      lowerBound: 0,
      upperBound: '*'
    });
    
    // Add attributes to TransformationRule
    transformationRule.attributes.push({
      id: uuidv4(),
      name: 'name',
      type: 'string',
      required: true,
      many: false
    });
    
    transformationRule.attributes.push({
      id: uuidv4(),
      name: 'priority',
      type: 'number',
      defaultValue: 0,
      required: false,
      many: false
    });
    
    transformationRule.attributes.push({
      id: uuidv4(),
      name: 'enabled',
      type: 'boolean',
      defaultValue: true,
      required: false,
      many: false
    });
    
    // Add references to TransformationRule
    transformationRule.references.push({
      id: uuidv4(),
      name: 'lhs',
      type: patternId,
      containment: false,
      lowerBound: 1,
      upperBound: 1
    });
    
    transformationRule.references.push({
      id: uuidv4(),
      name: 'rhs',
      type: patternId,
      containment: false,
      lowerBound: 1,
      upperBound: 1
    });
    
    transformationRule.references.push({
      id: uuidv4(),
      name: 'nacs',
      type: patternId,
      containment: false,
      lowerBound: 0,
      upperBound: '*'
    });

    // Add all classes to the package
    ecorePackage.classes.push(eClass);
    ecorePackage.classes.push(eAttribute);
    ecorePackage.classes.push(eReference);
    ecorePackage.classes.push(ePackage);
    ecorePackage.classes.push(pattern);
    ecorePackage.classes.push(patternElement);
    ecorePackage.classes.push(transformationRule);

    // Add the package to our collection
    this.ePackages.push(ecorePackage);
    
    // Save to storage
    this.saveToStorage();
  }

  getAllEPackages(): EPackage[] {
    return [...this.ePackages];
  }

  getEPackageById(id: string): EPackage | undefined {
    return this.ePackages.find(pkg => pkg.id === id);
  }

  getCoreEPackage(): EPackage {
    return this.coreEPackage;
  }

  getEClassById(packageId: string, classId: string): EClass | undefined {
    const pkg = this.getEPackageById(packageId);
    if (!pkg) return undefined;
    return pkg.classes.find(cls => cls.id === classId);
  }

  getEClassByName(packageId: string, name: string): EClass | undefined {
    const pkg = this.getEPackageById(packageId);
    if (!pkg) return undefined;
    return pkg.classes.find(cls => cls.name === name);
  }

  createEPackage(name: string, nsURI: string, nsPrefix: string): EPackage {
    const newPackage: EPackage = {
      id: uuidv4(),
      name,
      nsURI,
      nsPrefix,
      classes: []
    };

    this.ePackages.push(newPackage);
    this.saveToStorage();
    return newPackage;
  }

  createEClass(packageId: string, name: string, abstract: boolean = false): EClass | undefined {
    const pkg = this.getEPackageById(packageId);
    if (!pkg) return undefined;

    const newClass: EClass = {
      id: uuidv4(),
      name,
      abstract,
      superTypes: [],
      attributes: [],
      references: []
    };

    pkg.classes.push(newClass);
    this.saveToStorage();
    return newClass;
  }

  addEAttribute(
    packageId: string,
    classId: string,
    name: string,
    type: 'string' | 'number' | 'boolean' | 'date',
    defaultValue?: any,
    required: boolean = false,
    many: boolean = false
  ): EAttribute | undefined {
    const cls = this.getEClassById(packageId, classId);
    if (!cls) return undefined;

    const newAttribute: EAttribute = {
      id: uuidv4(),
      name,
      type,
      defaultValue,
      required,
      many
    };

    cls.attributes.push(newAttribute);
    this.saveToStorage();
    return newAttribute;
  }

  addEReference(
    packageId: string,
    classId: string,
    name: string,
    targetClassId: string,
    containment: boolean = false,
    lowerBound: number = 0,
    upperBound: number | '*' = '*',
    oppositeId?: string
  ): EReference | undefined {
    const cls = this.getEClassById(packageId, classId);
    if (!cls) return undefined;

    const newReference: EReference = {
      id: uuidv4(),
      name,
      type: targetClassId,
      containment,
      lowerBound,
      upperBound,
      opposite: oppositeId
    };

    cls.references.push(newReference);
    this.saveToStorage();
    return newReference;
  }

  updateEPackage(id: string, updates: Partial<EPackage>): boolean {
    const packageIndex = this.ePackages.findIndex(pkg => pkg.id === id);
    if (packageIndex === -1) return false;

    // Prevent changing the ID
    const { id: _, ...restUpdates } = updates;

    this.ePackages[packageIndex] = {
      ...this.ePackages[packageIndex],
      ...restUpdates
    };

    this.saveToStorage();
    return true;
  }

  updateEClass(packageId: string, classId: string, updates: Partial<EClass>): boolean {
    const pkg = this.getEPackageById(packageId);
    if (!pkg) return false;

    const classIndex = pkg.classes.findIndex(cls => cls.id === classId);
    if (classIndex === -1) return false;

    // Prevent changing the ID
    const { id: _, ...restUpdates } = updates;

    pkg.classes[classIndex] = {
      ...pkg.classes[classIndex],
      ...restUpdates
    };

    this.saveToStorage();
    return true;
  }

  deleteEPackage(id: string): boolean {
    // Don't allow deleting the core package
    if (id === this.coreEPackage.id) return false;

    const initialLength = this.ePackages.length;
    this.ePackages = this.ePackages.filter(pkg => pkg.id !== id);
    
    if (initialLength !== this.ePackages.length) {
      this.saveToStorage();
      return true;
    }
    
    return false;
  }

  deleteEClass(packageId: string, classId: string): boolean {
    const pkg = this.getEPackageById(packageId);
    if (!pkg) return false;

    const initialLength = pkg.classes.length;
    pkg.classes = pkg.classes.filter(cls => cls.id !== classId);
    
    if (initialLength !== pkg.classes.length) {
      // Also remove references to this class
      for (const pkgItem of this.ePackages) {
        for (const cls of pkgItem.classes) {
          // Remove from superTypes
          cls.superTypes = cls.superTypes.filter(st => st !== classId);
          
          // Update references that point to this class
          cls.references = cls.references.filter(ref => ref.type !== classId);
        }
      }
      
      this.saveToStorage();
      return true;
    }
    
    return false;
  }

  deleteEAttribute(packageId: string, classId: string, attributeId: string): boolean {
    const cls = this.getEClassById(packageId, classId);
    if (!cls) return false;

    const initialLength = cls.attributes.length;
    cls.attributes = cls.attributes.filter(attr => attr.id !== attributeId);
    
    if (initialLength !== cls.attributes.length) {
      this.saveToStorage();
      return true;
    }
    
    return false;
  }

  deleteEReference(packageId: string, classId: string, referenceId: string): boolean {
    const cls = this.getEClassById(packageId, classId);
    if (!cls) return false;

    const initialLength = cls.references.length;
    const refToDelete = cls.references.find(ref => ref.id === referenceId);
    
    cls.references = cls.references.filter(ref => ref.id !== referenceId);
    
    if (initialLength !== cls.references.length && refToDelete) {
      // If this reference has an opposite, remove the opposite reference as well
      if (refToDelete.opposite) {
        for (const pkg of this.ePackages) {
          for (const c of pkg.classes) {
            const oppositeRefIndex = c.references.findIndex(ref => ref.id === refToDelete.opposite);
            if (oppositeRefIndex !== -1) {
              c.references.splice(oppositeRefIndex, 1);
              break;
            }
          }
        }
      }
      
      this.saveToStorage();
      return true;
    }
    
    return false;
  }
}

export const metaMetamodelService = new MetaMetamodelService(); 