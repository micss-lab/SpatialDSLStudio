import { 
  Model, 
  ModelElement, 
  Metamodel,
  MetaClass,
  MetaReference,
  ValidationResult,
  ValidationIssue,
  OCLValidationIssue
} from '../../models/types';
import { metamodelService } from '../metamodel';
import { oclService } from '../constraint';
import { jsService } from '../constraint';
import { modelInheritanceUtilsService } from './model-inheritance-utils.service';

/**
 * Service for validating models against their metamodels and constraints
 */
export class ModelValidationService {
  private lastValidationIssues: OCLValidationIssue[] = [];

  /**
   * Validate model against metamodel and constraints
   */
  validateModel(model: Model): ValidationResult {
    if (!model) {
      return {
        valid: false,
        issues: [{
          severity: 'error',
          message: `Model not found`,
          elementId: ''
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
          elementId: model.id
        }]
      };
    }

    const issues: ValidationIssue[] = [];

    // Validate each model element against its metaclass
    for (const element of model.elements) {
      const metaClass = modelInheritanceUtilsService.findMetaClassInMetamodel(metamodel, element.modelElementId);
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
    const allAttributes = modelInheritanceUtilsService.getAllAttributes(metaClass, metamodel);
    
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
      const allAttributes = modelInheritanceUtilsService.getAllAttributes(metaClass, metamodel);
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

  validateElementReferences(
    element: ModelElement,
    metaClass: MetaClass,
    metamodel: Metamodel,
    model: Model,
    issues: ValidationIssue[]
  ): void {
    // Get all references including inherited ones
    const allReferences = modelInheritanceUtilsService.getAllReferences(metaClass, metamodel);
    
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
      const allReferences = modelInheritanceUtilsService.getAllReferences(metaClass, metamodel);
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
        !modelInheritanceUtilsService.isSubtypeOf(targetElement.modelElementId, targetMetaClass.id, metamodelService.getMetamodelById(model.conformsTo))) {
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

  private validateJSConstraints(model: Model, metamodel: Metamodel, issues: ValidationIssue[]): void {
    try {
      // Get the global jsService instance directly
      const js = jsService;
      
      // Ensure the jsService has a reference to the model service
      if (!js.modelService) {
        console.log('ModelService: Setting modelService in jsService during validation');
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

  private findOppositeReference(reference: MetaReference, metamodel: Metamodel): MetaReference | undefined {
    if (!reference.opposite) return undefined;
    
    // Find the class that contains the opposite reference
    const targetClass = metamodel.classes.find(c => c.id === reference.target);
    if (!targetClass) return undefined;
    
    // Find the opposite reference in that class
    return targetClass.references.find(r => r.id === reference.opposite || r.name === reference.opposite);
  }

  /**
   * Get the last validation issues
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
   */
  hasValidationIssues(): boolean {
    return this.lastValidationIssues.length > 0;
  }
}

export const modelValidationService = new ModelValidationService();
