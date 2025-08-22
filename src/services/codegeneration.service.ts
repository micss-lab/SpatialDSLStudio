import {
  Diagram,
  DiagramElement,
  CodeGenerationTemplate,
  CodeGenerationResult,
  Metamodel,
  MetaClass,
  Model,
  ModelElement,
  CodeGenerationProject,
  MetaAttribute,
  MetaReference
} from '../models/types';
import { v4 as uuidv4 } from 'uuid';
import Handlebars from 'handlebars';
import { metamodelService } from './metamodel.service';
import { diagramService } from './diagram.service';
import { modelService } from './model.service';

class CodeGenerationService {
  private exampleTemplates: CodeGenerationTemplate[] = [];
  private projects: CodeGenerationProject[] = [];
  private readonly EXAMPLE_TEMPLATES_STORAGE_KEY = 'obeo_like_tool_example_templates';
  private readonly PROJECTS_STORAGE_KEY = 'obeo_like_tool_projects';

  constructor() {
    // Initialize handlebars
    this.registerHelpers();
    
    // Load templates and projects from localStorage
    this.loadFromStorage();
    
    // Register additional helpers for 3D properties
    this.registerHandlebarsHelpers();
    
    // If no example templates exist, load examples
    if (this.exampleTemplates.length === 0) {
      this.loadExampleTemplates();
    }
    
    // If no projects exist, load example projects
    if (this.projects.length === 0) {
      this.loadExampleProjects();
    }
  }

  // ==============================
  // Inheritance helpers (flatten)
  // ==============================
  private getAllAttributes(metaClass: MetaClass, metamodel: Metamodel): MetaAttribute[] {
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
    // Deduplicate by name so child overrides parent
    const unique: MetaAttribute[] = [];
    const seen = new Set<string>();
    for (let i = allAttributes.length - 1; i >= 0; i--) {
      const attr = allAttributes[i];
      if (!seen.has(attr.name)) {
        seen.add(attr.name);
        unique.unshift(attr);
      }
    }
    return unique;
  }

  private getAllReferences(metaClass: MetaClass, metamodel: Metamodel): MetaReference[] {
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
    // Deduplicate by name so child overrides parent
    const unique: MetaReference[] = [];
    const seen = new Set<string>();
    for (let i = allReferences.length - 1; i >= 0; i--) {
      const ref = allReferences[i];
      if (!seen.has(ref.name)) {
        seen.add(ref.name);
        unique.unshift(ref);
      }
    }
    return unique;
  }

  private loadFromStorage(): void {
    try {
      // Load example templates
      const storedExampleTemplates = localStorage.getItem(this.EXAMPLE_TEMPLATES_STORAGE_KEY);
      if (storedExampleTemplates) {
        this.exampleTemplates = JSON.parse(storedExampleTemplates);
      } else {
        this.exampleTemplates = [];
      }
      
      // Load projects
      const storedProjects = localStorage.getItem(this.PROJECTS_STORAGE_KEY);
      if (storedProjects) {
        this.projects = JSON.parse(storedProjects);
      } else {
        this.projects = [];
      }
    } catch (error) {
      console.error('Error loading data from localStorage:', error);
      this.exampleTemplates = [];
      this.projects = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.EXAMPLE_TEMPLATES_STORAGE_KEY, JSON.stringify(this.exampleTemplates));
      localStorage.setItem(this.PROJECTS_STORAGE_KEY, JSON.stringify(this.projects));
    } catch (error) {
      console.error('Error saving data to localStorage:', error);
    }
  }

  private registerHelpers() {
    // Register custom helpers for code generation
    
    Handlebars.registerHelper('capitalize', function(str) {
      if (typeof str !== 'string') return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    });
    
    Handlebars.registerHelper('lowercase', function(str) {
      if (typeof str !== 'string') return '';
      return str.toLowerCase();
    });
    
    Handlebars.registerHelper('uppercase', function(str) {
      if (typeof str !== 'string') return '';
      return str.toUpperCase();
    });
    
    Handlebars.registerHelper('camelCase', function(str) {
      if (typeof str !== 'string') return '';
      return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) => 
        index === 0 ? letter.toLowerCase() : letter.toUpperCase()
      ).replace(/\s+/g, '');
    });
    
    Handlebars.registerHelper('snakeCase', function(str) {
      if (typeof str !== 'string') return '';
      return str.replace(/\s+/g, '_').toLowerCase();
    });
    
    // Helper to quote string values but leave numbers and booleans as is
    Handlebars.registerHelper('quote', function(value) {
      if (typeof value === 'string') {
        return `"${value}"`;
      }
      return value;
    });
    
    // Add equality comparison helper
    Handlebars.registerHelper('eq', function(a, b) {
      return a === b;
    });
    
    // Add a range helper for numeric loops
    Handlebars.registerHelper('range', function(start, end, options) {
      let result = '';
      for (let i = start; i <= end; i++) {
        // Set @first and @last for each iteration
        const data = Handlebars.createFrame(options.data || {});
        data.index = i;
        data.first = (i === start);
        data.last = (i === end);
        result += options.fn(i, { data });
      }
      return result;
    });

    // Add a concat helper for string concatenation
    Handlebars.registerHelper('concat', function() {
      // Remove the last argument (Handlebars options object)
      return Array.prototype.slice.call(arguments, 0, -1).join('');
    });
    
    // Generic helpers to fix comma placement for list initializers (model-agnostic)
    Handlebars.registerHelper('resetListComma', function(listName: string, options: any) {
      const root = (options && options.data && options.data.root) || {};
      (root as any).__pcListComma = (root as any).__pcListComma || {};
      (root as any).__pcListComma[listName] = false;
      return '';
    });

    Handlebars.registerHelper('commaIfNeeded', function(listName: string, options: any) {
      const root = (options && options.data && options.data.root) || {};
      (root as any).__pcListComma = (root as any).__pcListComma || {};
      if ((root as any).__pcListComma[listName]) {
        return ',';
      } else {
        (root as any).__pcListComma[listName] = true;
        return '';
      }
    });



    
    // Add a helper to get elements by class name
    Handlebars.registerHelper('getElementsByClass', function(elements, className, options) {
      if (!elements || !Array.isArray(elements)) return [];
      return elements.filter(el => {
        const elClassName = el.style?.name || '';
        return elClassName.toLowerCase() === className.toLowerCase();
      });
    });

    
    // Add a helper to iterate with index
    Handlebars.registerHelper('eachWithIndex', function(array, options) {
      let result = '';
      for (let i = 0; i < array.length; i++) {
        result += options.fn({...array[i], index: i});
      }
      return result;
    });
    
    // Helper to get the JavaScript type name of a value
    Handlebars.registerHelper('typeof', function(value) {
      if (value === undefined) return 'undefined';
      if (value === null) return 'Object'; // In Java, null is still Object
      
      if (typeof value === 'number') return 'double';
      if (typeof value === 'boolean') return 'boolean';
      
      // Default to string for everything else
      return 'String';
    });
    
    // Helper for arbitrary object lookup (useful for dynamic access)
    Handlebars.registerHelper('lookup', function(obj, key) {
      if (!obj) return undefined;
      
      return obj[key];
    });
    

    
    // Helper to count elements by class name
    Handlebars.registerHelper('countByClassName', function(className, options) {
      const countByClassName = options.data.root.countByClassName;
      if (!countByClassName) return 0;
      
      return countByClassName[className] || 0;
    });
    
    // Helper to count elements by class ID
    Handlebars.registerHelper('countByClassId', function(classId, options) {
      const countByClass = options.data.root.countByClass;
      if (!countByClass) return 0;
      
      return countByClass[classId] || 0;
    });
    
    // Helper that tries both class name and ID for counting
    Handlebars.registerHelper('countElements', function(classNameOrId, options) {
      const countByClassName = options.data.root.countByClassName;
      const countByClass = options.data.root.countByClass;
      
      // Try class name first
      if (countByClassName && countByClassName[classNameOrId] !== undefined) {
        return countByClassName[classNameOrId];
      }
      
      // Try class ID next
      if (countByClass && countByClass[classNameOrId] !== undefined) {
        return countByClass[classNameOrId];
      }
      
      // No matches found
      return 0;
    });
  }

  private registerHandlebarsHelpers() {
    // Helper to access 3D properties with proper capitalization
    Handlebars.registerHelper('get3DProperty', function(obj, prop) {
      if (!obj) return '';
      
      // Try capitalized version first
      const capitalizedProp = prop.charAt(0).toUpperCase() + prop.slice(1).toLowerCase();
      if (obj[capitalizedProp] !== undefined) {
        return obj[capitalizedProp];
      }
      
      // Try lowercase version
      const lowercaseProp = prop.toLowerCase();
      if (obj[lowercaseProp] !== undefined) {
        return obj[lowercaseProp];
      }
      
      return '';
    });
    
    // Helper to check if a 3D property exists
    Handlebars.registerHelper('has3DProperty', function(obj, prop) {
      if (!obj) return false;
      
      const capitalizedProp = prop.charAt(0).toUpperCase() + prop.slice(1).toLowerCase();
      const lowercaseProp = prop.toLowerCase();
      
      return obj[capitalizedProp] !== undefined || obj[lowercaseProp] !== undefined;
    });
    
    // Debug helper to show all 3D properties
    Handlebars.registerHelper('debug3DProperties', function(obj) {
      if (!obj) return 'No object provided';
      
      const props = {
        X: obj.X !== undefined ? obj.X : 'undefined',
        Y: obj.Y !== undefined ? obj.Y : 'undefined',
        RZ: obj.RZ !== undefined ? obj.RZ : 'undefined',
        Width: obj.Width !== undefined ? obj.Width : 'undefined',
        Length: obj.Length !== undefined ? obj.Length : 'undefined',
        Height: obj.Height !== undefined ? obj.Height : 'undefined'
      };
      
      // Also check style and position3D
      if (obj.style) {
        const styleProps: Record<string, any> = {
          style_position3D: obj.style.position3D ? JSON.stringify(obj.style.position3D) : 'undefined',
          style_rotationZ: obj.style.rotationZ !== undefined ? obj.style.rotationZ : 'undefined',
          style_widthMm: obj.style.widthMm !== undefined ? obj.style.widthMm : 'undefined',
          style_heightMm: obj.style.heightMm !== undefined ? obj.style.heightMm : 'undefined',
          style_depthMm: obj.style.depthMm !== undefined ? obj.style.depthMm : 'undefined'
        };
        
        // Merge the style properties into our result
        Object.assign(props, styleProps);
      }
      
      return JSON.stringify(props, null, 2);
    });
    
    // Debug helper to show Width and Length specifically
    Handlebars.registerHelper('debugWidthLength', function(obj) {
      if (!obj) return 'No object provided';
      
      return `Width: ${obj.Width}, Length: ${obj.Length}, widthMm: ${obj.widthMm}, heightMm: ${obj.heightMm}`;
    });
  }

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
    this.saveToStorage();
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

    this.saveToStorage();
    return true;
  }

  deleteTemplate(id: string): boolean {
    const initialLength = this.exampleTemplates.length;
    this.exampleTemplates = this.exampleTemplates.filter(t => t.id !== id);
    
    if (initialLength !== this.exampleTemplates.length) {
      this.saveToStorage();
      return true;
    }
    
    return false;
  }

  generateCode(diagramId: string, templateId: string, elements: DiagramElement[]): CodeGenerationResult[] {
    console.log('Generating code with template:', templateId, 'for diagram:', diagramId);
    
    const template = this.getTemplateById(templateId);
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
      // Continue anyway, as we might want to generate code for a different metamodel
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
      // Return empty result, but maybe we still want to generate something?
      // For now, let's proceed but the context will be limited.
    }
    
    // Prepare handlebars template
    const compiledTemplate = Handlebars.compile(template.templateContent, { noEscape: true });
    const filenameTemplate = Handlebars.compile(template.outputPattern, { noEscape: true });
    
    // --- CONTEXT BUILDING ---
    
    // 1. Prepare base contexts
    const allElementsContext = this.prepareMultiElementContext(elements, diagram, metamodel);
    const primaryElement = targetElements.length > 0 ? targetElements[0] : (elements.length > 0 ? elements[0] : null);
    const elementContext = primaryElement ? this.prepareSingleElementContext(primaryElement) : {};

    // 2. Prepare metamodels context: {{metamodelname.classname}}
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
                    // Expose flattened attributes/references for templates
                    attributes: this.getAllAttributes(cls, mm),
                    references: this.getAllReferences(cls, mm),
                    // Keep own (non-inherited) lists for reference if needed
                    ownAttributes: cls.attributes,
                    ownReferences: cls.references
                }))
            };
            
            // Also add each class directly as a property for backward compatibility
            mm.classes.forEach(cls => {
                metamodelsContext[sanitizedMetamodelName][cls.name] = {
                    ...cls,
                    attributes: this.getAllAttributes(cls, mm),
                    references: this.getAllReferences(cls, mm),
                    ownAttributes: cls.attributes,
                    ownReferences: cls.references
                };
            });
        }
    });

    // 3. Prepare models context: {{modelname.elementname}}
    const modelsContext: { [key: string]: any } = {};
    const conformingModels = modelService.getModelsByMetamodelId(metamodel.id);
    conformingModels.forEach(m => {
        // Initialize the model context with basic model info
        modelsContext[m.name] = {
            id: m.id,
            name: m.name,
            elements: [] // Will store all elements as an array
        };
        
        // Process each element
        m.elements.forEach(elem => {
            const elemName = elem.style?.name;
            if (elemName) {
                // Prepare a rich context for each element
                const elemContext = this.prepareSingleElementContext(elem);
                
                // Find corresponding diagram element to get 3D properties
                const diagramElements = diagram?.elements || [];
                // The modelElementId in DiagramElement should match the id of the ModelElement
                // According to types.ts: DiagramElement.modelElementId references a ModelElement.id
                let matchingDiagramElement = diagramElements.find(de => de.modelElementId === elem.id);
                
                // Try alternative matching if needed
                if (!matchingDiagramElement) {
                    // Try matching by name
                    const nameMatch = diagramElements.find(de => 
                        de.style && de.style.name && de.style.name === elemName
                    );
                    if (nameMatch) {
                        matchingDiagramElement = nameMatch;
                    }
                }
                
                if (matchingDiagramElement) {                    
                    // Get 3D properties from the correct locations
                    // 1. Position: Check position3D in style first, then fall back to x/y in the element
                    if (matchingDiagramElement.style?.position3D) {
                        elemContext.X = matchingDiagramElement.style.position3D.x;
                        elemContext.Y = matchingDiagramElement.style.position3D.y;
                    } else {
                        if (matchingDiagramElement.x !== undefined) elemContext.X = matchingDiagramElement.x;
                        if (matchingDiagramElement.y !== undefined) elemContext.Y = matchingDiagramElement.y;
                    }
                    
                    // 2. Rotation: Check rotationZ in style
                    if (matchingDiagramElement.style?.rotationZ !== undefined) {
                        elemContext.RZ = matchingDiagramElement.style.rotationZ;
                    } else if (matchingDiagramElement.style?.rz !== undefined) {
                        elemContext.RZ = matchingDiagramElement.style.rz;
                    }
                    
                    // 3. Dimensions: Check widthMm/heightMm/depthMm in style first
                    // According to Node3D.tsx, widthMm is used for Width
                    if (matchingDiagramElement.style?.widthMm !== undefined) {
                        elemContext.Width = matchingDiagramElement.style.widthMm;
                    } else if (matchingDiagramElement.width !== undefined) {
                        elemContext.Width = matchingDiagramElement.width;
                    }
                    
                    // For Height: Try multiple sources in order of priority
                    if (matchingDiagramElement.style?.depthMm !== undefined) {
                        // First choice: depthMm from style
                        elemContext.Height = matchingDiagramElement.style.depthMm;
                    } else if (matchingDiagramElement.style?.appearance) {
                        // Second choice: depthMm from appearance object
                        try {
                            const appearance = JSON.parse(matchingDiagramElement.style.appearance);
                            if (appearance.depthMm !== undefined) {
                                elemContext.Height = appearance.depthMm;
                            }
                        } catch (e) {
                            console.error(`Error parsing appearance for ${elemName}:`, e);
                        }
                    } else if (matchingDiagramElement.height !== undefined) {
                        // Last resort: use height property
                        elemContext.Height = matchingDiagramElement.height;
                    }
                    
                    // For Length: Try multiple sources in order of priority
                    if (matchingDiagramElement.style?.heightMm !== undefined) {
                        // First choice: heightMm from style
                        elemContext.Length = matchingDiagramElement.style.heightMm;
                    } else if (matchingDiagramElement.style?.appearance) {
                        // Second choice: heightMm from appearance object
                        try {
                            const appearance = JSON.parse(matchingDiagramElement.style.appearance);
                            if (appearance.heightMm !== undefined) {
                                elemContext.Length = appearance.heightMm;
                            }
                        } catch (e) {
                            console.error(`Error parsing appearance for ${elemName}:`, e);
                        }
                    } else if (matchingDiagramElement.style?.lengthMm !== undefined) {
                        // Third choice: lengthMm from style
                        elemContext.Length = matchingDiagramElement.style.lengthMm;
                    } else if (matchingDiagramElement.style?.length !== undefined) {
                        // Last resort: use length property
                        elemContext.Length = matchingDiagramElement.style.length;
                    }
                    
                    // Use default values from appearance service if still undefined
                    if (elemContext.Length === undefined) {
                        elemContext.Length = 500; // Default heightMm from appearance service
                    }
                    
                    if (elemContext.Height === undefined) {
                        elemContext.Height = 200; // Default depthMm from appearance service
                    }
                }
                
                // Add to the elements array
                modelsContext[m.name].elements.push(elemContext);
    
                // The element is also accessible by its name (for backward compatibility)
                modelsContext[m.name][elemName] = elemContext;
            }
        });
    });

    // 4. Create the final context
    const context = {
      // The main element's properties at root level for backward compatibility
      ...elementContext,
      // All elements indexed by name (existing functionality)
      ...allElementsContext,
      // All elements in an array
      elements: elements.map(el => this.prepareSingleElementContext(el)),
      // The primary element being processed
      currentElement: elementContext,
      // The target metamodel
      metamodel: {
        id: metamodel.id,
        name: metamodel.name,
        classes: metamodel.classes.map(cls => ({
          ...cls,
          attributes: this.getAllAttributes(cls, metamodel),
          references: this.getAllReferences(cls, metamodel),
          ownAttributes: cls.attributes,
          ownReferences: cls.references
        }))
      },
      // The current model
      model: {
        id: model.id,
        name: model.name,
        elements: model.elements.map(el => this.prepareSingleElementContext(el))
      },
      // New contexts for accessing all metamodels and models
      ...metamodelsContext,
      ...modelsContext,
    };
    
          // Template is ready for generation
    
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
   * Prepares a context for a single model element
   * @param element The model element
   * @returns A context object with all element properties
   */
  private prepareSingleElementContext(element: any): any {
    // Start with basic properties
    const context: any = {
      id: element.id,
      name: element.style?.name || element.id,
      type: element.modelElementId || element.type,
    };

    // Try to resolve the corresponding model element to merge attribute values
    let resolvedModel: Model | undefined;
    let resolvedModelElement: ModelElement | undefined;
    try {
      const allModels = modelService.getAllModels();
      outer: for (const m of allModels) {
        // Prefer lookup by modelElementId when provided (diagram element case)
        if (element.modelElementId) {
          const found = m.elements.find(e => e.id === element.modelElementId);
          if (found) {
            resolvedModel = m;
            resolvedModelElement = found;
            break outer;
          }
        }
        // Fallback: direct id match (model element case)
        if (element.id) {
          const foundById = m.elements.find(e => e.id === element.id);
          if (foundById) {
            resolvedModel = m;
            resolvedModelElement = foundById;
            break outer;
          }
        }
      }
    } catch {}
    
    // Try to parse appearance object which may contain 3D properties
    let appearance: any = {};
    if (element.style?.appearance) {
      try {
        appearance = JSON.parse(element.style.appearance);
      } catch (e) {
        console.error('Error parsing appearance:', e);
      }
    }

    // Add all attributes from style (diagram or model element style)
    if (element.style) {
      // Process all style properties
      Object.keys(element.style).forEach(key => {
        context[key] = element.style[key];
        
        // Handle special 3D properties
        if (key === 'position3D') {
          // Extract position3D coordinates
          if (element.style.position3D) {
            context.X = element.style.position3D.x;
            context.Y = element.style.position3D.y;
          }
        } else if (key === 'rotationZ') {
          // Extract rotation
          context.RZ = element.style.rotationZ;
        } else if (key === 'widthMm') {
          // Extract width in mm (UI Length control → actual length)
          context.Length = element.style.widthMm;
        } else if (key === 'depthMm') {
          // In 3D mode, depthMm is used for Height (Y-axis)
          context.Height = element.style.depthMm;
        } else if (key === 'heightMm') {
          // In 3D mode, heightMm is used for Width (X-axis)
          context.Width = element.style.heightMm;
        } else if (['x', 'y', 'rz', 'width', 'height', 'length'].includes(key.toLowerCase())) {
          // Also add capitalized version for standard 2D properties
          const capitalizedKey = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
          context[capitalizedKey] = element.style[key];
      }
    });
    }

    // If we resolved a model element, merge its style (attribute values) so inherited attributes are accessible
    if (resolvedModelElement && resolvedModelElement.style) {
      Object.keys(resolvedModelElement.style).forEach(attrName => {
        if (context[attrName] === undefined) {
          context[attrName] = resolvedModelElement!.style[attrName];
        }
      });
    }

    // Add properties from appearance if not already set
    if (appearance) {
      // Width (X-axis, from heightMm)
      if (context.Width === undefined && appearance.heightMm !== undefined) {
        context.Width = appearance.heightMm;
      }
      
      // Height (Y-axis, from depthMm)
      if (context.Height === undefined && appearance.depthMm !== undefined) {
        context.Height = appearance.depthMm;
      }
      
      // Length (Z-axis, from widthMm)
      if (context.Length === undefined && appearance.widthMm !== undefined) {
        context.Length = appearance.widthMm;
      }
    }

    // Add direct properties if they exist (for DiagramElements)
    // These are fallbacks if style properties aren't available
    if (element.x !== undefined && context.X === undefined) context.X = element.x;
    if (element.y !== undefined && context.Y === undefined) context.Y = element.y;
    // Comment out 2D width/height fallbacks to avoid conflicts with 3D properties
    // if (element.width !== undefined && context.Width === undefined) context.Width = element.width;
    // if (element.height !== undefined && context.Height === undefined) context.Height = element.height;

    // Add references
    if (element.references) {
      Object.keys(element.references).forEach(key => {
        context[key] = element.references[key];
      });
    }

    // If we have metamodel context for this element, compute an attributes array with values
    if (resolvedModel && resolvedModelElement) {
      const mm = metamodelService.getMetamodelById(resolvedModel.conformsTo);
      if (mm) {
        const metaCls = mm.classes.find(c => c.id === resolvedModelElement!.modelElementId);
        if (metaCls) {
          const flatAttrs = this.getAllAttributes(metaCls, mm);
          context.attributes = flatAttrs.map(attr => ({
            ...attr,
            value: resolvedModelElement!.style ? resolvedModelElement!.style[attr.name] : undefined
          }));
        }
      }
    }

    // Use default values if still undefined
    if (context.Width === undefined) {
      context.Width = 800; // Default heightMm from appearance service
    }
    
    if (context.Length === undefined) {
      context.Length = 500; // Default widthMm from appearance service
    }
    
    if (context.Height === undefined) {
      context.Height = 200; // Default depthMm from appearance service
    }

    return context;
  }

  private prepareMultiElementContext(elements: DiagramElement[], diagram: Diagram, metamodel: Metamodel): any {
    const context: any = {};
    
    // Group elements by metamodel class ID
    const elementsByClass: Record<string, any[]> = {};
    // Group elements by metaclass name
    const elementsByClassName: Record<string, any[]> = {};
    
    // Create a map of metaclass IDs to names for quick lookup
    const metaclassIdToName: Record<string, string> = {};
    metamodel.classes.forEach(cls => {
      metaclassIdToName[cls.id] = cls.name;
    });
    
    console.log('Metaclass ID to Name mapping:', metaclassIdToName);
    
    // First, index all elements by their name for direct access
    elements.forEach(element => {
      const name = element.style.name;
      if (!name) return;
      
      // Create an element context
      const elementContext = this.prepareSingleElementContext(element);
      
      // Add to the context by name
      context[name] = elementContext;
      
      // Group by class type (using ID)
      const modelElementId = element.modelElementId;
      if (!elementsByClass[modelElementId]) {
        elementsByClass[modelElementId] = [];
      }
      elementsByClass[modelElementId].push(elementContext);
      
      // Group by class name if we can find it
      const metaclassName = metaclassIdToName[modelElementId];
      if (metaclassName) {
        if (!elementsByClassName[metaclassName]) {
          elementsByClassName[metaclassName] = [];
        }
        elementsByClassName[metaclassName].push(elementContext);
      }
    });
    
    // Add all elements by class groups 
    context.elementsByClass = elementsByClass;
    context.elementsByClassName = elementsByClassName;
    
    // Count elements by type (using IDs)
    context.countByClass = {};
    Object.keys(elementsByClass).forEach(key => {
      context.countByClass[key] = elementsByClass[key].length;
    });
    
    // Count elements by class name
    context.countByClassName = {};
    Object.keys(elementsByClassName).forEach(key => {
      context.countByClassName[key] = elementsByClassName[key].length;
    });
    
    // Debug logging to help identify the correct structure
    console.log('Multi-element context created:', {
      "Number of named elements": Object.keys(context).length - 4, // Subtract elementsByClass, elementsByClassName, countByClass, countByClassName
      "Element class groups by ID": Object.keys(elementsByClass),
      "Element counts by ID": context.countByClass,
      "Element class groups by name": Object.keys(elementsByClassName),
      "Element counts by name": context.countByClassName,
      "Sample element names": Object.keys(context).filter(key => !['elementsByClass', 'elementsByClassName', 'countByClass', 'countByClassName'].includes(key)).slice(0, 5)
    });
    
    return context;
  }

  // Helper method to load example templates
  loadExampleTemplates() {
    // Java Class Template
    const javaClassTemplate = this.createTemplate(
      'Java Class Template',
      'java',
      `// Generated Java Class
package com.example.model;

/**
 * {{name}} class generated from the model
 */
public class {{capitalize name}} {
    {{#each attributes}}
    private {{typeof this}} {{camelCase name}};
    {{/each}}
    
    /**
     * Default constructor
     */
    public {{capitalize name}}() {
        // Initialize default values
    }
    
    {{#each attributes}}
    /**
     * Get {{name}}
     * @return the {{name}} value
     */
    public {{typeof this}} get{{capitalize name}}() {
        return {{camelCase name}};
    }
    
    /**
     * Set {{name}}
     * @param {{camelCase name}} the {{name}} value to set
     */
    public void set{{capitalize name}}({{typeof this}} {{camelCase name}}) {
        this.{{camelCase name}} = {{camelCase name}};
    }
    {{/each}}
}`,
      'metamodel-1', // Target metamodel ID
      '{{capitalize name}}.java' // Output pattern
    );
    
    // Python Class Template
    const pythonClassTemplate = this.createTemplate(
      'Python Class Template',
      'python',
      `class {{capitalize name}}:
    def __init__(self):
        {{#each attributes}}
        self.{{snakeCase name}} = None
        {{/each}}
    
    {{#each attributes}}
    @property
    def {{snakeCase name}}(self):
        return self._{{snakeCase name}}
    
    @{{snakeCase name}}.setter
    def {{snakeCase name}}(self, value):
        self._{{snakeCase name}} = value
    {{/each}}`,
      'metamodel-1', // Target metamodel ID
      '{{snakeCase name}}.py' // Output pattern
    );
    
    // Multi-element Server Template
    const serverConfigTemplate = this.createTemplate(
      'Multi-Server Configuration',
      'java',
      `// Multi-Server Configuration Template
// This template demonstrates how to access multiple diagram elements
// Current element: {{name}}

import java.util.ArrayList;
import java.util.List;

/**
 * ServerManager class - manages all server instances
 * 
 * Created from diagram with:
 * - {{elementsByClass.Server.length}} Server instances
 * - Current time: {{currentElement.name}}
 * - Metamodel: {{metamodel.name}}
 */
public class ServerManager {
    // ===============================================================
    // Method 1: Access specific servers by their exact names
    // This is useful when you know the exact names of elements
    // ===============================================================
    
    // First server specific values
    private static final int FIRST_SERVER_PORT = {{Class_Server1.port}};
    private static final String FIRST_SERVER_NAME = "{{Class_Server1.servername}}";
    
    // Second server specific values
    private static final int SECOND_SERVER_PORT = {{Class_Server2.port}};
    private static final String SECOND_SERVER_NAME = "{{Class_Server2.servername}}";
    
    // ===============================================================
    // Method 2: Use arrays to store all servers
    // This is useful when you have an unknown number of elements
    // ===============================================================
    
    // Define arrays to store server data
    private static final String[] SERVER_NAMES = {
        {{#each elementsByClass.Server}}
        {{#if @index}}, {{/if}}"{{servername}}"
        {{/each}}
    };
    
    private static final int[] SERVER_PORTS = {
        {{#each elementsByClass.Server}}
        {{#if @index}}, {{/if}}{{port}}
        {{/each}}
    };
    
    // ===============================================================
    // Method 3: Loop through elements to generate methods
    // This dynamically generates code based on available elements
    // ===============================================================
    
    /**
     * Initialize all server configurations
     */
    public void initializeAllServers() {
        System.out.println("Initializing " + {{elementsByClass.Server.length}} + " servers:");
        
        {{#each elementsByClass.Server}}
        initializeServer{{@index}}("{{servername}}", {{port}});
        {{/each}}
    }
    
    // Generate a method for each server
    {{#each elementsByClass.Server}}
    private void initializeServer{{@index}}(String name, int port) {
        System.out.println("  - Starting server " + name + " on port " + port);
        // Server specific initialization code here
    }
    {{/each}}
    
    // ===============================================================
    // Method 4: Filter elements by type (using #if and eq helper)
    // ===============================================================
    
    public void printAllElements() {
        System.out.println("Diagram elements:");
        
        {{#each elements}}
        {{#if (eq modelElementId "Server")}}
        System.out.println("  - SERVER: {{name}} (port={{port}})");
        {{else}}
        System.out.println("  - OTHER: {{name}} (type={{modelElementId}})");
        {{/if}}
        {{/each}}
    }
    
    // Constructor
    public ServerManager() {
        System.out.println("Initializing Server Manager");
        initializeAllServers();
        printAllElements();
    }
    
    // Main method
    public static void main(String[] args) {
        new ServerManager();
    }
}`,
      'SERVER_METAMODEL', // Target metamodel ID
      'ServerManager.java' // Output pattern
    );
    
    // Multi-metaclass Application Template
    const applicationTemplate = this.createTemplate(
      'Complete Application',
      'java',
      `// Complete Application Template
// This template demonstrates generating a full application from multiple metaclasses
// in the same metamodel
// Metamodel: {{metamodel.name}}

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Application class that uses multiple element types from the metamodel
 * Generated from diagram: {{currentElement.name}}
 */
public class Application {
    private static final String APP_NAME = "Generated Application";
    
    // ===============================================================
    // Class summary from metamodel
    // ===============================================================
    
    /*
     * Metamodel {{metamodel.name}} contains {{metamodel.classes.length}} classes:
     * {{#each metamodel.classes}}
     * - {{name}} (id: {{id}})
     * {{/each}}
     */
    
    // ===============================================================
    // Instance counters - number of each type in the diagram
    // ===============================================================
    
    // Count all element types in the diagram
    {{#each metamodel.classes}}
    private static final int NUM_{{uppercase name}} = {{lookup ../elementsByClass id.length}};
    {{/each}}
    
    // ===============================================================
    // Class definitions for different metaclasses
    // ===============================================================
    
    {{#each metamodel.classes}}
    {{#if (lookup ../elementsByClass id)}}
    // Class definition for {{name}}
    public static class {{name}} {
        private String id;
        private String name;
        
        {{#with (lookup ../elementsByClass.[0] id.[0])}}
        {{#each this}}
        {{#unless (eq @key "id")}}
        {{#unless (eq @key "name")}}
        {{#unless (eq @key "type")}}
        {{#unless (eq @key "modelElementId")}}
        private {{typeof this}} {{@key}};
        {{/unless}}
        {{/unless}}
        {{/unless}}
        {{/unless}}
        {{/each}}
        {{/with}}
        
        public {{name}}(String id, String name) {
            this.id = id;
            this.name = name;
        }
        
        // Getters and setters
        public String getId() { return id; }
        public String getName() { return name; }
        
        {{#with (lookup ../elementsByClass.[0] id.[0])}}
        {{#each this}}
        {{#unless (eq @key "id")}}
        {{#unless (eq @key "name")}}
        {{#unless (eq @key "type")}}
        {{#unless (eq @key "modelElementId")}}
        public {{typeof this}} get{{capitalize @key}}() { return {{@key}}; }
        public void set{{capitalize @key}}({{typeof this}} {{@key}}) { this.{{@key}} = {{@key}}; }
        {{/unless}}
        {{/unless}}
        {{/unless}}
        {{/unless}}
        {{/each}}
        {{/with}}
    }
    {{/if}}
    {{/each}}
    
    // Main method
    public static void main(String[] args) {
        System.out.println("Starting " + APP_NAME);
        
        // Create instances of all elements in the diagram
        {{#each elements}}
        {{name}} {{camelCase name}} = new {{modelElementId}}("{{id}}", "{{name}}");
        {{/each}}
        
        // Print summary
        System.out.println("Created " + {{elements.length}} + " elements");
    }
}`,
      'metamodel-1', // Target metamodel ID
      'Application.java' // Output pattern
    );
    
    // Create example projects
    
    // Java Project
    const javaProject = this.createProject(
      'Java Project',
      'metamodel-1',
      'A project that generates Java code from the model',
      true // isExample = true
    );
    
    // Add templates to Java project
    this.addTemplateToProject(
      javaProject.id,
      javaClassTemplate.name,
      javaClassTemplate.language,
      javaClassTemplate.templateContent,
      javaClassTemplate.outputPattern
    );
    this.addTemplateToProject(
      javaProject.id,
      applicationTemplate.name,
      applicationTemplate.language,
      applicationTemplate.templateContent,
      applicationTemplate.outputPattern
    );
    
    // Python Project
    const pythonProject = this.createProject(
      'Python Project',
      'metamodel-1',
      'A project that generates Python code from the model',
      true // isExample = true
    );
    
    // Add templates to Python project
    this.addTemplateToProject(
      pythonProject.id,
      pythonClassTemplate.name,
      pythonClassTemplate.language,
      pythonClassTemplate.templateContent,
      pythonClassTemplate.outputPattern
    );
    
    // Full Stack Project
    const fullStackProject = this.createProject(
      'Full Stack Project',
      'metamodel-1',
      'A project that generates both Java and Python code',
      true // isExample = true
    );
    
    // Add templates to Full Stack project
    this.addTemplateToProject(
      fullStackProject.id,
      javaClassTemplate.name,
      javaClassTemplate.language,
      javaClassTemplate.templateContent,
      javaClassTemplate.outputPattern
    );
    this.addTemplateToProject(
      fullStackProject.id,
      pythonClassTemplate.name,
      pythonClassTemplate.language,
      pythonClassTemplate.templateContent,
      pythonClassTemplate.outputPattern
    );
    this.addTemplateToProject(
      fullStackProject.id,
      applicationTemplate.name,
      applicationTemplate.language,
      applicationTemplate.templateContent,
      applicationTemplate.outputPattern
    );
    
    // Server Project
    const serverProject = this.createProject(
      'Server Project',
      'SERVER_METAMODEL',
      'A project for server configuration',
      true // isExample = true
    );
    
    // Add templates to Server project
    this.addTemplateToProject(
      serverProject.id,
      serverConfigTemplate.name,
      serverConfigTemplate.language,
      serverConfigTemplate.templateContent,
      serverConfigTemplate.outputPattern
    );
  }

  // Project-related methods
  
  getAllProjects(): CodeGenerationProject[] {
    return [...this.projects].filter(p => !p.isExample);
  }
  
  getAllExampleProjects(): CodeGenerationProject[] {
    return [...this.projects].filter(p => p.isExample);
  }
  
  getProjectById(id: string): CodeGenerationProject | undefined {
    return this.projects.find(p => p.id === id);
  }
  
  getProjectsByMetamodelId(metamodelId: string): CodeGenerationProject[] {
    return this.projects.filter(p => p.targetMetamodelId === metamodelId && !p.isExample);
  }
  
  createProject(
    name: string,
    targetMetamodelId: string,
    description: string = '',
    isExample: boolean = false
  ): CodeGenerationProject {
    const newProject: CodeGenerationProject = {
      id: uuidv4(),
      name,
      description,
      targetMetamodelId,
      templates: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isExample
    };
    
    this.projects.push(newProject);
    this.saveToStorage();
    return newProject;
  }
  
  updateProject(
    id: string, 
    updates: Partial<Omit<CodeGenerationProject, 'id' | 'createdAt' | 'templates'>>
  ): boolean {
    const projectIndex = this.projects.findIndex(p => p.id === id);
    if (projectIndex === -1) return false;
    
    this.projects[projectIndex] = {
      ...this.projects[projectIndex],
      ...updates,
      updatedAt: Date.now()
    };
    
    this.saveToStorage();
    return true;
  }
  
  deleteProject(id: string): boolean {
    const initialLength = this.projects.length;
    this.projects = this.projects.filter(p => p.id !== id);
    
    const result = initialLength !== this.projects.length;
    if (result) {
      this.saveToStorage();
    }
    return result;
  }
  
  // Template management within projects
  
  addTemplateToProject(
    projectId: string, 
    name: string,
    language: 'java' | 'python',
    templateContent: string,
    outputPattern: string
  ): CodeGenerationTemplate | null {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return null;
    
    const newTemplate: CodeGenerationTemplate = {
      id: uuidv4(),
      name,
      language,
      templateContent,
      targetMetamodelId: project.targetMetamodelId,
      outputPattern
    };
    
    project.templates.push(newTemplate);
    project.updatedAt = Date.now();
    this.saveToStorage();
    return newTemplate;
  }
  
  updateTemplateInProject(
    projectId: string,
    templateId: string,
    updates: Partial<Omit<CodeGenerationTemplate, 'id' | 'targetMetamodelId'>>
  ): boolean {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return false;
    
    const templateIndex = project.templates.findIndex(t => t.id === templateId);
    if (templateIndex === -1) return false;
    
    project.templates[templateIndex] = {
      ...project.templates[templateIndex],
      ...updates
    };
    
    project.updatedAt = Date.now();
    this.saveToStorage();
    return true;
  }
  
  removeTemplateFromProject(projectId: string, templateId: string): boolean {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return false;
    
    const initialLength = project.templates.length;
    project.templates = project.templates.filter(t => t.id !== templateId);
    
    const result = initialLength !== project.templates.length;
    if (result) {
      project.updatedAt = Date.now();
      this.saveToStorage();
    }
    return result;
  }
  
  // Generate code for a project (all templates)
  generateProjectCode(diagramId: string, projectId: string): CodeGenerationResult[] {
    const project = this.getProjectById(projectId);
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
  
  // Generate code from a specific template
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
    
    // --- CONTEXT BUILDING ---
    
    // 1. Prepare base contexts
    const allElementsContext = this.prepareMultiElementContext(elements, diagram, metamodel);
    const primaryElement = elements.length > 0 ? elements[0] : null;
    const elementContext = primaryElement ? this.prepareSingleElementContext(primaryElement) : {};

    // 2. Prepare metamodels context: {{metamodelname.classname}}
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
                    attributes: this.getAllAttributes(cls, mm),
                    references: this.getAllReferences(cls, mm),
                    ownAttributes: cls.attributes,
                    ownReferences: cls.references
                }))
            };
            
            // Also add each class directly as a property for backward compatibility
            mm.classes.forEach(cls => {
                metamodelsContext[sanitizedMetamodelName][cls.name] = {
                    ...cls,
                    attributes: this.getAllAttributes(cls, mm),
                    references: this.getAllReferences(cls, mm),
                    ownAttributes: cls.attributes,
                    ownReferences: cls.references
                };
            });
        }
    });

    // 3. Prepare models context: {{modelname.elementname}}
    const modelsContext: { [key: string]: any } = {};
    const conformingModels = modelService.getModelsByMetamodelId(metamodel.id);
    conformingModels.forEach(m => {
        // Initialize the model context with basic model info
        modelsContext[m.name] = {
            id: m.id,
            name: m.name,
            elements: [] // Will store all elements as an array
        };
        
        // Process each element
        m.elements.forEach(elem => {
            const elemName = elem.style?.name;
            if (elemName) {
                // Prepare a rich context for each element
                const elemContext = this.prepareSingleElementContext(elem);
                
                // Find corresponding diagram element to get 3D properties
                const diagramElements = diagram?.elements || [];
                // The modelElementId in DiagramElement should match the id of the ModelElement
                // According to types.ts: DiagramElement.modelElementId references a ModelElement.id
                let matchingDiagramElement = diagramElements.find(de => de.modelElementId === elem.id);
                
                // Try alternative matching if needed
                if (!matchingDiagramElement) {
                    // Try matching by name
                    const nameMatch = diagramElements.find(de => 
                        de.style && de.style.name && de.style.name === elemName
                    );
                    if (nameMatch) {
                        matchingDiagramElement = nameMatch;
                    }
                }
                
                if (matchingDiagramElement) {                    
                    // Get 3D properties from the correct locations
                    // 1. Position: Check position3D in style first, then fall back to x/y in the element
                    if (matchingDiagramElement.style?.position3D) {
                        elemContext.X = matchingDiagramElement.style.position3D.x;
                        elemContext.Y = matchingDiagramElement.style.position3D.y;
                    } else {
                        if (matchingDiagramElement.x !== undefined) elemContext.X = matchingDiagramElement.x;
                        if (matchingDiagramElement.y !== undefined) elemContext.Y = matchingDiagramElement.y;
                    }
                    
                    // 2. Rotation: Check rotationZ in style
                    if (matchingDiagramElement.style?.rotationZ !== undefined) {
                        elemContext.RZ = matchingDiagramElement.style.rotationZ;
                    } else if (matchingDiagramElement.style?.rz !== undefined) {
                        elemContext.RZ = matchingDiagramElement.style.rz;
                    }
                    
                    // 3. Dimensions: Check widthMm/heightMm/depthMm in style first
                    // According to Node3D.tsx, widthMm is used for Width
                    if (matchingDiagramElement.style?.widthMm !== undefined) {
                      elemContext.Width = matchingDiagramElement.style.heightMm;;
                    } else if (matchingDiagramElement.width !== undefined) {
                        elemContext.Width = matchingDiagramElement.width;
                    }
                    
                    // For Height: Try multiple sources in order of priority
                    if (matchingDiagramElement.style?.depthMm !== undefined) {
                        // First choice: depthMm from style
                        elemContext.Height = matchingDiagramElement.style.depthMm;
                    } else if (matchingDiagramElement.style?.appearance) {
                        // Second choice: depthMm from appearance object
                        try {
                            const appearance = JSON.parse(matchingDiagramElement.style.appearance);
                            if (appearance.depthMm !== undefined) {
                                elemContext.Height = appearance.depthMm;
                            }
                        } catch (e) {
                            console.error(`Error parsing appearance for ${elemName}:`, e);
                        }
                    } else if (matchingDiagramElement.height !== undefined) {
                        // Last resort: use height property
                        elemContext.Height = matchingDiagramElement.height;
                    }
                    
                    // For Length: Try multiple sources in order of priority
                    if (matchingDiagramElement.style?.heightMm !== undefined) {
                        // First choice: heightMm from style
                        elemContext.Length = matchingDiagramElement.style.widthMm;
                    } else if (matchingDiagramElement.style?.appearance) {
                        // Second choice: heightMm from appearance object
                        try {
                            const appearance = JSON.parse(matchingDiagramElement.style.appearance);
                            if (appearance.heightMm !== undefined) {
                                elemContext.Length = appearance.heightMm;
                            }
                        } catch (e) {
                            console.error(`Error parsing appearance for ${elemName}:`, e);
                        }
                    } else if (matchingDiagramElement.style?.lengthMm !== undefined) {
                        // Third choice: lengthMm from style
                        elemContext.Length = matchingDiagramElement.style.lengthMm;
                    } else if (matchingDiagramElement.style?.length !== undefined) {
                        // Last resort: use length property
                        elemContext.Length = matchingDiagramElement.style.length;
                    }
                    
                    // Use default values from appearance service if still undefined
                    if (elemContext.Length === undefined) {
                        elemContext.Length = 500; // Default heightMm from appearance service
                    }
                    
                    if (elemContext.Height === undefined) {
                        elemContext.Height = 200; // Default depthMm from appearance service
                    }
                }
                
                // Add to the elements array
                modelsContext[m.name].elements.push(elemContext);
    
                // The element is also accessible by its name (for backward compatibility)
                modelsContext[m.name][elemName] = elemContext;
            }
        });
    });

    // 4. Create the final context
    const context = {
      // The main element's properties at root level for backward compatibility
      ...elementContext,
      // All elements indexed by name (existing functionality)
      ...allElementsContext,
      // All elements in an array
      elements: elements.map(el => this.prepareSingleElementContext(el)),
      // The primary element being processed
      currentElement: elementContext,
      // The target metamodel
      metamodel: {
        id: metamodel.id,
        name: metamodel.name,
        classes: metamodel.classes.map(cls => ({
          ...cls,
          attributes: this.getAllAttributes(cls, metamodel),
          references: this.getAllReferences(cls, metamodel),
          ownAttributes: cls.attributes,
          ownReferences: cls.references
        }))
      },
      // The current model
      model: {
        id: model.id,
        name: model.name,
        elements: model.elements.map(el => this.prepareSingleElementContext(el))
      },
      // New contexts for accessing all metamodels and models
      ...metamodelsContext,
      ...modelsContext,
    };
    
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
  
  // Load example projects
  loadExampleProjects() {
    // First, ensure we have example templates
    if (this.exampleTemplates.length === 0) {
      this.loadExampleTemplates();
    }
    
    // Find example templates by name
    const javaClassTemplate = this.exampleTemplates.find(t => t.name === 'Java Class Template');
    const pythonClassTemplate = this.exampleTemplates.find(t => t.name === 'Python Class Template');
    const serverConfigTemplate = this.exampleTemplates.find(t => t.name === 'Multi-Server Configuration');
    const applicationTemplate = this.exampleTemplates.find(t => t.name === 'Complete Application');
    
    if (!javaClassTemplate || !pythonClassTemplate || !serverConfigTemplate || !applicationTemplate) {
      console.error('Could not find all example templates');
      return;
    }
    
    // Create example projects
    
    // Java Project
    const javaProject = this.createProject(
      'Java Project',
      'metamodel-1',
      'A project that generates Java code from the model',
      true // isExample = true
    );
    
    // Add templates to Java project
    this.addTemplateToProject(
      javaProject.id,
      javaClassTemplate.name,
      javaClassTemplate.language,
      javaClassTemplate.templateContent,
      javaClassTemplate.outputPattern
    );
    
    this.addTemplateToProject(
      javaProject.id,
      applicationTemplate.name,
      applicationTemplate.language,
      applicationTemplate.templateContent,
      applicationTemplate.outputPattern
    );
    
    // Python Project
    const pythonProject = this.createProject(
      'Python Project',
      'metamodel-1',
      'A project that generates Python code from the model',
      true // isExample = true
    );
    
    // Add templates to Python project
    this.addTemplateToProject(
      pythonProject.id,
      pythonClassTemplate.name,
      pythonClassTemplate.language,
      pythonClassTemplate.templateContent,
      pythonClassTemplate.outputPattern
    );
    
    // Full Stack Project
    const fullStackProject = this.createProject(
      'Full Stack Project',
      'metamodel-1',
      'A project that generates both Java and Python code',
      true // isExample = true
    );
    
    // Add templates to Full Stack project
    this.addTemplateToProject(
      fullStackProject.id,
      javaClassTemplate.name,
      javaClassTemplate.language,
      javaClassTemplate.templateContent,
      javaClassTemplate.outputPattern
    );
    
    this.addTemplateToProject(
      fullStackProject.id,
      pythonClassTemplate.name,
      pythonClassTemplate.language,
      pythonClassTemplate.templateContent,
      pythonClassTemplate.outputPattern
    );
    
    this.addTemplateToProject(
      fullStackProject.id,
      applicationTemplate.name,
      applicationTemplate.language,
      applicationTemplate.templateContent,
      applicationTemplate.outputPattern
    );
    
    // Server Project
    const serverProject = this.createProject(
      'Server Project',
      'SERVER_METAMODEL',
      'A project for server configuration',
      true // isExample = true
    );
    
    // Add templates to Server project
    this.addTemplateToProject(
      serverProject.id,
      serverConfigTemplate.name,
      serverConfigTemplate.language,
      serverConfigTemplate.templateContent,
      serverConfigTemplate.outputPattern
    );
  }

  // Generate code from a model directly (no diagram required)
  generateCodeFromModel(modelId: string, templateId: string): CodeGenerationResult[] {
    console.log('Generating code with template:', templateId, 'for model:', modelId);
    
    const template = this.getTemplateById(templateId);
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
      // Continue anyway, as we might want to generate code for a different metamodel
    }

    // Get the metamodel to access its classes
    const metamodel = metamodelService.getMetamodelById(template.targetMetamodelId);
    if (!metamodel) {
      throw new Error('Metamodel not found');
    }
    
    // Prepare handlebars template
    const compiledTemplate = Handlebars.compile(template.templateContent, { noEscape: true });
    const filenameTemplate = Handlebars.compile(template.outputPattern, { noEscape: true });
    
    // --- CONTEXT BUILDING ---
    
    // Create empty elements array since we don't have diagram elements
    const elements: DiagramElement[] = [];
    
    // 1. Prepare base contexts - with empty diagram
    const emptyDiagram: Diagram = {
      id: 'virtual-diagram',
      name: 'Virtual Diagram',
      modelId: model.id,
      elements: []
    };
    
    const allElementsContext = {};
    const elementContext = {};

    // 2. Prepare metamodels context: {{metamodelname.classname}}
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
                    attributes: this.getAllAttributes(cls, mm),
                    references: this.getAllReferences(cls, mm),
                    ownAttributes: cls.attributes,
                    ownReferences: cls.references
                }))
            };
            
            // Also add each class directly as a property for backward compatibility
            mm.classes.forEach(cls => {
                metamodelsContext[sanitizedMetamodelName][cls.name] = {
                    ...cls,
                    attributes: this.getAllAttributes(cls, mm),
                    references: this.getAllReferences(cls, mm),
                    ownAttributes: cls.attributes,
                    ownReferences: cls.references
                };
            });
        }
    });

    // 3. Prepare models context: {{modelname.elementname}}
    const modelsContext: { [key: string]: any } = {};
    const conformingModels = modelService.getModelsByMetamodelId(metamodel.id);
    conformingModels.forEach(m => {
        // Initialize the model context with basic model info
        modelsContext[m.name] = {
            id: m.id,
            name: m.name,
            elements: [] // Will store all elements as an array
        };
        
        // Process each element
        m.elements.forEach(elem => {
            const elemName = elem.style?.name;
            if (elemName) {
                // Prepare a rich context for each element
                const elemContext = this.prepareSingleElementContext(elem);
                
                // Add default values for spatial properties that would normally come from the diagram
                elemContext.X = 0;
                elemContext.Y = 0;
                elemContext.RZ = 0;
                elemContext.Width = 100;
                elemContext.Height = 100;
                elemContext.Length = 100;
                
                // Add to the elements array
                modelsContext[m.name].elements.push(elemContext);
    
                // The element is also accessible by its name (for backward compatibility)
                modelsContext[m.name][elemName] = elemContext;
            }
        });
    });

    // 4. Create the final context
    const context = {
      // The main element's properties at root level for backward compatibility
      ...elementContext,
      // All elements indexed by name (existing functionality)
      ...allElementsContext,
      // All elements in an array
      elements: model.elements.map(el => this.prepareSingleElementContext(el)),
      // The primary element being processed
      currentElement: elementContext,
      // The target metamodel
      metamodel: {
        id: metamodel.id,
        name: metamodel.name,
        classes: metamodel.classes.map(cls => ({
          ...cls,
          attributes: this.getAllAttributes(cls, metamodel),
          references: this.getAllReferences(cls, metamodel),
          ownAttributes: cls.attributes,
          ownReferences: cls.references
        }))
      },
      // The current model
      model: {
        id: model.id,
        name: model.name,
        elements: model.elements.map(el => this.prepareSingleElementContext(el))
      },
      // New contexts for accessing all metamodels and models
      ...metamodelsContext,
      ...modelsContext,
    };
    
    // Template is ready for generation
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

  // Generate code for a project from a model (no diagram required)
  generateProjectCodeFromModel(modelId: string, projectId: string): CodeGenerationResult[] {
    const project = this.getProjectById(projectId);
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
        // Create a template result using the model directly
        const templateResults = this.generateCodeFromModel(modelId, template.id);
        results = [...results, ...templateResults];
      } catch (error) {
        console.error(`Error generating code for template ${template.name}:`, error);
      }
    }
    
    return results;
  }
}

export const codeGenerationService = new CodeGenerationService(); 