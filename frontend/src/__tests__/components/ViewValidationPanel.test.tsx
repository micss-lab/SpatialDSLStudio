import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import ViewValidationPanel from '../../components/diagram/ViewValidationPanel';
import { Diagram, ValidationIssue } from '../../models/types';
import { spatialQuickFixService } from '../../services/diagram/spatial-quick-fix.service';

jest.mock('../../services/diagram/spatial-quick-fix.service', () => ({ spatialQuickFixService: {
  preview: jest.fn(), apply: jest.fn(),
} }));

const overlap: ValidationIssue = {
  severity: 'error', message: 'Rack A overlaps Rack B', constraintId: 'overlap', location: 'spatialRules.noOverlap',
  elementId: 'rack-a', relatedElementIds: ['rack-b'],
};
const diagram: Diagram = {
  id: 'view-1', modelId: 'model-1', name: 'Warehouse', elements: [
    { id: 'view-node-a', type: 'node', modelElementId: 'rack', style: { name: 'Rack A', linkedModelElementId: 'rack-a' } },
    { id: 'rack-b', type: 'node', modelElementId: 'rack', style: { name: 'Rack B' } },
  ],
};

describe('ViewValidationPanel', () => {
  it('lists issues, refreshes validation, and navigates to an issue', () => {
    const issue = {
      severity: 'warning' as const,
      message: 'Battery reserve is low',
      elementId: 'robot-2',
      constraintId: 'battery-reserve',
    };
    const onRefresh = jest.fn();
    const onSelectIssue = jest.fn();

    render(
      <ViewValidationPanel
        issues={[issue]}
        onRefresh={onRefresh}
        onSelectIssue={onSelectIssue}
      />
    );

    expect(screen.getByTestId('view-validation-panel')).toHaveTextContent('1 issue');
    expect(screen.getByText('Battery reserve is low')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('validation-issue-0'));
    fireEvent.click(screen.getByRole('button', { name: 'Validate view' }));

    expect(onSelectIssue).toHaveBeenCalledWith(issue);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('filters the list by severity and navigates to the matching issue', () => {
    const warning = { severity: 'warning' as const, message: 'Battery reserve is low' };
    const error = { severity: 'error' as const, message: 'Rack clearance is too small' };
    const onSelectIssue = jest.fn();
    render(<ViewValidationPanel issues={[warning, error]} onRefresh={jest.fn()} onSelectIssue={onSelectIssue} />);

    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Errors' }));
    expect(screen.queryByText(warning.message)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /rack clearance is too small/i }));
    expect(onSelectIssue).toHaveBeenCalledWith(error);
  });

  it('previews either visible element and sends only the reviewed move when applying', async () => {
    const preview = jest.mocked(spatialQuickFixService.preview);
    const apply = jest.mocked(spatialQuickFixService.apply);
    preview.mockImplementation(async (_view, _model, request) => ({
      previewHash: `${request.moveElementId}-hash`, elementName: request.moveElementId, ruleName: 'No overlap',
      before: { x: 0, y: 0, z: 0 }, after: { x: 400, y: 0, z: 0 }, clearedIssues: 1,
    }));
    apply.mockResolvedValue(undefined);
    const onApplied = jest.fn();
    render(<ViewValidationPanel issues={[overlap]} onRefresh={jest.fn()} onSelectIssue={jest.fn()} quickFix={{ diagram, onApplied }} />);
    fireEvent.click(screen.getByRole('button', { name: /Preview fix for Rack A/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Proposed position')).toBeInTheDocument();
    expect(apply).not.toHaveBeenCalled();
    fireEvent.mouseDown(within(dialog).getByRole('combobox', { name: /Element to move/ }));
    fireEvent.click(screen.getByRole('option', { name: 'Rack B' }));
    expect(await within(dialog).findByText(/Applying this move updates rack-b/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply fix' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(apply).toHaveBeenCalledWith('view-1', 'model-1', {
      ruleId: 'overlap', elementId: 'rack-a', relatedElementId: 'rack-b', moveElementId: 'rack-b',
    }, 'rack-b-hash');
  });

  it('keeps the issue visible for a read-only view without a fix action', () => {
    render(<ViewValidationPanel issues={[overlap]} onRefresh={jest.fn()} onSelectIssue={jest.fn()} />);
    expect(screen.getByText(overlap.message)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Preview fix/ })).not.toBeInTheDocument();
  });

  it('shows the target selected by the server for an adjacency finding', async () => {
    const issue: ValidationIssue = {
      severity: 'warning', message: 'Rack A is outside the pathway range', constraintId: 'adjacent',
      elementId: 'rack-a', location: 'spatialRules.adjacentTo',
    };
    const preview = jest.mocked(spatialQuickFixService.preview);
    preview.mockResolvedValue({
      previewHash: 'adjacent-hash', elementName: 'Rack A', ruleName: 'Adjacent to a pathway',
      targetElementName: 'Pathway 2', before: { x: 0, y: 0, z: 0 }, after: { x: 600, y: 0, z: 0 }, clearedIssues: 1,
    });
    render(<ViewValidationPanel issues={[issue]} onRefresh={jest.fn()} onSelectIssue={jest.fn()}
      quickFix={{ diagram, onApplied: jest.fn() }} />);
    fireEvent.click(screen.getByRole('button', { name: /Preview fix for Rack A/ }));
    expect(await screen.findByText('Target element · Pathway 2')).toBeInTheDocument();
    expect(screen.getByText('Element to move · Rack A')).toBeInTheDocument();
    expect(preview).toHaveBeenCalledWith('view-1', 'model-1', { ruleId: 'adjacent', elementId: 'rack-a', moveElementId: 'rack-a' });
  });
});
