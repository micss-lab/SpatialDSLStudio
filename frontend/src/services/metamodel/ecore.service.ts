import {
  Constraint,
  MetaAttribute,
  MetaAttributeType,
  MetaClass,
  MetaEnum,
  MetaReference,
  Metamodel,
} from '../../models/types';
import { metamodelService } from './metamodel.service';
import { v4 as uuidv4 } from 'uuid';

export interface EcoreExportWarning {
  type: 'dropped-reference-attributes';
  message: string;
  details: string[];
}

export interface EcoreExportResult {
  xml: string;
  warnings: EcoreExportWarning[];
}

export interface EcoreImportWarning {
  type: 'custom-datatype-fallback' | 'unresolved-reference' | 'unresolved-supertype' | 'unresolved-opposite' | 'skipped-annotation' | 'cross-package-reference';
  message: string;
  details?: string[];
}

export interface EcoreImportResult {
  metamodelId: string | null;
  warnings: EcoreImportWarning[];
}

const ECORE_NS = 'http://www.eclipse.org/emf/2002/Ecore';
const OCL_SOURCE = 'http://www.eclipse.org/emf/2002/Ecore/OCL';

class EcoreService {
  metamodelToEcore(metamodelId: string): string | null {
    return this.exportMetamodelToEcore(metamodelId)?.xml || null;
  }

  exportMetamodelToEcore(metamodelId: string): EcoreExportResult | null {
    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      console.error(`Metamodel with ID ${metamodelId} not found`);
      return null;
    }

    try {
      const warnings = this.collectExportWarnings(metamodel);
      let ecoreContent = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmi:version="2.0"
  xmlns:xmi="http://www.omg.org/XMI"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:ecore="${ECORE_NS}"
  name="${this.escapeXml(metamodel.name)}"
  nsPrefix="${this.escapeXml(metamodel.prefix)}"
  nsURI="${this.escapeXml(metamodel.uri)}">`;

      for (const metaclass of metamodel.classes) {
        ecoreContent += this.generateEClassXml(metaclass, metamodel);
      }

      for (const metaEnum of metamodel.enums || []) {
        ecoreContent += this.generateEEnumXml(metaEnum);
      }

      ecoreContent += '\n</ecore:EPackage>';
      return { xml: ecoreContent, warnings };
    } catch (error) {
      console.error('Error converting metamodel to Ecore:', error);
      return null;
    }
  }

  private generateEClassXml(metaclass: MetaClass, metamodel: Metamodel): string {
    const superTypes = (metaclass.superTypes || [])
      .map(supertypeId => metamodel.classes.find(c => c.id === supertypeId))
      .filter((cls): cls is MetaClass => Boolean(cls))
      .map(cls => `#//${this.escapeXml(cls.name)}`)
      .join(' ');

    let eClassXml = `\n  <eClassifiers xsi:type="ecore:EClass" name="${this.escapeXml(metaclass.name)}"${metaclass.abstract ? ' abstract="true"' : ''}${superTypes ? ` eSuperTypes="${superTypes}"` : ''}>`;

    for (const constraint of metaclass.constraints || []) {
      if (constraint.type === 'ocl') {
        eClassXml += this.generateOclAnnotationXml(constraint);
      }
    }

    for (const attribute of metaclass.attributes) {
      eClassXml += this.generateEAttributeXml(attribute, metamodel);
    }

    for (const reference of metaclass.references) {
      eClassXml += this.generateEReferenceXml(reference, metamodel);
    }

    eClassXml += '\n  </eClassifiers>';
    return eClassXml;
  }

  private generateOclAnnotationXml(constraint: Constraint): string {
    return `\n    <eAnnotations source="${OCL_SOURCE}">
      <details key="${this.escapeXml(constraint.name || 'invariant')}" value="${this.escapeXml(constraint.expression)}"/>
    </eAnnotations>`;
  }

  private generateEAttributeXml(attribute: MetaAttribute, metamodel: Metamodel): string {
    const ecoreType = this.getEcoreAttributeType(attribute.type, metamodel);
    const many = attribute.many ? ' upperBound="-1"' : '';
    const required = attribute.required ? ' lowerBound="1"' : '';
    const defaultValue = attribute.defaultValue !== undefined && attribute.defaultValue !== ''
      ? ` defaultValueLiteral="${this.escapeXml(String(attribute.defaultValue))}"`
      : '';

    return `\n    <eStructuralFeatures xsi:type="ecore:EAttribute" name="${this.escapeXml(attribute.name)}" eType="${ecoreType}"${many}${required}${defaultValue}/>`;
  }

  private getEcoreAttributeType(type: MetaAttributeType, metamodel: Metamodel): string {
    if (typeof type === 'object' && type.enumId) {
      const metaEnum = (metamodel.enums || []).find(en => en.id === type.enumId);
      return metaEnum ? `#//${this.escapeXml(metaEnum.name)}` : `ecore:EDataType ${ECORE_NS}#//EString`;
    }

    const typeMap: Record<string, string> = {
      string: `ecore:EDataType ${ECORE_NS}#//EString`,
      number: `ecore:EDataType ${ECORE_NS}#//EDouble`,
      boolean: `ecore:EDataType ${ECORE_NS}#//EBoolean`,
      date: `ecore:EDataType ${ECORE_NS}#//EDate`
    };

    const primitiveType = typeof type === 'string' ? type : 'string';
    return typeMap[primitiveType] || typeMap.string;
  }

  private generateEReferenceXml(reference: MetaReference, metamodel: Metamodel): string {
    const targetClass = metamodel.classes.find(c => c.id === reference.target);
    if (!targetClass) {
      console.warn(`Target class with ID ${reference.target} not found for reference ${reference.name}`);
      return '';
    }

    const upperBound = reference.cardinality?.upperBound === '*'
      ? ' upperBound="-1"'
      : typeof reference.cardinality?.upperBound === 'number'
        ? ` upperBound="${reference.cardinality.upperBound}"`
        : '';
    const lowerBound = reference.cardinality?.lowerBound > 0
      ? ` lowerBound="${reference.cardinality.lowerBound}"`
      : '';
    const opposite = reference.opposite
      ? this.findReferenceFragment(metamodel, reference.opposite)
      : '';

    return `\n    <eStructuralFeatures xsi:type="ecore:EReference" name="${this.escapeXml(reference.name)}" eType="#//${this.escapeXml(targetClass.name)}"${upperBound}${lowerBound} containment="${reference.containment}"${opposite ? ` eOpposite="${opposite}"` : ''}/>`;
  }

  private generateEEnumXml(metaEnum: MetaEnum): string {
    let enumXml = `\n  <eClassifiers xsi:type="ecore:EEnum" name="${this.escapeXml(metaEnum.name)}">`;
    metaEnum.literals.forEach((literal, index) => {
      const value = literal.value !== undefined ? literal.value : index;
      const literalValue = literal.literal && literal.literal !== literal.name
        ? ` literal="${this.escapeXml(literal.literal)}"`
        : '';
      enumXml += `\n    <eLiterals name="${this.escapeXml(literal.name)}"${value !== index ? ` value="${value}"` : ''}${literalValue}/>`;
    });
    enumXml += '\n  </eClassifiers>';
    return enumXml;
  }

  importFromEcore(ecoreContent: string): string | null {
    return this.importFromEcoreWithReport(ecoreContent).metamodelId;
  }

  importFromEcoreWithReport(ecoreContent: string): EcoreImportResult {
    const warnings: EcoreImportWarning[] = [];
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(ecoreContent, 'text/xml');
      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) {
        console.error('Error parsing Ecore XML:', parserError.textContent);
        return { metamodelId: null, warnings };
      }

      const ePackage = this.findEPackage(xmlDoc);
      if (!ePackage) {
        console.error('No EPackage found in Ecore content');
        return { metamodelId: null, warnings };
      }

      const packageName = ePackage.getAttribute('name') || 'ImportedMetamodel';
      const nsPrefix = ePackage.getAttribute('nsPrefix') || packageName.toLowerCase();
      const nsURI = ePackage.getAttribute('nsURI') || `http://www.modeling-tool.com/${packageName.toLowerCase()}`;
      const newMetamodel = metamodelService.createMetamodel(packageName);

      const eClassifiers = Array.from(ePackage.children).filter(child => child.localName === 'eClassifiers');
      const eClasses = eClassifiers.filter(classifier => this.getXsiType(classifier).endsWith('EClass'));
      const eEnums = eClassifiers.filter(classifier => this.getXsiType(classifier).endsWith('EEnum'));
      const pathToClassId = new Map<string, string>();
      const nameToClassId = new Map<string, string>();
      const pathToEnumId = new Map<string, string>();
      const enums: MetaEnum[] = [];

      eClasses.forEach(eClass => {
        const className = eClass.getAttribute('name');
        if (!className) return;

        const newClass = metamodelService.addMetaClass(newMetamodel.id, className, eClass.getAttribute('abstract') === 'true');
        if (!newClass) return;

        metamodelService.updateMetaClass(newMetamodel.id, newClass.id, { attributes: [], references: [], constraints: [] });
        const path = `#//${className}`;
        pathToClassId.set(path, newClass.id);
        nameToClassId.set(className, newClass.id);
      });

      eEnums.forEach(eEnum => {
        const enumName = eEnum.getAttribute('name');
        if (!enumName) return;
        const metaEnum: MetaEnum = {
          id: uuidv4(),
          name: enumName,
          eClass: '',
          literals: Array.from(eEnum.children)
            .filter(child => child.localName === 'eLiterals')
            .map((literal, index) => ({
              name: literal.getAttribute('name') || `LITERAL_${index}`,
              value: literal.hasAttribute('value') ? Number(literal.getAttribute('value')) : undefined,
              literal: literal.getAttribute('literal') || undefined
            }))
        };
        enums.push(metaEnum);
        pathToEnumId.set(`#//${enumName}`, metaEnum.id);
      });

      const currentMetamodel = metamodelService.getMetamodelById(newMetamodel.id);
      if (currentMetamodel) {
        metamodelService.updateMetamodel(newMetamodel.id, {
          ...currentMetamodel,
          uri: nsURI,
          prefix: nsPrefix,
          enums
        });
      }

      eClasses.forEach(eClass => {
        const className = eClass.getAttribute('name');
        const classId = className ? nameToClassId.get(className) : undefined;
        if (!className || !classId) return;

        const constraints = this.parseOclConstraints(eClass, className, classId);
        if (constraints.length > 0) {
          metamodelService.updateMetaClass(newMetamodel.id, classId, { constraints });
        }
        this.collectSkippedAnnotations(eClass, className, warnings);

        Array.from(eClass.children)
          .filter(child => child.localName === 'eStructuralFeatures' && this.getXsiType(child).endsWith('EAttribute'))
          .forEach(eAttribute => {
            const attributeName = eAttribute.getAttribute('name');
            if (!attributeName) return;

            metamodelService.addMetaAttribute(
              newMetamodel.id,
              classId,
              attributeName,
              this.parseAttributeType(eAttribute.getAttribute('eType'), pathToEnumId, warnings, `${className}.${attributeName}`),
              eAttribute.getAttribute('defaultValueLiteral') ?? undefined,
              this.parseLowerBound(eAttribute) > 0,
              this.parseUpperBound(eAttribute) === '*'
            );
          });

        Array.from(eClass.children)
          .filter(child => child.localName === 'eStructuralFeatures' && this.getXsiType(child).endsWith('EReference'))
          .forEach(eReference => {
            const referenceName = eReference.getAttribute('name');
            const eType = eReference.getAttribute('eType');
            const targetClassId = eType ? this.resolveClassifierRef(eType, pathToClassId, nameToClassId) : undefined;
            if (!referenceName) return;
            if (!targetClassId) {
              warnings.push({
                type: eType && this.isCrossPackageReference(eType) ? 'cross-package-reference' : 'unresolved-reference',
                message: `Skipped EReference ${className}.${referenceName}; target classifier could not be resolved.`,
                details: eType ? [eType] : undefined
              });
              return;
            }

            const newReference = metamodelService.addMetaReference(
              newMetamodel.id,
              classId,
              referenceName,
              targetClassId,
              eReference.getAttribute('containment') === 'true',
              this.parseLowerBound(eReference),
              this.parseUpperBound(eReference)
            );

            const opposite = eReference.getAttribute('eOpposite');
            if (newReference && opposite) {
              (newReference as any).__pendingEOpposite = opposite;
            }
          });
      });

      eClasses.forEach(eClass => {
        const className = eClass.getAttribute('name');
        const classId = className ? nameToClassId.get(className) : undefined;
        if (!classId) return;

        const superTypeIds = this.getSuperTypeRefs(eClass)
          .map(ref => {
            const resolved = this.resolveClassifierRef(ref, pathToClassId, nameToClassId);
            if (!resolved) {
              warnings.push({
                type: this.isCrossPackageReference(ref) ? 'cross-package-reference' : 'unresolved-supertype',
                message: `Skipped unresolved ESuperType for ${className}.`,
                details: [ref]
              });
            }
            return resolved;
          })
          .filter((id): id is string => Boolean(id));

        if (superTypeIds.length > 0) {
          metamodelService.updateMetaClass(newMetamodel.id, classId, { superTypes: superTypeIds });
        }
      });

      this.resolveOpposites(newMetamodel.id, warnings);
      return { metamodelId: newMetamodel.id, warnings };
    } catch (error) {
      console.error('Error importing Ecore:', error);
      return { metamodelId: null, warnings };
    }
  }

  downloadAsEcore(metamodelId: string): boolean {
    const result = this.exportMetamodelToEcore(metamodelId);
    if (!result) return false;

    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) return false;

    if (result.warnings.length > 0) {
      const details = result.warnings.flatMap(warning => warning.details).join('\n');
      const proceed = window.confirm(`Ecore export will drop data that has no Ecore equivalent:\n\n${details}\n\nDownload anyway?`);
      if (!proceed) return false;
    }

    this.download(`${metamodel.name.replace(/\s+/g, '_')}.ecore`, result.xml, 'application/xml');
    return true;
  }

  metamodelToUmlClassDiagram(metamodelId: string): string | null {
    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      console.error(`Metamodel with ID ${metamodelId} not found`);
      return null;
    }

    try {
      let plantUml = `@startuml
skinparam classAttributeIconSize 0
skinparam classFontStyle bold
skinparam classFontSize 14
skinparam classBackgroundColor #FEFECE
skinparam classStereotypeFontSize 12
skinparam packageStyle rectangle
skinparam packageFontStyle bold
skinparam packageBackgroundColor #EEEEEE

title ${metamodel.name} - Class Diagram

package "${metamodel.name}" #DDDDFF {
`;

      for (const metaclass of metamodel.classes) {
        plantUml += metaclass.abstract
          ? `  abstract class "${metaclass.name}" {\n`
          : `  class "${metaclass.name}" {\n`;

        for (const attr of metaclass.attributes) {
          const required = attr.required ? ' <b>required</b>' : '';
          const many = attr.many ? '[]' : '';
          plantUml += `    ${attr.name} : ${this.formatAttributeType(attr.type, metamodel)}${many}${required}\n`;
        }

        plantUml += `  }\n\n`;
      }

      for (const metaEnum of metamodel.enums || []) {
        plantUml += `  enum "${metaEnum.name}" {\n`;
        for (const literal of metaEnum.literals) {
          plantUml += `    ${literal.name}\n`;
        }
        plantUml += `  }\n\n`;
      }

      for (const metaclass of metamodel.classes) {
        for (const supertypeId of metaclass.superTypes || []) {
          const supertype = metamodel.classes.find(c => c.id === supertypeId);
          if (supertype) plantUml += `  "${supertype.name}" <|-- "${metaclass.name}"\n`;
        }
      }

      for (const metaclass of metamodel.classes) {
        for (const ref of metaclass.references) {
          const targetClass = metamodel.classes.find(c => c.id === ref.target);
          if (!targetClass) continue;
          const targetCard = ref.cardinality.upperBound === '*'
            ? `${ref.cardinality.lowerBound}..*`
            : `${ref.cardinality.lowerBound}..${ref.cardinality.upperBound}`;
          plantUml += `  "${metaclass.name}" ${ref.containment ? '*--' : '-->'} "${targetClass.name}" : ${ref.name} 1:${targetCard}\n`;
        }
      }

      plantUml += `}\n@enduml`;
      return plantUml;
    } catch (error) {
      console.error('Error converting metamodel to UML Class diagram:', error);
      return null;
    }
  }

  downloadAsUmlClassDiagram(metamodelId: string): boolean {
    const plantUmlContent = this.metamodelToUmlClassDiagram(metamodelId);
    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!plantUmlContent || !metamodel) return false;

    this.download(`${metamodel.name.replace(/\s+/g, '_')}_class_diagram.puml`, plantUmlContent, 'text/plain');
    return true;
  }

  private collectExportWarnings(metamodel: Metamodel): EcoreExportWarning[] {
    const dropped = metamodel.classes.flatMap(cls =>
      cls.references.flatMap(ref =>
        (ref.attributes || []).map(attr => `${cls.name}.${ref.name}.${attr.name}`)
      )
    );

    return dropped.length > 0
      ? [{
        type: 'dropped-reference-attributes',
        message: `Dropped ${dropped.length} reference attribute(s); Ecore EReference has no direct attribute slot.`,
        details: dropped
      }]
      : [];
  }

  private findReferenceFragment(metamodel: Metamodel, referenceId: string): string {
    for (const cls of metamodel.classes) {
      const ref = cls.references.find(candidate => candidate.id === referenceId);
      if (ref) return `#//${this.escapeXml(cls.name)}/${this.escapeXml(ref.name)}`;
    }
    return '';
  }

  private resolveOpposites(metamodelId: string, warnings: EcoreImportWarning[]): void {
    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) return;

    const refByFragment = new Map<string, { classId: string; reference: MetaReference }>();
    metamodel.classes.forEach(cls => {
      cls.references.forEach(ref => {
        refByFragment.set(`#//${cls.name}/${ref.name}`, { classId: cls.id, reference: ref });
      });
    });

    metamodel.classes.forEach(cls => {
      cls.references.forEach(ref => {
        const pending = (ref as any).__pendingEOpposite;
        if (!pending) return;
        const target = refByFragment.get(pending);
        if (target) {
          metamodelService.updateMetaReference(metamodel.id, cls.id, ref.id, { opposite: target.reference.id });
        } else {
          warnings.push({
            type: 'unresolved-opposite',
            message: `Skipped unresolved eOpposite for ${cls.name}.${ref.name}.`,
            details: [pending]
          });
        }
      });
    });
  }

  private parseOclConstraints(eClass: Element, className: string, classId: string): Constraint[] {
    return Array.from(eClass.children)
      .filter(child => child.localName === 'eAnnotations' && child.getAttribute('source') === OCL_SOURCE)
      .flatMap(annotation => Array.from(annotation.children)
        .filter(child => child.localName === 'details')
        .map((detail, index) => ({
          id: uuidv4(),
          name: detail.getAttribute('key') || `invariant_${index + 1}`,
          contextClassName: className,
          contextClassId: classId,
          expression: detail.getAttribute('value') || '',
          isValid: true,
          severity: 'error' as const,
          type: 'ocl' as const
        }))
      );
  }

  private findEPackage(xmlDoc: XMLDocument): Element | null {
    return Array.from(xmlDoc.getElementsByTagName('*'))
      .find(element => element.localName === 'EPackage') || null;
  }

  private getXsiType(element: Element): string {
    return element.getAttribute('xsi:type') || element.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type') || '';
  }

  private collectSkippedAnnotations(eClass: Element, className: string, warnings: EcoreImportWarning[]): void {
    Array.from(eClass.children)
      .filter(child => child.localName === 'eAnnotations' && child.getAttribute('source') !== OCL_SOURCE)
      .forEach(annotation => {
        warnings.push({
          type: 'skipped-annotation',
          message: `Skipped unsupported EAnnotation on ${className}.`,
          details: [annotation.getAttribute('source') || 'unknown']
        });
      });
  }

  private parseAttributeType(
    eType: string | null,
    pathToEnumId: Map<string, string>,
    warnings: EcoreImportWarning[],
    context: string
  ): MetaAttributeType {
    if (!eType) return 'string';
    const enumId = pathToEnumId.get(this.normalizeClassifierRef(eType));
    if (enumId) return { enumId };
    if (eType.includes('EInt') || eType.includes('ELong') || eType.includes('EDouble') || eType.includes('EFloat')) return 'number';
    if (eType.includes('EBoolean')) return 'boolean';
    if (eType.includes('EDate')) return 'date';
    if (!eType.includes('EString')) {
      warnings.push({
        type: this.isCrossPackageReference(eType) ? 'cross-package-reference' : 'custom-datatype-fallback',
        message: `Imported ${context} as string because datatype "${eType}" is not supported directly.`,
        details: [eType]
      });
    }
    return 'string';
  }

  private parseLowerBound(element: Element): number {
    return Number(element.getAttribute('lowerBound') || 0);
  }

  private parseUpperBound(element: Element): number | '*' {
    const value = element.getAttribute('upperBound');
    if (value === '-1') return '*';
    return value ? Number(value) : 1;
  }

  private getSuperTypeRefs(eClass: Element): string[] {
    const inlineRefs = (eClass.getAttribute('eSuperTypes') || '').split(/\s+/).filter(Boolean);
    const childRefs = Array.from(eClass.children)
      .filter(child => child.localName === 'eSuperTypes')
      .map(child => child.getAttribute('href') || child.getAttribute('eType') || '')
      .filter(Boolean);
    return [...inlineRefs, ...childRefs];
  }

  private resolveClassifierRef(ref: string, pathToId: Map<string, string>, nameToId: Map<string, string>): string | undefined {
    const normalized = this.normalizeClassifierRef(ref);
    return pathToId.get(normalized) || nameToId.get(normalized.replace(/^#\/\//, '').split('/')[0]);
  }

  private normalizeClassifierRef(ref: string): string {
    const fragment = ref.includes('#') ? ref.substring(ref.indexOf('#')) : ref;
    if (fragment.startsWith('#//')) return fragment;
    if (fragment.startsWith('//')) return `#${fragment}`;
    return fragment;
  }

  private isCrossPackageReference(ref: string): boolean {
    return ref.includes('#') && !ref.startsWith('#');
  }

  private formatAttributeType(type: MetaAttributeType, metamodel: Metamodel): string {
    if (typeof type === 'object') {
      return (metamodel.enums || []).find(metaEnum => metaEnum.id === type.enumId)?.name || 'enum';
    }
    return type;
  }

  private download(filename: string, content: string, type: string): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

export const ecoreService = new EcoreService();
