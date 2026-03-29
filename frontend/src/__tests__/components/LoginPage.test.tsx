import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the auth context
const mockLogin = jest.fn();
const mockRegister = jest.fn();
const mockClearError = jest.fn();
const mockClearRegistrationSuccess = jest.fn();

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    register: mockRegister,
    error: null,
    clearError: mockClearError,
    isLoading: false,
    registrationSuccess: false,
    clearRegistrationSuccess: mockClearRegistrationSuccess,
  }),
}));

import LoginPage from '../../components/auth/LoginPage';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('LoginPage', () => {
  it('renders login form by default', () => {
    render(<LoginPage />);

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('renders email and password fields', () => {
    render(<LoginPage />);

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('shows validation error when email is empty', async () => {
    render(<LoginPage />);

    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    });
  });

  it('calls login with email and password on submit', async () => {
    mockLogin.mockResolvedValue(undefined);
    render(<LoginPage />);

    const emailField = screen.getByLabelText(/email address/i);
    const passwordField = screen.getByLabelText(/password/i);

    await userEvent.type(emailField, 'test@example.com');
    await userEvent.type(passwordField, 'password123');

    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
    });
  });

  it('can switch to register mode', async () => {
    render(<LoginPage />);

    const createAccountLink = screen.getByText(/create account/i);
    fireEvent.click(createAccountLink);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    });
  });
});

describe('LoginPage in register mode', () => {
  it('renders register form when switched to register mode', async () => {
    render(<LoginPage />);

    const createAccountLink = screen.getByText(/create account/i);
    fireEvent.click(createAccountLink);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    });
  });

  it('shows error when passwords do not match in register mode', async () => {
    render(<LoginPage />);

    const createAccountLink = screen.getByText(/create account/i);
    fireEvent.click(createAccountLink);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    });

    const emailField = screen.getByLabelText(/email address/i);
    const passwordFields = screen.getAllByLabelText(/password/i);

    await userEvent.type(emailField, 'test@example.com');
    await userEvent.type(passwordFields[0], 'password123');
    await userEvent.type(passwordFields[1], 'differentpassword');

    const submitBtn = screen.getByRole('button', { name: /create account/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });
});
