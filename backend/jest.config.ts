import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
  moduleNameMapper: {
    // Redirect ALL config/database imports to the mock singleton
    '.*/config/database(\\.ts)?$': '<rootDir>/src/__tests__/helpers/prisma.mock.ts',
    '^../../../shared/(.*)$': '<rootDir>/../shared/$1',
    '^../../shared/(.*)$': '<rootDir>/../shared/$1',
    '^../shared/(.*)$': '<rootDir>/../shared/$1',
  },
  collectCoverage: false,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/server.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        isolatedModules: true,
        strict: false,
        esModuleInterop: true,
      },
    }],
  },
};

export default config;
