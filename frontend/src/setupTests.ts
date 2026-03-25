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

// Mock window.URL.createObjectURL
Object.defineProperty(window, 'URL', {
  writable: true,
  value: {
    createObjectURL: jest.fn(() => 'mocked-url'),
    revokeObjectURL: jest.fn(),
  },
});

// Suppress console.error for specific well-known warnings in tests
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('ReactDOM.render is no longer supported') ||
      args[0].includes('Warning: An update to') ||
      args[0].includes('Warning: validateDOMNesting'))
  ) {
    return;
  }
  originalConsoleError.call(console, ...args);
};
