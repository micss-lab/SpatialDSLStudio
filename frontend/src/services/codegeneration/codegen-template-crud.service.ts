import { CodeGenerationTemplate } from '../../models/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Service for managing standalone code generation templates (deprecated)
 * Note: Templates are now embedded within projects. This service is kept for backward compatibility.
 */
export class CodegenTemplateCrudService {
  private exampleTemplates: CodeGenerationTemplate[] = [];

  getAllTemplates(): CodeGenerationTemplate[] {
    return [...this.exampleTemplates];
  }

  getTemplateById(id: string): CodeGenerationTemplate | undefined {
    return this.exampleTemplates.find(t => t.id === id);
  }

  getTemplatesByLanguage(language: 'java' | 'python'): CodeGenerationTemplate[] {
    return this.exampleTemplates.filter(t => t.language === language);
  }

  createTemplate(
    name: string,
    language: 'java' | 'python',
    templateContent: string,
    targetMetamodelId: string,
    outputPattern: string
  ): CodeGenerationTemplate {
    const newTemplate: CodeGenerationTemplate = {
      id: uuidv4(),
      name,
      language,
      templateContent,
      targetMetamodelId,
      outputPattern
    };
    
    this.exampleTemplates.push(newTemplate);
    return newTemplate;
  }

  updateTemplate(id: string, updates: Partial<CodeGenerationTemplate>): boolean {
    const templateIndex = this.exampleTemplates.findIndex(t => t.id === id);
    if (templateIndex === -1) return false;

    this.exampleTemplates[templateIndex] = {
      ...this.exampleTemplates[templateIndex],
      ...updates,
      id // Ensure ID doesn't change
    };

    return true;
  }

  deleteTemplate(id: string): boolean {
    const initialLength = this.exampleTemplates.length;
    this.exampleTemplates = this.exampleTemplates.filter(t => t.id !== id);
    
    return initialLength !== this.exampleTemplates.length;
  }

  setTemplates(templates: CodeGenerationTemplate[]): void {
    this.exampleTemplates = templates;
  }

  clearTemplates(): void {
    this.exampleTemplates = [];
  }
}

export const codegenTemplateCrudService = new CodegenTemplateCrudService();
