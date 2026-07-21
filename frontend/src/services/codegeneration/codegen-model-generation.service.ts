import { Diagram, CodeGenerationResult } from '../../models/types';
import Handlebars from 'handlebars';
import { metamodelService } from '../metamodel';
import { modelService } from '../model';
import { codegenContextBuilderService } from './codegen-context-builder.service';
import { codegenInheritanceUtilsService } from './codegen-inheritance-utils.service';
import { codegenProjectCrudService } from './codegen-project-crud.service';
import { codegenTemplateCrudService } from './codegen-template-crud.service';

/**
 * Service for generating code from models (without diagrams)
 */
export class CodegenModelGenerationService {
  /**
   * Generate code from a model using a template (no diagram required)
   */
  generateCodeFromModel(modelId: string, templateId: string): CodeGenerationResult[] {
    console.log('Generating code with template:', templateId, 'for model:', modelId);
    
    const template = codegenTemplateCrudService.getTemplateById(templateId)
      ?? codegenProjectCrudService
        .getAllProjects()
        .flatMap(project => project.templates)
        .find(projectTemplate => projectTemplate.id === templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    // Get the model
    const model = modelService.getModelById(modelId);
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
    
    // Prepare handlebars template
    const compiledTemplate = Handlebars.compile(template.templateContent, { noEscape: true });
    const filenameTemplate = Handlebars.compile(template.outputPattern, { noEscape: true });
    
    // Build context for model-based generation
    const context = this.buildModelContext(model, metamodel);
    
    // Generate code
    try {
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
   * Generate code for a project from a model (no diagram required)
   */
  generateProjectCodeFromModel(modelId: string, projectId: string): CodeGenerationResult[] {
    const project = codegenProjectCrudService.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project with ID ${projectId} not found`);
    }
    
    const model = modelService.getModelById(modelId);
    if (!model) {
      throw new Error(`Model with ID ${modelId} not found`);
    }
    
    let results: CodeGenerationResult[] = [];
    
    // Generate code for each template in the project
    for (const template of project.templates) {
      try {
        const templateResults = this.generateCodeFromModel(modelId, template.id);
        results = [...results, ...templateResults];
      } catch (error) {
        console.error(`Error generating code for template ${template.name}:`, error);
      }
    }
    
    return results;
  }

  /**
   * Build context for model-based generation
   */
  private buildModelContext(model: any, metamodel: any): any {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const emptyDiagram: Diagram = {
      id: 'virtual-diagram',
      name: 'Virtual Diagram',
      modelId: model.id,
      elements: []
    };
    
    const allElementsContext = codegenContextBuilderService.prepareMultiElementContext(
      model.elements,
      emptyDiagram,
      metamodel
    );
    const elementContext = {};

    // Prepare metamodels context
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

    // Prepare models context
    const modelsContext: { [key: string]: any } = {};
    const conformingModels = modelService.getModelsByMetamodelId(metamodel.id);
    conformingModels.forEach(m => {
        modelsContext[m.name] = {
            id: m.id,
            name: m.name,
            elements: []
        };
        
        codegenContextBuilderService.sortElementsForGeneration(m.elements).forEach(elem => {
            const elemName = elem.style?.name;
            if (elemName) {
                const elemContext = codegenContextBuilderService.prepareSingleElementContext(elem);
                
                modelsContext[m.name].elements.push(elemContext);
                modelsContext[m.name][elemName] = elemContext;
            }
        });
    });

    // Create final context
    return {
      ...elementContext,
      ...allElementsContext,
      elements: codegenContextBuilderService.prepareElementsContext(model.elements),
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
        elements: codegenContextBuilderService.prepareElementsContext(model.elements)
      },
      ...metamodelsContext,
      ...modelsContext,
    };
  }
}

export const codegenModelGenerationService = new CodegenModelGenerationService();
