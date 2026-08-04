import { validateMetamodel } from '../../services/metamodel/metamodel-validation.service';
import { metaMetamodelService } from '../../services/metametamodel';

// Mock apiClient to prevent network calls from MetaMetamodelService constructor
jest.mock('../../services/core', () => ({
  apiClient: {
    get: jest.fn().mockResolvedValue(null),
    post: jest.fn().mockResolvedValue(null),
    put: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(null),
  },
  API_ENDPOINTS: {
    EPACKAGES: '/api/epackages',
    EPACKAGES_CORE: '/api/epackages/core',
  },
}));

beforeEach(() => {
  jest.spyOn(metaMetamodelService, 'getEPackageById').mockImplementation((id: string) => {
    if (id === 'valid-pkg-id') {
      return { id: 'valid-pkg-id', name: 'Ecore', nsURI: 'http://ecore', nsPrefix: 'ecore', classes: [] } as any;
    }
    return undefined;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const makeMetamodel = (overrides: any = {}) => ({
  id: 'mm-1',
  name: 'TestMM',
  uri: 'http://test/mm',
  prefix: 'test',
  eClass: 'valid-pkg-id',
  classes: [],
  constraints: [],
  conformsTo: 'valid-pkg-id',
  ...overrides,
});

describe('validateMetamodel', () => {
  it('returns valid for a well-formed metamodel', () => {
    const mm = makeMetamodel({
      classes: [
        {
          id: 'cls-1',
          name: 'Person',
          abstract: false,
          superTypes: [],
          attributes: [
            { id: 'attr-1', name: 'name', type: 'string', multiplicity: '0..1' },
          ],
          references: [],
        },
      ],
    });

    const result = validateMetamodel(mm as any);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('reports issue for invalid meta-metamodel reference', () => {
    const mm = makeMetamodel({ conformsTo: 'nonexistent-pkg' });

    const result = validateMetamodel(mm as any);

    expect(result.valid).toBe(false);
    expect(result.issues).toContain('Invalid meta-metamodel reference: nonexistent-pkg');
  });

  it('reports issue when metamodel has no name', () => {
    const mm = makeMetamodel({ name: '' });

    const result = validateMetamodel(mm as any);

    expect(result.valid).toBe(false);
    expect(result.issues).toContain('Metamodel must have a name');
  });

  it('reports issue when metamodel has no URI', () => {
    const mm = makeMetamodel({ uri: '' });

    const result = validateMetamodel(mm as any);

    expect(result.valid).toBe(false);
    expect(result.issues).toContain('Metamodel must have a URI');
  });

  it('reports issue when class has no name', () => {
    const mm = makeMetamodel({
      classes: [
        { id: 'cls-1', name: '', abstract: false, superTypes: [], attributes: [], references: [] },
      ],
    });

    const result = validateMetamodel(mm as any);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i: string) => i.includes('must have a name'))).toBe(true);
  });

  it('reports inconsistent vertical-placement policies on metaclasses', () => {
    const mm = makeMetamodel({
      classes: [{
        id: 'drone',
        name: 'Drone',
        abstract: false,
        superTypes: [],
        attributes: [],
        references: [],
        concreteSyntax: {
          three_d: {
            verticalPlacement: {
              mode: 'adjustable',
              defaultBaseZMm: 500,
              minBaseZMm: 1000,
              maxBaseZMm: 5000,
              stepMm: -10,
            },
          },
        },
      }],
    });

    const result = validateMetamodel(mm as any);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('stepMm must be greater than 0'),
      expect.stringContaining('defaultBaseZMm must be greater than or equal to'),
    ]));
  });

  it('reports issue when attribute has no name', () => {
    const mm = makeMetamodel({
      classes: [
        {
          id: 'cls-1',
          name: 'MyClass',
          abstract: false,
          superTypes: [],
          attributes: [{ id: 'attr-1', name: '', type: 'string', multiplicity: '0..1' }],
          references: [],
        },
      ],
    });

    const result = validateMetamodel(mm as any);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i: string) => i.includes('must have a name'))).toBe(true);
  });

  it('reports issue when attribute has no type', () => {
    const mm = makeMetamodel({
      classes: [
        {
          id: 'cls-1',
          name: 'MyClass',
          abstract: false,
          superTypes: [],
          attributes: [{ id: 'attr-1', name: 'myAttr', type: '', multiplicity: '0..1' }],
          references: [],
        },
      ],
    });

    const result = validateMetamodel(mm as any);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i: string) => i.includes('must have a type'))).toBe(true);
  });

  it('reports issue when reference points to non-existent class', () => {
    const mm = makeMetamodel({
      classes: [
        {
          id: 'cls-1',
          name: 'MyClass',
          abstract: false,
          superTypes: [],
          attributes: [],
          references: [
            { id: 'ref-1', name: 'myRef', target: 'nonexistent-cls', multiplicity: '0..1' },
          ],
        },
      ],
    });

    const result = validateMetamodel(mm as any);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i: string) => i.includes('non-existent class'))).toBe(true);
  });

  it('reports issue for reference with non-existent opposite', () => {
    const mm = makeMetamodel({
      classes: [
        {
          id: 'cls-1',
          name: 'A',
          abstract: false,
          superTypes: [],
          attributes: [],
          references: [
            { id: 'ref-1', name: 'aRef', target: 'cls-1', opposite: 'nonexistent-ref', multiplicity: '0..1' },
          ],
        },
      ],
    });

    const result = validateMetamodel(mm as any);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i: string) => i.includes('non-existent opposite'))).toBe(true);
  });

  it('validates valid bidirectional references', () => {
    const mm = makeMetamodel({
      classes: [
        {
          id: 'cls-1',
          name: 'A',
          abstract: false,
          superTypes: [],
          attributes: [],
          references: [
            { id: 'ref-1', name: 'bRef', target: 'cls-2', opposite: 'ref-2', multiplicity: '0..1' },
          ],
        },
        {
          id: 'cls-2',
          name: 'B',
          abstract: false,
          superTypes: [],
          attributes: [],
          references: [
            { id: 'ref-2', name: 'aRef', target: 'cls-1', opposite: 'ref-1', multiplicity: '0..1' },
          ],
        },
      ],
    });

    const result = validateMetamodel(mm as any);

    expect(result.valid).toBe(true);
  });
});
