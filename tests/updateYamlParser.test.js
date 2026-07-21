import { describe, it, expect, vi } from 'vitest';

describe('parseUpdateInfo', () => {
  let parseUpdateInfo;

  beforeAll(async () => {
    const mod = await import('../src/updateYamlParser.js');
    parseUpdateInfo = mod.parseUpdateInfo;
  });

  it('parses valid YAML with version and files', () => {
    const yaml = `version: 1.5.0
files:
  - url: https://example.com/update.zip
    sha2: abc123
    sha512: def456`;
    const result = parseUpdateInfo(yaml, 'latest.yml', 'https://example.com');
    expect(result.version).toBe('1.5.0');
    expect(result.files).toHaveLength(1);
    expect(result.files[0].url).toBe('https://example.com/update.zip');
    expect(result.files[0].sha2).toBe('abc123');
    expect(result.files[0].sha512).toBe('def456');
    expect(result.path).toBe('latest.yml');
    expect(result.url).toBe('https://example.com');
  });

  it('handles missing sha2 and sha512 fields', () => {
    const yaml = `version: 1.0.0
files:
  - url: https://example.com/update.zip`;
    const result = parseUpdateInfo(yaml, 'latest.yml', '');
    expect(result.files[0].sha2).toBeNull();
    expect(result.files[0].sha512).toBeNull();
  });

  it('handles non-string url as empty string', () => {
    const yaml = `version: 1.0.0
files:
  - url: 123`;
    const result = parseUpdateInfo(yaml, 'latest.yml', '');
    expect(result.files[0].url).toBe('');
  });

  it('throws on invalid YAML', () => {
    expect(() => parseUpdateInfo('not: valid: yaml: [[[', 'test.yml', '')).toThrow('Failed to parse YAML');
  });

  it('throws when result is not an object', () => {
    expect(() => parseUpdateInfo('hello', 'test.yml', '')).toThrow('Invalid update info');
  });

  it('throws when files array is empty', () => {
    const yaml = `version: 1.0.0
files: []`;
    expect(() => parseUpdateInfo(yaml, 'test.yml', '')).toThrow("Update info doesn't contain files array");
  });

  it('throws when file entry is not an object', () => {
    const yaml = `version: 1.0.0
files:
  - not-an-object`;
    expect(() => parseUpdateInfo(yaml, 'test.yml', '')).toThrow('Invalid file entry at index 0');
  });

  it('handles files not being an array', () => {
    const yaml = `version: 1.0.0
files: not-an-array`;
    expect(() => parseUpdateInfo(yaml, 'test.yml', '')).toThrow("Update info doesn't contain files array");
  });

  it('handles result being null', () => {
    expect(() => parseUpdateInfo('null', 'test.yml', '')).toThrow('Invalid update info');
  });

  it('handles multiple file entries', () => {
    const yaml = `version: 2.0.0
files:
  - url: https://example.com/win.zip
    sha2: aaa
  - url: https://example.com/mac.zip
    sha512: bbb`;
    const result = parseUpdateInfo(yaml, 'latest.yml', '');
    expect(result.files).toHaveLength(2);
    expect(result.files[0].url).toBe('https://example.com/win.zip');
    expect(result.files[0].sha2).toBe('aaa');
    expect(result.files[1].url).toBe('https://example.com/mac.zip');
    expect(result.files[1].sha512).toBe('bbb');
  });

  it('handles missing version field', () => {
    const yaml = `files:
  - url: https://example.com/update.zip`;
    const result = parseUpdateInfo(yaml, 'latest.yml', '');
    expect(result.version).toBeUndefined();
  });
});
