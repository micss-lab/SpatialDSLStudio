/**
 * API Client for communicating with the backend server
 * This module provides a centralized way to make HTTP requests
 */

// Configuration - can be overridden via environment variables
const API_BASE_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:3001/api' : '/api');

if (!API_BASE_URL) {
  throw new Error('REACT_APP_API_URL is required for non-development environments');
}

const isAbsoluteHttpUrl = /^https?:\/\//i.test(API_BASE_URL);

if (process.env.NODE_ENV === 'production' && isAbsoluteHttpUrl && !API_BASE_URL.startsWith('https://')) {
  throw new Error('REACT_APP_API_URL must use HTTPS in production');
}

// Token storage key
const TOKEN_KEY = 'auth_token';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  headers?: Record<string, string>;
  skipAuth?: boolean; // Skip authentication for public endpoints
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Get the stored authentication token
   */
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  /**
   * Set the authentication token
   */
  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  }

  /**
   * Remove the authentication token
   */
  removeToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  /**
   * Make an HTTP request to the API
   */
  private async request<T>(endpoint: string, options: RequestOptions): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    let hadAuthToken = false;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Add authentication header if token exists and not skipping auth
    if (!options.skipAuth) {
      const token = this.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        hadAuthToken = true;
      }
    }

    const config: RequestInit = {
      method: options.method,
      headers,
    };

    if (options.body && options.method !== 'GET') {
      config.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, config);
      
      // Handle 401 Unauthorized - token expired or invalid
      if (response.status === 401) {
        this.removeToken();
        // Only notify session-expired when there was an authenticated session.
        if (hadAuthToken) {
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        }
        throw new Error('Authentication required. Please log in again.');
      }
      
      const data: ApiResponse<T> = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      return data.data as T;
    } catch (error) {
      console.error(`API request failed: ${options.method} ${endpoint}`, error);
      throw error;
    }
  }

  /**
   * Upload a file using multipart/form-data
   */
  async uploadFile(
    endpoint: string, 
    file: File, 
    additionalData?: Record<string, any>
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    let hadAuthToken = false;
    const formData = new FormData();
    formData.append('file', file);

    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        if (typeof value === 'object') {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, String(value));
        }
      });
    }

    try {
      const headers: Record<string, string> = {};
      const token = this.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        hadAuthToken = true;
      }

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers,
        // Don't set Content-Type header - browser will set it with boundary
      });

      // Handle 401 Unauthorized
      if (response.status === 401) {
        this.removeToken();
        if (hadAuthToken) {
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        }
        throw new Error('Authentication required. Please log in again.');
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Upload failed: ${response.status}`);
      }

      return data.data;
    } catch (error) {
      console.error(`File upload failed: ${endpoint}`, error);
      throw error;
    }
  }

  /**
   * Download a file
   */
  async downloadFile(endpoint: string): Promise<Blob> {
    const url = `${this.baseUrl}${endpoint}`;
    let hadAuthToken = false;

    try {
      const headers: Record<string, string> = {};
      const token = this.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        hadAuthToken = true;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      // Handle 401 Unauthorized
      if (response.status === 401) {
        this.removeToken();
        if (hadAuthToken) {
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        }
        throw new Error('Authentication required. Please log in again.');
      }

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      return await response.blob();
    } catch (error) {
      console.error(`File download failed: ${endpoint}`, error);
      throw error;
    }
  }

  // GET request
  get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  // POST request
  post<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, { method: 'POST', body });
  }

  // PUT request
  put<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, { method: 'PUT', body });
  }

  // DELETE request
  delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // PATCH request
  patch<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, { method: 'PATCH', body });
  }
}

// Create a singleton instance
export const apiClient = new ApiClient();

// Export the class for custom instances
export { ApiClient };

// API endpoint constants
export const API_ENDPOINTS = {
  // Auth
  AUTH_LOGIN: '/auth/login',
  AUTH_REGISTER: '/auth/register',
  AUTH_VERIFY_EMAIL: '/auth/verify-email',
  AUTH_RESEND_VERIFICATION_CODE: '/auth/resend-verification-code',
  AUTH_ME: '/auth/me',
  AUTH_VERIFY: '/auth/verify',
  AUTH_CHANGE_PASSWORD: '/auth/change-password',
  AUTH_FORGOT_PASSWORD: '/auth/forgot-password',
  AUTH_RESET_PASSWORD: '/auth/reset-password',

  // Role Requests
  ROLE_REQUESTS: '/role-requests',
  ROLE_REQUESTS_MY: '/role-requests/my',
  
  // Health
  HEALTH: '/health',
  
  // EPackages (Meta-metamodel)
  EPACKAGES: '/epackages',
  EPACKAGES_CORE: '/epackages/core',
  
  // Metamodels
  METAMODELS: '/metamodels',
  
  // Models
  MODELS: '/models',
  
  // Diagrams
  DIAGRAMS: '/diagrams',

  // Viewpoints
  VIEWPOINTS: '/viewpoints',

  // Interoperability
  SIRIUS_VALIDATE: '/interoperability/sirius/validate',
  SIRIUS_IMPORT: '/interoperability/sirius/import',
  SIRIUS_AIRD_IMPORT: '/interoperability/sirius/aird/import',
  SIRIUS_EXPORT: '/interoperability/sirius/export',
  
  // Transformations
  TRANSFORMATION_PATTERNS: '/transformations/patterns',
  TRANSFORMATION_RULES: '/transformations/rules',
  TRANSFORMATION_EXECUTE: '/transformations/execute',
  TRANSFORMATION_EXECUTIONS: '/transformations/executions',
  
  // Code Generation
  CODEGEN_PROJECTS: '/codegen/projects',
  CODEGEN_GENERATE: '/codegen/generate',
  CODEGEN_PREVIEW: '/codegen/preview',
  CODEGEN_DOWNLOAD: '/codegen/download',
  
  // Tests
  TEST_CASES: '/tests/cases',
  TEST_RUN: '/tests/run',
  TEST_GENERATE: '/tests/generate',
  
  // Files
  FILES: '/files',
  FILES_UPLOAD: '/files/upload',
  FILES_UPLOAD_BASE64: '/files/upload-base64',
  FILES_STATS: '/files/stats',
};

// Auth API types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface RegistrationPendingResponse {
  email: string;
  verificationRequired: true;
  message: string;
}

export interface VerifyEmailRequest {
  email: string;
  code: string;
}

// User role enum (matches backend)
export type UserRole = 'ADMIN' | 'DSL_DESIGNER' | 'MODELER' | 'VIEWER';

// Resource type enum (matches backend)
export type ResourceType = 'METAMODEL' | 'MODEL' | 'DIAGRAM' | 'TRANSFORMATION_RULE' | 'CODEGEN_PROJECT' | 'TEST_CASE';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
  expiresIn: string;
}

// Auth API methods
export const authApi = {
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.AUTH_LOGIN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Login failed');
    }
    return result;
  },

  register: async (data: RegisterRequest): Promise<RegistrationPendingResponse> => {
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.AUTH_REGISTER}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Registration failed');
    }
    return result;
  },

  verifyEmail: async (data: VerifyEmailRequest): Promise<AuthResponse> => {
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.AUTH_VERIFY_EMAIL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Email verification failed');
    }
    return result;
  },

  resendVerificationCode: async (email: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.AUTH_RESEND_VERIFICATION_CODE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to resend verification code');
    }
    return result;
  },

  getCurrentUser: async (): Promise<{ user: AuthUser }> => {
    const token = apiClient.getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.AUTH_ME}`, {
      method: 'GET',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to get user');
    }
    return result;
  },

  verifyToken: async (token: string): Promise<{ valid: boolean; user?: AuthUser }> => {
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.AUTH_VERIFY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const result = await response.json();
    return result;
  },

  forgotPassword: async (email: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.AUTH_FORGOT_PASSWORD}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to send reset email');
    }
    return result;
  },

  resetPassword: async (token: string, newPassword: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.AUTH_RESET_PASSWORD}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to reset password');
    }
    return result;
  },
};

export default apiClient;
