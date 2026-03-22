import {
  Diagram,
  DiagramElement,
  CodeGenerationTemplate,
  CodeGenerationResult,
  CodeGenerationProject
} from '../../models/types';
import Handlebars from 'handlebars';
import { metamodelService } from '../metamodel';
import { diagramService } from '../diagram';
import { modelService } from '../model';
import { codegenContextBuilderService } from './codegen-context-builder.service';
import { codegenInheritanceUtilsService } from './codegen-inheritance-utils.service';
import { codegenProjectCrudService } from './codegen-project-crud.service';
import { codegenTemplateCrudService } from './codegen-template-crud.service';

/**
 * Service for executing code generation from diagrams and templates
 */
export class CodegenGenerationEngineService {
  /**
   * Generate code from a diagram using a specific template
   */
  generateCode(diagramId: string, templateId: string, elements: DiagramElement[]): CodeGenerationResult[] {
    console.log('Generating code with template:', templateId, 'for diagram:', diagramId);
    
    const template = codegenTemplateCrudService.getTemplateById(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    // Get the diagram to access its model
    const diagram = diagramService.getDiagramById(diagramId);
    if (!diagram) {
      throw new Error('Diagram not found');
    }

    // Check if the template's metamodel matches the model's metamodel
    const model = modelService.getModelById(diagram.modelId);
    if (!model) {
      throw new Error('Model not found');
    }
    
    if (model.conformsTo !== template.targetMetamodelId) {
      console.warn(`Template metamodel (${template.targetMetamodelId}) doesn't match model's metamodel (${model.conformsTo})`);
    }

    // Get the metamodel to access its classes
    const metamodel = metamodelService.getMetamodelById(template.targetMetamodelId);
    if (!metamodel) {
      throw new Error('Metamodel not found');
    }

    // Get all metaclass IDs from the metamodel
    const metaclassIds = metamodel.classes.map(cls => cls.id);
    
    // Find all elements that use any metaclass from the metamodel
    const targetElements = elements.filter(el => 
      el.type === 'node' && el.modelElementId && metaclassIds.includes(el.modelElementId)
    );
    
    console.log('Found target elements:', targetElements);
    
    if (targetElements.length === 0) {
      console.warn(`No elements found for metamodel ID: ${template.targetMetamodelId}`);
    }
    
    // Prepare handlebars template
    const compiledTemplate = Handlebars.compile(template.templateContent, { noEscape: true });
    const filenameTemplate = Handlebars.compile(template.outputPattern, { noEscape: true });
    
    // Build context
    const context = this.buildDiagramContext(elements, diagram, metamodel, model);
    
    try {
      // Generate a single file with all elements
      const content = compiledTemplate(context);
      const filename = filenameTemplate(context);
      
      return [{
        filename,
        content
      }];
    } catch (error) {
      console.error('Error generating code:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to generate code: ${errorMessage}`);
    }
  }

  /**
   * Generate code for all templates in a project
   */
  generateProjectCode(diagramId: string, projectId: string): CodeGenerationResult[] {
    const project = codegenProjectCrudService.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project with ID ${projectId} not found`);
    }
    
    const diagram = diagramService.getDiagramById(diagramId);
    if (!diagram) {
      throw new Error(`Diagram with ID ${diagramId} not found`);
    }
    
    let results: CodeGenerationResult[] = [];
    
    // Generate code for each template in the project
    for (const template of project.templates) {
      try {
        const templateResults = this.generateCodeFromTemplate(diagramId, template, diagram.elements);
        results = [...results, ...templateResults];
      } catch (error) {
        console.error(`Error generating code for template ${template.name}:`, error);
      }
    }
    
    return results;
  }

  /**
   * Generate code from a specific template
   */
  generateCodeFromTemplate(
    diagramId: string, 
    template: CodeGenerationTemplate, 
    elements: DiagramElement[]
  ): CodeGenerationResult[] {
    const diagram = diagramService.getDiagramById(diagramId);
    if (!diagram) {
      throw new Error(`Diagram with ID ${diagramId} not found`);
    }
    
    const model = modelService.getModelById(diagram.modelId);
    if (!model) {
      throw new Error(`Model not found for diagram ${diagramId}`);
    }
    
    const metamodel = metamodelService.getMetamodelById(model.conformsTo);
    if (!metamodel) {
      throw new Error(`Metamodel not found for model ${model.id}`);
    }

    // Build context
    const context = this.buildDiagramContext(elements, diagram, metamodel, model);
    
    // Results array to store generated files
    const results: CodeGenerationResult[] = [];
    
    try {
      // For multi-element templates, we generate a single file
      const compiledTemplate = Handlebars.compile(template.templateContent, { noEscape: true });
      const compiledFilenameTemplate = Handlebars.compile(template.outputPattern, { noEscape: true });
      
      // Generate the file content using the template
      const content = compiledTemplate(context);
      
      // Generate the filename using the pattern
      const filename = compiledFilenameTemplate(context);
      
      results.push({
        filename,
        content
      });
    } catch (error: unknown) {
      console.error('Error generating code:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to generate code: ${errorMessage}`);
    }
    
    return results;
  }

  /**
   * Build a comprehensive context for diagram-based generation
   */
  private buildDiagramContext(elements: DiagramElement[], diagram: Diagram, metamodel: any, model: any): any {
    // 1. Prepare base contexts
    const allElementsContext = codegenContextBuilderService.prepareMultiElementContext(elements, diagram, metamodel);
    const primaryElement = elements.length > 0 ? elements[0] : null;
    const elementContext = primaryElement ? codegenContextBuilderService.prepareSingleElementContext(primaryElement) : {};

    // 2. Prepare metamodels context
    const metamodelsContext: { [key: string]: any } = {};
    const allMetamodels = metamodelService.getAllMetamodels();
    allMetamodels.forEach(mm => {
        const sanitizedMetamodelName = mm.name.replace(/[^a-zA-Z0-9_]/g, '');
        if (sanitizedMetamodelName) {
            metamodelsContext[sanitizedMetamodelName] = {
                id: mm.id,
                name: mm.name,
                classes: mm.classes.map(cls => ({
                    ...cls,
                    attributes: codegenInheritanceUtilsService.getAllAttributes(cls, mm),
                    references: codegenInheritanceUtilsService.getAllReferences(cls, mm),
                    ownAttributes: cls.attributes,
                    ownReferences: cls.references
                }))
            };
            
            mm.classes.forEach(cls => {
                metamodelsContext[sanitizedMetamodelName][cls.name] = {
                    ...cls,
                    attributes: codegenInheritanceUtilsService.getAllAttributes(cls, mm),
                    references: codegenInheritanceUtilsService.getAllReferences(cls, mm),
                    ownAttributes: cls.attributes,
                    ownReferences: cls.references
                };
            });
        }
    });

    // 3. Prepare models context
    const modelsContext: { [key: string]: any } = {};
    const conformingModels = modelService.getModelsByMetamodelId(metamodel.id);
    conformingModels.forEach(m => {
        modelsContext[m.name] = {
            id: m.id,
            name: m.name,
            elements: []
        };
        
        m.elements.forEach(elem => {
            const elemName = elem.style?.name;
            if (elemName) {
                const elemContext = codegenContextBuilderService.prepareSingleElementContext(elem);
                
                // Find corresponding diagram element for 3D properties
                const diagramElements = diagram?.elements || [];
                let matchingDiagramElement = diagramElements.find(de => de.modelElementId === elem.id);
                
                if (!matchingDiagramElement) {
                    const nameMatch = diagramElements.find(de => 
                        de.style && de.style.name && de.style.name === elemName
                    );
                    if (nameMatch) {
                        matchingDiagramElement = nameMatch;
                    }
                }
                
                if (matchingDiagramElement) {
                    this.apply3DProperties(elemContext, matchingDiagramElement);
                }
                
                modelsContext[m.name].elements.push(elemContext);
                modelsContext[m.name][elemName] = elemContext;
            }
        });
    });

    // 4. Create the final context
    return {
      ...elementContext,
      ...allElementsContext,
      elements: elements.map(el => codegenContextBuilderService.prepareSingleElementContext(el)),
      currentElement: elementContext,
      metamodel: {
        id: metamodel.id,
        name: metamodel.name,
        classes: metamodel.classes.map((cls: any) => ({
          ...cls,
          attributes: codegenInheritanceUtilsService.getAllAttributes(cls, metamodel),
          references: codegenInheritanceUtilsService.getAllReferences(cls, metamodel),
          ownAttributes: cls.attributes,
          ownReferences: cls.references
        }))
      },
      model: {
        id: model.id,
        name: model.name,
        elements: model.elements.map((el: any) => codegenContextBuilderService.prepareSingleElementContext(el))
      },
      ...metamodelsContext,
      ...modelsContext,
    };
  }

  /**
   * Apply 3D properties from diagram element to context
   */
  private apply3DProperties(elemContext: any, diagramElement: any): void {
    // Position
    if (diagramElement.style?.position3D) {
        elemContext.X = diagramElement.style.position3D.x;
        elemContext.Y = diagramElement.style.position3D.y;
    } else {
        if (diagramElement.x !== undefined) elemContext.X = diagramElement.x;
        if (diagramElement.y !== undefined) elemContext.Y = diagramElement.y;
    }
    
    // Rotation
    if (diagramElement.style?.rotationZ !== undefined) {
        elemContext.RZ = diagramElement.style.rotationZ;
    } else if (diagramElement.style?.rz !== undefined) {
        elemContext.RZ = diagramElement.style.rz;
    }
    
    // Dimensions
    if (diagramElement.style?.heightMm !== undefined) {
        elemContext.Width = diagramElement.style.heightMm;
    } else if (diagramElement.width !== undefined) {
        elemContext.Width = diagramElement.width;
    }
    
    if (diagramElement.style?.depthMm !== undefined) {
        elemContext.Height = diagramElement.style.depthMm;
    } else if (diagramElement.style?.appearance) {
        try {
            const appearance = JSON.parse(diagramElement.style.appearance);
            if (appearance.depthMm !== undefined) {
                elemContext.Height = appearance.depthMm;
            }
        } catch (e) {}
    } else if (diagramElement.height !== undefined) {
        elemContext.Height = diagramElement.height;
    }
    
    if (diagramElement.style?.widthMm !== undefined) {
        elemContext.Length = diagramElement.style.widthMm;
    } else if (diagramElement.style?.appearance) {
        try {
            const appearance = JSON.parse(diagramElement.style.appearance);
            if (appearance.widthMm !== undefined) {
                elemContext.Length = appearance.widthMm;
            }
        } catch (e) {}
    } else if (diagramElement.style?.lengthMm !== undefined) {
        elemContext.Length = diagramElement.style.lengthMm;
    }
    
    // Defaults
    if (elemContext.Length === undefined) elemContext.Length = 500;
    if (elemContext.Height === undefined) elemContext.Height = 200;
  }
}

export const codegenGenerationEngineService = new CodegenGenerationEngineService();
