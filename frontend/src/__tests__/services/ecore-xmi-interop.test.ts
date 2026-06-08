/* eslint-disable import/first */
import { readFileSync } from 'fs';
import path from 'path';
import { MetaAttributeType, MetaClass, MetaReference, Metamodel, Model } from '../../models/types';

let mockIdCounter = 0;
let mockMetamodelStore = new Map<string, Metamodel>();

function nextId(prefix: string): string {
  return `${prefix}-${++mockIdCounter}`;
}

function mockGetAllMetamodels(): Metamodel[] {
  return Array.from(mockMetamodelStore.values());
}

function mockGetMetamodelById(id: string): Metamodel | undefined {
  return mockMetamodelStore.get(id);
}

function mockCreateMetamodel(name: string): Metamodel {
  const metamodel: Metamodel = {
    id: nextId('mm'),
    name,
    eClass: '',
    uri: `http://www.modeling-tool.com/${name.toLowerCase()}`,
    prefix: name.toLowerCase(),
    classes: [],
    enums: [],
    conformsTo: 'core',
    constraints: []
  };
  mockMetamodelStore.set(metamodel.id, metamodel);
  return metamodel;
}

function mockUpdateMetamodel(id: string, updatedMetamodel: Metamodel): Metamodel {
  mockMetamodelStore.set(id, updatedMetamodel);
  return updatedMetamodel;
}

function mockAddMetaClass(metamodelId: string, name: string, abstract = false): MetaClass | null {
  const metamodel = mockMetamodelStore.get(metamodelId);
  if (!metamodel) return null;

  const metaClass: MetaClass = {
    id: nextId('class'),
    name,
    eClass: '',
    abstract,
    superTypes: [],
    attributes: [],
    references: []
  };
  metamodel.classes.push(metaClass);
  return metaClass;
}

function mockUpdateMetaClass(metamodelId: string, classId: string, updates: Partial<MetaClass>): boolean {
  const metaClass = mockMetamodelStore.get(metamodelId)?.classes.find(cls => cls.id === classId);
  if (!metaClass) return false;

  Object.assign(metaClass, updates);
  return true;
}

function mockAddMetaAttribute(
  metamodelId: string,
  classId: string,
  name: string,
  type: MetaAttributeType,
  defaultValue?: any,
  required?: boolean,
  many = false
) {
  const metaClass = mockMetamodelStore.get(metamodelId)?.classes.find(cls => cls.id === classId);
  if (!metaClass) return null;

  const attribute = {
    id: nextId('attr'),
    name,
    eClass: '',
    type,
    defaultValue,
    required,
    many
  };
  metaClass.attributes.push(attribute);
  return attribute;
}

function mockAddMetaReference(
  metamodelId: string,
  classId: string,
  name: string,
  target: string,
  containment = false,
  lowerBound = 0,
  upperBound: number | '*' = 1
): MetaReference | null {
  const metaClass = mockMetamodelStore.get(metamodelId)?.classes.find(cls => cls.id === classId);
  if (!metaClass) return null;

  const reference: MetaReference = {
    id: nextId('ref'),
    name,
    eClass: '',
    target,
    containment,
    cardinality: { lowerBound, upperBound }
  };
  metaClass.references.push(reference);
  return reference;
}

function mockUpdateMetaReference(metamodelId: string, classId: string, referenceId: string, updates: Partial<MetaReference>): boolean {
  const reference = mockMetamodelStore
    .get(metamodelId)
    ?.classes.find(cls => cls.id === classId)
    ?.references.find(ref => ref.id === referenceId);
  if (!reference) return false;

  Object.assign(reference, updates);
  return true;
}

jest.mock('../../services/metamodel/metamodel.service', () => ({
  metamodelService: {
    getAllMetamodels: mockGetAllMetamodels,
    getMetamodelById: mockGetMetamodelById,
    createMetamodel: mockCreateMetamodel,
    updateMetamodel: mockUpdateMetamodel,
    addMetaClass: mockAddMetaClass,
    updateMetaClass: mockUpdateMetaClass,
    addMetaAttribute: mockAddMetaAttribute,
    addMetaReference: mockAddMetaReference,
    updateMetaReference: mockUpdateMetaReference
  }
}));

jest.mock('../../services/metamodel', () => ({
  metamodelService: {
    getAllMetamodels: mockGetAllMetamodels,
    getMetamodelById: mockGetMetamodelById,
    createMetamodel: mockCreateMetamodel,
    updateMetamodel: mockUpdateMetamodel,
    addMetaClass: mockAddMetaClass,
    updateMetaClass: mockUpdateMetaClass,
    addMetaAttribute: mockAddMetaAttribute,
    addMetaReference: mockAddMetaReference,
    updateMetaReference: mockUpdateMetaReference
  }
}));

import { ecoreService } from '../../services/metamodel/ecore.service';
import { modelXmiExportService } from '../../services/model/model-xmi-export.service';
import { modelXmiImportService } from '../../services/model/model-xmi-import.service';

const readFixture = (filename: string) => readFileSync(
  path.join(process.cwd(), 'src/examples/data', filename),
  'utf8'
);

beforeEach(() => {
  mockIdCounter = 0;
  mockMetamodelStore = new Map<string, Metamodel>();
  jest.clearAllMocks();
});

describe('Ecore interop', () => {
  it('round-trips a Library Ecore package through the metamodel service', () => {
    const metamodelId = ecoreService.importFromEcore(readFixture('library.ecore'));
    expect(metamodelId).toBeTruthy();

    const metamodel = mockGetMetamodelById(metamodelId as string);
    const bookClass = metamodel?.classes.find(cls => cls.name === 'Book');
    const personClass = metamodel?.classes.find(cls => cls.name === 'Person');
    const genreEnum = metamodel?.enums?.find(metaEnum => metaEnum.name === 'Genre');

    expect(metamodel?.uri).toBe('http://example.org/library');
    expect(genreEnum?.literals.map(literal => literal.name)).toEqual(['FICTION', 'NONFICTION']);
    expect(bookClass?.constraints?.[0].expression).toBe('self.pages > 0');
    expect(bookClass?.references.find(ref => ref.name === 'author')?.opposite)
      .toBe(personClass?.references.find(ref => ref.name === 'books')?.id);

    const exported = ecoreService.metamodelToEcore(metamodelId as string);
    expect(exported).toContain('xsi:type="ecore:EEnum" name="Genre"');
    expect(exported).toContain('defaultValueLiteral="0"');
    expect(exported).toContain('eOpposite="#//Person/books"');
  });

  it('reports lossy Ecore imports and preserves enum literal values', () => {
    const ecore = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmi:version="2.0"
  xmlns:xmi="http://www.omg.org/XMI"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
  name="workflow" nsURI="http://example.org/workflow" nsPrefix="workflow">
  <eClassifiers xsi:type="ecore:EDataType" name="Currency"/>
  <eClassifiers xsi:type="ecore:EEnum" name="Status">
    <eLiterals name="OPEN" literal="Open"/>
  </eClassifiers>
  <eClassifiers xsi:type="ecore:EClass" name="Task" eSuperTypes="#//MissingBase">
    <eAnnotations source="custom">
      <details key="note" value="ignored"/>
    </eAnnotations>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="amount" eType="#//Currency"/>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="status" eType="#//Status"/>
    <eStructuralFeatures xsi:type="ecore:EReference" name="owner" eType="#//MissingOwner" containment="false"/>
  </eClassifiers>
</ecore:EPackage>`;

    const result = ecoreService.importFromEcoreWithReport(ecore);
    expect(result.metamodelId).toBeTruthy();
    expect(result.warnings.map(warning => warning.type)).toEqual(expect.arrayContaining([
      'custom-datatype-fallback',
      'unresolved-reference',
      'unresolved-supertype',
      'skipped-annotation'
    ]));

    const metamodel = mockGetMetamodelById(result.metamodelId as string);
    expect(metamodel?.enums?.[0].literals[0].literal).toBe('Open');

    const exported = ecoreService.metamodelToEcore(result.metamodelId as string);
    expect(exported).toContain('<eLiterals name="OPEN" literal="Open"/>');
  });
});

describe('Model XMI interop', () => {
  it('imports a Library XMI model and exports namespace-stable XMI', () => {
    const metamodelId = ecoreService.importFromEcore(readFixture('library.ecore'));
    expect(metamodelId).toBeTruthy();

    const importResult = modelXmiImportService.importModel(readFixture('library.xmi'), 'Library Model');
    expect(importResult.model).toBeTruthy();
    expect(importResult.warnings.map(warning => warning.type)).toContain('auto-layout');
    expect(importResult.model?.elements).toHaveLength(5);

    const exportResult = modelXmiExportService.exportModel(importResult.model!);
    expect(exportResult?.xml).toContain('<library:Library xmi:version="2.0"');
    expect(exportResult?.xml).toContain('xmlns:library="http://example.org/library"');
    expect(exportResult?.xml).toMatch(/<books xmi:id="[^"]+" title="Hamlet" pages="200" genre="FICTION" author="\/\/@persons\.0"\/>/);
    expect(exportResult?.xml).toMatch(/<persons xmi:id="[^"]+" name="William Shakespeare" books="\/\/@books\.0"\/>/);
  });

  it('preserves stable xmi:id values and exports them back', () => {
    const metamodelId = ecoreService.importFromEcore(readFixture('library.ecore'));
    expect(metamodelId).toBeTruthy();

    const importResult = modelXmiImportService.importModel(`<?xml version="1.0" encoding="UTF-8"?>
<library:Library xmi:version="2.0"
  xmlns:xmi="http://www.omg.org/XMI"
  xmlns:library="http://example.org/library"
  xmi:id="library-root"
  name="City Library">
  <books xmi:id="book-1" title="Hamlet" pages="200" genre="FICTION" author="person-1"/>
  <persons xmi:id="person-1" name="William Shakespeare" books="book-1"/>
</library:Library>`, 'Library Model');

    expect(importResult.model?.elements.map(element => element.id)).toEqual(expect.arrayContaining([
      'library-root',
      'book-1',
      'person-1'
    ]));

    const exportResult = modelXmiExportService.exportModel(importResult.model!);
    expect(exportResult?.xml).toContain('xmi:id="book-1"');
    expect(exportResult?.xml).toContain('author="//@persons.0"');
  });

  it('warns on duplicate xmi:id values during import', () => {
    const metamodelId = ecoreService.importFromEcore(readFixture('library.ecore'));
    expect(metamodelId).toBeTruthy();

    const importResult = modelXmiImportService.importModel(`<?xml version="1.0" encoding="UTF-8"?>
<library:Library xmi:version="2.0"
  xmlns:xmi="http://www.omg.org/XMI"
  xmlns:library="http://example.org/library"
  name="City Library">
  <books xmi:id="dup-book" title="Hamlet" pages="200" genre="FICTION"/>
  <books xmi:id="dup-book" title="Poetics" pages="120" genre="NONFICTION"/>
</library:Library>`, 'Library Model');

    expect(importResult.warnings.map(warning => warning.type)).toContain('duplicate-xmi-id');
  });

  it('reports unresolved non-containment references during export', () => {
    const metamodelId = ecoreService.importFromEcore(readFixture('library.ecore'));
    expect(metamodelId).toBeTruthy();
    const metamodel = mockGetMetamodelById(metamodelId as string)!;
    const libraryClass = metamodel.classes.find(cls => cls.name === 'Library')!;
    const bookClass = metamodel.classes.find(cls => cls.name === 'Book')!;

    const model: Model = {
      id: 'model-1',
      name: 'Broken Library',
      metamodelId: metamodel.id,
      conformsTo: metamodel.id,
      elements: [
        {
          id: 'library-root',
          modelElementId: libraryClass.id,
          style: { name: 'Broken Library' },
          references: { books: ['book-1'], persons: [] }
        },
        {
          id: 'book-1',
          modelElementId: bookClass.id,
          style: { title: 'Hamlet', pages: 200, genre: 'FICTION' },
          references: { author: 'missing-person' }
        }
      ],
      connections: []
    };

    const exportResult = modelXmiExportService.exportModel(model);
    expect(exportResult?.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'unresolved-reference' })
    ]));
  });

  it('preserves concrete subclass type for EMF containment XMI', () => {
    const metamodel: Metamodel = {
      id: 'poly-mm',
      name: 'poly',
      eClass: '',
      uri: 'http://example.org/poly',
      prefix: 'poly',
      conformsTo: 'core',
      enums: [],
      constraints: [],
      classes: [
        {
          id: 'container-class',
          name: 'Container',
          eClass: '',
          abstract: false,
          superTypes: [],
          attributes: [{ id: 'container-name', name: 'name', eClass: '', type: 'string', many: false }],
          references: [{
            id: 'items-ref',
            name: 'items',
            eClass: '',
            target: 'base-class',
            containment: true,
            cardinality: { lowerBound: 0, upperBound: '*' }
          }]
        },
        {
          id: 'base-class',
          name: 'BaseItem',
          eClass: '',
          abstract: true,
          superTypes: [],
          attributes: [{ id: 'base-label', name: 'label', eClass: '', type: 'string', many: false }],
          references: []
        },
        {
          id: 'sub-class',
          name: 'SpecialItem',
          eClass: '',
          abstract: false,
          superTypes: ['base-class'],
          attributes: [{ id: 'sub-priority', name: 'priority', eClass: '', type: 'number', many: false }],
          references: []
        }
      ]
    };
    mockMetamodelStore.set(metamodel.id, metamodel);

    const model: Model = {
      id: 'poly-model',
      name: 'Poly Model',
      metamodelId: metamodel.id,
      conformsTo: metamodel.id,
      elements: [
        {
          id: 'container-1',
          modelElementId: 'container-class',
          style: { name: 'Root' },
          references: { items: ['item-1'] }
        },
        {
          id: 'item-1',
          modelElementId: 'sub-class',
          style: { label: 'Fast lane', priority: 3 },
          references: {}
        }
      ],
      connections: []
    };

    const exportResult = modelXmiExportService.exportModel(model);
    expect(exportResult?.xml).toContain('xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
    expect(exportResult?.xml).toContain('<items xsi:type="poly:SpecialItem"');

    const importResult = modelXmiImportService.importModel(exportResult!.xml, 'Imported Poly Model');
    expect(importResult.model?.elements).toHaveLength(2);
    expect(importResult.model?.elements.find(element => element.style.label === 'Fast lane')?.modelElementId)
      .toBe('sub-class');
  });
});
