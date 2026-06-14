import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.js'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      thresholds: {
        // Global minimum — per-file entries below override for critical files
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0,
        perFile: true,
        // Critical game logic — enforce higher standards
        'src/game.js': {
          statements: 60,
          branches: 55,
          functions: 60,
          lines: 60,
        },
        'src/monster.js': {
          statements: 60,
          branches: 78,
          functions: 45,
          lines: 62,
        },
        'src/troop.js': {
          statements: 70,
          branches: 75,
          functions: 63,
          lines: 73,
        },
      },
    },
  },
});
