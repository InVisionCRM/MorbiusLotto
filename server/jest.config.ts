import type { Config } from 'jest';

const tsJestGlobals = {
  'ts-jest': {
    tsconfig: '<rootDir>/tsconfig.json',
  },
};

const config: Config = {
  testTimeout: 30000,
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/src/__tests__'],
      testMatch: ['**/*.unit.test.ts'],
      setupFilesAfterEnv: [],
      globals: tsJestGlobals,
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/src/__tests__'],
      testMatch: ['**/*.test.ts'],
      testPathIgnorePatterns: ['\\.unit\\.test\\.ts$'],
      setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
      globals: tsJestGlobals,
    },
  ],
};

export default config;
