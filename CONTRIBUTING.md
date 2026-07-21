# Contributing to Tower Defense

Thank you for your interest in contributing! This document covers everything you need to know to get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Project Overview](#project-overview)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Conventions](#code-conventions)
- [Testing](#testing)
- [Coverage Requirements](#coverage-requirements)
- [Pull Request Process](#pull-request-process)
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

| Script | Purpose |
|--------|---------|
| `npm start` | Launch the game in Electron |
| `npm test` | Run all tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with V8 coverage report |
| `npm run lint` | Check code for issues (ESLint) |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run format` | Format all code with Prettier |
| `npm run format:check` | Check formatting without modifying files |
| `npm run build` | Build NSIS installer |
| `npm run release` | Build + publish to GitHub Releases |

## Development Workflow

### 1. Fork and Branch

- Fork the repository and create a feature branch from `main` or the relevant `release/*` branch
- Use a descriptive branch name: `fix/monster-slow-bug`, `feat/new-troop-type`, `refactor/game-loop`

### 2. Make Changes

- Follow the code conventions below
- Keep changes focused — one logical change per pull request
- Update or add tests for any new functionality

### 3. Run Quality Checks

Before submitting, run these three commands and confirm they all pass:

```bash
npm run lint          # Must pass with 0 errors (checks src/, tests/, electron-main.js, preload.js)
npm run format:check  # Must pass — all files use Prettier style (checks src/**/*.js, tests/**/*.js, css/**/*.css)
npm test              # Must pass — all tests green
```

### 4. Submit a Pull Request

- Target the `main` branch for bug fixes or the appropriate `release/*` branch for features
- Write a clear description of what the change does and why
- Reference any related issues

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

| Pattern | Example | Usage |
|---------|---------|-------|
| PascalCase | `Monster`, `Troop`, `Grid` | Classes |
| camelCase | `getDamage`, `spawnMonster` | Functions, methods, variables |
| UPPER_SNAKE | `CONFIG`, `TILE.EMPTY` | Constants |
| `_` prefix | `_buildStatLines` | Internal helpers (exported for tests) |

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
    beforeEach(() => { /* setup */ });
    afterEach(() => { vi.restoreAllMocks(); });

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

## Coverage Requirements

The project enforces **≥80% per-file** on all four metrics:

| Metric | Threshold |
|--------|-----------|
| Statements | ≥ 80% |
| Branches | ≥ 80% |
| Functions | ≥ 80% |
| Lines | ≥ 80% |

Run coverage with:

```bash
npm run test:coverage
```

Current project-wide coverage: **~91% branches, ~98% statements** across 41 test files.

### Coverage Tips

- Focus on **branch coverage** — that's usually the hardest to achieve
- Edge cases to cover: `null`, `undefined`, `0`, `NaN`, negative values, empty arrays, boundary values
- Both `if/else` branches need tests — including the "else" path

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
```

## Project Structure

```
src/                  # Source code (ES modules)
  config.js           # Game constants and tuning
  game.js             # Core game orchestrator
  troop.js            # Troop logic
  monster.js          # Monster AI
  projectile.js       # Projectile logic
  waveManager.js      # Wave progression
  pathGenerator.js    # Procedural path generation
  particles.js        # Particle effects
  audio.js            # Web Audio SFX
  rendering/          # Canvas renderers
  ui/                 # UI panels and HUD
tests/                # Test suite (Vitest)
  helpers.js          # Shared test utilities
  *.test.js           # 41 test files, 1,369 tests
```

See the [README.md](README.md) for a full breakdown of source files and their responsibilities.
