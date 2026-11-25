import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ViewValidationPanel from '../../components/diagram/ViewValidationPanel';

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
});
