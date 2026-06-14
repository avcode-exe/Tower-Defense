import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SaveSerializer } from '../src/gamePersistence.js';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const packageLockJson = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

describe('stable release versioning', () => {
  it('uses stable release 1.5.2 across release metadata', () => {
    expect(packageJson.version).toBe('1.5.2');
    expect(packageLockJson.version).toBe('1.5.2');
    expect(packageLockJson.packages[''].version).toBe('1.5.2');
  });

  it('serializes stable 1.5.2 saves', () => {
    const data = SaveSerializer.fromGame({
      gold: 100,
      lives: 25,
      seed: 42,
      speed: 1,
      devMode: false,
      devMonsterCounts: {},
      wave: { currentWave: 0 },
      troops: [],
    });

    expect(data.version).toBe('1.5.2');
  });
});
