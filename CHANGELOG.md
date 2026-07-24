# Changelog

## [1.7.1] — 2026-07-24

### 🐛 Bug Fixes

- **Stale skipped version blocking updates** — When a version was previously skipped (persisted in settings), downgrading to an older version would prevent update notifications since the skip was never cleared. Removed the skip version feature entirely to ensure users are always notified of available updates on startup.
- **Double startup update check** — Both the main process (`did-finish-load`) and renderer (`updateManager.init()`) triggered duplicate update checks on startup. Removed the main process call; renderer's 3-second delayed check is sufficient.
- **Popup shortcut race condition** — `_handlePopupShortcut()` in `game.js` could call `openFn` twice (once from `transitionend` event, once from the fallback `setTimeout`). Added a `opened` guard flag to ensure `openFn` is idempotent.
- **Duplicate `SHIELD_SHOP_WIDTH` in config** — `src/config.js` defined `SHIELD_SHOP_WIDTH` twice (250 and 220); the second definition silently overrode the first. Removed the duplicate.
- **Missing `about` key in electron-main settings** — `DEFAULT_SETTINGS.collapsed` in `electron-main.js` was missing the `about: false` key that `settingsDefaults.js` includes. Synced the two definitions.
- **Dead code in `resolveDownloadTag`** — Removed unreachable early return in `githubReleaseFeed.js`.
- **Redundant `if (m.alive)` in `_stepMonsters`** — Removed redundant guard inside `if (m.hp <= 0)` block in `game.js`.
- **Dead code `_compactMonsters`** — Removed unused method from `game.js`; updated test to use `_cleanupDead()`.

### 🎉 Features

- **Sidebars expanded on startup** — Left and right sidebars (HUD + shop) now always expand on startup regardless of persisted collapsed state, ensuring full UI visibility on launch.
- **Skip → Cancel in update notifications** — Removed the "Skip this update" feature. "Skip" buttons replaced with "Cancel" which simply dismisses without persisting. Users are now notified of available updates on every startup.

### ⚙️ Performance

- **Auto-save debounce** — `_stepWaveCompletion()` now only calls `_autoSave()` every 5 waves (`AUTO_SAVE_DEBOUNCE_WAVES`) instead of every wave, reducing disk I/O.
- **Cached DPS/HPS in troop.js** — `getDps()` and `getHps()` now return cached values computed in `_recomputeStats()`, avoiding recomputation on every render call.
- **Cached stat lines in shop.js** — `_buildStatLines()` caches its result on the troop object, invalidated on upgrade.
- **Optimized `_buildTroopTileIndex`** — Removed redundant full rebuilds from `sellTroop()` and `killTroop()`; index is rebuilt only in `_cleanupDead()` which runs in the same step.
- **Optimized `_updateMonsterTileIndex`** — Rewrote from full clear-and-rebuild to incremental updates: tracks `_prevTileIdx` on each monster and only moves entries between tiles when monsters cross tile boundaries.
- **Dynamic particle cap** — `PARTICLES._maxPool` now scales with `navigator.hardwareConcurrency` (100–300 particles based on core count) instead of being hardcoded to 300.

### 🧪 Testing & Quality

- **1,885 tests** across 49 files (up from 1,710 tests, 47 files).
- **Toast branch coverage** — Added test for `showToast` without a type parameter, covering the `TYPE_ICONS[type] || ''` fallback and `icon ?` falsy ternary branches. Toast.js branch coverage: 83.33% → 95.83%.
- **preload.cjs excluded from coverage** — Removed from coverage `include` list in vitest config since v8 cannot instrument CJS files. Tests remain active via `tests/preload.test.js`.
- **Coverage improved** — Overall: 98.38% statements, 92.93% branches (+0.78pp), 98.30% functions, 99.30% lines. Every source file meets ≥90% on all metrics.

### ⚙️ Configuration

- **Magic numbers extracted** — Added named constants to `config.js` (`MAX_SPAWNS_PER_FRAME`, `HIT_TROOPS_CAP`, `PARTICLE_POOL_SIZE`, `DEV_MODE_CLICK_THRESHOLD`, `DEV_MODE_CLICK_WINDOW_MS`, `WAVE_TRANSITION_DURATION`, `AUTO_SAVE_DEBOUNCE_MS`, `AUTO_SAVE_DEBOUNCE_WAVES`, `REVIVE_REWARD_HP_RATIO`, `POPUP_ANIM_MS`) and replaced all hardcoded values across source files.

### 💾 Persistence

- **Save migration pipeline** — Added `SaveMigrator` to `gamePersistence.js` with versioned migration system. Legacy saves (v0, no version field) are migrated with sensible defaults. Integrated into `GameSnapshotRestorer.apply()`.

### 📝 Documentation

- **Removed skip version feature** — All references to `skipUpdate`, `skip-update`, and `skippedVersions` removed from API docs, notification system descriptions, and contributing guidelines.
- **Updated test stats** — Coverage metrics, test counts, and file counts updated across README and CONTRIBUTING to reflect current project state.

## [1.7.0] — 2026-07-23

### 🎉 Features

- **Dynamic Particle System** — 4 quality tiers (Low/Medium/High/Ultra) with configurable pool size, spawn multiplier, and lifetime multiplier via `setQuality()`. Adjustable from the Settings panel.
- **Auto-throttle** — `_checkFrameBudget()` monitors frame budget: 3 slow frames (>33ms) downgrades one tier, 60 fast frames (<16ms) upgrades toward user preference. Operates independently of user setting; clears on recovery.
- **Multi-slot save rotation** — SaveRotationManager with 3 auto-save slots (autosave.0–autosave.2) using LRU eviction, plus manual named slots. Save/Load popup with preview thumbnails, overwrite confirmation dialog.
- **Settings Panel Rework** — Tab-based layout (Audio/Graphics/Controls/Accessibility/Update) with draft-based editing (Save/Cancel). Keybind capture, accessibility toggles, particle quality selector, update channel selection.

## [1.6.2] — 2026-07-22

### 🐛 Bug Fixes

- **Monster attack distance validation (L6)** — `_stepMonsterAttacks()` now validates Chebyshev tile distance between attacker and target before delivering damage. Previously only `target.alive` was checked — if a monster moved out of range between queuing an attack and execution, the attack was still delivered. This is a safety guard that formalizes existing behavior; no in-game scenario currently triggers out-of-range attacks.
- **Shield regen delay spec-configurable (L7)** — Shield regen delay moved from a global `CONFIG.SHIELD_REGEN_DELAY` constant into `MONSTER_SPECS.S.shieldRegenDelay` (backward-compatible fallback via `??` operator). Future monster types can now have different regen delays without special cases in `monster.js`.

### 🧪 Testing & Quality

- **1,532 tests** (up from 1,420, +112 new tests across 2 releases)
- **45 test files** across the project (up from 41)
- **L12: Overlay branch coverage** — New `tests/uiOverlays.test.js` (14 tests) with proper canvas mock setup, deterministic `performance.now()` mocking, and full branch coverage of `drawWaveTransition` (fade-in, hold, fade-out, expired, early returns). Removed fragile overlay extra-branches tests from `uiRendering.test.js`. Overlays.js now at **100%** on all 4 coverage metrics.
- **L13 phase 1: electron-main.js coverage** — New `tests/electronMain.test.js` (50 tests) with `vi.mock('electron')`, `vi.mock('fs')` with proper ESM/CJS interop (`default` + named exports), and `vi.mock('os')`. Tests cover: all 13 IPC channel registrations, settings sanitization (7 edge cases: null, array, valid, oversized, skippedVersion filtering, channel validation, interval normalization), settings persistence (read with merge, fallback on error), save/load game handlers (valid, oversized, non-object), delete-save, window creation with BrowserWindow options, autoUpdater event wiring (7 event callbacks), sendStatus/handleUpdaterError/formatUpdaterError paths, and app lifecycle window-all-closed/before-quit/activate handlers.
- **L13 phase 2: preload.js coverage (100%)** — New `tests/preload.test.js` (30 tests) with `vi.mock('electron')` capturing `contextBridge.exposeInMainWorld` API. Tests cover: all 15 Electron API methods (getSettings, saveSettings, getVersion, sendManualCheck, downloadUpdate, requestRestartToUpdate, skipUpdate, onUpdateStatus, setAutoDownload, setUpdateChannel, cancelUpdate, saveGame, loadGame, deleteSave) with type validation branches (null, array, string, number, boolean, function) via `isPlainObject` and explicit type guards (4 TypeError branches for saveSettings, 2 for skipUpdate, 2 for onUpdateStatus, 1 for setAutoDownload, 1 for setUpdateChannel, 3 for saveGame). preload.js now at **100%** on all 4 coverage metrics and added to vitest thresholds.
- **L14: main.js coverage (~47%)** — New `tests/main.test.js` (14 tests) with comprehensive jsdom environment: canvas polyfill (`HTMLCanvasElement.prototype.getContext`), full DOM fixture (30+ elements), and Electron stub. Tests cover: module import, error tracking registration (`window.onerror`), Game/Input creation, save detection flow, settings loading and sync, UpdateManager initialization, about version display, monster info population, and notification system wiring. Handler body partially executes in jsdom. Main.js excluded from thresholds (~47% below 80% per-file minimum; deferred to v1.7.x).

### ⚙️ Configuration

- **Version bump** — 1.6.1 → 1.6.2 (stable release)

## [1.6.1] — 2026-07-21

### 🐛 Bug Fixes

- **_hitTroops Set memory leak (L8)** — Added hard cap (200) and periodic cleanup to pass-mode monster `_hitTroops` Set to prevent unbounded memory growth during long game sessions. Cleanup runs every 10 frames, removing stale/dead troop references.
- **handleToggleClick null canvas crash (L11)** — Early return guard when `RENDERER.ctx` or `RENDERER.ctx.canvas` is null, preventing crashes during race conditions on startup.
- **resolveDownloadTag dev fallback (L9)** — Proper mock verification for `http.request` in test suite, ensuring the dev fallback path is correctly exercised.
- **headRequest integration tests (L10)** — Real local HTTP server tests for timeout/ECONNREFUSED/200/404 paths with production `User-Agent` header.

### 🛠️ Technical & Architecture

- **Global error tracking** — `unhandledrejection` + `onerror` handlers in main.js catch unexpected crashes, display a DOM overlay with the error message, and log to localStorage (capped at 20 entries). Idempotent `_errorShown` guard prevents overlay spam.
- **Necromancer module extraction** — `_stepNecromancerRevives` + `resetRevivedMonster` extracted from `Game` class into dedicated `src/necromancer.js` (~70 lines). Game orchestrator is now ~85 lines lighter.
- **Popup manager extraction** — Bar popup show/hide/toggle/persist logic extracted from `main.js` into `src/ui/popupManager.js` (~80 lines). Constants `BAR_BTN_MAP` and `POPUP_MAP` exported for reuse.
- **`monstersInRange` helper extraction** — Tile-scanning helper moved from local definition in `troop.js` to shared `src/utils.js` for reuse across `Troop.pickTarget`, `Troop.damageMonstersInHealRange`, and future callers.
- **`_pixelToGameTile` helper** — New method in `Game` class consolidates the screen-pixel-to-game-tile coordinate transform with gameplay-area bounds check, replacing 3 duplicated instances.
- **Healing loop condition flattening** — Restructured support healing loop guard from compound `||` chain into separate `if` statements with reordered conditions (`t === this` before `t.spec.type === 'support'`) for measurable V8 branch coverage.

### 🧪 Testing & Quality

- **1,420 tests** (up from 1,369, +51 new tests)
- **Troop coverage** — 15 new tests covering: candidate loop guards (self/dead/full-HP/support-type filtering), healing loop bypass tests (support-type removal, mixed targets), upgradeStat slow for non-support, pickTarget fallback paths, update AOE fallback, dead troop early return, and non-support tileIndex parameter.
- **githubReleaseFeed coverage** — 50 tests covering: resolveDownloadTag setTimeout path, getReleaseFromEntryAny malformed links, semver.parse failure paths, stripLeadingV edge cases with null currentVersion, and `(known limitation: ...)` documentation for CI-portable ECONNREFUSED assertions.
- **updateManager coverage** — 54 tests covering: falsy version fallback in `_handleProgress`, null/undefined pct in `_showProgress`, falsy version in `_handleDownloaded`, missing progressWrap, and null skippedVersions fallback in `skip()`.
- **CI environment portability** — ECONNREFUSED assertion relaxed to generic `.toThrow()` with documented environment dependency for GitHub Actions runners.
- **Lint and Prettier** — 0 lint errors, consistent Prettier formatting across all 80+ source and test files.

## [1.6.0] — 2026-07-21

### 🎮 Gameplay

- **Troop HP system** — troops now have health pools and can be destroyed by monsters, adding strategic depth to positioning
- **Three monster attack modes:**
  - **stop** (default): Monsters pause to attack troops in range, then resume pathing
  - **slow**: Monsters slow to half speed near defense troops while attacking (Spear)
  - **pass**: Monsters penetrate defenses at full speed, hitting each troop once (Runner)
- **Healer Troop** (support) — locks onto damaged allies, heals 8 HP/tick, deals 3 damage to monsters in heal range; upgradeable TGT stat for more simultaneous targets
- **Flamer Troop** (melee) — applies burn DoT (3 stacks, 3s duration, 0.5s ticks); burn damage scales with DMG upgrades
- **Necromancer monster** — revives up to 4 dead allied monsters within 2-tile range; revived monsters become revive-immune and take 50% reduced damage
- **Ice Wizard** — splash + slow (50% speed, 2.5s) + shatter bonus (+50% damage on slowed targets); upgradeable SLW stat
- **Lightning chain** — upgradeable CHN stat adds +1 chain target per level (base 2), with 0.5s stun on each hit
- **Monster splitting** — Brute, Elite, and Champion split into 2 of `level-1` on death (non-Boss, non-Shielded, non-pass-mode)
- **Boss monster** — appears at waves 10/20/30 with 1668 HP (doubled to 3336 at spawn), 15 HP/s passive heal, 200g reward
- **Shielded monster** — 173 HP + regenerating 69 HP shield (overheals to 104)
- **Sell confirmation** — optional toggle; selling refunds 30% of total gold invested with 3-second global cooldown
- **Dev mode** (triple-click gold) — infinite gold & lives, custom wave composition via DEV popup, Alt+D toggle
- **Adjustable game speed** — 1× / 2× / 4× / 8× / 16× / 32× / 64× / 128×

### 🖥️ User Interface

- **Drag-to-place** — click-and-drag troop placement from shop cards onto the grid
- **Placement preview** — ghost preview with range circles, DPS/HPS text shown before placing
- **Wave preview panel** — next-wave monster composition with health/damage estimates, Necromancer revive estimates
- **Notification system** — bell icon with toast popups, notification panel with timestamps and action buttons (Update/Skip/Restart)
- **Settings panel** — persistent settings with Save/Cancel, update channel selection, check interval, auto-download toggle
- **About page** — game info, version with release type, GitHub repo link
- **Animated tray windows** — smooth roll-up/down transitions, single-tray constraint
- **Smart cursor** — standard arrow by default, hand pointer on clickable elements (shop, buttons, troops, grid)
- **Hover tooltips** — shop cards show troop stats on hover, stat upgrades highlight on hover
- **UI reorganization** — extracted game rendering from UI rendering, separated panel and cursor logic

### 🔧 Technical & Architecture

- **ES modules** — entire source base migrated to ES2020 modules with clean module boundaries
- **GameRenderer extraction** — game-specific draw calls separated from core Canvas renderer
- **Fixed-timestep simulation** — deterministic game logic decoupled from frame rate via accumulator
- **Background heartbeat** — keeps the main-thread simulation running when the window is backgrounded
- **Zero-allocation coordinate helpers** — `_into` variants (`tileCenterInto`, `pixelToTile`, `shopCardRectInto`) write into pre-allocated output objects
- **Offscreen canvas caching** — static grid/path layers rendered once to offscreen canvases for performance
- **Path2D caching** — troop rounded-rectangle paths created once and reused across frames
- **Data-driven particle effects** — all 9 effect types defined in a single `EFFECT_DEFS` table with generic dispatcher
- **Config-driven design** — all game tuning, monster specs, troop specs, and wave definitions centralized in `config.js`
- **Entity pooling** — projectiles, popups, and tile-index arrays recycled to minimize GC pressure
- **Tile-index spatial lookups** — O(1) neighbor queries via `_monsterTileIndex` and `_troopTileIndex`
- **Code deduplication** — extracted shared `_buildStatLines` helper in shop.js eliminating ~40 lines of duplication

### 🧪 Testing & Quality

- **Complete test suite rewrite** — all 32 test files rewritten from scratch, 13 new test files added
- **1,369 tests** across 41 files (up from ~800 tests across 32 files)
- **≥80% per-file coverage thresholds** enforced on all 4 metrics (statements, branches, functions, lines)
- **Project-wide coverage**: 98.37% statements, 91.35% branches, 98.12% functions, 99.61% lines
- **Save schema pinning** — 6 JSON fixtures in `tests/fixtures/saves/` for migration testing
- **Contract enforcement** — module boundary contracts tested via `contracts.test.js`
- **Canvas hit-test parity** — cursor hit-testing verified against UI coordinates in `uiHitTestParity.test.js`
- **Memory lifecycle tests** — pool recycling, long-session stability, particle cap saturation
- **Triaged limitation tests** — `(known limitation: ...)` markers in every test file documenting intentional gaps
- **Deterministic tests** — all tests use fixed seeds, `vi.useFakeTimers()`, and `vi.mock()` for full isolation

### 📦 Build & Release

- **Electron 42** — upgraded to latest Electron with context isolation
- **electron-builder 26** — NSIS installer with configurable install directory, desktop shortcut
- **Auto-update via GitHub Releases** — channel selection (stable/pre-release), progress bar, one-click install
- **electron-updater 6.6.1** — automatic update detection and installation
- **CI pipeline** — GitHub Actions on ubuntu + windows, Node 20 + 22, enforcing lint + format + coverage thresholds
- **ESLint 8.57** — static analysis with vitest globals configured for test files
- **Prettier** — consistent formatting across the entire codebase

### 📚 Documentation

- **CONTRIBUTING.md** — comprehensive contribution guidelines with setup, workflow, conventions, and testing practices
- **README.md** — updated with latest test count, coverage stats, and version references
- **No changelog existed before this release** — this file is the first

---

## [1.5.0] — 2026-07-14

### Added

- Healer Troop with lock-on healing, multi-target upgrade, and heal beam visual
- Necromancer monster with revive mechanic
- Wave preview panel with estimates
- Placement preview with DPS/HPS calculations
- Notification system with toast popups and bell icon
- Settings panel with persistent config
- About page with version info

### Changed

- Refactored game rendering into dedicated GameRenderer module
- Migrated codebase to ES modules
- Deduplicated settings defaults and version logic
- Expanded test suite to 800+ tests

---

## [1.4.1] — 2026-07-07

### Changed

- Final bug fixes and optimizations
- Code quality polish and deduplication
- Expanded coverage for UI helpers, input mapping, audio, renderer, and cursor hit-testing
