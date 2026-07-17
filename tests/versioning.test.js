import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SaveSerializer } from '../src/gamePersistence.js';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const packageLockJson = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

describe('beta release versioning', () => {
  it('uses beta release 1.6.0-beta.2 across release metadata', () => {
    expect(packageJson.version).toBe('1.6.0-beta.2');
    expect(packageLockJson.version).toBe('1.6.0-beta.2');
    expect(packageLockJson.packages[''].version).toBe('1.6.0-beta.2');
  });

  it('serializes saves with provided version', () => {
    const data = SaveSerializer.fromGame(
      {
        gold: 100,
        lives: 25,
        seed: 42,
        speed: 1,
        devMode: false,
        devMonsterCounts: {},
        wave: { currentWave: 0 },
        troops: [],
      },
      '1.6.0-beta.2'
    );

    expect(data.version).toBe('1.6.0-beta.2');
  });
});
