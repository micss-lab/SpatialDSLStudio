import { v4 as uuidv4 } from 'uuid';
import { 
  Model, 
  ModelElement, 
  Metamodel,
  MetaClass,
  MetaAttribute,
  MetaReference,
  ValidationResult,
  ValidationIssue,
  OCLConstraint,
  OCLValidationContext,
  OCLValidationResult,
  OCLValidationIssue
} from '../models/types';
import { metamodelService } from './metamodel.service';
import { oclService } from './ocl.service';
import { jsService } from './js.service';

// Define a type for references that can handle any value
type ReferenceValue = string | string[] | null | any;

class ModelService {
  private models: Model[] = [];
  private readonly STORAGE_KEY = 'obeo_like_tool_models';
  private lastValidationIssues: OCLValidationIssue[] = [];
  private newlyCreatedElements: Set<string> = new Set();

  constructor() {
    // Load models from localStorage if available
    this.loadFromStorage();
    
    // Clean up any potential duplicate elements in models
    this.cleanupModels();
    
    // Set the model service reference in OCL service to handle circular dependency
    setTimeout(() => {
      oclService.setModelService(this);
    }, 0);
  }

  /**
   * Load models from storage and validate them
   */
  private loadFromStorage(): void {
    try {
      const storedData = localStorage.getItem(this.STORAGE_KEY);
      if (storedData) {
        this.models = JSON.parse(storedData);
        
        // Migrate from old property names if needed
        this.models.forEach(model => {
          model.elements.forEach(element => {
            // Migrate metaClassId to modelElementId
            if ((element as any).metaClassId && !element.modelElementId) {
              element.modelElementId = (element as any).metaClassId;
              delete (element as any).metaClassId;
            }
            
            // Migrate properties to style
            if ((element as any).properties && !element.style) {
              element.style = (element as any).properties;
              delete (element as any).properties;
            }
          });
        });
        // Perform migration for newly added metamodel attributes on existing elements
        const migrated = this.migrateNewAttributesOnLoad();
        if (migrated) {
          this.saveToStorage();
        }
      }
    } catch (error) {
      console.error('Error loading models from localStorage:', error);
      this.models = [];
    }
  }

  /**
   * Migrate newly added attributes from the metamodel to existing model elements on load.
   * This ensures that when you add attributes to a metaclass, existing elements get default values.
   * @returns true if any changes were applied
   */
  private migrateNewAttributesOnLoad(): boolean {
    let changed = false;
    for (const model of this.models) {
      const metamodel = metamodelService.getMetamodelById(model.conformsTo);
      if (!metamodel) continue;
      for (const element of model.elements) {
        const metaClass = this.findMetaClassInMetamodel(metamodel, element.modelElementId);
        if (!metaClass) continue;
        const allAttributes = this.getAllAttributes(metaClass, metamodel);
        if (!element.style) {
          element.style = {} as any;
        }
        for (const attr of allAttributes) {
          // If the attribute is missing on the element, initialize it
          if ((element.style as any)[attr.name] === undefined) {
            if (attr.defaultValue !== undefined) {
              (element.style as any)[attr.name] = attr.defaultValue;
            } else {
              switch (attr.type) {
                case 'string': (element.style as any)[attr.name] = ''; break;
                case 'number': (element.style as any)[attr.name] = 0; break;
                case 'boolean': (element.style as any)[attr.name] = false; break;
                case 'date': (element.style as any)[attr.name] = new Date().toISOString(); break;
                default: (element.style as any)[attr.name] = ''; break;
              }
            }
            changed = true;
          }
        }
      }
    }
    return changed;
  }

  /**
   * Validate all models against their OCL constraints
   * This identifies any validation issues existing in the loaded models
   * NOTE: This is no longer called on startup - validation only happens when the user clicks the Conformance Checking button
   */
  private validateAllModels(): void {
    for (const model of this.models) {
      const validationResult = this.validateModel(model.id);
      
      // No longer logging validation issues since validation is only performed on demand
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.models));
      // Ensure data is properly saved by checking localStorage
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (!saved) {
        console.error('Failed to save models to localStorage');
      }
    } catch (error) {
      console.error('Error saving models to localStorage:', error);
    }
  }

  getAllModels(): Model[] {
    return [...this.models];
  }

  getModelById(id: string): Model | undefined {
    return this.models.find(m => m.id === id);
  }

  getModelsByMetamodelId(metamodelId: string): Model[] {
    return this.models.filter(m => m.conformsTo === metamodelId);
  }

  createModel(name: string, metamodelId: string): Model {
    const newModel: Model = {
      id: uuidv4(),
      name,
      metamodelId,
      elements: [],
      conformsTo: metamodelId
    };
    
    this.models.push(newModel);
    this.saveToStorage();
    return newModel;
  }

  deleteModel(id: string): boolean {
    const initialLength = this.models.length;
    this.models = this.models.filter(m => m.id !== id);
    const result = initialLength !== this.models.length;
    if (result) {
      this.saveToStorage();
    }
    return result;
  }

  // Add a model element conforming to a metaclass
  addModelElement(
    modelId: string, 
    metaClassId: string,
    properties: Record<string, any> = {}
  ): ModelElement | null {
    const model = this.getModelById(modelId);
    if (!model) return null;

    // Get the metamodel and metaclass to check conformance
    const metamodel = metamodelService.getMetamodelById(model.conformsTo);
    if (!metamodel) return null;

    const metaClass = this.findMetaClassInMetamodel(metamodel, metaClassId);
    if (!metaClass) return null;

    // Prevent instantiation of abstract classes
    if (metaClass.abstract) {
      console.error(`Cannot instantiate abstract class: ${metaClass.name}`);
      return null;
    }

    // Create the new element
    const newElement: ModelElement = {
      id: uuidv4(),
      modelElementId: metaClassId,
      style: {},
      references: {}
    };

    // Get all attributes including inherited ones
    const allAttributes = this.getAllAttributes(metaClass, metamodel);
    
    // Initialize style with default values from the metaclass and its parents
    allAttributes.forEach(attr => {
      // Use provided value or default from meta-attribute
      if (properties[attr.name] !== undefined) {
        newElement.style[attr.name] = properties[attr.name];
      } else if (attr.defaultValue !== undefined) {
        newElement.style[attr.name] = attr.defaultValue;
      } else {
        // Initialize with appropriate empty value
        switch (attr.type) {
          case 'string':
            // For name attribute specifically, use a more descriptive default
            if (attr.name === 'name') {
              newElement.style[attr.name] = `${metaClass.name}_${Date.now().toString().slice(-4)}`;
            } else {
              newElement.style[attr.name] = '';
            }
            break;
          case 'number':
            newElement.style[attr.name] = 0;
            break;
          case 'boolean':
            newElement.style[attr.name] = false;
            break;
          case 'date':
            newElement.style[attr.name] = new Date().toISOString();
            break;
        }
      }
    });

    // Get all references including inherited ones
    const allReferences = this.getAllReferences(metaClass, metamodel);
    
    // Initialize references as empty arrays or null
    allReferences.forEach(ref => {
      if (ref.cardinality.upperBound === '*' || ref.cardinality.upperBound > 1) {
        newElement.references[ref.name] = [];
      } else {
        newElement.references[ref.name] = null as any;
      }
    });

    // Add the element to the model without validation - we'll validate it after the user edits it
    // This allows users to create elements that initially don't meet constraints
    model.elements.push(newElement);
    this.saveToStorage();
    
    // Track this as a newly created element for deferred validation
    this.newlyCreatedElements.add(newElement.id);
    
    return newElement;
  }

  // Helper to find a metaclass in a metamodel, including inheritance hierarchy
  private findMetaClassInMetamodel(metamodel: Metamodel, metaClassId: string): MetaClass | null {
    const directClass = metamodel.classes.find(c => c.id === metaClassId);
    return directClass || null;
  }

  // Helper to get all attributes including inherited ones
  private getAllAttributes(metaClass: MetaClass, metamodel: Metamodel): MetaAttribute[] {
    const allAttributes: MetaAttribute[] = [...metaClass.attributes];
    const processedClasses = new Set<string>([metaClass.id]); // Prevent infinite recursion
    
    // Function to recursively collect attributes from parent classes
    const collectInheritedAttributes = (currentClass: MetaClass) => {
      if (currentClass.superTypes && currentClass.superTypes.length > 0) {
        for (const superTypeId of currentClass.superTypes) {
          // Avoid circular inheritance
          if (processedClasses.has(superTypeId)) continue;
          processedClasses.add(superTypeId);
          
          const superClass = metamodel.classes.find(c => c.id === superTypeId);
          if (superClass) {
            // Add all attributes from the parent class
            allAttributes.push(...superClass.attributes);
            // Recursively collect from the parent's parents
            collectInheritedAttributes(superClass);
          }
        }
      }
    };
    
    collectInheritedAttributes(metaClass);
    
    // Remove duplicates based on attribute name (child class attributes override parent class attributes)
    const uniqueAttributes: MetaAttribute[] = [];
    const seenNames = new Set<string>();
    
    // Process in reverse order so child class attributes take precedence
    for (let i = allAttributes.length - 1; i >= 0; i--) {
      const attr = allAttributes[i];
      if (!seenNames.has(attr.name)) {
        seenNames.add(attr.name);
        uniqueAttributes.unshift(attr); // Add to beginning to maintain order
      }
    }
    
    return uniqueAttributes;
  }

  // Helper to get all references including inherited ones
  private getAllReferences(metaClass: MetaClass, metamodel: Metamodel): MetaReference[] {
    const allReferences: MetaReference[] = [...metaClass.references];
    const processedClasses = new Set<string>([metaClass.id]); // Prevent infinite recursion
    
    // Function to recursively collect references from parent classes
    const collectInheritedReferences = (currentClass: MetaClass) => {
      if (currentClass.superTypes && currentClass.superTypes.length > 0) {
        for (const superTypeId of currentClass.superTypes) {
          // Avoid circular inheritance
          if (processedClasses.has(superTypeId)) continue;
          processedClasses.add(superTypeId);
          
          const superClass = metamodel.classes.find(c => c.id === superTypeId);
          if (superClass) {
            // Add all references from the parent class
            allReferences.push(...superClass.references);
            // Recursively collect from the parent's parents
            collectInheritedReferences(superClass);
          }
        }
      }
    };
    
    collectInheritedReferences(metaClass);
    
    // Remove duplicates based on reference name (child class references override parent class references)
    const uniqueReferences: MetaReference[] = [];
    const seenNames = new Set<string>();
    
    // Process in reverse order so child class references take precedence
    for (let i = allReferences.length - 1; i >= 0; i--) {
      const ref = allReferences[i];
      if (!seenNames.has(ref.name)) {
        seenNames.add(ref.name);
        uniqueReferences.unshift(ref); // Add to beginning to maintain order
      }
    }
    
    return uniqueReferences;
  }

  // Update a model element's style properties
  updateModelElementProperties(
    modelId: string,
    elementId: string,
    properties: Record<string, any>
  ): boolean {
    const model = this.getModelById(modelId);
    if (!model) return false;

    const elementIndex = model.elements.findIndex(e => e.id === elementId);
    if (elementIndex === -1) return false;

    // Check if this is a newly created element being edited for the first time
    const isNewlyCreatedElement = this.newlyCreatedElements.has(elementId);
    
    // Update the element (removed validation check as per user's request)
    model.elements[elementIndex].style = {
      ...model.elements[elementIndex].style,
      ...properties
    };

    // If this was a newly created element, remove it from tracking after first edit
    if (isNewlyCreatedElement) {
      this.newlyCreatedElements.delete(elementId);
    }

    this.saveToStorage();
    return true;
  }

  /**
   * Perform constraint validation on a model without making any changes
   * This will be called explicitly by the "Conformance Checking" button
   * @param modelId The ID of the model to validate
   * @returns Validation result with issues, if any
   */
  performConstraintValidation(modelId: string): ValidationResult {
    return this.validateModel(modelId);
  }

  /**
   * Set or update a reference from one model element to another
   * @param modelId The ID of the model
   * @param sourceElementId The ID of the source element
   * @param referenceName The name of the reference
   * @param targetElementId The ID of the target element, array of IDs for multi-valued references, or null to clear the reference
   * @param bendPoints Optional array of bend points for visualizing self-references or complex reference paths
   * @param attributes Optional attributes for the reference
   * @returns true if the reference was successfully set, false otherwise
   */
  setModelElementReference(
    modelId: string,
    sourceElementId: string,
    referenceName: string,
    targetElementId: string | string[] | null,
    bendPoints?: Array<{x: number, y: number}>,
    attributes?: Record<string, any>
  ): boolean {
    const model = this.getModelById(modelId);
    if (!model) return false;

    const sourceElementIndex = model.elements.findIndex(e => e.id === sourceElementId);
    if (sourceElementIndex === -1) return false;

    // Get the source element
    const sourceElement = model.elements[sourceElementIndex];

    // Get the metamodel for type checking
    const metamodel = metamodelService.getMetamodelById(model.conformsTo);
    if (!metamodel) return false;

    // Find the metaclass of the source element
    const sourceMetaClass = metamodel.classes.find(c => c.id === sourceElement.modelElementId);
    if (!sourceMetaClass) return false;
    
    // Find the reference definition
    const reference = sourceMetaClass.references.find(r => r.name === referenceName);
    if (!reference) return false;
    
    // For self-references, check if they're allowed
    if (targetElementId && targetElementId === sourceElementId && reference.allowSelfReference !== true) {
      console.error('Self-references are not allowed for this reference type');
      return false;
    }

    // Check if this is for a multi-valued reference (array)
    const isMultiValued = reference.cardinality.upperBound === '*' || 
                          (typeof reference.cardinality.upperBound === 'number' && reference.cardinality.upperBound > 1);
    
    // Set the reference value
    if (isMultiValued) {
      // Handle multi-valued references
      if (targetElementId === null) {
        sourceElement.references[referenceName] = [];
      } else if (Array.isArray(targetElementId)) {
        sourceElement.references[referenceName] = targetElementId;
      } else {
        // Convert single value to array or add to existing array
        const currentValue = sourceElement.references[referenceName];
        if (Array.isArray(currentValue)) {
          if (!currentValue.includes(targetElementId)) {
            sourceElement.references[referenceName] = [...currentValue, targetElementId];
          }
        } else {
          sourceElement.references[referenceName] = [targetElementId];
        }
      }
    } else {
      // Handle single-valued references
      sourceElement.references[referenceName] = targetElementId;
    }
    
    // Store bend points for visualization if provided
    if (bendPoints && bendPoints.length > 0) {
      // @ts-ignore - References type declaration doesn't know about our custom extensions
      sourceElement.references[`${referenceName}_bendPoints`] = bendPoints;
    }
    
    // Store reference attributes if provided
    if (attributes && Object.keys(attributes).length > 0) {
      // @ts-ignore - References type declaration doesn't know about our custom extensions
      sourceElement.references[`${referenceName}_attributes`] = attributes;
    }
    
    // For bidirectional references, update the target element's reference as well
    if (reference.opposite && targetElementId !== null) {
      this.updateBidirectionalReference(model, sourceElement, targetElementId, referenceName, reference.opposite);
    }

    // Save changes
    this.saveToStorage();
    
    return true;
  }

  // Helper to update bidirectional references
  private updateBidirectionalReference(
    model: Model,
    sourceElement: ModelElement,
    targetId: string | string[],
    sourceName: string,
    oppositeName: string
  ): void {
    if (Array.isArray(targetId)) {
      // For multi-valued references, update each target
      targetId.forEach(id => this.updateSingleBidirectionalReference(model, sourceElement, id, sourceName, oppositeName));
    } else {
      // For single-valued references
      this.updateSingleBidirectionalReference(model, sourceElement, targetId, sourceName, oppositeName);
    }
  }

  // Helper to update a single bidirectional reference
  private updateSingleBidirectionalReference(
    model: Model,
    sourceElement: ModelElement,
    targetId: string,
    sourceName: string,
    oppositeName: string
  ): void {
    // Find the target element
    const targetElement = model.elements.find(e => e.id === targetId);
    if (!targetElement) return;
    
    // Get the target's metaclass
    const metamodel = metamodelService.getMetamodelById(model.conformsTo);
    if (!metamodel) return;
    
    const targetMetaClass = metamodel.classes.find(c => c.id === targetElement.modelElementId);
    if (!targetMetaClass) return;
    
    // Find the opposite reference definition
    const oppositeReference = targetMetaClass.references.find(r => r.name === oppositeName);
    if (!oppositeReference) return;
    
    // Check if opposite reference is multi-valued
    const isMultiValued = oppositeReference.cardinality.upperBound === '*' || 
                         (typeof oppositeReference.cardinality.upperBound === 'number' && oppositeReference.cardinality.upperBound > 1);
    
    // Update the opposite reference
    if (isMultiValued) {
      // For multi-valued opposite references
      const currentValue = targetElement.references[oppositeName];
      if (Array.isArray(currentValue)) {
        if (!currentValue.includes(sourceElement.id)) {
          targetElement.references[oppositeName] = [...currentValue, sourceElement.id];
        }
      } else {
        targetElement.references[oppositeName] = [sourceElement.id];
      }
    } else {
      // For single-valued opposite references
      targetElement.references[oppositeName] = sourceElement.id;
    }
  }

  // Helper method to find opposite reference
  private findOppositeReference(reference: MetaReference, metamodel: Metamodel): MetaReference | undefined {
    if (!reference.opposite) return undefined;
    
    // Find the class that contains the opposite reference
    const targetClass = metamodel.classes.find(c => c.id === reference.target);
    if (!targetClass) return undefined;
    
    // Find the opposite reference in that class
    return targetClass.references.find(r => r.id === reference.opposite || r.name === reference.opposite);
  }

  // Helper method to check if a class is a subtype of another
  private isSubtypeOf(classId: string, superClassId: string, metamodel: Metamodel | undefined): boolean {
    if (!metamodel) return false;
    if (classId === superClassId) return true;
    
    const cls = metamodel.classes.find(c => c.id === classId);
    if (!cls || !cls.superTypes) return false;
    
    return cls.superTypes.some(superTypeId => 
      this.isSubtypeOf(superTypeId, superClassId, metamodel)
    );
  }

  // Check bidirectional reference consistency
  private checkBidirectionalConsistency(
    model: Model,
    sourceElement: ModelElement,
    targetId: string,
    sourceName: string,
    oppositeName: string,
    issues: ValidationIssue[]
  ): void {
    const targetElement = model.elements.find(e => e.id === targetId);
    if (!targetElement) return; // Skip validation if target doesn't exist
    
    const oppositeValue = targetElement.references[oppositeName];
    
    if (oppositeValue === null || oppositeValue === undefined) {
      issues.push({ 
        severity: 'error', 
        message: `Opposite reference '${oppositeName}' is not set in the target element for reference '${sourceName}'`, 
        elementId: sourceElement.id 
      });
    } else if (Array.isArray(oppositeValue)) {
      if (!oppositeValue.includes(sourceElement.id)) {
        issues.push({ 
          severity: 'error', 
          message: `Opposite reference '${oppositeName}' does not include this element in the target element for reference '${sourceName}'`, 
          elementId: sourceElement.id 
        });
      }
    } else if (oppositeValue !== sourceElement.id) {
      issues.push({ 
        severity: 'error', 
        message: `Opposite reference '${oppositeName}' does not point back to this element for reference '${sourceName}'`, 
        elementId: sourceElement.id 
      });
    }
  }

  /**
   * Delete a model element
   * @param modelId The ID of the model
   * @param elementId The ID of the element to delete
   * @returns Whether the operation was successful
   */
  deleteModelElement(modelId: string, elementId: string): boolean {
    const modelIndex = this.models.findIndex(m => m.id === modelId);
    if (modelIndex === -1) return false;
    
    const model = this.models[modelIndex];
    const elementIndex = model.elements.findIndex(e => e.id === elementId);
    if (elementIndex === -1) return false;
    
    // Get the element to be deleted
    const elementToDelete = model.elements[elementIndex];
    
    // Remove all references to this element from other elements in this model
    this.removeReferencesToElement(model, elementToDelete.id);
    
    // Remove the element
    model.elements.splice(elementIndex, 1);
    
    // Save changes
    this.models[modelIndex] = { ...model };
    this.saveToStorage();
    
    return true;
  }

  /**
   * Remove all references to a deleted element from other elements in the model
   * This prevents ghost references that can cause React duplicate key errors
   */
  private removeReferencesToElement(model: Model, elementId: string): void {
    // Go through all remaining elements in the model
    for (const element of model.elements) {
      if (element.id === elementId) continue; // Skip the element being deleted
      
      // Check all references in this element
      for (const [refName, refValue] of Object.entries(element.references)) {
        if (Array.isArray(refValue)) {
          // For multi-valued references, filter out the deleted element
          element.references[refName] = refValue.filter(id => id !== elementId);
        } else if (refValue === elementId) {
          // For single-valued references, set to null
          element.references[refName] = null;
        }
      }
    }
  }

  /**
   * Validate model against metamodel and constraints
   */
  validateModel(modelId: string): ValidationResult {
    const model = this.getModelById(modelId);
    if (!model) {
      return {
        valid: false,
        issues: [{
          severity: 'error',
          message: `Model with ID ${modelId} not found`,
          elementId: modelId
        }]
      };
    }

    const metamodel = metamodelService.getMetamodelById(model.conformsTo);
    if (!metamodel) {
      return {
        valid: false,
        issues: [{
          severity: 'error',
          message: `Metamodel with ID ${model.conformsTo} not found`,
          elementId: modelId
        }]
      };
    }

    const issues: ValidationIssue[] = [];

    // Validate each model element against its metaclass
    for (const element of model.elements) {
      const metaClass = this.findMetaClassInMetamodel(metamodel, element.modelElementId);
      if (!metaClass) {
        issues.push({
          severity: 'error',
          message: `MetaClass with ID ${element.modelElementId} not found`,
          elementId: element.id
        });
        continue;
      }

      // Validate attributes
      this.validateElementAttributes(element, metaClass, metamodel, issues);

      // Validate references
      this.validateElementReferences(element, metaClass, metamodel, model, issues);
    }

    // Validate containment hierarchy
    this.validateContainmentHierarchy(model, metamodel, issues);

    // Validate OCL constraints
    this.validateOCLConstraints(model, metamodel, issues);
    
    // Validate JavaScript constraints
    this.validateJSConstraints(model, metamodel, issues);

    // Store the validation issues
    this.lastValidationIssues = issues.filter(issue => 
      'constraintId' in issue) as OCLValidationIssue[];

    return {
      valid: issues.length === 0,
      issues
    };
  }

  private validateElementAttributes(
    element: ModelElement, 
    metaClass: MetaClass,
    metamodel: Metamodel,
    issues: ValidationIssue[]
  ): void {
    // Get all attributes including inherited ones
    const allAttributes = this.getAllAttributes(metaClass, metamodel);
    
    // Check that all required attributes are present
    allAttributes.forEach(attr => {
      const value = element.style[attr.name];
      
      // Check if required attribute is missing
      if (attr.required && (value === undefined || value === null || value === '')) {
        issues.push({ 
          severity: 'error', 
          message: `Required attribute '${attr.name}' is missing`, 
          elementId: element.id 
        });
      }
      
      // Check type conformance if value is present
      if (value !== undefined && value !== null) {
        let typeError = false;
        
        switch (attr.type) {
          case 'string':
            // Special handling for string values that might look like JSON objects
            if (typeof value === 'string') {
              // String is the correct type, so no error
              typeError = false;
            } else if (typeof value === 'object') {
              // Object being stored in a string attribute - stringify it so it displays correctly
              element.style[attr.name] = JSON.stringify(value);
              typeError = false;
            } else {
              // Not a string or object, this is an error
              typeError = true;
            }
            break;
          case 'number':
            typeError = typeof value !== 'number' && !(!isNaN(Number(value)) && value !== '');
            break;
          case 'boolean':
            typeError = typeof value !== 'boolean' && value !== 'true' && value !== 'false';
            break;
          case 'date':
            // Handle numbers or non-string values
            if (typeof value === 'number' || typeof value !== 'string') {
              typeError = true;
              break;
            }
            
            // If it's a string, check if it can be parsed
            try {
              // Try to parse the date
              const parsedDate = new Date(value);
              typeError = isNaN(parsedDate.getTime());
              
              // If parsed correctly, check if it's a valid date (check if month/day overflowed)
              if (!typeError && typeof value === 'string') {
                // Handle different date formats
                let originalYear, originalMonth, originalDay;
                
                if (value.includes('-')) {
                  // ISO format: YYYY-MM-DD
                  const dateParts = value.split('T')[0].split('-');
                  if (dateParts.length >= 3) {
                    originalYear = parseInt(dateParts[0], 10);
                    originalMonth = parseInt(dateParts[1], 10) - 1; // JS months are 0-based
                    originalDay = parseInt(dateParts[2], 10);
                  }
                } else if (value.includes('/')) {
                  // US/European format: MM/DD/YYYY or DD/MM/YYYY
                  const dateParts = value.split('/');
                  if (dateParts.length >= 3) {
                    // Assume MM/DD/YYYY for simplicity
                    originalMonth = parseInt(dateParts[0], 10) - 1;
                    originalDay = parseInt(dateParts[1], 10);
                    originalYear = parseInt(dateParts[2], 10);
                  }
                } else if (value.includes('.')) {
                  // European format with dots: DD.MM.YYYY
                  const dateParts = value.split('.');
                  if (dateParts.length >= 3) {
                    originalDay = parseInt(dateParts[0], 10);
                    originalMonth = parseInt(dateParts[1], 10) - 1;
                    originalYear = parseInt(dateParts[2], 10);
                  }
                }
                
                // If we were able to extract date parts, verify they match the parsed date
                if (originalYear !== undefined && originalMonth !== undefined && originalDay !== undefined) {
                  typeError = (parsedDate.getFullYear() !== originalYear || 
                              parsedDate.getMonth() !== originalMonth || 
                              parsedDate.getDate() !== originalDay);
                  
                  if (typeError) {
                    console.log(`Date validation failed: Original ${originalDay}/${originalMonth+1}/${originalYear} parsed as ${parsedDate.getDate()}/${parsedDate.getMonth()+1}/${parsedDate.getFullYear()}`);
                  }
                }
              }
            } catch (error) {
              typeError = true;
            }
            break;
        }
        
        if (typeError) {
          issues.push({ 
            severity: 'error', 
            message: `Attribute '${attr.name}' has incorrect type. Expected ${attr.type}`, 
            elementId: element.id 
          });
        }
      }
    });
    
    // Check for unknown attributes
    Object.keys(element.style).forEach(propName => {
      // Define a list of special attributes used for visualization/UI that shouldn't be validated
      const visualizationAttributes = [
        'position',   // For positioning in diagrams
        'appearance', // For element appearance customization
        'position3D', // For 3D mode positioning
        'color',      // For custom colors
        'size',       // For custom sizing
        'linkedModelElementId', // For diagram-model linking
        'modelElementRefId'     // For references without changing type
      ];
      
      // Skip visualization attributes
      if (visualizationAttributes.includes(propName)) return;

      // Check against all attributes including inherited ones
      const allAttributes = this.getAllAttributes(metaClass, metamodel);
      const attributeExists = allAttributes.some(attr => attr.name === propName);
      if (!attributeExists) {
        issues.push({ 
          severity: 'warning', 
          message: `Unknown attribute '${propName}' not defined in metaclass`, 
          elementId: element.id 
        });
      }
    });
  }

  private validateElementReferences(
    element: ModelElement,
    metaClass: MetaClass,
    metamodel: Metamodel,
    model: Model,
    issues: ValidationIssue[]
  ): void {
    // Get all references including inherited ones
    const allReferences = this.getAllReferences(metaClass, metamodel);
    
    // Check that all required references are present
    allReferences.forEach(reference => {
      const refValue = element.references[reference.name];
      
      // Check for missing required references
      if (reference.cardinality.lowerBound > 0) {
        if (refValue === undefined || refValue === null) {
          issues.push({ 
            severity: 'error', 
            message: `Required reference '${reference.name}' is missing`, 
            elementId: element.id 
          });
        } else if (Array.isArray(refValue) && refValue.length < reference.cardinality.lowerBound) {
          issues.push({ 
            severity: 'error', 
            message: `Reference '${reference.name}' has fewer elements than required minimum (${refValue.length} < ${reference.cardinality.lowerBound})`, 
            elementId: element.id 
          });
        }
      }
      
      // Check upper bound for multi-valued references
      if (Array.isArray(refValue) && 
          reference.cardinality.upperBound !== '*' && 
          refValue.length > reference.cardinality.upperBound) {
        issues.push({ 
          severity: 'error', 
          message: `Reference '${reference.name}' has more elements than allowed maximum (${refValue.length} > ${reference.cardinality.upperBound})`, 
          elementId: element.id 
        });
      }
      
      // Validate reference targets
      if (refValue !== null && refValue !== undefined) {
        const targetMetaClass = metamodel.classes.find(c => c.id === reference.target);
        if (!targetMetaClass) {
          issues.push({ 
            severity: 'error', 
            message: `Reference '${reference.name}' points to non-existent target metaclass`, 
            elementId: element.id 
          });
          return;
        }
        
        if (Array.isArray(refValue)) {
          // Validate each target for multi-valued references
          refValue.forEach(targetId => {
            this.validateReferenceTarget(model, element, targetId, targetMetaClass, reference.name, issues);
          });
        } else {
          // Validate target for single-valued references
          this.validateReferenceTarget(model, element, refValue as string, targetMetaClass, reference.name, issues);
        }
      }
      
      // Validate bidirectional references
      if (reference.opposite) {
        this.validateOppositeReference(model, element, reference, metamodel, issues);
      }
    });
    
    // Check for unknown references, but ignore special UI-related references
    Object.keys(element.references).forEach(refName => {
      // Skip UI-related reference properties like bend points and attributes
      if (refName.endsWith('_bendPoints') || refName.endsWith('_attributes')) {
        return;
      }
      
      // Check against all references including inherited ones
      const allReferences = this.getAllReferences(metaClass, metamodel);
      const referenceExists = allReferences.some(ref => ref.name === refName);
      if (!referenceExists) {
        issues.push({ 
          severity: 'warning', 
          message: `Unknown reference '${refName}' not defined in metaclass`, 
          elementId: element.id 
        });
      }
    });
  }

  private validateReferenceTarget(
    model: Model,
    sourceElement: ModelElement,
    targetId: string,
    targetMetaClass: MetaClass,
    referenceName: string,
    issues: ValidationIssue[]
  ): void {
    // Check if target element exists
    const targetElement = model.elements.find(e => e.id === targetId);
    if (!targetElement) {
      issues.push({ 
        severity: 'error', 
        message: `Reference '${referenceName}' points to non-existent element: ${targetId}`, 
        elementId: sourceElement.id 
      });
      return;
    }
    
    // Check if target element conforms to the target metaclass
    if (targetElement.modelElementId !== targetMetaClass.id && 
        !this.isSubtypeOf(targetElement.modelElementId, targetMetaClass.id, metamodelService.getMetamodelById(model.conformsTo))) {
      issues.push({ 
        severity: 'error', 
        message: `Reference '${referenceName}' points to element of incorrect type. Expected ${targetMetaClass.name}`, 
        elementId: sourceElement.id 
      });
    }
  }

  private validateOppositeReference(
    model: Model,
    element: ModelElement,
    reference: MetaReference,
    metamodel: Metamodel,
    issues: ValidationIssue[]
  ): void {
    // Find the opposite reference
    const oppositeReference = this.findOppositeReference(reference, metamodel);
    if (!oppositeReference) {
      issues.push({ 
        severity: 'error', 
        message: `Cannot find opposite reference '${reference.opposite}' for reference '${reference.name}'`, 
        elementId: element.id 
      });
      return;
    }
    
    // Get the value of this reference
    const sourceRefValue = element.references[reference.name];
    if (sourceRefValue === null || sourceRefValue === undefined) {
      return; // Nothing to validate if reference is not set
    }
    
    // Check bidirectional consistency
    if (Array.isArray(sourceRefValue)) {
      // For multi-valued references
      sourceRefValue.forEach(targetId => {
        this.checkBidirectionalConsistency(model, element, targetId, reference.name, oppositeReference.name, issues);
      });
    } else {
      // For single-valued references
      this.checkBidirectionalConsistency(model, element, sourceRefValue as string, reference.name, oppositeReference.name, issues);
    }
  }

  private validateContainmentHierarchy(
    model: Model,
    metamodel: Metamodel,
    issues: ValidationIssue[]
  ): void {
    // Build a map of containment relationships
    const containmentMap = new Map<string, string[]>();
    
    // Fill containment map
    model.elements.forEach(element => {
      const metaClass = metamodel.classes.find(c => c.id === element.modelElementId);
      if (!metaClass) return;
      
      // Check all references
      Object.entries(element.references).forEach(([refName, refValue]) => {
        // Find the reference in the metaclass
        const reference = metaClass.references.find(r => r.name === refName);
        if (!reference || !reference.containment) return; // Skip non-containment references
        
        if (Array.isArray(refValue)) {
          // Multi-valued containment
          refValue.forEach(targetId => {
            if (!containmentMap.has(targetId)) {
              containmentMap.set(targetId, [element.id]);
            } else {
              // Error: an element can't be contained by multiple elements
              issues.push({ 
                severity: 'error', 
                message: `Element is contained by multiple elements (${element.id} and ${containmentMap.get(targetId)![0]})`, 
                elementId: targetId 
              });
            }
          });
        } else if (refValue !== null) {
          // Single-valued containment
          const targetId = refValue as string;
          if (!containmentMap.has(targetId)) {
            containmentMap.set(targetId, [element.id]);
          } else {
            // Error: an element can't be contained by multiple elements
            issues.push({ 
              severity: 'error', 
              message: `Element is contained by multiple elements (${element.id} and ${containmentMap.get(targetId)![0]})`, 
              elementId: targetId 
            });
          }
        }
      });
    });
    
    // Check for containment cycles
    model.elements.forEach(element => {
      // Skip if we've already checked this element
      if (containmentMap.has(element.id)) {
        const visited = new Set<string>();
        const path: string[] = [];
        this.detectCycle(element.id, containmentMap, visited, path, issues);
      }
    });
  }

  private detectCycle(
    elementId: string,
    containmentMap: Map<string, string[]>,
    visited: Set<string>,
    path: string[],
    issues: ValidationIssue[]
  ): boolean {
    // If we've already visited this element in the current path, we have a cycle
    if (path.includes(elementId)) {
      const cycleStart = path.indexOf(elementId);
      const cycle = [...path.slice(cycleStart), elementId];
      
      issues.push({ 
        severity: 'error', 
        message: `Containment cycle detected: ${cycle.join(' → ')}`, 
        elementId: elementId 
      });
      
      return true;
    }
    
    // If we've already visited this element in a different path, no need to check again
    if (visited.has(elementId)) {
      return false;
    }
    
    // Mark as visited and add to current path
    visited.add(elementId);
    path.push(elementId);
    
    // Check all containers of this element
    const containers = containmentMap.get(elementId) || [];
    for (const containerId of containers) {
      if (this.detectCycle(containerId, containmentMap, visited, path, issues)) {
        return true;
      }
    }
    
    // Remove from current path before returning
    path.pop();
    return false;
  }

  /**
   * Add an imported model element (with existing ID and properties)
   * @param modelId The ID of the model to add the element to
   * @param element The complete element to add
   * @returns The added model element or null if failed
   */
  addImportedModelElement(
    modelId: string,
    element: ModelElement
  ): ModelElement | null {
    const model = this.getModelById(modelId);
    if (!model) return null;

    // Add the element directly
    model.elements.push(element);
    this.saveToStorage();
    return element;
  }

  /**
   * Update a model with new data
   * @param modelId The ID of the model to update
   * @param updatedModel The new model data
   * @returns The updated model or undefined if not found
   */
  updateModel(modelId: string, updatedModel: Partial<Model>): Model | undefined {
    const modelIndex = this.models.findIndex(m => m.id === modelId);
    if (modelIndex === -1) return undefined;
    
    // Update the model with the new data, preserving the ID
    this.models[modelIndex] = {
      ...this.models[modelIndex],
      ...updatedModel,
      id: modelId // Ensure ID doesn't change
    };
    
    this.saveToStorage();
    return this.models[modelIndex];
  }

  /**
   * Update the position of a model element
   * @param modelId The ID of the model
   * @param elementId The ID of the element to update
   * @param position The new position
   * @returns Whether the operation was successful
   */
  updateElementPosition(
    modelId: string,
    elementId: string,
    position: { x: number, y: number }
  ): boolean {
    const model = this.getModelById(modelId);
    if (!model) return false;

    const element = model.elements.find(e => e.id === elementId);
    if (!element) return false;

    // Update the position in the style property
    element.style = {
      ...element.style,
      position
    };

    this.saveToStorage();
    return true;
  }

  /**
   * Validate OCL constraints
   */
  private validateOCLConstraints(model: Model, metamodel: Metamodel, issues: ValidationIssue[]): void {
    try {
      // Check for OCL constraints before proceeding
      let hasOclConstraints = false;
      
      // Scan metaclasses for OCL constraints
      for (const cls of metamodel.classes) {
        if (cls.constraints && cls.constraints.some(c => 'type' in c && (c.type as string) === 'ocl')) {
          hasOclConstraints = true;
          break;
        }
      }
      
      // Also check metamodel global constraints
      if (!hasOclConstraints && metamodel.constraints) {
        hasOclConstraints = metamodel.constraints.some(c => 'type' in c && (c.type as string) === 'ocl');
      }
      
      // Skip OCL validation if no OCL constraints exist
      if (!hasOclConstraints) {
        console.log('No OCL constraints found, skipping OCL validation');
        return;
      }
      
      // Use OCL service to validate constraints
      const oclValidationResult = oclService.validateModelAgainstConstraints(model.id, metamodel.id);
      
      if (!oclValidationResult.valid) {
        // Add OCL validation issues to the general validation issues
        oclValidationResult.issues.forEach(oclIssue => {
          issues.push({
            severity: oclIssue.severity === 'error' ? 'error' : 
                    oclIssue.severity === 'warning' ? 'warning' : 'info',
            message: oclIssue.message,
            elementId: oclIssue.elementId,
            constraintId: oclIssue.constraintId
          });
        });
      }
    } catch (error) {
      console.error('Error validating OCL constraints:', error);
      issues.push({
        severity: 'error',
        message: `Error validating OCL constraints: ${error instanceof Error ? error.message : String(error)}`,
        elementId: model.id
      });
    }
  }

  /**
   * Clean up all models to remove duplicate elements and fix invalid references
   * This helps prevent React duplicate key errors
   */
  private cleanupModels(): void {
    let modelsChanged = false;
    
    // First, check for duplicate IDs across ALL models (global uniqueness)
    const allElementIds = new Map<string, {modelIndex: number, elementIndex: number}>();
    const duplicateIds = new Set<string>();
    
    // Scan all models to find duplicate IDs
    for (let modelIndex = 0; modelIndex < this.models.length; modelIndex++) {
      const model = this.models[modelIndex];
      
      for (let elementIndex = 0; elementIndex < model.elements.length; elementIndex++) {
        const element = model.elements[elementIndex];
        
        if (allElementIds.has(element.id)) {
          // We found a duplicate element ID across models
          duplicateIds.add(element.id);
          console.warn(`Found duplicate element ID "${element.id}" in model "${model.name}" and model "${this.models[allElementIds.get(element.id)!.modelIndex].name}"`);
        } else {
          allElementIds.set(element.id, {modelIndex, elementIndex});
        }
      }
    }
    
    // Fix duplicate IDs by generating new IDs
    if (duplicateIds.size > 0) {
      console.warn(`Found ${duplicateIds.size} duplicate element IDs across models. Regenerating IDs...`);
      
      for (let modelIndex = 0; modelIndex < this.models.length; modelIndex++) {
        const model = this.models[modelIndex];
        
        for (let elementIndex = 0; elementIndex < model.elements.length; elementIndex++) {
          const element = model.elements[elementIndex];
          
          if (duplicateIds.has(element.id)) {
            // Check if this is the first occurrence of this ID
            const firstOccurrence = allElementIds.get(element.id)!;
            
            // Only regenerate ID if this is not the first occurrence
            if (firstOccurrence.modelIndex !== modelIndex || firstOccurrence.elementIndex !== elementIndex) {
              // Generate a new unique ID for this element
              const oldId = element.id;
              const newId = uuidv4();
              
              console.warn(`Regenerating ID for element in model "${model.name}": ${oldId} -> ${newId}`);
              element.id = newId;
              
              // Update any references to this element within the same model
              this.updateReferencesToElement(model, oldId, newId);
              
              modelsChanged = true;
            }
          }
        }
      }
    }
    
    // Now process each model individually for internal duplicates and dangling references
    for (let i = 0; i < this.models.length; i++) {
      const model = this.models[i];
      
      // Create a map to track unique elements by ID
      const uniqueElements = new Map();
      const duplicateIds = new Set();
      
      // Find duplicate elements within same model (should be handled by the above, but double-check)
      for (const element of model.elements) {
        if (uniqueElements.has(element.id)) {
          duplicateIds.add(element.id);
        } else {
          uniqueElements.set(element.id, element);
        }
      }
      
      // If duplicates found, rebuild the model with only unique elements
      if (duplicateIds.size > 0) {
        console.warn(`Found ${duplicateIds.size} duplicate elements in model ${model.name}. Cleaning up...`);
        model.elements = Array.from(uniqueElements.values());
        modelsChanged = true;
      }
      
      // Clean up dangling references to non-existent elements
      const elementIds = new Set(model.elements.map(e => e.id));
      let referencesFixed = false;
      
      for (const element of model.elements) {
        for (const [refName, refValue] of Object.entries(element.references)) {
          if (Array.isArray(refValue)) {
            const originalLength = refValue.length;
            element.references[refName] = refValue.filter(id => elementIds.has(id));
            
            if (originalLength !== (element.references[refName]?.length || 0)) {
              referencesFixed = true;
            }
          } else if (refValue !== null && !elementIds.has(refValue as string)) {
            element.references[refName] = null;
            referencesFixed = true;
          }
        }
      }
      
      if (referencesFixed) {
        console.warn(`Fixed dangling references in model ${model.name}`);
        modelsChanged = true;
      }
    }
    
    // Additional cleanup: prune attributes that no longer exist in the metamodel
    // This helps keep existing model elements in sync when attributes are removed from metaclasses
    for (let i = 0; i < this.models.length; i++) {
      const model = this.models[i];
      const metamodel = metamodelService.getMetamodelById(model.conformsTo);
      if (!metamodel) continue;
      for (const element of model.elements) {
        const metaClass = metamodel.classes.find(c => c.id === element.modelElementId);
        if (!metaClass) continue;
        const allAttributes = this.getAllAttributes(metaClass, metamodel);
        const allowedNames = new Set<string>(allAttributes.map(a => a.name));
        // Visualization/UI keys that should be preserved even if not part of the metaclass
        const visualizationAttributes = new Set<string>([
          'position', 'appearance', 'position3D', 'color', 'size', 'linkedModelElementId', 'modelElementRefId'
        ]);
        for (const key of Object.keys(element.style || {})) {
          if (!allowedNames.has(key) && !visualizationAttributes.has(key)) {
            delete (element.style as any)[key];
            modelsChanged = true;
          }
        }
      }
    }

    // Save changes if any models were modified
    if (modelsChanged) {
      this.saveToStorage();
    }
  }
  
  /**
   * Update references after an element ID has changed
   */
  private updateReferencesToElement(model: Model, oldId: string, newId: string): void {
    for (const element of model.elements) {
      for (const [refName, refValue] of Object.entries(element.references)) {
        if (Array.isArray(refValue)) {
          // For multi-valued references, replace the old ID with the new ID
          for (let i = 0; i < refValue.length; i++) {
            if (refValue[i] === oldId) {
              refValue[i] = newId;
            }
          }
        } else if (refValue === oldId) {
          // For single-valued references, replace with the new ID
          element.references[refName] = newId;
        }
      }
    }
  }

  /**
   * Manually clean up models to fix duplicate elements and references
   * This can be called by consumers to fix existing issues
   * @returns The number of fixed issues
   */
  cleanupModelsManually(): number {
    let fixedIssueCount = 0;
    
    // Store original length of models to track changes
    const originalModelCounts = this.models.map(model => model.elements.length);
    
    // Run the cleanup
    this.cleanupModels();
    
    // Count how many elements were removed/fixed
    for (let i = 0; i < this.models.length; i++) {
      fixedIssueCount += Math.abs(originalModelCounts[i] - this.models[i].elements.length);
    }
    
    return fixedIssueCount;
  }

  /**
   * Remove any duplicate occurrences of the specified element ID
   * This removes all elements with this ID except for the first one found
   * @param elementId The element ID to deduplicate
   * @returns The number of duplicate instances removed
   */
  removeDuplicateElements(elementId: string): number {
    let removedCount = 0;
    let foundFirst = false;
    
    // Process all models to find and remove duplicates
    for (let i = 0; i < this.models.length; i++) {
      const model = this.models[i];
      const elementsToRemove: number[] = [];
      
      // First pass: Mark duplicates for removal
      for (let j = 0; j < model.elements.length; j++) {
        const element = model.elements[j];
        
        if (element.id === elementId) {
          if (foundFirst) {
            // This is a duplicate, mark for removal
            elementsToRemove.push(j);
          } else {
            // This is the first occurrence, keep it
            foundFirst = true;
          }
        }
      }
      
      // Second pass: Remove marked elements (in reverse order to maintain indexes)
      for (let j = elementsToRemove.length - 1; j >= 0; j--) {
        const indexToRemove = elementsToRemove[j];
        model.elements.splice(indexToRemove, 1);
        removedCount++;
      }
    }
    
    // Save changes if any elements were removed
    if (removedCount > 0) {
      this.saveToStorage();
    }
    
    return removedCount;
  }

  /**
   * Get the last validation issues
   * @returns The last validation issues that occurred
   */
  getLastValidationIssues(): OCLValidationIssue[] {
    return this.lastValidationIssues;
  }
  
  /**
   * Clear the last validation issues
   */
  clearLastValidationIssues(): void {
    this.lastValidationIssues = [];
  }
  
  /**
   * Check if there are any validation issues
   * @returns True if there are validation issues
   */
  hasValidationIssues(): boolean {
    return this.lastValidationIssues.length > 0;
  }

  /**
   * Validate JavaScript constraints
   */
  private validateJSConstraints(model: Model, metamodel: Metamodel, issues: ValidationIssue[]): void {
    try {
      // Get the global jsService instance directly
      const js = require('./js.service').jsService;
      
      // Ensure the jsService has a reference to this model service
      if (!js.modelService) {
        console.log('ModelService: Setting modelService in jsService during validation');
        js.setModelService(this);
      }
      
      // Use jsService to validate JavaScript constraints
      js.validateJSConstraints(model, metamodel, issues);
    } catch (error) {
      console.error('Error validating JS constraints:', error);
      issues.push({
        severity: 'error',
        message: `Error validating JavaScript constraints: ${error instanceof Error ? error.message : String(error)}`,
        elementId: model.id
      });
    }
  }

  /**
   * Set the JS service reference to handle circular dependency
   */
  setJSService(service: any): void {
    // Directly set this model service on the provided js service instance
    service.setModelService(this);
  }
}

export const modelService = new ModelService(); 