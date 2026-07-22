import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import smartWarehouseMetamodelData from '../../examples/data/smart-warehouse-metamodel.json';
import smartWarehouseModelData from '../../examples/data/smart-warehouse-model.json';
import smartWarehouseViewsData from '../../examples/data/smart-warehouse-views.json';
import smartWarehouseViewpointsData from '../../examples/data/smart-warehouse-viewpoints.json';
import { Diagram, DiagramElement, Metamodel, Model } from '../../models/types';

jest.mock('react-konva', () => {
  const ReactModule = require('react');
  const Stage = ReactModule.forwardRef((stageProps: any, ref: any) => {
    const { children, ...props } = stageProps;
    ReactModule.useImperativeHandle(ref, () => ({
      container: () => ({
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
      }),
      width: jest.fn(),
      height: jest.fn(),
      batchDraw: jest.fn(),
    }));
    return ReactModule.createElement('div', { 'data-testid': 'konva-stage', ...props }, children);
  });
  const Group = (groupProps: any) => ReactModule.createElement(
    'div',
    {
      ...(groupProps.onClick ? { role: 'button', tabIndex: 0 } : {}),
      onClick: groupProps.onClick ? () => groupProps.onClick({ cancelBubble: false }) : undefined,
    },
    groupProps.children
  );
  const Text = (textProps: any) => ReactModule.createElement('span', null, textProps.text);
  const Primitive = (primitiveProps: any) => ReactModule.createElement('div', null, primitiveProps.children);
  return {
    Stage,
    Layer: Primitive,
    Rect: Primitive,
    Text,
    Group,
    Line: Primitive,
    Circle: Primitive,
    Image: Primitive,
    Label: Primitive,
    Tag: Primitive,
    Arrow: Primitive,
  };
});

jest.mock('../../components/diagram/shared/hooks', () => {
  const ReactModule = require('react');
  return {
    useDiagramData: jest.fn(),
    useElementSelection: () => {
      const [selectedElement, setSelectedElement] = ReactModule.useState(null);
      return {
        selectedElement,
        setSelectedElement,
        clearSelection: () => setSelectedElement(null),
        isSelected: (id: string) => selectedElement && selectedElement.id === id,
      };
    },
  };
});

jest.mock('../../components/diagram/DiagramElementProperties', () => () => null);
jest.mock('../../components/diagram/RuleVisualizationPanel', () => () => null);
jest.mock('../../components/diagram/ViewValidationPanel', () => () => null);

jest.mock('../../services/diagram', () => ({
  concreteSyntaxResolver: {
    resolve2D: jest.fn(() => ({ defaultSize: { width: 120, height: 80 } })),
    resolveEdge: jest.fn(() => ({})),
  },
  diagramService: {
    getDiagramById: jest.fn(),
    getPinAttachmentDetails: jest.fn(() => ({ isPin: false })),
    isPinElementInView: jest.fn(() => false),
    addAllModelElementsToView: jest.fn(),
    addElement: jest.fn(),
    updateElement: jest.fn(),
    updateModelElementPresentationInView: jest.fn(),
    deleteElement: jest.fn(),
    removeElementsForModelElement: jest.fn(),
    getCompatiblePinCreationOptions: jest.fn(() => []),
    createPinForOwnerInView: jest.fn(),
  },
  diagramToolExecutionService: {
    executeCreateNodeTool: jest.fn(),
    executeCreateEdgeTool: jest.fn(),
    executeDeleteTool: jest.fn(),
    executeReconnectTool: jest.fn(),
  },
  getExecutableToolType: (tool: any) => (
    tool.type === 'node' ? 'create-node' : tool.type === 'edge' ? 'create-edge' : tool.type
  ),
  viewValidationService: {
    validateDiagram: () => ({ valid: true, issues: [] }),
    findElementForIssue: () => undefined,
    getElementSeverity: () => undefined,
  },
}));

jest.mock('../../services/model', () => ({
  modelService: {
    getModelById: jest.fn(),
    setModelElementReference: jest.fn(),
    updateModelElementProperties: jest.fn(),
    deleteModelElement: jest.fn(),
  },
}));

jest.mock('../../services/viewpoint.service', () => ({
  viewpointService: {
    resolveRepresentationDescription: jest.fn(),
  },
}));

import DiagramEditor from '../../components/diagram/DiagramEditor';
import { useDiagramData } from '../../components/diagram/shared/hooks';
import { diagramService, diagramToolExecutionService } from '../../services/diagram';
import { viewpointService } from '../../services/viewpoint.service';

const mockedUseDiagramData = useDiagramData as jest.Mock;
const mockedDiagramService = diagramService as any;
const mockedToolService = diagramToolExecutionService as any;
const mockedViewpointService = viewpointService as any;

const warehouseMetamodel = JSON.parse(JSON.stringify(smartWarehouseMetamodelData)) as Metamodel;
const warehouseModel = JSON.parse(JSON.stringify(smartWarehouseModelData)) as Model;
const warehouseViewpoint = smartWarehouseViewpointsData[0];
const floorPlan = warehouseViewpoint.representationDescriptions[0];
const rawView = JSON.parse(JSON.stringify(smartWarehouseViewsData[0])) as Diagram;
const robot = warehouseModel.elements.find(element => (
  element.modelElementId === '10000000-0000-4000-8000-000000000102'
))!;
const robotNode: DiagramElement = {
  id: robot.id,
  type: 'node',
  modelElementId: robot.modelElementId,
  x: robot.presentation?.position2D?.x || 100,
  y: robot.presentation?.position2D?.y || 100,
  width: robot.presentation?.size2D?.width || 120,
  height: robot.presentation?.size2D?.height || 80,
  style: { ...robot.style, linkedModelElementId: robot.id },
};
const diagram: Diagram = { ...rawView, elements: [robotNode] };

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseDiagramData.mockReturnValue({
    diagram,
    setDiagram: jest.fn(),
    metamodel: warehouseMetamodel,
    model: warehouseModel,
    isLoading: false,
  });
  mockedDiagramService.getDiagramById.mockReturnValue(diagram);
  mockedViewpointService.resolveRepresentationDescription.mockReturnValue({
    viewpoint: warehouseViewpoint,
    representationDescription: floorPlan,
  });
  mockedToolService.executeCreateNodeTool.mockResolvedValue({
    ok: true,
    message: 'Mobile Robot created an element.',
    value: {
      id: 'created-robot',
      type: 'node',
      modelElementId: '10000000-0000-4000-8000-000000000102',
      style: {},
    },
  });
  mockedToolService.executeDeleteTool.mockReturnValue({
    ok: true,
    message: 'Delete from Warehouse removed the model element.',
  });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const renderEditor = () => render(
  <MemoryRouter>
    <DiagramEditor diagramId={diagram.id} />
  </MemoryRouter>
);

describe('DiagramEditor authored tool interactions', () => {
  it('runs the Smart Warehouse create-node tool when its palette entry is dropped', async () => {
    renderEditor();

    const toolEntry = screen.getByText('Mobile Robot').closest('[draggable="true"]');
    expect(toolEntry).not.toBeNull();
    fireEvent.dragStart(toolEntry!, {
      dataTransfer: { setData: jest.fn(), effectAllowed: '' },
    });
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'clientX', { value: 240 });
    Object.defineProperty(dropEvent, 'clientY', { value: 180 });
    fireEvent(screen.getByTestId('diagram-canvas-drop-zone'), dropEvent);

    await waitFor(() => {
      expect(mockedToolService.executeCreateNodeTool).toHaveBeenCalledWith(
        diagram.id,
        expect.objectContaining({ id: 'tool-floor-mobile-robot' }),
        expect.objectContaining({ position2D: { x: 240, y: 180 } })
      );
    });
  });

  it('runs the Smart Warehouse delete tool against the selected diagram node', () => {
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Delete from Warehouse' }));
    const robotShape = screen.getByText('Mobile Robot Resource').closest('[role="button"]');
    expect(robotShape).not.toBeNull();
    fireEvent.click(robotShape!);

    expect(mockedToolService.executeDeleteTool).toHaveBeenCalledWith(
      diagram.id,
      expect.objectContaining({ id: 'tool-floor-delete' }),
      expect.objectContaining({ id: robot.id, type: 'node' })
    );
  });
});
