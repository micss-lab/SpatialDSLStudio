import { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';
import { Metamodel, Model, Diagram } from '../../models/types';
import Handlebars from 'handlebars';

export function createHandlebarsCompletions(
  metamodels: Metamodel[],
  models: Model[],
  diagram: Diagram | null,
  targetMetamodelId?: string
) {
  return (context: CompletionContext): CompletionResult | null => {
    // eslint-disable-next-line no-useless-escape
    const word = context.matchBefore(/\{\{[#\/]?[\w.]*$/);
    if (!word) return null;

    const textBefore = context.state.doc.sliceString(0, context.pos);
    const lastOpenBrace = textBefore.lastIndexOf('{{');
    
    if (lastOpenBrace === -1) return null;

    const textAfterBrace = textBefore.slice(lastOpenBrace + 2);
    
    const completions: Completion[] = [];

    // Pattern: {{MetamodelName.ClassName. or {{MetamodelName.ClassName.part
    const metamodelClassPropertyPattern = /^(\w+)\.(\w+)\.(\w*)$/;
    const metamodelClassPropertyMatch = textAfterBrace.match(metamodelClassPropertyPattern);
    
    if (metamodelClassPropertyMatch) {
      const metamodelName = metamodelClassPropertyMatch[1];
      const className = metamodelClassPropertyMatch[2];
      const partialProp = metamodelClassPropertyMatch[3];
      
      const metamodel = metamodels.find(mm => sanitizeName(mm.name) === metamodelName);
      if (metamodel) {
        const metaClass = metamodel.classes.find(c => c.name === className);
        if (metaClass) {
          completions.push(
            { label: 'name', type: 'property', detail: 'Class name' },
            { label: 'id', type: 'property', detail: 'Class ID' },
            { label: 'abstract', type: 'property', detail: 'boolean' },
            { label: 'attributes', type: 'property', detail: 'Attribute[]' },
            { label: 'references', type: 'property', detail: 'Reference[]' },
            { label: 'superTypes', type: 'property', detail: 'string[]' }
          );
          
          return {
            from: context.pos - partialProp.length,
            options: completions,
            validFor: /^[\w]*$/
          };
        }
      }
    }

    // Pattern: {{MetamodelName. or {{MetamodelName.part
    const metamodelClassPattern = /^(\w+)\.(\w*)$/;
    const metamodelClassMatch = textAfterBrace.match(metamodelClassPattern);
    
    if (metamodelClassMatch) {
      const metamodelName = metamodelClassMatch[1];
      const partialName = metamodelClassMatch[2];
      
      // Check for special context variables first
      if (metamodelName === 'countByClassName' || metamodelName === 'elementsByClassName') {
        // Suggest class names from the target metamodel
        const targetMetamodel = targetMetamodelId ? metamodels.find(m => m.id === targetMetamodelId) : null;
        if (targetMetamodel) {
          targetMetamodel.classes.forEach(cls => {
            completions.push({
              label: cls.name,
              type: 'property',
              detail: metamodelName === 'countByClassName' ? 'number (count)' : 'array (elements)',
              info: `${cls.name} instances in diagram`
            });
          });
        }
        
        if (completions.length > 0) {
          return {
            from: context.pos - partialName.length,
            options: completions,
            validFor: /^[\w]*$/
          };
        }
      } else if (metamodelName === 'countByClass' || metamodelName === 'elementsByClass') {
        // These use class IDs, suggest available class IDs from metamodel
        const targetMetamodel = targetMetamodelId ? metamodels.find(m => m.id === targetMetamodelId) : null;
        if (targetMetamodel) {
          targetMetamodel.classes.forEach(cls => {
            completions.push({
              label: cls.id,
              type: 'property',
              detail: metamodelName === 'countByClass' ? 'number (count)' : 'array (elements)',
              info: `${cls.name} (ID: ${cls.id})`
            });
          });
        }
        
        if (completions.length > 0) {
          return {
            from: context.pos - partialName.length,
            options: completions,
            validFor: /^[\w]*$/
          };
        }
      } else if (metamodelName === 'currentElement') {
        // Suggest common element properties
        completions.push(
          { label: 'id', type: 'property', detail: 'string' },
          { label: 'name', type: 'property', detail: 'string' },
          { label: 'type', type: 'property', detail: 'string' },
          { label: 'X', type: 'property', detail: 'number', info: '3D position' },
          { label: 'Y', type: 'property', detail: 'number', info: '3D position' },
          { label: 'RZ', type: 'property', detail: 'number', info: '3D rotation' },
          { label: 'Width', type: 'property', detail: 'number' },
          { label: 'Length', type: 'property', detail: 'number' },
          { label: 'Height', type: 'property', detail: 'number' }
        );
        
        return {
          from: context.pos - partialName.length,
          options: completions,
          validFor: /^[\w]*$/
        };
      } else if (metamodelName === 'metamodel') {
        completions.push(
          { label: 'id', type: 'property', detail: 'string' },
          { label: 'name', type: 'property', detail: 'string' },
          { label: 'classes', type: 'property', detail: 'array', info: 'All classes in metamodel' }
        );
        
        return {
          from: context.pos - partialName.length,
          options: completions,
          validFor: /^[\w]*$/
        };
      } else if (metamodelName === 'model') {
        completions.push(
          { label: 'id', type: 'property', detail: 'string' },
          { label: 'name', type: 'property', detail: 'string' },
          { label: 'elements', type: 'property', detail: 'array', info: 'All elements in model' }
        );
        
        return {
          from: context.pos - partialName.length,
          options: completions,
          validFor: /^[\w]*$/
        };
      }
      
      const metamodel = metamodels.find(mm => sanitizeName(mm.name) === metamodelName);
      
      if (metamodel) {
        metamodel.classes.forEach(cls => {
          completions.push({
            label: cls.name,
            type: 'class',
            detail: cls.abstract ? 'abstract class' : 'class',
            info: `${cls.attributes?.length || 0} attributes, ${cls.references?.length || 0} references`
          });
        });
      } else {
        const model = models.find(m => m.name === metamodelName);
        if (model) {
          completions.push({
            label: 'id',
            type: 'property',
            detail: 'Model ID'
          });
          completions.push({
            label: 'name',
            type: 'property',
            detail: 'Model name'
          });
          completions.push({
            label: 'elements',
            type: 'property',
            detail: 'ModelElement[]'
          });
          
          model.elements.forEach(elem => {
            const elemName = elem.style?.name;
            if (elemName) {
              completions.push({
                label: elemName,
                type: 'variable',
                detail: 'model element',
                info: `Element from model ${model.name}`
              });
            }
          });
        }
      }
      
      if (completions.length > 0) {
        return {
          from: context.pos - partialName.length,
          options: completions,
          validFor: /^[\w]*$/
        };
      }
    }

    // Pattern: {{ModelName.ElementName. or {{ModelName.ElementName.part
    const modelElementPropertyPattern = /^(\w+)\.(\w+)\.(\w*)$/;
    const modelElementPropertyMatch = textAfterBrace.match(modelElementPropertyPattern);
    
    if (modelElementPropertyMatch) {
      const modelName = modelElementPropertyMatch[1];
      const elementName = modelElementPropertyMatch[2];
      const partialProp = modelElementPropertyMatch[3];
      
      const model = models.find(m => m.name === modelName);
      if (model) {
        const element = model.elements.find(e => e.style?.name === elementName);
        if (element) {
          completions.push(
            { label: 'id', type: 'property', detail: 'Element ID' },
            { label: 'name', type: 'property', detail: 'Element name' },
            { label: 'modelElementId', type: 'property', detail: 'MetaClass ID' }
          );
          
          if (element.style) {
            Object.keys(element.style).forEach(key => {
              if (!['name', 'linkedModelElementId', 'appearance'].includes(key)) {
                completions.push({
                  label: key,
                  type: 'property',
                  detail: typeof element.style[key]
                });
              }
            });
          }
          
          // 3D properties (always available since they're extracted from diagram elements)
          completions.push(
            { label: 'X', type: 'property', detail: 'number', info: 'X position in 3D space' },
            { label: 'Y', type: 'property', detail: 'number', info: 'Y position in 3D space' },
            { label: 'RZ', type: 'property', detail: 'number', info: 'Rotation around Z-axis' },
            { label: 'Width', type: 'property', detail: 'number', info: 'Width in mm' },
            { label: 'Length', type: 'property', detail: 'number', info: 'Length in mm' },
            { label: 'Height', type: 'property', detail: 'number', info: 'Height in mm' }
          );
          
          return {
            from: context.pos - partialProp.length,
            options: completions,
            validFor: /^[\w]*$/
          };
        }
      }
    }

    // Pattern: {{#
    if (textAfterBrace === '#') {
      completions.push(
        { 
          label: '#each', 
          type: 'keyword', 
          detail: 'iterate array', 
          info: 'Iterates over an array. Use: {{#each arrayName}} ... {{/each}}',
          apply: '#each elements}}\n  {{this.name}}\n{{/each' 
        },
        { 
          label: '#if', 
          type: 'keyword', 
          detail: 'conditional', 
          info: 'Conditional block. Use: {{#if condition}} ... {{/if}}',
          apply: '#if condition}}\n  \n{{/if' 
        },
        { 
          label: '#unless', 
          type: 'keyword', 
          detail: 'inverse conditional', 
          info: 'Renders block if condition is false',
          apply: '#unless condition}}\n  \n{{/unless' 
        },
        { 
          label: '#with', 
          type: 'keyword', 
          detail: 'change context', 
          info: 'Changes context to the specified object',
          apply: '#with object}}\n  {{this.property}}\n{{/with' 
        },
        { 
          label: '#range', 
          type: 'keyword', 
          detail: 'numeric loop', 
          info: 'Loops from start to end. Use: {{#range 1 10}} ... {{/range}}',
          apply: '#range 1 10}}\n  {{this}}\n{{/range' 
        }
      );
      
      return {
        from: word.from + 2,
        options: completions,
        validFor: /^#[\w]*$/
      };
    }

    // Pattern: {{ (start of expression)
    if (!textAfterBrace.includes('.') && !textAfterBrace.startsWith('#') && !textAfterBrace.startsWith('/')) {
      // Add metamodel suggestions
      metamodels.forEach(mm => {
        const sanitized = sanitizeName(mm.name);
        completions.push({
          label: sanitized,
          type: 'namespace',
          detail: 'metamodel',
          info: `${mm.classes.length} classes`
        });
      });

      // Add model suggestions (only conforming models if targetMetamodelId is set)
      const relevantModels = targetMetamodelId 
        ? models.filter(m => m.conformsTo === targetMetamodelId)
        : models;
      
      relevantModels.forEach(m => {
        completions.push({
          label: m.name,
          type: 'namespace',
          detail: 'model',
          info: `${m.elements.length} elements`
        });
      });

      // Context variables
      completions.push(
        { label: 'currentElement', type: 'variable', detail: 'object', info: 'Current element being processed' },
        { label: 'elements', type: 'variable', detail: 'array', info: 'All elements in diagram' },
        { label: 'metamodel', type: 'variable', detail: 'object', info: 'Target metamodel' },
        { label: 'model', type: 'variable', detail: 'object', info: 'Current model' },
        { label: 'elementsByClass', type: 'variable', detail: 'object', info: 'Elements grouped by class ID (use with class IDs)' },
        { label: 'elementsByClassName', type: 'variable', detail: 'object', info: 'Elements grouped by class name' },
        { label: 'countByClass', type: 'variable', detail: 'object', info: 'Element counts by class ID (use with class IDs)' },
        { label: 'countByClassName', type: 'variable', detail: 'object', info: 'Element counts by class name' }
      );

      // Handlebars helpers
      const helpers = getRegisteredHelpers();
      helpers.forEach(helper => {
        const helperInfo = getHelperInfo(helper);
        completions.push({
          label: helper,
          type: 'function',
          detail: helperInfo.signature,
          info: helperInfo.description
        });
      });

      return {
        from: word.from + 2,
        options: completions,
        validFor: /^[\w]*$/
      };
    }

    return null;
  };
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '');
}

function getRegisteredHelpers(): string[] {
  const builtins = ['helperMissing', 'blockHelperMissing', 'each', 'if', 'unless', 'with', 'log', 'lookup'];
  return Object.keys(Handlebars.helpers).filter(h => !builtins.includes(h));
}

interface HelperInfo {
  signature: string;
  description: string;
}

function getHelperInfo(helperName: string): HelperInfo {
  const helperDocs: Record<string, HelperInfo> = {
    // String manipulation (return strings)
    'capitalize': { signature: '(capitalize str)', description: 'Returns string with first letter capitalized. Ex: {{capitalize name}}' },
    'lowercase': { signature: '(lowercase str)', description: 'Returns lowercase string. Ex: {{lowercase name}}' },
    'uppercase': { signature: '(uppercase str)', description: 'Returns UPPERCASE string. Ex: {{uppercase name}}' },
    'camelCase': { signature: '(camelCase str)', description: 'Returns camelCase string. Ex: {{camelCase "hello world"}}' },
    'snakeCase': { signature: '(snakeCase str)', description: 'Returns snake_case string. Ex: {{snakeCase "hello world"}}' },
    
    // Type manipulation
    'quote': { signature: '(quote value)', description: 'Wraps strings in quotes, leaves numbers as-is' },
    'typeof': { signature: '(typeof value)', description: 'Returns type name (for Java). Ex: {{typeof this}}' },
    
    // Comparison (use in #if)
    'eq': { signature: '(eq a b)', description: 'Returns true if equal. Use: {{#if (eq value1 value2)}}' },
    
    // String operations
    'concat': { signature: '(concat str1 str2 ...)', description: 'Concatenates strings. Ex: {{concat "prefix" name "suffix"}}' },
    
    // Array/Element operations (use in #each)
    'getElementsByClass': { signature: '(getElementsByClass elements className)', description: 'Filters elements. Use: {{#each (getElementsByClass elements "Robot")}}' },
    
    // Dynamic access
    'lookup': { signature: '(lookup object key)', description: 'Dynamic property access. Ex: {{lookup object propertyName}}' },
    
    // Counting (return numbers)
    'countByClassName': { signature: '(countByClassName "ClassName")', description: 'Returns count of elements by class name. Ex: {{countByClassName "Robot"}}' },
    'countByClassId': { signature: '(countByClassId classId)', description: 'Returns count by class ID. Ex: {{countByClassId "class-123"}}' },
    'countElements': { signature: '(countElements classNameOrId)', description: 'Returns count by name or ID. Ex: {{countElements "Robot"}}' },
    
    // 3D properties
    'get3DProperty': { signature: '(get3DProperty obj "prop")', description: 'Gets 3D property. Ex: {{get3DProperty this "x"}}' },
    'has3DProperty': { signature: '(has3DProperty obj "prop")', description: 'Returns true if has 3D property. Use in {{#if}}' },
    'debug3DProperties': { signature: '(debug3DProperties obj)', description: 'Debug: shows all 3D properties as JSON' },
    'baseCenterMeters': { signature: '(baseCenterMeters baseElevationMm verticalExtentMm)', description: 'Converts base elevation plus half the vertical extent from millimetres to metres' },
    
    // List formatting (for clean array generation)
    'resetListComma': { signature: '(resetListComma "listName")', description: 'Resets comma state before iterating' },
    'commaIfNeeded': { signature: '(commaIfNeeded "listName")', description: 'Adds comma only between items, not before first' }
  };

  return helperDocs[helperName] || { signature: helperName, description: 'Custom helper function' };
}
