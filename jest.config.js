export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  extensionsToTreatAsEsm: ['.ts'],
  setupFiles: ['<rootDir>/tests/jest.setup.ts'],
  transform: {
    '^.+\\.ts$': [ 'ts-jest', { useESM: true } ]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
}; 