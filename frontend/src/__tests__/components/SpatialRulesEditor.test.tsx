import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import SpatialRulesEditor from '../../components/metamodel/SpatialRulesEditor';
import { metamodelService } from '../../services/metamodel';
import { Metamodel } from '../../models/types';

jest.mock('../../services/metamodel', () => ({
  metamodelService: { updateMetamodel: jest.fn() },
}));

const metamodel: Metamodel = {
  id: 'mm-1',
  name: 'Warehouse',
  eClass: 'EPackage',
  uri: 'http://example.org/warehouse',
  prefix: 'wh',
  conformsTo: 'ecore',
  classes: [
    { id: 'rack', name: 'StorageRack', eClass: 'EClass', abstract: false, superTypes: [], attributes: [], references: [] },
    { id: 'conveyor', name: 'Conveyor', eClass: 'EClass', abstract: false, superTypes: [], attributes: [], references: [] },
  ],
  spatialRules: [{
    id: 'rule-1',
    name: 'Conveyors apart',
    kind: 'noOverlap',
    sourceClassId: 'conveyor',
    targetClassId: 'conveyor',
    mode: 'plan',
    severity: 'error',
  }],
};

const chooseOption = (label: string, option: string) => {
  fireEvent.mouseDown(screen.getByLabelText(label));
  fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: option }));
};

describe('SpatialRulesEditor', () => {
  beforeEach(() => {
    (metamodelService.updateMetamodel as jest.Mock).mockImplementation((_id: string, updated: Metamodel) => updated);
  });

  it('lists existing rules with a readable summary', () => {
    render(<SpatialRulesEditor metamodel={metamodel} onUpdateMetamodel={jest.fn()} />);

    expect(screen.getByText('Conveyors apart')).toBeInTheDocument();
    expect(screen.getByText('Conveyor and Conveyor do not overlap')).toBeInTheDocument();
    expect(screen.getByText('Plan view')).toBeInTheDocument();
  });

  it('shows the distance field only for kinds that use it and requires it where needed', () => {
    const onUpdateMetamodel = jest.fn();
    render(<SpatialRulesEditor metamodel={metamodel} onUpdateMetamodel={onUpdateMetamodel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Rule' }));
    fireEvent.change(screen.getByLabelText('Rule name'), { target: { value: 'Aisle width' } });
    expect(screen.queryByLabelText('Minimum gap (mm)')).not.toBeInTheDocument();

    chooseOption('Kind', 'Minimum clearance');
    chooseOption('Source class', 'StorageRack');
    chooseOption('Target class', 'StorageRack');
    expect(screen.getByLabelText('Minimum gap (mm)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Minimum gap (mm) is required for Minimum clearance.')).toBeInTheDocument();
    expect(metamodelService.updateMetamodel).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Minimum gap (mm)'), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('The distance must be a number of millimetres, zero or greater.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Minimum gap (mm)'), { target: { value: '1500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(metamodelService.updateMetamodel).toHaveBeenCalledWith('mm-1', expect.objectContaining({
      spatialRules: [
        metamodel.spatialRules![0],
        expect.objectContaining({
          name: 'Aisle width',
          kind: 'minClearance',
          sourceClassId: 'rack',
          targetClassId: 'rack',
          distanceMm: 1500,
          mode: 'volume',
          severity: 'error',
        }),
      ],
    }));
    expect(onUpdateMetamodel).toHaveBeenCalledTimes(1);
  });

  it('requires both classes before saving', () => {
    render(<SpatialRulesEditor metamodel={metamodel} onUpdateMetamodel={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Rule' }));
    fireEvent.change(screen.getByLabelText('Rule name'), { target: { value: 'Incomplete' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('Choose both a source class and a target class.')).toBeInTheDocument();
    expect(metamodelService.updateMetamodel).not.toHaveBeenCalled();
  });

  it('deletes a rule and hides editing controls when read-only', () => {
    const { rerender } = render(<SpatialRulesEditor metamodel={metamodel} onUpdateMetamodel={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Conveyors apart' }));
    expect(metamodelService.updateMetamodel).toHaveBeenCalledWith('mm-1', expect.objectContaining({ spatialRules: [] }));

    rerender(<SpatialRulesEditor metamodel={metamodel} readOnly onUpdateMetamodel={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Delete Conveyors apart' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Rule' })).toBeDisabled();
  });
});
