import { MetaClass, MetaReference, Metamodel, Model, ModelConnection, ModelElement } from '../../models/types';
import { metamodelService } from '../metamodel';

export interface ModelXmiWarning {
  type: 'dropped-reference-attributes' | 'dropped-bend-points' | 'dropped-presentation' | 'missing-metamodel' | 'unresolved-reference';
  message: string;
  details?: string[];
}

export interface ModelXmiExportResult {
  xml: string;
  warnings: ModelXmiWarning[];
}

class ModelXmiExportService {
  exportModel(model: Model): ModelXmiExportResult | null {
    const metamodel = metamodelService.getMetamodelById(model.conformsTo || model.metamodelId);
    if (!metamodel) {
      return {
        xml: '',
        warnings: [{ type: 'missing-metamodel', message: `Metamodel not found: ${model.conformsTo || model.metamodelId}` }]
      };
    }

    const classById = new Map(metamodel.classes.map(cls => [cls.id, cls]));
    const containmentParent = this.getContainmentParents(model, metamodel);
    const roots = model.elements.filter(element => !containmentParent.has(element.id));
    const fragmentPaths = this.buildFragmentPaths(model, metamodel, roots);
    const warnings = this.collectWarnings(model, metamodel, fragmentPaths);
    const namespaces = `xmlns:xmi="http://www.omg.org/XMI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:${metamodel.prefix}="${metamodel.uri}"`;
    const rootXml = roots.map(root => {
      const rootClass = classById.get(root.modelElementId);
      return rootClass
        ? this.serializeElement(root, `${metamodel.prefix}:${rootClass.name}`, model, metamodel, classById, fragmentPaths)
        : '';
    }).join('');

    if (roots.length === 1) {
      const rootClass = classById.get(roots[0].modelElementId);
      if (!rootClass) return null;
      const body = this.serializeElement(
        roots[0],
        `${metamodel.prefix}:${rootClass.name}`,
        model,
        metamodel,
        classById,
        fragmentPaths,
        `xmi:version="2.0" ${namespaces}`
      );
      return {
        xml: `<?xml version="1.0" encoding="UTF-8"?>${body}`,
        warnings
      };
    }

    return {
      xml: `<?xml version="1.0" encoding="UTF-8"?>\n<xmi:XMI xmi:version="2.0" ${namespaces}>${rootXml}</xmi:XMI>`,
      warnings
    };
  }

  private serializeElement(
    element: ModelElement,
    explicitTag: string | undefined,
    model: Model,
    metamodel: Metamodel,
    classById: Map<string, MetaClass>,
    fragmentPaths: Map<string, string>,
    rootAttributes = '',
    declaredClassId?: string
  ): string {
    const metaClass = classById.get(element.modelElementId);
    if (!metaClass) return '';

    const tag = explicitTag || metaClass.name;
    const attributes = this.serializeAttributes(element, metaClass, model, metamodel, fragmentPaths);
    const containmentChildren = this.getContainmentChildren(element, model, metamodel);
    const childXml = containmentChildren
      .map(({ reference, child }) => this.serializeElement(child, reference.name, model, metamodel, classById, fragmentPaths, '', reference.target))
      .join('');
    const xsiType = declaredClassId && declaredClassId !== element.modelElementId
      ? ` xsi:type="${this.escapeXml(metamodel.prefix)}:${this.escapeXml(metaClass.name)}"`
      : '';

    const openingAttributes = rootAttributes ? ` ${rootAttributes}${xsiType}${attributes}` : `${xsiType}${attributes}`;

    return childXml
      ? `\n<${tag}${openingAttributes}>${childXml}\n</${tag}>`
      : `\n<${tag}${openingAttributes}/>`;
  }

  private serializeAttributes(
    element: ModelElement,
    metaClass: MetaClass,
    model: Model,
    metamodel: Metamodel,
    fragmentPaths: Map<string, string>
  ): string {
    const xmlAttributes: string[] = [`xmi:id="${this.escapeXml(element.id)}"`];

    for (const attribute of this.getAllAttributes(metaClass, metamodel)) {
      const value = element.style?.[attribute.name];
      if (value === undefined || value === null || value === '') continue;
      xmlAttributes.push(`${attribute.name}="${this.escapeXml(String(value))}"`);
    }

    const referenceAssignments = this.getReferenceAssignments(element, model, metaClass, metamodel);
    for (const reference of this.getAllReferences(metaClass, metamodel)) {
      if (reference.containment) continue;

      const targetIds = referenceAssignments.get(reference.name) || [];
      const paths = targetIds
        .map(targetId => fragmentPaths.get(targetId))
        .filter((path): path is string => Boolean(path));

      if (paths.length > 0) {
        xmlAttributes.push(`${reference.name}="${this.escapeXml(paths.join(' '))}"`);
      }
    }

    return xmlAttributes.length > 0 ? ` ${xmlAttributes.join(' ')}` : '';
  }

  private getReferenceAssignments(element: ModelElement, model: Model, metaClass: MetaClass, metamodel: Metamodel): Map<string, string[]> {
    const assignments = new Map<string, string[]>();
    for (const reference of this.getAllReferences(metaClass, metamodel)) {
      const value = element.references?.[reference.name];
      const values = Array.isArray(value) ? value : value ? [value] : [];
      if (values.length > 0) assignments.set(reference.name, [...values]);
    }

    for (const connection of model.connections || []) {
      if (connection.sourceId !== element.id) continue;
      const reference = this.getAllReferences(metaClass, metamodel).find(ref =>
        ref.id === connection.referenceId || ref.name === connection.referenceName || ref.name === connection.type
      );
      if (!reference) continue;
      const current = assignments.get(reference.name) || [];
      if (!current.includes(connection.targetId)) current.push(connection.targetId);
      assignments.set(reference.name, current);
    }

    return assignments;
  }

  private getContainmentChildren(
    element: ModelElement,
    model: Model,
    metamodel: Metamodel
  ): Array<{ reference: MetaReference; child: ModelElement }> {
    const metaClass = metamodel.classes.find(cls => cls.id === element.modelElementId);
    if (!metaClass) return [];

    const children: Array<{ reference: MetaReference; child: ModelElement }> = [];
    for (const reference of this.getAllReferences(metaClass, metamodel).filter(ref => ref.containment)) {
      const value = element.references?.[reference.name];
      const targetIds = Array.isArray(value) ? value : value ? [value] : [];
      targetIds.forEach(targetId => {
        const child = model.elements.find(candidate => candidate.id === targetId);
        if (child) children.push({ reference, child });
      });
    }
    return children;
  }

  private getContainmentParents(model: Model, metamodel: Metamodel): Map<string, string> {
    const parents = new Map<string, string>();
    for (const element of model.elements) {
      this.getContainmentChildren(element, model, metamodel).forEach(({ child }) => {
        parents.set(child.id, element.id);
      });
    }
    return parents;
  }

  private buildFragmentPaths(model: Model, metamodel: Metamodel, roots: ModelElement[]): Map<string, string> {
    const paths = new Map<string, string>();
    const visit = (element: ModelElement, path: string) => {
      paths.set(element.id, path);
      const grouped = new Map<string, ModelElement[]>();
      this.getContainmentChildren(element, model, metamodel).forEach(({ reference, child }) => {
        const group = grouped.get(reference.name) || [];
        group.push(child);
        grouped.set(reference.name, group);
      });

      grouped.forEach((children, referenceName) => {
        children.forEach((child, index) => {
          const childPath = path === '/'
            ? `//@${referenceName}.${index}`
            : `${path}/@${referenceName}.${index}`;
          visit(child, childPath);
        });
      });
    };

    roots.forEach((root, index) => visit(root, roots.length === 1 ? '/' : `//${index}`));
    return paths;
  }

  private collectWarnings(model: Model, metamodel: Metamodel, fragmentPaths: Map<string, string>): ModelXmiWarning[] {
    const droppedReferenceAttributes = (model.connections || [])
      .filter(connection => connection.attributes && Object.keys(connection.attributes).length > 0)
      .map(connection => `${connection.referenceName || connection.referenceId || connection.type || connection.id}: ${Object.keys(connection.attributes || {}).join(', ')}`);
    const droppedBendPoints = (model.connections || [])
      .filter((connection: ModelConnection) => connection.bendPoints2D && connection.bendPoints2D.length > 0)
      .map(connection => connection.referenceName || connection.referenceId || connection.id);
    const hasPresentation = model.elements.some(element => element.presentation && Object.keys(element.presentation).length > 0);
    const warnings: ModelXmiWarning[] = [];

    if (droppedReferenceAttributes.length > 0) {
      warnings.push({
        type: 'dropped-reference-attributes',
        message: 'Per-connection attributes have no Ecore XMI equivalent and were dropped.',
        details: droppedReferenceAttributes
      });
    }
    if (droppedBendPoints.length > 0) {
      warnings.push({
        type: 'dropped-bend-points',
        message: 'Per-connection bend points have no core XMI equivalent and were dropped.',
        details: droppedBendPoints
      });
    }
    if (hasPresentation) {
      warnings.push({
        type: 'dropped-presentation',
        message: 'Presentation/layout data is not part of core Ecore XMI and was dropped.'
      });
    }

    const unresolved = this.collectUnresolvedReferenceTargets(model, metamodel, fragmentPaths);
    if (unresolved.length > 0) {
      warnings.push({
        type: 'unresolved-reference',
        message: 'Some non-containment reference targets were not exported because their target elements are missing from the XMI tree.',
        details: unresolved
      });
    }

    return warnings;
  }

  private collectUnresolvedReferenceTargets(
    model: Model,
    metamodel: Metamodel,
    fragmentPaths: Map<string, string>
  ): string[] {
    const unresolved = new Set<string>();
    model.elements.forEach(element => {
      const metaClass = metamodel.classes.find(cls => cls.id === element.modelElementId);
      if (!metaClass) return;
      const assignments = this.getReferenceAssignments(element, model, metaClass, metamodel);
      this.getAllReferences(metaClass, metamodel).forEach(reference => {
        if (reference.containment) return;
        (assignments.get(reference.name) || []).forEach(targetId => {
          if (!fragmentPaths.has(targetId)) {
            unresolved.add(`${element.id}.${reference.name} -> ${targetId}`);
          }
        });
      });
    });
    return Array.from(unresolved);
  }

  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
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

export const modelXmiExportService = new ModelXmiExportService();
