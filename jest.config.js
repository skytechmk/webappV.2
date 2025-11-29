// Jest configuration for testing
export default {
    // Test environment
    testEnvironment: 'jsdom',

    // Setup files
    setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],

    // Test file patterns
    testMatch: [
        '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
        '<rootDir>/src/**/*.{test,spec}.{js,jsx,ts,tsx}',
        '<rootDir>/components/**/__tests__/**/*.{js,jsx,ts,tsx}',
        '<rootDir>/components/**/*.{test,spec}.{js,jsx,ts,tsx}',
        '<rootDir>/utils/**/__tests__/**/*.{js,ts}',
        '<rootDir>/utils/**/*.{test,spec}.{js,ts}',
        '<rootDir>/services/**/__tests__/**/*.{js,ts}',
        '<rootDir>/services/**/*.{test,spec}.{js,ts}',
        '<rootDir>/server/**/__tests__/**/*.{js,ts}',
        '<rootDir>/server/**/*.{test,spec}.{js,ts}'
    ],

    // Module file extensions
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

    // Module name mapping
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^~/(.*)$': '<rootDir>/$1',
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
        '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/src/__mocks__/fileMock.js'
    },

    // Transform files
    transform: {
        '^.+\\.(ts|tsx)$': 'ts-jest',
        '^.+\\.(js|jsx)$': 'babel-jest'
    },

    // Coverage configuration
    collectCoverageFrom: [
        'src/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        'utils/**/*.{ts,js}',
        'services/**/*.{ts,js}',
        'server/**/*.{js,ts}',
        '!src/**/*.d.ts',
        '!src/main.tsx',
        '!src/vite-env.d.ts',
        '!components/**/*.d.ts',
        '!server/index.js',
        '!**/node_modules/**',
        '!**/dist/**',
        '!**/coverage/**'
    ],

    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],

    // Test timeout
    testTimeout: 10000,

    // Ignore patterns
    testPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/'],

    // Global setup
    globalSetup: '<rootDir>/src/test-setup.js',

    // Clear mocks between tests
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true
};