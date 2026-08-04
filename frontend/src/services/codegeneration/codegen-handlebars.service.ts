import Handlebars from 'handlebars';

/**
 * Service for registering Handlebars helpers for code generation
 */
export class CodegenHandlebarsService {
  registerAllHelpers(): void {
    this.registerStandardHelpers();
    this.register3DHelpers();
  }

  private registerStandardHelpers(): void {
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

    // OpenUSD prim identifiers cannot contain spaces, punctuation, or begin
    // with a digit. Keep this deterministic so independently generated USD
    // layers address exactly the same prims.
    Handlebars.registerHelper('usdIdentifier', function(value) {
      const cleaned = String(value ?? '')
        .trim()
        .replace(/[^A-Za-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
      if (!cleaned) return 'Prim';
      return /^\d/.test(cleaned) ? '_' + cleaned : cleaned;
    });

    Handlebars.registerHelper('meters', function(value) {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric / 1000 : 0;
    });

    Handlebars.registerHelper('halfMeters', function(value) {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric / 2000 : 0;
    });

    // Convert a base elevation and vertical extent from millimetres into the
    // centre elevation required by centred OpenUSD proxy geometry.
    Handlebars.registerHelper('baseCenterMeters', function(baseElevationMm, verticalExtentMm) {
      const base = Number(baseElevationMm);
      const extent = Number(verticalExtentMm);
      return (Number.isFinite(base) && Number.isFinite(extent))
        ? (base + extent / 2) / 1000
        : 0;
    });
    
    // Helper to quote string values but leave numbers and booleans as is
    Handlebars.registerHelper('quote', function(value) {
      if (typeof value === 'string') {
        return `"${value}"`;
      }
      return value;
    });

    // JSON string escaping is also valid for Java string literals for the
    // model data emitted by the bundled generators. The helper includes the
    // surrounding quotes and prevents names from breaking generated source.
    Handlebars.registerHelper('javaString', function(value) {
      return JSON.stringify(String(value ?? ''));
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

  private register3DHelpers(): void {
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
        Z: obj.Z !== undefined ? obj.Z : 'undefined',
        BaseElevationMm: obj.BaseElevationMm !== undefined ? obj.BaseElevationMm : 'undefined',
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
}

export const codegenHandlebarsService = new CodegenHandlebarsService();
