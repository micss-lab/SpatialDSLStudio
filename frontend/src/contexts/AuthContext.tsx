import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef, useMemo } from 'react';
import { apiClient, authApi, AuthUser, AuthResponse, UserRole } from '../services/core';
import { clearProjectCachesLocal } from '../services/project-session.service';

// Role hierarchy for permission checking (higher index = more permissions)
const ROLE_HIERARCHY: UserRole[] = ['VIEWER', 'MODELER', 'DSL_DESIGNER', 'ADMIN'];

// Operations that each role can perform
const ROLE_OPERATIONS: Record<UserRole, Set<string>> = {
  ADMIN: new Set(['create', 'edit', 'delete', 'share', 'view', 'manage_users']),
  DSL_DESIGNER: new Set(['create', 'edit', 'delete', 'share', 'view']),
  MODELER: new Set(['edit', 'view']),
  VIEWER: new Set(['view']),
};

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerificationCode: (email: string) => Promise<void>;
  logout: () => void;
  error: string | null;
  clearError: () => void;
  registrationSuccess: boolean;
  clearRegistrationSuccess: () => void;
  // Role-based access control helpers
  role: UserRole | null;
  canCreate: boolean;
  canEdit: boolean;
  canEditMetamodel: boolean; // True only for DSL_DESIGNER/ADMIN - metamodels require higher privileges
  canDelete: boolean;
  canShare: boolean;
  isAdmin: boolean;
  hasRole: (requiredRole: UserRole) => boolean;
  canPerformOperation: (operation: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  // Track if user is manually logging out to prevent "session expired" message
  const isLoggingOutRef = useRef(false);

  // Check if user is already logged in on mount
  useEffect(() => {
    const initAuth = async () => {
      const token = apiClient.getToken();
      if (token) {
        try {
          const result = await authApi.verifyToken(token);
          if (result.valid && result.user) {
            clearProjectCachesLocal();
            setUser(result.user);
          } else {
            apiClient.removeToken();
          }
        } catch (err) {
          console.error('Token verification failed:', err);
          apiClient.removeToken();
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  // Listen for unauthorized events (e.g., token expired)
  useEffect(() => {
    const handleUnauthorized = () => {
      // Don't show session expired message if user manually logged out
      if (!isLoggingOutRef.current) {
        setUser(null);
        setError('Your session has expired. Please log in again.');
      }
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response: AuthResponse = await authApi.login({ email, password });
      apiClient.setToken(response.token);
      // Artifact services are loaded only after the user opens a project.
      clearProjectCachesLocal();
      setUser(response.user);
    } catch (err: any) {
      setError(err.message || 'Login failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    setRegistrationSuccess(false);
    try {
      // Register but don't auto-login - user should login manually
      await authApi.register({ email, password });
      // Don't set token or user - just show success and redirect to login
      setRegistrationSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const verifyEmail = useCallback(async (email: string, code: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response: AuthResponse = await authApi.verifyEmail({ email, code });
      apiClient.setToken(response.token);
      clearProjectCachesLocal();
      setUser(response.user);
      setRegistrationSuccess(false);
    } catch (err: any) {
      setError(err.message || 'Email verification failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const resendVerificationCode = useCallback(async (email: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await authApi.resendVerificationCode(email);
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification code');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    // Set flag to prevent "session expired" message
    isLoggingOutRef.current = true;
    apiClient.removeToken();
    apiClient.setProjectId(null);
    setUser(null);
    setError(null);
    // Clear all service caches locally (no API calls to avoid 401)
    clearProjectCachesLocal();
    // Reset the flag after a short delay
    setTimeout(() => {
      isLoggingOutRef.current = false;
    }, 100);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearRegistrationSuccess = useCallback(() => {
    setRegistrationSuccess(false);
  }, []);

  // Role-based access control helpers
  const role = user?.role ?? null;

  const hasRole = useCallback((requiredRole: UserRole): boolean => {
    if (!role) return false;
    const userRoleIndex = ROLE_HIERARCHY.indexOf(role);
    const requiredRoleIndex = ROLE_HIERARCHY.indexOf(requiredRole);
    return userRoleIndex >= requiredRoleIndex;
  }, [role]);

  const canPerformOperation = useCallback((operation: string): boolean => {
    if (!role) return false;
    return ROLE_OPERATIONS[role]?.has(operation) ?? false;
  }, [role]);

  // Memoized permission flags
  const permissions = useMemo(() => ({
    canCreate: role ? ROLE_OPERATIONS[role].has('create') : false,
    canEdit: role ? ROLE_OPERATIONS[role].has('edit') : false,
    canEditMetamodel: role === 'ADMIN' || role === 'DSL_DESIGNER', // Only DSL_DESIGNER and ADMIN can edit metamodels
    canDelete: role ? ROLE_OPERATIONS[role].has('delete') : false,
    canShare: role ? ROLE_OPERATIONS[role].has('share') : false,
    isAdmin: role === 'ADMIN',
  }), [role]);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    verifyEmail,
    resendVerificationCode,
    logout,
    error,
    clearError,
    registrationSuccess,
    clearRegistrationSuccess,
    // Role-based access control
    role,
    ...permissions,
    hasRole,
    canPerformOperation,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
