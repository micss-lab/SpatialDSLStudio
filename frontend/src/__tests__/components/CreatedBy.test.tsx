import React from 'react';
import { render, screen } from '@testing-library/react';
import { resolveOwnerEmail } from '../../services/common/ownership';

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'me@example.com' } }),
}));

// Imported after the mock so CreatedBy picks up the mocked useAuth.
import CreatedBy from '../../components/common/CreatedBy';

describe('resolveOwnerEmail', () => {
  it('prefers the resource ownerEmail', () => {
    expect(resolveOwnerEmail({ ownerEmail: 'other@example.com' }, 'me@example.com')).toBe(
      'other@example.com'
    );
  });

  it('falls back to the current user when ownerEmail is absent', () => {
    expect(resolveOwnerEmail({ isOwner: true }, 'me@example.com')).toBe('me@example.com');
  });
});

describe('CreatedBy', () => {
  it("shows another user's email for resources the current user does not own", () => {
    render(<CreatedBy isOwner={false} ownerEmail="other@example.com" />);
    expect(screen.getByText('Created by other@example.com')).toBeInTheDocument();
  });

  it('marks the current user as the owner', () => {
    render(<CreatedBy isOwner />);
    expect(screen.getByText('Created by me@example.com (you)')).toBeInTheDocument();
  });
});
