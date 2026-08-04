import path from 'path';
import Handlebars from 'handlebars';
import {
  CodeGenerationResult,
  CodeGenerationTemplate,
  Metamodel,
  Model,
  ModelElement,
} from '../../../../shared/types';
import { ApiError } from '../../middleware';
import { contentHash } from '../lifecycle/canonical';

export interface GeneratedFile extends CodeGenerationResult {
  contentHash: string;
}

const safeFilename = (value: string): string => {
  const normalized = path.posix.normalize(value.replace(/\\/g, '/'));
  if (!normalized || normalized === '.' || path.posix.isAbsolute(normalized) || normalized.startsWith('../')) {
    throw new ApiError(400, `Generated output path is unsafe: ${value}`);
  }
  return normalized;
};

const elementContext = (element: ModelElement, className: string): Record<string, any> => {
  const position = element.presentation?.position3D;
  const size = element.presentation?.size3D;
  return {
    id: element.id,
    modelElementId: element.modelElementId,
    metaClassName: className,
    name: element.name || element.style?.name || element.id,
    ...element.style,
    references: element.references || {},
    presentation: element.presentation || {},
    X: position?.x,
    Y: position?.y,
    Z: position?.z,
    RZ: element.presentation?.rotationZ,
    Length: size?.widthMm,
    Width: size?.heightMm,
    Height: size?.depthMm,
  };
};

export class CodeGenerationEngine {
  private createHandlebars(): typeof Handlebars {
    const engine = Handlebars.create() as typeof Handlebars;
    engine.registerHelper('capitalize', (value: unknown) => {
      const text = String(value ?? '');
      return text.charAt(0).toUpperCase() + text.slice(1);
    });
    engine.registerHelper('lowercase', (value: unknown) => String(value ?? '').toLowerCase());
    engine.registerHelper('uppercase', (value: unknown) => String(value ?? '').toUpperCase());
    engine.registerHelper('camelCase', (value: unknown) => String(value ?? '')
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) => index === 0 ? letter.toLowerCase() : letter.toUpperCase())
      .replace(/\s+/g, ''));
    engine.registerHelper('snakeCase', (value: unknown) => String(value ?? '').trim().replace(/\s+/g, '_').toLowerCase());
    engine.registerHelper('eq', (left: unknown, right: unknown) => left === right);
    engine.registerHelper('ne', (left: unknown, right: unknown) => left !== right);
    engine.registerHelper('and', (...args: unknown[]) => args.slice(0, -1).every(Boolean));
    engine.registerHelper('or', (...args: unknown[]) => args.slice(0, -1).some(Boolean));
    engine.registerHelper('not', (value: unknown) => !value);
    engine.registerHelper('concat', (...args: unknown[]) => args.slice(0, -1).join(''));
    engine.registerHelper('json', (value: unknown) => JSON.stringify(value));
    engine.registerHelper('quote', (value: unknown) => typeof value === 'string' ? JSON.stringify(value) : value);
    engine.registerHelper('javaString', (value: unknown) => JSON.stringify(String(value ?? '')));
    engine.registerHelper('meters', (value: unknown) => Number.isFinite(Number(value)) ? Number(value) / 1000 : 0);
    engine.registerHelper('halfMeters', (value: unknown) => Number.isFinite(Number(value)) ? Number(value) / 2000 : 0);
    engine.registerHelper('baseCenterMeters', (base: unknown, extent: unknown) => (
      Number.isFinite(Number(base)) && Number.isFinite(Number(extent))
        ? (Number(base) + Number(extent) / 2) / 1000
        : 0
    ));
    engine.registerHelper('usdIdentifier', (value: unknown) => {
      const cleaned = String(value ?? '').trim().replace(/[^A-Za-z0-9_]/g, '_')
        .replace(/_+/g, '_').replace(/^_+|_+$/g, '');
      if (!cleaned) return 'Prim';
      return /^\d/.test(cleaned) ? `_${cleaned}` : cleaned;
    });
    engine.registerHelper('range', (start: number, end: number, options: Handlebars.HelperOptions) => {
      let output = '';
      for (let index = Number(start); index <= Number(end); index += 1) {
        output += options.fn(index, { data: { ...(options.data || {}), index } });
      }
      return output;
    });
    engine.registerHelper('getElementsByClass', (elements: any[], className: string) => (
      Array.isArray(elements) ? elements.filter(element => element.metaClassName === className) : []
    ));
    engine.registerHelper('countByClassName', (className: string, options: Handlebars.HelperOptions) => (
      options.data?.root?.countByClassName?.[className] || 0
    ));
    engine.registerHelper('countByClassId', (classId: string, options: Handlebars.HelperOptions) => (
      options.data?.root?.countByClassId?.[classId] || 0
    ));
    engine.registerHelper('resetListComma', (listName: string, options: Handlebars.HelperOptions) => {
      const root = options.data?.root || {};
      root.__listComma = root.__listComma || {};
      root.__listComma[listName] = false;
      return '';
    });
    engine.registerHelper('commaIfNeeded', (listName: string, options: Handlebars.HelperOptions) => {
      const root = options.data?.root || {};
      root.__listComma = root.__listComma || {};
      const comma = root.__listComma[listName] ? ',' : '';
      root.__listComma[listName] = true;
      return comma;
    });
    return engine;
  }

  buildContext(model: Model, metamodel: Metamodel): Record<string, any> {
    const classById = new Map(metamodel.classes.map(metaClass => [metaClass.id, metaClass]));
    const elements = [...model.elements]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(element => elementContext(element, classById.get(element.modelElementId)?.name || element.modelElementId));
    const byClassId: Record<string, any[]> = {};
    const byClassName: Record<string, any[]> = {};
    elements.forEach(element => {
      (byClassId[element.modelElementId] ||= []).push(element);
      (byClassName[element.metaClassName] ||= []).push(element);
    });
    const countByClassId = Object.fromEntries(Object.entries(byClassId).map(([key, value]) => [key, value.length]));
    const countByClassName = Object.fromEntries(Object.entries(byClassName).map(([key, value]) => [key, value.length]));
    const classAliases = Object.fromEntries(Object.entries(byClassName));
    return {
      model: { ...model, elements },
      currentModel: { ...model, elements },
      metamodel,
      elements,
      elementsByClassId: byClassId,
      elementsByClassName: byClassName,
      countByClassId,
      countByClassName,
      ...classAliases,
    };
  }

  generate(
    model: Model,
    metamodel: Metamodel,
    templates: CodeGenerationTemplate[]
  ): GeneratedFile[] {
    const engine = this.createHandlebars();
    const context = this.buildContext(model, metamodel);
    const filenames = new Set<string>();
    return templates.map(template => {
      if (template.targetMetamodelId && template.targetMetamodelId !== metamodel.id) {
        throw new ApiError(409, `Template ${template.name} targets a different metamodel`);
      }
      const content = engine.compile(template.templateContent, { noEscape: true })(context);
      const filename = safeFilename(engine.compile(template.outputPattern, { noEscape: true })(context));
      if (filenames.has(filename)) throw new ApiError(409, `Multiple templates generate ${filename}`);
      filenames.add(filename);
      return { filename, content, contentHash: contentHash({ filename, content }) };
    });
  }
}

export const codeGenerationEngine = new CodeGenerationEngine();

