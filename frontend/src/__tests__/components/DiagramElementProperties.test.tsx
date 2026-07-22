import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import DiagramElementProperties from '../../components/diagram/DiagramElementProperties';
import { diagramService } from '../../services/diagram';
import { modelService } from '../../services/model';

jest.mock('../../components/diagram/ElementAppearanceSelector', () => () => null);
jest.mock('../../services/diagram', () => ({
  diagramService: {
    getDiagramById: jest.fn(),
    getCompatiblePinCreationOptions: jest.fn(),
  },
}));
jest.mock('../../services/model', () => {
  return {
    modelService: {
      getModelById: jest.fn(),
      getAllModels: jest.fn(),
      setModelElementReference: jest.fn(),
    },
    modelInheritanceUtilsService: {
      getAllAttributes: (metaClass: any) => metaClass.attributes || [],
      getAllReferences: (metaClass: any) => metaClass.references || [],
      isSubtypeOf: (classId: string, superClassId: string) => classId === superClassId,
    },
  };
});

const model = {
  id: 'model-1',
  conformsTo: 'metamodel-1',
  elements: [
    {
      id: 'robot-1',
      modelElementId: 'robot',
      style: { name: 'Robot One', BatteryLevel: 18, Priority: 7 },
      references: { assignedStation: 'station-1' },
    },
    { id: 'station-1', modelElementId: 'station', style: { name: 'Station A' }, references: {} },
    { id: 'station-2', modelElementId: 'station', style: { name: 'Station B' }, references: {} },
  ],
};

const metamodel = {
  id: 'metamodel-1',
  name: 'Warehouse',
  classes: [
    {
      id: 'robot',
      name: 'MobileRobot',
      abstract: false,
      superTypes: [],
      attributes: [
        { id: 'battery', name: 'BatteryLevel', type: 'number', many: false },
        { id: 'priority', name: 'Priority', type: 'number', many: false },
      ],
      references: [
        {
          id: 'assigned-station',
          name: 'assignedStation',
          target: 'station',
          containment: false,
          cardinality: { lowerBound: 1, upperBound: 1 },
        },
      ],
    },
    { id: 'station', name: 'ChargingStation', abstract: false, superTypes: [], attributes: [], references: [] },
  ],
  enums: [],
} as any;

const element = {
  id: 'view-node-1',
  type: 'node' as const,
  modelElementId: 'robot',
  style: { linkedModelElementId: 'robot-1' },
};

beforeEach(() => {
  (diagramService.getDiagramById as jest.Mock).mockReturnValue({ id: 'diagram-1', modelId: 'model-1' });
  (diagramService.getCompatiblePinCreationOptions as jest.Mock).mockReturnValue([]);
  (modelService.getModelById as jest.Mock).mockReturnValue(model);
  (modelService.getAllModels as jest.Mock).mockReturnValue([model]);
  (modelService.setModelElementReference as jest.Mock).mockReturnValue(true);
});

describe('DiagramElementProperties property sections', () => {
  it('renders only configured semantic fields and edits a configured reference in 3D', async () => {
    const onReferenceChange = jest.fn();
    render(
      <DiagramElementProperties
        element={element}
        metamodel={metamodel}
        diagramId="diagram-1"
        is3D
        onChange={jest.fn()}
        onReferenceChange={onReferenceChange}
        propertySections={[
          {
            id: 'robot-status',
            name: 'Robot Status',
            metaClassIds: ['robot'],
            attributeNames: ['BatteryLevel'],
            referenceNames: ['assignedStation'],
          },
          {
            id: 'station-details',
            name: 'Station Details',
            metaClassIds: ['station'],
            attributeNames: [],
            referenceNames: [],
          },
        ]}
      />
    );

    expect(screen.getByText('Robot Status')).toBeInTheDocument();
    expect(screen.queryByText('Station Details')).not.toBeInTheDocument();
    expect(await screen.findByDisplayValue('18')).toHaveAccessibleName('BatteryLevel');
    expect(screen.queryByRole('spinbutton', { name: 'Priority' })).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'assignedStation' }));
    fireEvent.click(screen.getByRole('option', { name: 'Station B' }));
    expect(onReferenceChange).toHaveBeenCalledWith('assignedStation', 'station-2');
  });
});
