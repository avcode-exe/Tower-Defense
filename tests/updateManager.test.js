import { describe, expect, it } from 'vitest';
import { UpdateManager } from '../src/updateManager.js';

function manager(version, channel) {
  return Object.assign(Object.create(UpdateManager.prototype), {
    settings: {
      version,
      update: {
        channel,
        skippedVersions: [],
      },
    },
  });
}

describe('UpdateManager.passesFilter', () => {
  it('rejects prereleases on the release channel', () => {
    expect(manager('1.5.0-beta.1', 'release').passesFilter({ version: '1.5.1-beta.1' })).toBe(false);
  });

  it('rejects the current stable version', () => {
    expect(manager('1.5.0', 'release').passesFilter({ version: '1.5.0' })).toBe(false);
  });

  it('accepts newer stable versions on the release channel', () => {
    expect(manager('1.5.0', 'release').passesFilter({ version: '1.5.1' })).toBe(true);
  });

  it('rejects the current prerelease version on the pre-release channel', () => {
    expect(manager('1.5.0-beta.1', 'pre-release').passesFilter({ version: '1.5.0-beta.1' })).toBe(false);
  });

  it('accepts newer prerelease versions on the pre-release channel', () => {
    expect(manager('1.5.0-beta.1', 'pre-release').passesFilter({ version: '1.5.0-beta.2' })).toBe(true);
  });
});
