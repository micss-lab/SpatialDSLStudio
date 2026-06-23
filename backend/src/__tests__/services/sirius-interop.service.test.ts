import { ApiError } from '../../middleware';

const metamodelServiceMock = {
  getById: jest.fn(),
};

const viewpointServiceMock = {
  create: jest.fn(),
  getAll: jest.fn(),
};

const modelServiceMock = {
  getById: jest.fn(),
};

const diagramServiceMock = {
  create: jest.fn(),
};

jest.mock('../../services/metamodel.service', () => ({
  metamodelService: metamodelServiceMock,
}));

jest.mock('../../services/viewpoint.service', () => ({
  viewpointService: viewpointServiceMock,
}));

jest.mock('../../services/model.service', () => ({
  modelService: modelServiceMock,
}));

jest.mock('../../services/diagram.service', () => ({
  diagramService: diagramServiceMock,
}));

import { siriusInteropService } from '../../services/sirius-interop.service';
import { Metamodel, Model, Viewpoint } from '../../../../shared/types';
import JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';

const mockMetamodel: Metamodel = {
  id: 'metamodel-1',
  name: 'Minimal',
  eClass: 'EPackage',
  uri: 'http://example.com/minimal',
  prefix: 'minimal',
  conformsTo: 'ecore',
  classes: [
    {
      id: 'cls-root',
      name: 'Root',
      eClass: 'EClass',
      abstract: false,
      superTypes: [],
      attributes: [],
      references: [
        {
          id: 'ref-children',
          name: 'children',
          eClass: 'EReference',
          target: 'cls-child',
          containment: true,
          cardinality: { lowerBound: 0, upperBound: '*' },
        },
      ],
    },
    {
      id: 'cls-child',
      name: 'Child',
      eClass: 'EClass',
      abstract: false,
      superTypes: [],
      attributes: [],
      references: [],
    },
    {
      id: 'cls-port',
      name: 'Port',
      eClass: 'EClass',
      abstract: false,
      superTypes: [],
      attributes: [],
      references: [],
    },
  ],
};

const minimalOdesign = `<?xml version="1.0" encoding="UTF-8"?>
<description:Group xmi:version="2.0"
    xmlns:xmi="http://www.omg.org/XMI"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:description="http://www.eclipse.org/sirius/description/1.1.0"
    xmlns:diagram="http://www.eclipse.org/sirius/diagram/description/1.1.0"
    name="Minimal">
  <ownedViewpoints xmi:id="vp.main" name="Minimal Viewpoint">
    <ownedRepresentations xmi:id="diag.main" xsi:type="diagram:DiagramDescription" name="Minimal Diagram" domainClass="minimal::Root">
      <defaultLayer name="Default">
        <nodeMappings xmi:id="map.root" name="Root" domainClass="minimal::Root">
          <style xsi:type="diagram:SquareDescription" color="#ffffff" borderColor="#111111"/>
          <borderedNodeMappings xmi:id="map.port" name="Port" domainClass="minimal::Port">
            <style xsi:type="diagram:EllipseDescription" color="#22c55e"/>
          </borderedNodeMappings>
        </nodeMappings>
        <containerMappings xmi:id="map.child" name="Child" domainClass="Child">
          <style xsi:type="diagram:SquareDescription" color="#dbeafe"/>
        </containerMappings>
        <edgeMappings xmi:id="edge.children" name="children" targetFinderExpression="feature:children">
          <style xsi:type="diagram:EdgeStyleDescription" strokeColor="#0f172a" targetArrow="InputArrow"/>
        </edgeMappings>
        <toolSections name="Tools">
          <ownedTools xmi:id="tool.createRoot" name="Create Root"/>
        </toolSections>
      </defaultLayer>
    </ownedRepresentations>
  </ownedViewpoints>
</description:Group>`;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SiriusInteropService', () => {
  it('validates a minimal Sirius .odesign into SpatialDSL viewpoint descriptions', async () => {
    metamodelServiceMock.getById.mockResolvedValue(mockMetamodel);

    const preview = await siriusInteropService.validate(
      { content: minimalOdesign, metamodelId: 'metamodel-1' },
      'user-1'
    );

    expect(preview.report.supported).toBe(true);
    expect(preview.groupName).toBe('Minimal');
    expect(preview.viewpoints).toHaveLength(1);
    expect(preview.viewpoints[0]).toEqual(expect.objectContaining({
      id: 'sirius-vp-main',
      name: 'Minimal Viewpoint',
      metamodelId: 'metamodel-1',
    }));

    const description = preview.viewpoints[0].representationDescriptions[0];
    expect(description.visibleMetaClassIds).toEqual(expect.arrayContaining(['cls-root', 'cls-child', 'cls-port']));
    expect(description.creatableMetaClassIds).toEqual(expect.arrayContaining(['cls-root', 'cls-child', 'cls-port']));
    expect(description.edgeMappings?.[0]).toEqual(expect.objectContaining({
      referenceId: 'ref-children',
      referenceName: 'children',
    }));
    expect(description.pinMappings?.[0]).toEqual(expect.objectContaining({
      pinMetaClassIds: ['cls-port'],
      ownerMetaClassIds: ['cls-root'],
    }));
    expect(description.toolDefinitions?.[0]).toEqual(expect.objectContaining({
      id: 'sirius-tool-createroot',
      name: 'Create Root',
    }));
  });

  it('rejects XML with external entity declarations', async () => {
    await expect(
      siriusInteropService.validate(
        {
          content: '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><description:Group/>',
        },
        'user-1'
      )
    ).rejects.toThrow(ApiError);
  });

  it('rejects malformed XML through the DOM parser', async () => {
    await expect(
      siriusInteropService.validate(
        {
          content: '<description:Group><ownedViewpoints></description:Group>',
        },
        'user-1'
      )
    ).rejects.toThrow(ApiError);
  });

  it('recognizes a Sirius .aird DAnalysis but reports when it has no diagram representations', async () => {
    modelServiceMock.getById.mockResolvedValue(mockModel);
    const preview = await siriusInteropService.validateAirdView(
      {
        sourceFormat: 'aird',
        modelId: 'model-1',
        content: `<?xml version="1.0" encoding="UTF-8"?>
          <viewpoint:DAnalysis xmi:id="analysis-1"
            xmlns:xmi="http://www.omg.org/XMI"
            xmlns:viewpoint="http://www.eclipse.org/sirius/1.1.0"/>`,
      },
      'user-1'
    );

    expect(preview.diagrams).toHaveLength(0);
    expect(preview.report.unresolvedReferences).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SIRIUS_AIRD_NO_DIAGRAMS' }),
    ]));
  });

  it('validates a base64 Sirius project ZIP by delegating the .odesign file', async () => {
    metamodelServiceMock.getById.mockResolvedValue(mockMetamodel);
    const zip = new JSZip();
    zip.file('description/minimal.odesign', minimalOdesign);
    zip.file('representations/session.aird', '<viewpoint:DAnalysis xmlns:viewpoint="http://www.eclipse.org/sirius/1.1.0"/>');
    const payload = await zip.generateAsync({ type: 'base64' });

    const preview = await siriusInteropService.validate(
      { sourceFormat: 'project-zip', content: payload, metamodelId: 'metamodel-1' },
      'user-1'
    );

    expect(preview.report.sourceFormat).toBe('project-zip');
    expect(preview.viewpoints).toHaveLength(1);
    expect(preview.report.droppedFeatures).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SIRIUS_DEFERRED_AIRD' }),
    ]));
    expect(preview.report.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SIRIUS_PROJECT_ZIP_ODSIGN_IMPORTED' }),
    ]));
  });

  it('rejects unsafe Sirius project ZIP paths', async () => {
    const zip = new JSZip();
    zip.file('../description/minimal.odesign', minimalOdesign);
    const payload = await zip.generateAsync({ type: 'base64' });

    await expect(
      siriusInteropService.validate(
        { sourceFormat: 'project-zip', content: payload },
        'user-1'
      )
    ).rejects.toThrow(ApiError);
  });

  it('reports unsupported non-diagram representation descriptions', async () => {
    metamodelServiceMock.getById.mockResolvedValue(mockMetamodel);
    const unsupported = minimalOdesign.replace(
      '</ownedViewpoints>',
      '<ownedRepresentations xmi:id="table.main" xsi:type="table:TableDescription" name="Table"/></ownedViewpoints>'
    );

    const preview = await siriusInteropService.validate(
      { content: unsupported, metamodelId: 'metamodel-1' },
      'user-1'
    );

    expect(preview.report.droppedFeatures).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SIRIUS_REPRESENTATION_KIND_UNSUPPORTED' }),
    ]));
    expect(preview.viewpoints[0].representationDescriptions).toHaveLength(1);
  });

  it('reports but skips mappings from unsupported additional layers', async () => {
    metamodelServiceMock.getById.mockResolvedValue({
      ...mockMetamodel,
      classes: [
        ...mockMetamodel.classes,
        {
          id: 'cls-review-note',
          name: 'ReviewNote',
          eClass: 'EClass',
          abstract: false,
          superTypes: [],
          attributes: [],
          references: [],
        },
      ],
    });
    const withAdditionalLayer = minimalOdesign.replace(
      '</defaultLayer>',
      `</defaultLayer>
      <additionalLayers xmi:id="layer.review" name="Review">
        <nodeMappings xmi:id="map.review" name="ReviewNote" domainClass="minimal::ReviewNote"/>
      </additionalLayers>`
    );

    const preview = await siriusInteropService.validate(
      { content: withAdditionalLayer, metamodelId: 'metamodel-1' },
      'user-1'
    );

    const description = preview.viewpoints[0].representationDescriptions[0];
    expect(preview.report.droppedFeatures).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SIRIUS_LAYERS_UNSUPPORTED' }),
    ]));
    expect(description.visibleMetaClassIds).not.toContain('cls-review-note');
  });

  it('resolves simple aql:self reference expressions', async () => {
    metamodelServiceMock.getById.mockResolvedValue(mockMetamodel);
    const withAqlReference = minimalOdesign.replace('feature:children', 'aql:self.children');

    const preview = await siriusInteropService.validate(
      { content: withAqlReference, metamodelId: 'metamodel-1' },
      'user-1'
    );

    expect(preview.viewpoints[0].representationDescriptions[0].edgeMappings?.[0]).toEqual(expect.objectContaining({
      referenceId: 'ref-children',
    }));
  });

  it('imports parsed .odesign viewpoints through the viewpoint service', async () => {
    metamodelServiceMock.getById.mockResolvedValue(mockMetamodel);
    viewpointServiceMock.create.mockImplementation(async (viewpoint: Viewpoint) => viewpoint);

    const result = await siriusInteropService.importOdesign(
      { content: minimalOdesign, metamodelId: 'metamodel-1' },
      'user-1',
      'DSL_DESIGNER'
    );

    expect(viewpointServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sirius-vp-main', metamodelId: 'metamodel-1' }),
      'user-1',
      'DSL_DESIGNER'
    );
    expect(result.viewpoints).toHaveLength(1);
  });

  it('does not import an unsupported .odesign with no viewpoints', async () => {
    metamodelServiceMock.getById.mockResolvedValue(mockMetamodel);

    await expect(
      siriusInteropService.importOdesign(
        { content: '<description:Group name="Empty"/>', metamodelId: 'metamodel-1' },
        'user-1',
        'DSL_DESIGNER'
      )
    ).rejects.toThrow(ApiError);

    expect(viewpointServiceMock.create).not.toHaveBeenCalled();
  });

  it('exports stored SpatialDSL viewpoints as a Sirius .odesign document', async () => {
    metamodelServiceMock.getById.mockResolvedValue(mockMetamodel);
    viewpointServiceMock.getAll.mockResolvedValue([
      {
        id: 'viewpoint-1',
        name: 'Minimal Viewpoint',
        metamodelId: 'metamodel-1',
        representationDescriptions: [
          {
            id: 'diagram-1',
            name: 'Minimal Diagram',
            viewpointId: 'viewpoint-1',
            kind: 'diagram',
            visibleMetaClassIds: ['cls-root'],
            creatableMetaClassIds: ['cls-root'],
            concreteSyntaxByMetaClassId: {
              'cls-root': { two_d: { shape: 'ellipse', fillColor: '#f8fafc' } },
              'cls-port': { two_d: { shape: 'circle', fillColor: '#22c55e' } },
            },
            concreteSyntaxByReferenceId: {
              'ref-children': { arrowHead: 'none', lineColor: '#0f172a' },
            },
            edgeMappings: [{ id: 'edge-1', referenceId: 'ref-children', referenceName: 'children' }],
            pinMappings: [
              {
                id: 'pin-1',
                pinMetaClassIds: ['cls-port'],
                ownerMetaClassIds: ['cls-root'],
              },
            ],
            isDefault: true,
          },
        ],
      },
    ]);

    const result = await siriusInteropService.exportOdesign(
      { metamodelId: 'metamodel-1' },
      'user-1'
    );

    expect(result.filename).toBe('minimal.odesign');
    expect(result.content).toContain('<description:Group');
    expect(result.content).toContain('xsi:type="diagram:DiagramDescription"');
    expect(result.content).toContain('xsi:type="diagram:EllipseDescription"');
    expect(result.content).toMatch(/<nodeMappings[^>]*Root[\s\S]*<borderedNodeMappings[^>]*Port[\s\S]*<\/nodeMappings>/);
    expect(result.content).toContain('targetFinderExpression="feature:children"');
    expect(result.content).toContain('targetArrow="NoDecoration"');
    expect(result.report.supported).toBe(true);
  });

  it('rejects explicit export requests that include inaccessible viewpoint IDs', async () => {
    metamodelServiceMock.getById.mockResolvedValue(mockMetamodel);
    viewpointServiceMock.getAll.mockResolvedValue([
      {
        id: 'viewpoint-1',
        name: 'Minimal Viewpoint',
        metamodelId: 'metamodel-1',
        representationDescriptions: [],
      },
    ]);

    await expect(
      siriusInteropService.exportOdesign(
        { metamodelId: 'metamodel-1', viewpointIds: ['viewpoint-1', 'missing-viewpoint'] },
        'user-1'
      )
    ).rejects.toThrow(ApiError);
  });
});

const mockModel: Model = {
  id: 'model-1',
  name: 'Demo Model',
  metamodelId: 'metamodel-1',
  conformsTo: 'metamodel-1',
  elements: [
    { id: 'component-api', name: 'API', modelElementId: 'cls-root', style: {}, references: {} },
    { id: 'component-db', name: 'Database', modelElementId: 'cls-child', style: {}, references: {} },
  ],
};

const mockAirdViewpoint: Viewpoint = {
  id: 'viewpoint-1',
  name: 'Minimal Viewpoint',
  metamodelId: 'metamodel-1',
  sharedConcreteSyntaxByMetaClassId: {},
  isDefault: true,
  representationDescriptions: [
    {
      id: 'sirius-diag-main',
      name: 'Minimal Diagram',
      viewpointId: 'viewpoint-1',
      kind: 'diagram',
      visibleMetaClassIds: ['cls-root', 'cls-child'],
      creatableMetaClassIds: ['cls-root', 'cls-child'],
      edgeMappings: [{ id: 'sirius-edge-children', referenceName: 'children' }],
      isDefault: true,
    },
  ],
};

const airdWithLayout = `<?xml version="1.0" encoding="UTF-8"?>
<xmi:XMI xmi:version="2.0"
    xmlns:xmi="http://www.omg.org/XMI"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:viewpoint="http://www.eclipse.org/sirius/1.1.0"
    xmlns:diagram="http://www.eclipse.org/sirius/diagram/1.1.0"
    xmlns:notation="http://www.eclipse.org/gmf/runtime/1.0.2/notation">
  <viewpoint:DAnalysis xmi:id="analysis-1">
    <ownedViews xmi:id="view-1" viewpoint="description/minimal.odesign#viewpoint-1">
      <ownedRepresentations xsi:type="diagram:DSemanticDiagram" xmi:id="rep-1" name="Demo System"
          target="model/sample.xmi#system-demo" description="description/minimal.odesign#diag.main">
        <ownedDiagramElements xmi:id="dde-api" name="API" target="model/sample.xmi#component-api"
            mapping="description/minimal.odesign#map.root"/>
        <ownedDiagramElements xmi:id="dde-db" name="Database" target="model/sample.xmi#component-db"
            mapping="description/minimal.odesign#map.root"/>
        <ownedDiagramElements xmi:id="dde-dep" name="API to Database" target="model/sample.xmi#component-api"
            mapping="description/minimal.odesign#edge.children" sourceNode="#dde-api" targetNode="#dde-db"/>
      </ownedRepresentations>
    </ownedViews>
  </viewpoint:DAnalysis>
  <notation:Diagram xmi:id="gmf-1" element="#rep-1">
    <children xsi:type="notation:Node" xmi:id="gn-api" element="#dde-api">
      <layoutConstraint xsi:type="notation:Bounds" x="100" y="50" width="160" height="90"/>
    </children>
    <children xsi:type="notation:Node" xmi:id="gn-db" element="#dde-db">
      <layoutConstraint xsi:type="notation:Bounds" x="400" y="260" width="160" height="90"/>
    </children>
    <edges xsi:type="notation:Edge" xmi:id="ge-dep" element="#dde-dep" source="gn-api" target="gn-db">
      <points x="180" y="140"/>
      <points x="480" y="260"/>
    </edges>
  </notation:Diagram>
</xmi:XMI>`;

describe('SiriusInteropService .aird import', () => {
  beforeEach(() => {
    modelServiceMock.getById.mockResolvedValue(mockModel);
    viewpointServiceMock.getAll.mockResolvedValue([mockAirdViewpoint]);
    diagramServiceMock.create.mockImplementation(async (data: any) => ({ id: `diagram-${data.name}`, ...data }));
  });

  it('validates a Sirius .aird into a SpatialDSL view with resolved targets and GMF layout', async () => {
    const preview = await siriusInteropService.validateAirdView(
      { content: airdWithLayout, sourceFormat: 'aird', modelId: 'model-1', viewpointId: 'viewpoint-1' },
      'user-1'
    );

    expect(preview.report.supported).toBe(true);
    expect(preview.diagrams).toHaveLength(1);

    const diagram = preview.diagrams[0];
    expect(diagram).toEqual(expect.objectContaining({
      name: 'Demo System',
      modelId: 'model-1',
      viewpointId: 'viewpoint-1',
      representationDescriptionId: 'sirius-diag-main',
    }));

    const nodes = diagram.elements.filter(element => element.type === 'node');
    const edges = diagram.elements.filter(element => element.type === 'edge');
    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(1);

    const apiNode = nodes.find(node => node.modelElementId === 'component-api');
    expect(apiNode).toEqual(expect.objectContaining({ x: 100, y: 50, width: 160, height: 90 }));

    const edge = edges[0];
    expect(edge.modelElementId).toBe('component-api');
    expect(edge.sourceId).toBe(nodes.find(node => node.modelElementId === 'component-api')!.id);
    expect(edge.targetId).toBe(nodes.find(node => node.modelElementId === 'component-db')!.id);
    expect(edge.points).toEqual([{ x: 180, y: 140 }, { x: 480, y: 260 }]);
  });

  it('imports a Sirius .aird by creating views through the diagram service', async () => {
    const result = await siriusInteropService.importAird(
      { content: airdWithLayout, modelId: 'model-1', viewpointId: 'viewpoint-1' },
      'user-1',
      'DSL_DESIGNER'
    );

    expect(diagramServiceMock.create).toHaveBeenCalledTimes(1);
    expect(diagramServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Demo System', modelId: 'model-1', viewpointId: 'viewpoint-1' }),
      'user-1',
      'DSL_DESIGNER'
    );
    expect(result.diagrams).toHaveLength(1);
    expect(result.report.supported).toBe(true);
  });

  it('fails .aird import when the model is missing', async () => {
    modelServiceMock.getById.mockResolvedValue(null);
    await expect(
      siriusInteropService.importAird(
        { content: airdWithLayout, modelId: 'missing', viewpointId: 'viewpoint-1' },
        'user-1',
        'DSL_DESIGNER'
      )
    ).rejects.toThrow(ApiError);
    expect(diagramServiceMock.create).not.toHaveBeenCalled();
  });

  it('warns and drops elements whose semantic target cannot be resolved', async () => {
    const airdUnresolved = airdWithLayout.replace(
      'name="Database" target="model/sample.xmi#component-db"',
      'name="Ghost" target="model/sample.xmi#missing-component"'
    );

    const preview = await siriusInteropService.validateAirdView(
      { content: airdUnresolved, sourceFormat: 'aird', modelId: 'model-1', viewpointId: 'viewpoint-1' },
      'user-1'
    );

    const diagram = preview.diagrams[0];
    // The DB node drops, which also drops the edge (its target endpoint is gone).
    expect(diagram.elements.filter(element => element.type === 'node')).toHaveLength(1);
    expect(diagram.elements.filter(element => element.type === 'edge')).toHaveLength(0);
    expect(preview.report.unresolvedReferences.some(warning => warning.code === 'SIRIUS_AIRD_TARGET_UNRESOLVED')).toBe(true);
  });

  it('parses the aird-layout fixture from disk and preserves GMF node bounds', async () => {
    const fixturePath = path.resolve(__dirname, '../../../../fixtures/sirius/aird-layout/representations.aird');
    const content = fs.readFileSync(fixturePath, 'utf8');
    const fixtureViewpoint: Viewpoint = {
      ...mockAirdViewpoint,
      representationDescriptions: [
        { ...mockAirdViewpoint.representationDescriptions[0], id: 'sirius-diagram-minimal' },
      ],
    };
    viewpointServiceMock.getAll.mockResolvedValue([fixtureViewpoint]);

    const preview = await siriusInteropService.validateAirdView(
      { content, sourceFormat: 'aird', modelId: 'model-1', viewpointId: 'viewpoint-1' },
      'user-1'
    );

    expect(preview.report.supported).toBe(true);
    expect(preview.report.unresolvedReferences).toHaveLength(0);
    const diagram = preview.diagrams[0];
    expect(diagram.representationDescriptionId).toBe('sirius-diagram-minimal');
    expect(diagram.elements.filter(element => element.type === 'node')).toHaveLength(2);
    expect(diagram.elements.filter(element => element.type === 'edge')).toHaveLength(1);
    expect(diagram.elements.find(element => element.modelElementId === 'component-api')).toEqual(
      expect.objectContaining({ x: 80, y: 60, width: 160, height: 90 })
    );
  });

  it('errors when no model is supplied for an .aird import', async () => {
    const preview = await siriusInteropService.validateAirdView(
      { content: airdWithLayout, sourceFormat: 'aird' },
      'user-1'
    );

    expect(preview.report.supported).toBe(false);
    expect(preview.diagrams).toHaveLength(0);
    expect(preview.report.unresolvedReferences.some(warning => warning.code === 'SIRIUS_AIRD_MODEL_REQUIRED')).toBe(true);
  });
});
