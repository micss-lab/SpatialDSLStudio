import { ApiClient, authApi } from '../../services/core/api.client';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock window.dispatchEvent
window.dispatchEvent = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  localStorageMock.clear();
  (window.dispatchEvent as jest.Mock).mockClear();
});

describe('ApiClient', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient('http://localhost:3001/api');
  });

  describe('getToken / setToken / removeToken', () => {
    it('stores and retrieves token', () => {
      client.setToken('my-token-123');
      expect(client.getToken()).toBe('my-token-123');
    });

    it('removes token', () => {
      client.setToken('my-token-123');
      client.removeToken();
      expect(client.getToken()).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('returns false when no token', () => {
      expect(client.isAuthenticated()).toBe(false);
    });

    it('returns true when token exists', () => {
      client.setToken('my-token');
      expect(client.isAuthenticated()).toBe(true);
    });
  });

  describe('get', () => {
    it('sends GET request with auth header', async () => {
      client.setToken('test-token');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { id: '1' } }),
      });

      const result = await client.get<{ id: string }>('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
      expect(result).toEqual({ id: '1' });
    });

    it('sends GET without auth when no token', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: {} }),
      });

      await client.get('/test');

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers.Authorization).toBeUndefined();
    });

    it('scopes artifact endpoints to the active project', async () => {
      client.setProjectId('project-1');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: [] }),
      });

      await client.get('/models?metamodelId=metamodel-1');
      await client.get('/diagrams/view-1');

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'http://localhost:3001/api/projects/project-1/models?metamodelId=metamodel-1',
        expect.objectContaining({ method: 'GET' })
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'http://localhost:3001/api/projects/project-1/views/view-1',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('does not rewrite project-management endpoints', async () => {
      client.setProjectId('project-1');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: [] }),
      });

      await client.get('/projects?includeArchived=true');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/projects?includeArchived=true',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('post', () => {
    it('sends POST request with JSON body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { created: true } }),
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const result = await client.post('/test', { name: 'value' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'value' }),
        })
      );
    });
  });

  describe('401 handling', () => {
    it('removes token and dispatches event on 401 when token exists', async () => {
      client.setToken('expired-token');
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ success: false, error: 'Unauthorized' }),
      });

      await expect(client.get('/test')).rejects.toThrow('Authentication required');
      expect(client.getToken()).toBeNull();
      expect(window.dispatchEvent).toHaveBeenCalled();
    });

    it('does not dispatch unauthorized event on 401 without token', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ success: false, error: 'Unauthorized' }),
      });

      await expect(client.get('/test')).rejects.toThrow('Authentication required');
      expect(window.dispatchEvent).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('throws error when response is not ok', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ success: false, error: 'Not found' }),
      });

      await expect(client.get('/test')).rejects.toThrow('Not found');
    });

    it('throws error when success is false', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: false, error: 'Business error' }),
      });

      await expect(client.get('/test')).rejects.toThrow('Business error');
    });
  });

  describe('put', () => {
    it('sends PUT request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { updated: true } }),
      });

      await client.put('/test/1', { name: 'updated' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/test/1',
        expect.objectContaining({ method: 'PUT' })
      );
    });
  });

  describe('delete', () => {
    it('sends DELETE request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: null }),
      });

      await client.delete('/test/1');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/test/1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });
});

describe('authApi', () => {
  describe('login', () => {
    it('sends login request and returns auth response', async () => {
      const mockResponse = {
        user: { id: '1', email: 'test@example.com', role: 'DSL_DESIGNER', createdAt: '2024-01-01' },
        token: 'jwt-token',
        expiresIn: '7d',
      };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await authApi.login({ email: 'test@example.com', password: 'password123' });

      expect(result.token).toBe('jwt-token');
      expect(result.user.email).toBe('test@example.com');
    });

    it('throws error when login fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Invalid credentials' }),
      });

      await expect(authApi.login({ email: 'test@example.com', password: 'wrong' }))
        .rejects.toThrow('Invalid credentials');
    });
  });

  describe('register', () => {
    it('sends register request', async () => {
      const mockResponse = {
        email: 'new@example.com',
        verificationRequired: true,
        message: 'Account created. Enter the verification code sent to your email to finish registration.',
      };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      });

      const result = await authApi.register({ email: 'new@example.com', password: 'password123' });

      expect(result).toEqual(mockResponse);
      expect(result.verificationRequired).toBe(true);
    });
  });

  describe('verifyEmail', () => {
    it('returns auth response after email verification', async () => {
      const mockResponse = {
        user: { id: '1', email: 'new@example.com', role: 'VIEWER', createdAt: '2024-01-01' },
        token: 'jwt-token',
        expiresIn: '7d',
      };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await authApi.verifyEmail({ email: 'new@example.com', code: '123456' });

      expect(result.token).toBe('jwt-token');
    });
  });

  describe('verifyToken', () => {
    it('returns validity result', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ valid: true, user: { id: '1', email: 'test@example.com' } }),
      });

      const result = await authApi.verifyToken('some-token');

      expect(result.valid).toBe(true);
    });
  });
});
