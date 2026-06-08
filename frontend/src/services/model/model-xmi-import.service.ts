import { MetaClass, MetaReference, Metamodel, Model, ModelElement } from '../../models/types';
import { metamodelService } from '../metamodel';
import { v4 as uuidv4 } from 'uuid';

export interface ModelXmiImportWarning {
  type: 'missing-metamodel' | 'unknown-class' | 'unknown-feature' | 'broken-reference' | 'external-reference' | 'invalid-enum' | 'auto-layout' | 'duplicate-xmi-id' | 'invalid-xmi-id';
  message: string;
  details?: string[];
}

export interface ModelXmiImportResult {
  model: Model | null;
  warnings: ModelXmiImportWarning[];
}

class ModelXmiImportService {
  importModel(xmiContent: string, name = 'Imported XMI Model'): ModelXmiImportResult {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmiContent, 'text/xml');
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error(parserError.textContent || 'Invalid XMI XML');
    }

    const rootElements = this.getRootElements(xmlDoc);
    const firstRoot = rootElements[0];
    const metamodel = firstRoot ? this.findMetamodelForRoot(firstRoot) : undefined;
    const warnings: ModelXmiImportWarning[] = [];

    if (!firstRoot || !metamodel) {
      return {
        model: null,
        warnings: [{
          type: 'missing-metamodel',
          message: 'No matching metamodel was found for the XMI namespace. Import the .ecore metamodel first.'
        }]
      };
    }

    const model: Model = {
      id: uuidv4(),
      name,
      metamodelId: metamodel.id,
      conformsTo: metamodel.id,
      elements: [],
      connections: []
    };
    const fragmentToId = new Map<string, string>();
    const xmiIdToId = new Map<string, string>();
    const deferredRefs: Array<{ element: ModelElement; reference: MetaReference; rawValue: string }> = [];

    rootElements.forEach((root, index) => {
      this.walkElement(root, undefined, metamodel, model, fragmentToId, xmiIdToId, deferredRefs, warnings, rootElements.length === 1 ? '/' : `//${index}`);
    });

    deferredRefs.forEach(({ element, reference, rawValue }) => {
      const targetIds = rawValue.split(/\s+/).filter(Boolean).flatMap(ref => {
        const resolved = this.resolveReference(ref, fragmentToId, xmiIdToId, warnings);
        return resolved ? [resolved] : [];
      });

      if (reference.cardinality.upperBound === '*' || (typeof reference.cardinality.upperBound === 'number' && reference.cardinality.upperBound > 1)) {
        element.references[reference.name] = targetIds;
      } else {
        element.references[reference.name] = targetIds[0] || null;
      }
    });

    this.applyGridLayout(model);
    warnings.push({
      type: 'auto-layout',
      message: 'XMI carries no layout; positions were auto-generated.'
    });

    return { model, warnings };
  }

  private walkElement(
    xmlElement: Element,
    parentContext: { element: ModelElement; metaClass: MetaClass; referenceName: string } | undefined,
    metamodel: Metamodel,
    model: Model,
    fragmentToId: Map<string, string>,
    xmiIdToId: Map<string, string>,
    deferredRefs: Array<{ element: ModelElement; reference: MetaReference; rawValue: string }>,
    warnings: ModelXmiImportWarning[],
    fragmentPath: string
  ): ModelElement | null {
    const metaClass = this.resolveElementClass(xmlElement, parentContext, metamodel);

    if (!metaClass) {
      warnings.push({ type: 'unknown-class', message: `Skipped unknown XMI element: ${xmlElement.localName}` });
      return null;
    }

    const xmiId = xmlElement.getAttribute('xmi:id') || xmlElement.getAttributeNS('http://www.omg.org/XMI', 'id');
    const elementId = this.resolveElementId(xmiId, xmiIdToId, warnings);
    const element: ModelElement = {
      id: elementId,
      modelElementId: metaClass.id,
      style: {},
      references: {},
      presentation: {
        position2D: { x: 0, y: 0 },
        size2D: { width: 120, height: 80 }
      }
    };

    model.elements.push(element);
    fragmentToId.set(fragmentPath, element.id);
    if (xmiId && elementId === xmiId) xmiIdToId.set(xmiId, element.id);

    for (const reference of this.getAllReferences(metaClass, metamodel)) {
      element.references[reference.name] = reference.cardinality.upperBound === '*' || (typeof reference.cardinality.upperBound === 'number' && reference.cardinality.upperBound > 1)
        ? []
        : null;
    }

    Array.from(xmlElement.attributes).forEach(attribute => {
      if (attribute.namespaceURI === 'http://www.w3.org/2000/xmlns/' || attribute.name === 'xmi:version' || attribute.name === 'xmi:id') return;

      const metaAttribute = this.getAllAttributes(metaClass, metamodel).find(candidate => candidate.name === attribute.name);
      const reference = this.getAllReferences(metaClass, metamodel).find(candidate => !candidate.containment && candidate.name === attribute.name);

      if (reference) {
        deferredRefs.push({ element, reference, rawValue: attribute.value });
      } else if (metaAttribute) {
        if (typeof metaAttribute.type === 'object') {
          const enumId = metaAttribute.type.enumId;
          const metaEnum = (metamodel.enums || []).find(candidate => candidate.id === enumId);
          if (metaEnum && !metaEnum.literals.some(literal => literal.name === attribute.value)) {
            warnings.push({
              type: 'invalid-enum',
              message: `Invalid enum literal for ${metaClass.name}.${metaAttribute.name}: ${attribute.value}`
            });
          }
        }
        element.style[attribute.name] = this.parseAttributeValue(attribute.value, metaAttribute.type);
        if (attribute.name === 'name') element.name = attribute.value;
      } else if (!attribute.name.includes(':')) {
        warnings.push({ type: 'unknown-feature', message: `Unknown attribute ${metaClass.name}.${attribute.name} was skipped.` });
      }
    });

    const childGroups = new Map<string, number>();
    Array.from(xmlElement.children).forEach(child => {
      const referenceName = child.localName;
      const containmentRef = this.getAllReferences(metaClass, metamodel).find(ref => ref.containment && ref.name === referenceName);
      if (!containmentRef) {
        warnings.push({ type: 'unknown-feature', message: `Unknown containment ${metaClass.name}.${referenceName} was skipped.` });
        return;
      }

      const index = childGroups.get(referenceName) || 0;
      childGroups.set(referenceName, index + 1);
      const childPath = fragmentPath === '/'
        ? `//@${referenceName}.${index}`
        : `${fragmentPath}/@${referenceName}.${index}`;
      const childElement = this.walkElement(child, { element, metaClass, referenceName }, metamodel, model, fragmentToId, xmiIdToId, deferredRefs, warnings, childPath);
      if (!childElement) return;

      const current = element.references[referenceName];
      if (Array.isArray(current)) {
        element.references[referenceName] = [...current, childElement.id];
      } else {
        element.references[referenceName] = childElement.id;
      }
    });

    return element;
  }

  private getRootElements(xmlDoc: XMLDocument): Element[] {
    const root = xmlDoc.documentElement;
    if (!root) return [];
    if (root.localName === 'XMI') return Array.from(root.children);
    return [root];
  }

  private findMetamodelForRoot(root: Element): Metamodel | undefined {
    const namespaceUri = root.namespaceURI || root.lookupNamespaceURI(root.prefix || '') || '';
    return metamodelService.getAllMetamodels().find(metamodel => metamodel.uri === namespaceUri);
  }

  private resolveElementClass(
    xmlElement: Element,
    parentContext: { element: ModelElement; metaClass: MetaClass; referenceName: string } | undefined,
    metamodel: Metamodel
  ): MetaClass | undefined {
    const xsiType = xmlElement.getAttribute('xsi:type')
      || xmlElement.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type');
    if (xsiType) {
      const className = xsiType.includes(':') ? xsiType.split(':').pop() : xsiType;
      const typedClass = metamodel.classes.find(cls => cls.name === className);
      if (typedClass) return typedClass;
    }

    return parentContext
      ? this.getContainmentTargetClass(parentContext.metaClass, parentContext.referenceName, metamodel)
      : metamodel.classes.find(cls => cls.name === xmlElement.localName);
  }

  private getContainmentTargetClass(parentClass: MetaClass, referenceName: string, metamodel: Metamodel): MetaClass | undefined {
    const reference = this.getAllReferences(parentClass, metamodel).find(ref => ref.containment && ref.name === referenceName);
    return reference ? metamodel.classes.find(cls => cls.id === reference.target) : undefined;
  }

  private resolveReference(ref: string, fragmentToId: Map<string, string>, xmiIdToId: Map<string, string>, warnings: ModelXmiImportWarning[]): string | null {
    if (/^[^#]+#/.test(ref)) {
      warnings.push({ type: 'external-reference', message: `Dropped external reference ${ref}; multi-resource XMI is not supported.` });
      return null;
    }

    const fragment = ref.startsWith('#') ? ref.substring(1) : ref;
    const resolved = fragmentToId.get(fragment) || fragmentToId.get(ref) || xmiIdToId.get(fragment);
    if (!resolved) {
      warnings.push({ type: 'broken-reference', message: `Could not resolve XMI reference ${ref}.` });
    }
    return resolved || null;
  }

  private resolveElementId(
    xmiId: string | null,
    xmiIdToId: Map<string, string>,
    warnings: ModelXmiImportWarning[]
  ): string {
    if (!xmiId) return uuidv4();
    if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(xmiId)) {
      warnings.push({
        type: 'invalid-xmi-id',
        message: `Generated a SpatialDSL ID because xmi:id "${xmiId}" is not a safe XML ID.`
      });
      return uuidv4();
    }
    if (xmiIdToId.has(xmiId)) {
      warnings.push({
        type: 'duplicate-xmi-id',
        message: `Generated a SpatialDSL ID because duplicate xmi:id "${xmiId}" was found.`
      });
      return uuidv4();
    }
    return xmiId;
  }

  private parseAttributeValue(value: string, type: any): any {
    if (typeof type === 'object') return value;
    if (type === 'number') return Number(value);
    if (type === 'boolean') return value === 'true';
    return value;
  }

  private applyGridLayout(model: Model): void {
    const groups = new Map<string, ModelElement[]>();
    model.elements.forEach(element => {
      const group = groups.get(element.modelElementId) || [];
      group.push(element);
      groups.set(element.modelElementId, group);
    });

    Array.from(groups.values()).forEach((elements, row) => {
      elements.forEach((element, column) => {
        element.presentation = {
          ...(element.presentation || {}),
          position2D: { x: 80 + column * 180, y: 80 + row * 140 },
          size2D: { width: 120, height: 80 }
        };
      });
    });
  }

  private getAllAttributes(metaClass: MetaClass, metamodel: Metamodel): MetaClass['attributes'] {
    const inherited = (metaClass.superTypes || [])
      .map(superTypeId => metamodel.classes.find(cls => cls.id === superTypeId))
      .filter((cls): cls is MetaClass => Boolean(cls))
      .flatMap(superClass => this.getAllAttributes(superClass, metamodel));
    return [...inherited, ...(metaClass.attributes || [])];
  }

  private getAllReferences(metaClass: MetaClass, metamodel: Metamodel): MetaReference[] {
    const inherited = (metaClass.superTypes || [])
      .map(superTypeId => metamodel.classes.find(cls => cls.id === superTypeId))
      .filter((cls): cls is MetaClass => Boolean(cls))
      .flatMap(superClass => this.getAllReferences(superClass, metamodel));
    return [...inherited, ...(metaClass.references || [])];
  }
}

export const modelXmiImportService = new ModelXmiImportService();
