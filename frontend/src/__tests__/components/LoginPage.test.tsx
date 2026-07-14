import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import LoginPage from '../../components/auth/LoginPage';

// Mock the auth context
const mockLogin = jest.fn();
const mockRegister = jest.fn();
const mockVerifyEmail = jest.fn();
const mockResendVerificationCode = jest.fn();
const mockClearError = jest.fn();
const mockClearRegistrationSuccess = jest.fn();

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    register: mockRegister,
    verifyEmail: mockVerifyEmail,
    resendVerificationCode: mockResendVerificationCode,
    error: null,
    clearError: mockClearError,
    isLoading: false,
    registrationSuccess: false,
    clearRegistrationSuccess: mockClearRegistrationSuccess,
  }),
}));

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

describe('LoginPage in verify mode', () => {
  // Reaches verify mode the same way a user does: an unverified login attempt
  const enterVerifyMode = async (email = 'test@example.com') => {
    mockLogin.mockRejectedValue(new Error('Email verification required'));
    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/email address/i), email);
    await userEvent.type(screen.getByLabelText(/^password/i), 'password123');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    });
  };

  it('renders an editable email field prefilled with the login email', async () => {
    await enterVerifyMode('test@example.com');

    const emailField = screen.getByLabelText(/email address/i);
    expect(emailField).toHaveValue('test@example.com');
    expect(emailField).toBeEnabled();
  });

  it('submits the visible email along with the code', async () => {
    mockVerifyEmail.mockResolvedValue(undefined);
    await enterVerifyMode('test@example.com');

    await userEvent.type(screen.getByLabelText(/verification code/i), '123456');
    fireEvent.click(screen.getByRole('button', { name: /verify email/i }));

    await waitFor(() => {
      expect(mockVerifyEmail).toHaveBeenCalledWith('test@example.com', '123456');
    });
  });

  it('submits an edited email address', async () => {
    mockVerifyEmail.mockResolvedValue(undefined);
    await enterVerifyMode('test@example.com');

    const emailField = screen.getByLabelText(/email address/i);
    await userEvent.clear(emailField);
    await userEvent.type(emailField, 'other@example.com');
    await userEvent.type(screen.getByLabelText(/verification code/i), '654321');
    fireEvent.click(screen.getByRole('button', { name: /verify email/i }));

    await waitFor(() => {
      expect(mockVerifyEmail).toHaveBeenCalledWith('other@example.com', '654321');
    });
  });

  it('shows a validation error instead of a dead end when email is cleared', async () => {
    await enterVerifyMode('test@example.com');

    await userEvent.clear(screen.getByLabelText(/email address/i));
    await userEvent.type(screen.getByLabelText(/verification code/i), '123456');
    fireEvent.click(screen.getByRole('button', { name: /verify email/i }));

    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    });
    expect(mockVerifyEmail).not.toHaveBeenCalled();
    // The field stays on screen so the user can recover
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
  });

  it('resends the code to the visible email', async () => {
    mockResendVerificationCode.mockResolvedValue(undefined);
    await enterVerifyMode('test@example.com');

    fireEvent.click(screen.getByText(/resend code/i));

    await waitFor(() => {
      expect(mockResendVerificationCode).toHaveBeenCalledWith('test@example.com');
    });
  });
});
