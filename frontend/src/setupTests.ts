// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock Monaco Editor - heavy dependency that doesn't work in jsdom
jest.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: () => null,
}));

// Mock Three.js / React Three Fiber
jest.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: any) => children,
  useFrame: jest.fn(),
  useThree: () => ({ camera: {}, gl: {}, scene: {} }),
  extend: jest.fn(),
}));

jest.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  Grid: () => null,
  Line: () => null,
  Text: () => null,
  Html: ({ children }: any) => children,
  useGLTF: () => ({ scene: {} }),
  Billboard: ({ children }: any) => children,
}));

// Mock react-konva
jest.mock('react-konva', () => ({
  Stage: ({ children }: any) => children,
  Layer: ({ children }: any) => children,
  Rect: () => null,
  Circle: () => null,
  Text: () => null,
  Arrow: () => null,
  Group: ({ children }: any) => children,
  Line: () => null,
}));

// Mock window.URL.createObjectURL / revokeObjectURL without overwriting the URL constructor
if (typeof window.URL.createObjectURL === 'undefined') {
  Object.defineProperty(window.URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: jest.fn(() => 'mocked-url'),
  });
} else {
  window.URL.createObjectURL = jest.fn(() => 'mocked-url');
}
if (typeof window.URL.revokeObjectURL === 'undefined') {
  Object.defineProperty(window.URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: jest.fn(),
  });
} else {
  window.URL.revokeObjectURL = jest.fn();
}

// Suppress console.error for specific well-known React warnings in tests
let consoleErrorSpy: jest.SpyInstance;
beforeAll(() => {
  const originalConsoleError = console.error.bind(console);
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('ReactDOM.render is no longer supported') ||
        args[0].includes('Warning: An update to') ||
        args[0].includes('Warning: validateDOMNesting'))
    ) {
      return;
    }
    originalConsoleError(...args);
  });
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
});
