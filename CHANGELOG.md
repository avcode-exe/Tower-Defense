# Changelog

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
