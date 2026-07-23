# Contributing to Tower Defense

Thank you for your interest in contributing! This document covers everything you need to know to get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Project Overview](#project-overview)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Commit Message Convention](#commit-message-convention)
- [Code Conventions](#code-conventions)
- [Testing](#testing)
- [Coverage Requirements](#coverage-requirements)
- [Refactoring Guidelines](#refactoring-guidelines)
- [Pull Request Process](#pull-request-process)
- [Publishing a Release](#publishing-a-release)
- [Project Structure](#project-structure)

## Code of Conduct

This project is governed by the [Apache 2.0 License](LICENSE). Be respectful, constructive, and inclusive in all interactions.

## Project Overview

A 2D tower defense game built with vanilla JavaScript (ES Modules), HTML5 Canvas 2D rendering, and Electron. Key architectural principles:

- **Zero runtime frameworks** — all game logic is vanilla JS
- **Config-driven design** — balance constants, monster specs, troop specs, and wave definitions live in `src/config.js`
- **Fixed-timestep simulation** — deterministic game loop decoupled from frame rate
- **Entity pooling** — projectiles, popups, and tile-index arrays are recycled
- **Data-driven particle effects** — all effect types defined in a single `EFFECT_DEFS` table

## Getting Started

### Prerequisites

- **Node.js** >= 20.19.0 (see `.github/workflows/ci.yml` for the exact matrix)
- **npm** (ships with Node.js)

### Setup

```bash
git clone <repo-url>
cd Tower-Defense
npm install
npm start          # Run in Electron dev mode
npm test           # Run the test suite
```

### Available Scripts

| Script                  | Purpose                                  |
| ----------------------- | ---------------------------------------- |
| `npm start`             | Launch the game in Electron              |
| `npm test`              | Run all tests (Vitest)                   |
| `npm run test:watch`    | Run tests in watch mode                  |
| `npm run test:coverage` | Run tests with V8 coverage report        |
| `npm run lint`          | Check code for issues (ESLint)           |
| `npm run lint:fix`      | Auto-fix lint issues                     |
| `npm run format`        | Format all code with Prettier            |
| `npm run format:check`  | Check formatting without modifying files |
| `npm run build`         | Build NSIS installer                     |
| `npm run release`       | Build + publish to GitHub Releases       |

## Development Workflow

### 1. Fork and Branch

- Fork the repository and create a feature branch from `main` or the relevant `release/*` branch
- Use a descriptive branch name: `fix/monster-slow-bug`, `feat/new-troop-type`, `refactor/game-loop`

### 2. Make Changes

- Follow the code conventions below
- Keep changes focused — one logical change per pull request
- Update or add tests for any new functionality

### 3. Run Quality Checks

Before submitting, run these commands and confirm they all pass:

```bash
npm run lint          # Must pass with 0 errors (checks src/, tests/, electron-main.js, preload.js)
npm run format:check  # Must pass — all files use Prettier style (checks src/**/*.js, tests/**/*.js, css/**/*.css)
npm test              # Must pass — all tests green (1,710 tests across 47 files)
npm run test:bench    # Optional — run performance hot-path benchmarks (50 tests covering tile index, combat, projectiles, waves, particles, state helpers)
npm run test:coverage # Must pass — ≥80% per-file on all 4 metrics (excluding src/main.js, src/necromancer.js, src/ui/popupManager.js)
```

**Pre-commit hook:** The project uses Husky + lint-staged to run `lint` and `format:check` on staged files before every commit. Ensure hooks are installed:

```bash
npx husky install
```

### 4. Submit a Pull Request

- Target the `main` branch for bug fixes or the appropriate `release/*` branch for features
- Write a clear description of what the change does and why
- Reference any related issues

## Commit Message Convention

The project follows [Conventional Commits](https://www.conventionalcommits.org/) with these types:

| Type       | Usage                                       |
| ---------- | ------------------------------------------- |
| `feat`     | New feature (new troop, monster, game mode) |
| `fix`      | Bug fix                                     |
| `refactor` | Code restructuring without behavior change  |
| `perf`     | Performance improvement                     |
| `test`     | Adding or fixing tests                      |
| `docs`     | Documentation changes                       |
| `chore`    | Build process, dependencies, tooling        |

**Format:** `<type>(<scope>): <subject>`

**Examples:**

```
feat(troop): add Valkyrie troop type with splash damage
fix(monster): correct slow duration calculation for Ice Wizard
refactor(game): extract InputHandler from Game class
perf(particles): dynamic particle cap based on hardwareConcurrency
test(persistence): add SaveMigrator migration tests
```

**Subject line:** Use the imperative mood ("add" not "added"), keep under 72 characters.

**Body:** Wrap at 72 characters. Explain what and why, not how.

**Breaking changes:** Add `BREAKING CHANGE:` footer with migration instructions.

## Code Conventions

### JavaScript

- **ES Modules** — use `import`/`export`, not `require`
- **Vanilla JS** — no TypeScript, no frameworks
- **No Node.js built-in modules in `src/`** — `fs`, `path`, `http` are used only in `electron-main.js`, `preload.js`, and test files
- **`const` over `let`** — prefer `const` unless the variable is reassigned
- **Descriptive names** — `getHealTargetCount()` not `getHTC()`
- **JSDoc** — optional but encouraged for exported functions

### File Organization

- One primary export per file (the class or main function)
- Helper functions that are only used within a module stay private (not exported)
- Exported `_`-prefixed functions (`_buildStatLines`, `_updateCardAreaBottom`) are internal helpers exposed for testing

### Naming Conventions

| Pattern     | Example                     | Usage                                 |
| ----------- | --------------------------- | ------------------------------------- |
| PascalCase  | `Monster`, `Troop`, `Grid`  | Classes                               |
| camelCase   | `getDamage`, `spawnMonster` | Functions, methods, variables         |
| UPPER_SNAKE | `CONFIG`, `TILE.EMPTY`      | Constants                             |
| `_` prefix  | `_buildStatLines`           | Internal helpers (exported for tests) |

### Module Mocking (for tests)

When creating tests that need `Game`, `RENDERER`, `AUDIO`, or `PARTICLES`, use the standard mock patterns from `tests/helpers.js`:

```js
vi.mock('../src/audio.js', () => ({ AUDIO: { ... } }));
vi.mock('../src/particles.js', () => ({ PARTICLES: { ... } }));
vi.mock('../src/rendering/renderer.js', () => ({ RENDERER: { ... } }));
```

Use `vi.mock()` for module mocking — never manual monkey-patching.

### DOM Testing

- Use `// @vitest-environment jsdom` per-file where real DOM is needed (toast, accessibility, main.js-adjacent tests)
- Use minimal hand-rolled stubs (`makeCtx()`, `makeCanvas()`, `makeElement()`) elsewhere
- Never depend on a real browser — all tests run in Node.js via Vitest

## Testing

### Test Runner

The project uses [Vitest](https://vitest.dev/) with V8 coverage provider. Tests live in `tests/` and mirror the `src/` structure.

### Running Tests

```bash
npm test                    # Full suite
npx vitest run tests/game.test.js   # Single file
npx vitest run -t 'specific test'   # Single test by name pattern
```

### Writing Tests

- **One assertion focus per test** — each `it()` tests one behavior
- **Descriptive names** — `'returns null when no monsters are in range'` not `'test1'`
- **No test interdependence** — each test sets up its own state
- **Always restore mocks** — use `afterEach(() => vi.restoreAllMocks())`
- **Use `vi.fn()`** for all external dependencies — never call real Audio/Canvas/DOM in unit tests
- **No `console.log` in tests** — use assertions
- **Deterministic** — no `Math.random()` in tests; use fixed seeds
- **Fast** — no real timers; use `vi.useFakeTimers()` where needed

### Test File Structure

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('ModuleName', () => {
  describe('featureName', () => {
    let game;
    beforeEach(() => {
      /* setup */
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('descriptive behavior statement', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

### Known Limitation Tests

Some tests document current limitations rather than ideal behavior. These are marked with `(known limitation: ...)` in the test name:

```js
it('particle pool cap is hardcoded to 300 with no dynamic scaling (known limitation: particle cap)', () => {
  expect(PARTICLES._maxPool).toBe(300);
});
```

If you fix a limitation, update or remove the corresponding tripwire test.

### Resolved Limitations

The following limitations have been addressed (see `PLAN.md` for details):

- **L2: No save migration** — `SaveMigrator` in `src/gamePersistence.js` provides versioned migration pipeline
- **L3: Particle cap hardcoded to 300** — Dynamic cap based on `navigator.hardwareConcurrency` (100–300 particles)

### Save Versioning

All saves include a `version` field (currently `1.0.0`). The `SaveMigrator.migrate(data)` method in `src/gamePersistence.js` is called automatically by `GameSnapshotRestorer.apply()` before restoring. When adding new persistent fields:

1. Add the field to `SaveSerializer.fromGame()`
2. Add a migrator in `SaveMigrator` if the field needs transformation
3. Use `??` default fallbacks in `GameSnapshotRestorer.apply()` for backward compatibility

## Coverage Requirements

The project enforces **≥80% per-file** on all four metrics:

| Metric     | Threshold |
| ---------- | --------- |
| Statements | ≥ 80%     |
| Branches   | ≥ 80%     |
| Functions  | ≥ 80%     |
| Lines      | ≥ 80%     |

Run coverage with:

```bash
npm run test:coverage
```

Current project-wide coverage: **92.12% branches, 98.23% statements, 98.43% functions, 99.60% lines** across 47 test files (1,710 tests).

### Performance Benchmarks

In addition to the unit/integration test suite, the project includes a dedicated **performance hot-path benchmark suite** (`tests/benchmarkHotPaths.test.js`) with 50 tests across 15 engine areas:

| Area | Tests | What's Measured |
| :--- | :--- | :--- |
| Tile index | 3 | `_buildTroopTileIndex` (0/1/12 troops) |
| Monster index | 3 | `_updateMonsterTileIndex` (0/10/50 monsters) |
| MonstersInRange | 2 | `pickTarget` melee/ranged (50 monsters) |
| Frame time | 3 | `step()` empty/light/heavy load |
| Cleanup | 1 | `_cleanupDead` (50 dead monsters + 12 dead troops) |
| Healer | 2 | `_tryHealAllies` (0/10 damaged monsters) |
| Particles | 5 | `hitSpark`, `deathBurst`, `healBurst`, `chainSpark`, mixed |
| Damage | 4 | `damageMonster` direct/shield/split, `takeDamage` shatter |
| Troop damage | 4 | `takeDamage` shield/no-shield, `damageTroop` melee/revive |
| AoE | 3 | `splashAt`, `chainHitAt`, `findClosestMonsterNear` |
| Monster update | 3 | `_updateBurn`, `_updateRegen`, `findTarget` |
| Projectile | 4 | `acquireProjectile` pooled, `update` flying/impact/timeout |
| Wave | 4 | `popDueMonster`, `shuffleSpecialMonsters`, `buildQueue` |
| Economy | 5 | `getUpgradeCost` cached/uncached, `getTotalInvested`, `canPlace` |
| State helpers | 4 | `_getPopup` pool/new, `_stepPopups`, `_stepWaveCompletion` |

Run with:

```bash
npx vitest run tests/benchmarkHotPaths.test.js --reporter=verbose
```

### Threshold Configuration

Thresholds are enforced in `vitest.config.js` using `coverage.thresholds.perFile: true`. The following files are **excluded** from per-file thresholds because they are Electron entry points or complex modules that cannot reach 80% in a Node.js test environment:

- `src/main.js` — DOM bootstrap, ~47% statements (excluded)
- `src/necromancer.js` — complex revive logic, ~70% statements (excluded)
- `src/ui/popupManager.js` — DOM animation, ~75% statements (excluded)

All other source files must meet ≥80% on all four metrics.

### Coverage Tips

- Focus on **branch coverage** — that's usually the hardest to achieve
- Edge cases to cover: `null`, `undefined`, `0`, `NaN`, negative values, empty arrays, boundary values
- Both `if/else` branches need tests — including the "else" path

## Refactoring Guidelines

Refactoring is encouraged but must follow these rules:

### When to Refactor

- **Extract classes** when a class exceeds ~800 lines or handles more than 2 concerns
- **Extract functions** when a function exceeds ~50 lines or has >3 levels of nesting
- **Break up modules** when a file has >2 unrelated responsibilities

### How to Refactor Safely

1. **Write characterization tests first** — ensure existing behavior is captured before changing code
2. **Refactor in small steps** — one extraction per commit, verify tests pass after each
3. **Prefer composition over inheritance** — inject dependencies rather than extending classes
4. **Keep public APIs stable** — internal refactors should not change exported interfaces
5. **Update tests** — if you extract a class, add tests for the new class

### Current Refactoring Targets

- `src/game.js` (~1,250 lines) — extract `InputHandler` and `SaveManager`
- `src/ui/shop.js` — decouple `drawShop` from `RENDERER.ctx` (dependency injection)
- `src/game.js` — `Game` handles input, state, persistence, and rendering coordination

### What NOT to Refactor

- **Don't refactor and add features in the same PR** — separate concerns
- **Don't rename public APIs** without a deprecation period
- **Don't refactor tests** unless they're broken — tests document behavior

## Pull Request Process

1. **Ensure CI passes** — the `.github/workflows/ci.yml` workflow runs `lint` → `format:check` → `test` on every push
2. **Keep PRs small** — focused changes are easier to review
3. **Update tests** — add or update tests to cover your changes
4. **Update documentation** — if you change public APIs or add features, update the README
5. **Describe your changes** — explain what and why in the PR description

### CI Pipeline

The CI workflow runs on `ubuntu-latest` and `windows-latest` with Node.js 20.x and 22.x:

```yaml
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        node-version: ['20.19.0', '22.12.0']
        os: [ubuntu-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install
      - run: npm run lint
      - run: npm run format:check
      - run: npm test
      - run: npm run test:coverage
```

CI fails if any step exits non-zero. The `test:coverage` step verifies that per-file thresholds are met.

## Publishing a Release

Releases are published to GitHub Releases and automatically picked up by the in-game update checker.

### Prerequisites

- **GitHub CLI** (`gh`) installed and authenticated: `gh auth login`
- **GitHub token** with `repo` scope (for private repos) or `public_repo` scope (for public repos)
- **Node.js** >= 20.19.0 (matching CI)

### Release Process

#### 1. Bump Version

Update the version in `package.json` following [Semantic Versioning](https://semver.org/):

```bash
# Patch release (bug fixes)
npm version patch  # 1.6.2 → 1.6.3

# Minor release (new features, backward-compatible)
npm version minor  # 1.6.2 → 1.7.0

# Major release (breaking changes)
npm version major  # 1.6.2 → 2.0.0
```

This updates `package.json` and creates a git commit + tag.

#### 1.1. Tag Naming Convention

GitHub release tags must follow the format:

```
vx.x.x - <name>
```

Where `<name>` is a short, descriptive release codename (kebab-case, no spaces).

**Examples:**

```
v1.6.3 - quick-fix
v1.7.0 - settings-overhaul
v2.0.0 - multiplayer-beta
```

To set a custom tag name with `npm version`:

```bash
npm version patch --message "v%s - quick-fix"
```

Or manually rename the tag after `npm version`:

```bash
git tag -d v1.6.3          # delete auto-generated tag
git tag v1.6.3 - quick-fix  # create properly named tag
git push origin :v1.6.3     # delete remote tag
git push origin v1.6.3 - quick-fix  # push new tag
```

The in-game update checker (`resolveDownloadTag` in `src/githubReleaseFeed.js`) handles both `v`-prefixed and bare tags, so the tag name format does not affect update detection.

#### 2. Update CHANGELOG

Add a new section to `CHANGELOG.md` at the top (below the `# Changelog` header):

```markdown
## [1.6.3] — 2026-07-23

### 🐛 Bug Fixes

- **Description** — Brief explanation of the fix and its impact.

### 🧪 Testing & Quality

- **N tests** — Summary of new/updated tests

### ⚙️ Configuration

- Any config changes
```

Use these section headers: `🐛 Bug Fixes`, `✨ New Features`, `⚡ Performance`, `🧪 Testing & Quality`, `⚙️ Configuration`, `💾 Persistence`, `📝 Documentation`.

#### 2.1. Writing Release Notes

Release notes should be clear, concise, and user-focused. Follow these guidelines:

**Structure:**

1. **Start with a summary line** — one sentence describing the release's primary purpose
2. **Group changes by category** — use the section headers above
3. **Write for users, not developers** — explain what changed and why it matters
4. **Be specific** — reference file names, method names, or config keys when relevant
5. **Include impact** — explain the user-facing effect of each change

**Format for each entry:**

```markdown
- **Component Name** — What changed and why it matters to users. Include context like "previously X, now Y" or "fixes issue where Z".
```

**Examples:**

```markdown
### 🐛 Bug Fixes

- **Monster attack validation** — `_stepMonsterAttacks()` now validates Chebyshev tile distance between attacker and target before delivering damage. Previously, if a monster moved out of range between queuing an attack and execution, the attack was still delivered. No in-game scenario currently triggers this, but it's a safety guard.
- **Popup shortcut race condition** — `_handlePopupShortcut()` could call `openFn` twice (once from `transitionend` event, once from the fallback `setTimeout`). Added a `opened` guard flag to ensure `openFn` is idempotent.
- **Duplicate SHIELD_SHOP_WIDTH** — `src/config.js` defined `SHIELD_SHOP_WIDTH` twice (250 and 220); the second definition silently overrode the first. Removed the duplicate.

### ✨ New Features

- **Save migration pipeline** — Added `SaveMigrator` to `src/gamePersistence.js` with versioned migration system. Legacy saves (v0, no version field) are automatically migrated with sensible defaults.
- **Dynamic particle cap** — `PARTICLES._maxPool` now scales with `navigator.hardwareConcurrency` (100–300 particles based on core count) instead of being hardcoded to 300.

### ⚡ Performance

- **Auto-save debounce** — `_stepWaveCompletion()` now only calls `_autoSave()` every 5 waves (`AUTO_SAVE_DEBOUNCE_WAVES`) instead of every wave, reducing disk I/O.
- **Cached DPS/HPS** — `getDps()` and `getHps()` in `src/troop.js` now return cached values computed in `_recomputeStats()`, avoiding recomputation on every render call.
- **Incremental monster tile index** — `_updateMonsterTileIndex()` rewritten from full clear-and-rebuild to incremental updates: only moves entries between tiles when monsters cross tile boundaries.

### 🧪 Testing & Quality

- **8 new tests** — `SaveMigrator` test suite (6 tests), auto-save debounce test (1 test), incremental monster tile index test (1 test).
- **Coverage improved** — Statements: 98.13% → 98.47%, Branches: 91.61% → 92.15%, Lines: 99.41% → 99.64%. `game.js` lines: 98.86% → 100%.

### ⚙️ Configuration

- **Magic numbers extracted** — Added named constants to `config.js` (`MAX_SPAWNS_PER_FRAME`, `HIT_TROOPS_CAP`, `PARTICLE_POOL_SIZE`, `DEV_MODE_CLICK_THRESHOLD`, `DEV_MODE_CLICK_WINDOW_MS`, `WAVE_TRANSITION_DURATION`, `AUTO_SAVE_DEBOUNCE_MS`, `AUTO_SAVE_DEBOUNCE_WAVES`, `REVIVE_REWARD_HP_RATIO`, `POPUP_ANIM_MS`) and replaced all hardcoded values across source files.
```

**What NOT to include:**

- Internal refactoring details that don't affect users
- Test implementation details (test counts are fine, but not test file names)
- Commit hashes or PR numbers
- Apologies or meta-commentary ("sorry for the breakage", "this was a long PR")

**GitHub Release Description:**
When `npm run release` creates the GitHub Release, it uses the CHANGELOG section as the release description. Ensure the CHANGELOG section is complete and well-formatted before publishing.

#### 3. Run Final Checks

```bash
npm run lint
npm run format:check
npm test
npm run test:coverage
```

All must pass before releasing.

#### 4. Build and Publish

```bash
npm run release
```

This runs `electron-builder --win --x64 --publish always`, which:

1. Builds the NSIS installer for Windows x64
2. Uploads the installer and `latest.yml` to GitHub Releases
3. Tags the release with the version from `package.json`

#### 5. Verify

After the release completes:

1. Check [GitHub Releases](https://github.com/avcode-exe/Tower-Defense/releases) for the new release
2. Verify the `latest.yml` and `latest.yml.sha512` files are present
3. Test the in-game update checker by running the app and triggering a manual check

### Release Channels

The update system supports two channels (configured in the settings panel):

| Channel       | Description               | Pre-release Tag              |
| ------------- | ------------------------- | ---------------------------- |
| `release`     | Stable releases only      | No `beta`/`rc` in version    |
| `pre-release` | Includes beta/rc versions | `1.7.0-beta.1`, `1.7.0-rc.1` |

To publish a pre-release:

```bash
npm version prerelease --preid=beta  # 1.7.0 → 1.7.0-beta.0
npm run release
```

### Auto-Update Architecture

The update flow works as follows:

1. **GitHub Release** — `electron-builder` publishes to `avcode-exe/Tower-Defense` releases with NSIS installer + `latest.yml`
2. **Atom Feed** — GitHub provides an Atom feed at `https://github.com/avcode-exe/Tower-Defense/releases.atom`
3. **Renderer Check** — `UpdateManager` (in `src/updateManager.js`) calls `window.electron.sendManualCheck()` which triggers `autoUpdater.checkForUpdates()` in `electron-main.js`
4. **Tag Resolution** — `resolveDownloadTag()` in `src/githubReleaseFeed.js` resolves whether the download URL uses `v`-prefixed or bare tags (runs both HEAD requests in parallel)
5. **Download** — `autoUpdater.downloadUpdate()` downloads and verifies the installer
6. **Install** — User clicks "Restart & Install" to apply the update

### What NOT to Do

- **Don't manually edit `latest.yml`** — it's generated by `electron-builder`
- **Don't publish without running tests** — CI will catch it, but it wastes time
- **Don't use `npm version` without committing first** — the tag commit should include all changes
- **Don't skip the CHANGELOG** — users rely on it to understand what changed

## Project Structure

```
src/                  # Source code (ES modules)
  config.js           # Game constants and tuning
  game.js             # Core game orchestrator (~1,250 lines — refactor target)
  gamePersistence.js  # Save serialization, migration, and restoration
  troop.js            # Troop logic
  monster.js          # Monster AI
  projectile.js       # Projectile logic
  waveManager.js      # Wave progression
  pathGenerator.js    # Procedural path generation
  particles.js        # Particle effects
  audio.js            # Web Audio SFX
  gameRuntime.js      # Game loop and runtime controller
  input.js            # DOM event wiring (delegates to game.inputHandler)
  saveManager.js      # Persistence manager (planned extraction from game.js)
  inputHandler.js     # Input handler (planned extraction from game.js)
  rendering/          # Canvas renderers
  ui/                 # UI panels and HUD
tests/                # Test suite (Vitest)
  helpers.js          # Shared test utilities
  *.test.js           # 47 test files, 1,710 tests
  benchmarkHotPaths.test.js  # 50 performance hot-path benchmarks
```

See the [README.md](README.md) for a full breakdown of source files and their responsibilities.
