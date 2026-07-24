#!/usr/bin/env node
/**
 * Unified version bump script.
 *
 * Reads the current version from package.json (single source of truth),
 * then propagates the new version to every source and test file that
 * has the current version hardcoded.
 *
 * Usage:
 *   node scripts/bump-version.js <newversion>       # apply changes
 *   node scripts/bump-version.js <newversion> --dry  # preview only
 *
 * Example:
 *   node scripts/bump-version.js 1.8.0
 *   node scripts/bump-version.js 1.7.1-beta.1 --dry
 */
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

// ── Parse args ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const NEW_VERSION = args.find((a) => !a.startsWith('--'));
const DRY_RUN = args.includes('--dry') || args.includes('--dry-run');

if (!NEW_VERSION || !/^\d+\.\d+\.\d+/.test(NEW_VERSION)) {
  console.error('Usage: node scripts/bump-version.js <newversion> [--dry]');
  console.error('  Example: node scripts/bump-version.js 1.8.0');
  process.exit(1);
}

// ── Read current version ───────────────────────────────────────────────────

const PKG = JSON.parse(readFileSync('./package.json', 'utf8'));
const OLD_VERSION = PKG.version;

if (OLD_VERSION === NEW_VERSION) {
  console.log(`Version is already ${OLD_VERSION}. Nothing to do.`);
  process.exit(0);
}

console.log(`📦 Version bump: ${OLD_VERSION} → ${NEW_VERSION}${DRY_RUN ? '  [DRY RUN - no files will be modified]' : ''}`);
console.log('');

// ── Replacement definitions ────────────────────────────────────────────────
//
// Each entry is [filePath, oldString, newString].
// Only exact string matches are replaced (one occurrence per entry).
// eslint-disable-next-line no-unused-vars

const replacements = [
  // ── Source ───────────────────────────────────────────────────────────
  ['./src/gamePersistence.js', `CURRENT_VERSION: '${OLD_VERSION}'`, `CURRENT_VERSION: '${NEW_VERSION}'`],

  // ── Test helpers ─────────────────────────────────────────────────────
  ['./tests/helpers.js', `game.appVersion = '${OLD_VERSION}'`, `game.appVersion = '${NEW_VERSION}'`],
  ['./tests/helpers.js', `getVersion: vi.fn(async () => '${OLD_VERSION}')`, `getVersion: vi.fn(async () => '${NEW_VERSION}')`],

  // ── electronMain test ────────────────────────────────────────────────
  ['./tests/electronMain.test.js', `mockAppGetVersion = vi.fn(() => '${OLD_VERSION}')`, `mockAppGetVersion = vi.fn(() => '${NEW_VERSION}')`],
  [
    './tests/electronMain.test.js',
    `resolveDownloadTag: vi.fn(async () => ({ tag: 'v${OLD_VERSION}' }))`,
    `resolveDownloadTag: vi.fn(async () => ({ tag: 'v${NEW_VERSION}' }))`,
  ],
  [
    './tests/electronMain.test.js',
    `parseUpdateInfo: vi.fn(() => ({ version: '${OLD_VERSION}', files: [{ url: 'Tower-Defense-Setup-${OLD_VERSION}.exe' }] }))`,
    `parseUpdateInfo: vi.fn(() => ({ version: '${NEW_VERSION}', files: [{ url: 'Tower-Defense-Setup-${NEW_VERSION}.exe' }] }))`,
  ],
  ['./tests/electronMain.test.js', `expect(result).toBe('${OLD_VERSION}')`, `expect(result).toBe('${NEW_VERSION}')`],
  ['./tests/electronMain.test.js', `expect(result.version).toBe('${OLD_VERSION}')`, `expect(result.version).toBe('${NEW_VERSION}')`],

  // ── preload test ─────────────────────────────────────────────────────
  ['./tests/preload.test.js', `mockInvoke.mockResolvedValueOnce('${OLD_VERSION}')`, `mockInvoke.mockResolvedValueOnce('${NEW_VERSION}')`],
  ['./tests/preload.test.js', `expect(result).toBe('${OLD_VERSION}')`, `expect(result).toBe('${NEW_VERSION}')`],

  // ── main test ────────────────────────────────────────────────────────
  ['./tests/main.test.js', `getAnnouncedVersion: vi.fn(() => '${OLD_VERSION}')`, `getAnnouncedVersion: vi.fn(() => '${NEW_VERSION}')`],
  ['./tests/main.test.js', `getVersion: vi.fn(async () => '${OLD_VERSION}')`, `getVersion: vi.fn(async () => '${NEW_VERSION}')`],
  ['./tests/main.test.js', `expect(el.textContent).toContain('${OLD_VERSION}')`, `expect(el.textContent).toContain('${NEW_VERSION}')`],
  ['./tests/main.test.js', `expect(mockGameInstance.appVersion).toBe('${OLD_VERSION}')`, `expect(mockGameInstance.appVersion).toBe('${NEW_VERSION}')`],

  // ── persistence test (only fixture data & meta assertions, NOT cmp calls) ─
  ['./tests/persistence.test.js', `version: '${OLD_VERSION}'`, `version: '${NEW_VERSION}'`],
  ['./tests/persistence.test.js', `meta.version).toBe('${OLD_VERSION}')`, `meta.version).toBe('${NEW_VERSION}')`],
];

// ── Update package.json first (via npm version) ──────────────────────────
// Run this BEFORE file replacements so if npm version fails, no source files
// are left modified.

console.log('');
if (!DRY_RUN) {
  try {
    execSync(`npm version ${NEW_VERSION} --no-git-tag-version`, { stdio: 'inherit' });
    console.log('  ✓ package.json (via npm version)');
    console.log('  ✓ package-lock.json (auto-regenerated)');
  } catch (err) {
    console.error(`  ✗ npm version failed: ${err.message}`);
    console.error('   Aborting — no source files were modified.');
    process.exit(1);
  }
} else {
  console.log('  - package.json + package-lock.json  (npm version --dry not supported, skip)');
}

// ── Apply replacements to source and test files ────────────────────────────

let replacedCount = 0;
let missedCount = 0;

for (const [filePath, oldStr, newStr] of replacements) {
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`  ✗ ${filePath} — could not read: ${err.message}`);
    missedCount++;
    continue;
  }

  if (content.includes(oldStr)) {
    if (!DRY_RUN) {
      // Use replaceAll to handle multiple occurrences (e.g. persistence test
      // has several `version: '1.7.0'` fixtures).
      content = content.replaceAll(oldStr, newStr);
      writeFileSync(filePath, content);
    }
    console.log(`  ✓ ${filePath}`);
    replacedCount++;
  } else {
    console.log(`  - ${filePath}  (pattern not found — may have already been updated)`);
    missedCount++;
  }
}

// ── Summary ────────────────────────────────────────────────────────────────

console.log('');
console.log('─'.repeat(50));
console.log(`Applied ${replacedCount} replacement(s)`);
if (missedCount > 0) {
  console.log(`Skipped ${missedCount} pattern(s) (already up-to-date or missing)`);
}
console.log('');

if (DRY_RUN) {
  console.log('🔍 Dry run complete — no files were modified.');
  console.log('   Re-run without --dry to apply the changes.');
} else {
  console.log('✅ Version bumped. Review with: git diff --stat');
  console.log('');
  console.log('⚠️  Files that may need manual updates:');
  console.log('   • CHANGELOG.md — add a new release entry');
  console.log('   • CONTRIBUTING.md — update version examples if needed');
  console.log('   • tests/fixtures/saves/*.json — update save fixture versions if format changed');
}
