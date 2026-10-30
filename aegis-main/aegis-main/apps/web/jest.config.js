module.exports = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // e2e/ (Playwright `test:e2e`) e e2e-record/ (Playwright `playwright.record.config.ts`)
  // são specs do runner do Playwright — importam @playwright/test e NÃO rodam sob jest.
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/', '<rootDir>/e2e/', '<rootDir>/e2e-record/'],
  moduleNameMapper: {
    '^@/components/(.*)$': '<rootDir>/components/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
    '^@/app/(.*)$': '<rootDir>/app/$1',
    '^@/styles/(.*)$': '<rootDir>/styles/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['next/babel'] }],
  },
  transformIgnorePatterns: [
    // d3-force-3d e seus deps são ESM-only; deixar passar pelo babel.
    '/node_modules/(?!(d3-force-3d|d3-binarytree|d3-dispatch|d3-octree|d3-quadtree|d3-timer)/)',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  moduleDirectories: ['node_modules', '<rootDir>'],
};
