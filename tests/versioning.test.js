import { describe, it, expect } from 'vitest';
import { isPrerelease, parseVersion, isNewerThan } from '../src/versionUtils.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8'));

describe('version consistency', () => {
  it('package.json version exists', () => {
    expect(pkg.version).toBeDefined();
    expect(typeof pkg.version).toBe('string');
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('versionUtils functions work', () => {
    expect(typeof isPrerelease).toBe('function');
    expect(typeof parseVersion).toBe('function');
    expect(typeof isNewerThan).toBe('function');
  });
});

describe('isPrerelease', () => {
  it('detects beta', () => {
    expect(isPrerelease('1.6.0-beta.2')).toBe(true);
  });
  it('detects alpha', () => {
    expect(isPrerelease('1.0.0-alpha.1')).toBe(true);
  });
  it('detects rc', () => {
    expect(isPrerelease('2.0.0-rc.1')).toBe(true);
  });
  it('returns false for stable', () => {
    expect(isPrerelease('1.5.0')).toBe(false);
  });
  it('returns false for null/undefined/empty', () => {
    expect(isPrerelease(null)).toBe(false);
    expect(isPrerelease(undefined)).toBe(false);
    expect(isPrerelease('')).toBe(false);
  });
});

describe('parseVersion', () => {
  it('parses full semver', () => {
    expect(parseVersion('1.6.0-beta.2')).toEqual({ major: 1, minor: 6, patch: 0, prerelease: ['beta', 2] });
  });
  it('parses stable', () => {
    expect(parseVersion('1.5.0')).toEqual({ major: 1, minor: 5, patch: 0, prerelease: [] });
  });
  it('handles null/undefined', () => {
    expect(parseVersion(null)).toEqual({ major: 0, minor: 0, patch: 0, prerelease: [] });
    expect(parseVersion(undefined)).toEqual({ major: 0, minor: 0, patch: 0, prerelease: [] });
    expect(parseVersion('')).toEqual({ major: 0, minor: 0, patch: 0, prerelease: [] });
  });
  it('parses prerelease with dots', () => {
    const v = parseVersion('2.0.0-rc.3.build.123');
    expect(v.major).toBe(2);
    expect(v.prerelease).toContain('rc');
    expect(v.prerelease).toContain(3);
  });
});

describe('isNewerThan', () => {
  it('major version', () => {
    expect(isNewerThan('2.0.0', '1.0.0')).toBe(true);
  });
  it('minor version', () => {
    expect(isNewerThan('1.5.0', '1.4.0')).toBe(true);
  });
  it('patch version', () => {
    expect(isNewerThan('1.0.1', '1.0.0')).toBe(true);
  });
  it('prerelease to stable', () => {
    expect(isNewerThan('1.0.0', '1.0.0-beta.1')).toBe(true);
  });
  it('stable to prerelease', () => {
    expect(isNewerThan('1.0.0-beta.2', '1.0.0')).toBe(false);
  });
  it('newer prerelease', () => {
    expect(isNewerThan('1.0.0-beta.2', '1.0.0-beta.1')).toBe(true);
  });
  it('same version', () => {
    expect(isNewerThan('1.0.0', '1.0.0')).toBe(false);
  });
  it('older version', () => {
    expect(isNewerThan('1.0.0', '1.1.0')).toBe(false);
  });

  it('prerelease comparison string vs number', () => {
    expect(isNewerThan('1.0.0-alpha', '1.0.0-beta')).toBe(false);
  });

  it('same prerelease length but different values', () => {
    expect(isNewerThan('1.0.0-1', '1.0.0-2')).toBe(false);
  });
});
