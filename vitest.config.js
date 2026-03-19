
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.test.js',
        '**/*.spec.js',
        'coverage/',
        'dist/',
        'build/',
        '*.config.js',
        'vitest.config.js'
      ],
      include: [
        'game.js',
        'functions/**/*.js'
      ],
      all: true,
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80
    },
    include: ['tests/**/*.test.js'],
    testTimeout: 10000,
    hookTimeout: 10000
  }
});
