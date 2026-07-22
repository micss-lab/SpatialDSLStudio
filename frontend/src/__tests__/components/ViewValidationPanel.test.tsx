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
});
