# Tower Defense

A 2D tower defense game built with vanilla JavaScript, HTML5 Canvas, and Electron.

![Icon](icon.png)

---

## Features

- **ES modules** — source organized in `src/` with clean module boundaries
- **Canvas 2D rendering** — game world drawn on HTML5 Canvas, with canvas overlays plus DOM panels for settings/help
- **Electron desktop app** — packaged with electron-builder (NSIS), auto-updates via GitHub Releases
- **12 troop types** — melee, ranged, splash, chain lightning, siege, **Ice Wizard** (splash + slow + shatter), **Healer** (support healing + monster damage), and **Flamer** (melee burn DoT)
- **9 monster types** — Grunt, Runner, Brute, Elite, Champion, Necromancer, Shielded, Boss, Spear
- **Modernized icon** — redesigned tower icon with glowing beacon and vibrant gradients
- **Slow & Shatter** — Ice Wizard slows enemies (50% speed, 2.5s); next hit on slowed target deals +50% bonus damage. **Splash 1.5 tiles** applies slow to all hit monsters.
- **Three monster attack modes** — **stop** (default, pauses to attack), **slow** (slows near troops, attacks while moving), **pass** (penetration, hits each troop once)
- **Troop HP** — troops have health pools and can be destroyed by monsters
- **Upgradeable troops** — 4 independently upgradeable stats per troop (DMG / RNG / SPD plus type-specific stats), up to level 5 each; Lightning adds **CHN**, Healer adds **TGT**, Ice Wizard adds **SLW**
- **Dev mode** (triple-click gold) — infinite gold & lives, custom wave composition via dedicated DEV popup. Start Wave button is greyed out in dev mode (use DEV popup to launch custom waves)
- **Adjustable game speed** — 1x / 2x / 4x / 8x / 16x / 32x / 64x / 128x
- **Background heartbeat** — keeps the main-thread sim running when the window is backgrounded
- **Auto-update** — built-in update checker via GitHub Releases with channel selection (stable / pre-release)
- **Notification system** — bell icon with toast popups, notification panel with action buttons
- **Settings panel** — persistent settings with Save/Cancel, update channel selection, check interval
- **About page** — game info, version, and GitHub repo link
- **Animated tray windows** — smooth roll-up/down transitions, only one tray window open at a time
- **Smart cursor** — standard arrow by default, hand pointer on clickable elements (shop, buttons, troops, grid)
- **16x16 grid** with procedurally generated winding paths
- **Necromancer** — revives dead allied monsters within range (up to 4 per Necromancer); revived monsters take 50% reduced damage
- **Monster splitting** — non-Boss, non-Shielded, non-pass-mode monsters split into 2 of `level-1` on death (e.g. Champion → 2 Elite)
- **Sell confirmation** — 30% refund with 3-second global cooldown

## Troops

| #   | Name        | Type    | Cost | HP  | Damage | Range | Speed | Special                                                                 |
| --- | ----------- | ------- | ---- | --- | ------ | ----- | ----- | ----------------------------------------------------------------------- |
| 1   | Swordsman   | Melee   | 70   | 50  | 9      | 1     | 0.67s | —                                                                       |
| 2   | Knight      | Melee   | 120  | 120 | 18     | 1     | 0.9s  | —                                                                       |
| 3   | Flamer      | Melee   | 160  | 70  | 14     | 1     | 0.75s | Burn DoT 3 stacks / 3s / 0.5s ticks                                     |
| 4   | Archer      | Ranged  | 70   | 30  | 12     | 3     | 1.2s  | —                                                                       |
| 5   | Machine Gun | Ranged  | 150  | 40  | 6      | 4     | 0.25s | High fire rate                                                          |
| 6   | Mage        | Ranged  | 180  | 35  | 32     | 3     | 1.3s  | Splash 2.0 tiles                                                        |
| 7   | Sniper      | Ranged  | 250  | 25  | 100    | 10    | 2.5s  | Long range                                                              |
| 8   | Valkyrie    | Melee   | 150  | 80  | 22     | 1     | 1.2s  | AoE 360° swing                                                          |
| 9   | Lightning   | Ranged  | 300  | 40  | 100    | 2     | 3s    | Chain 2 (+1/level) + stun 0.5s                                          |
| 10  | Mortar      | Ranged  | 200  | 30  | 65     | 8     | 3.0s  | Splash 2.5 tiles                                                        |
| 11  | Ice Wizard  | Ranged  | 200  | 60  | 6      | 3     | 1.4s  | Splash 1.5 tiles, Slow 50% (2.5s) + Shatter +50%                        |
| 12  | Healer      | Support | 150  | 40  | 8 heal | 3     | 0.5s  | Heals damaged allies; 3 dmg to monsters in range; TGT increases targets |

**Upgradeable stats per troop:**

- All troops: **DMG** (×1.2 per level), **RNG** (ranged only, +1 tile/level), **SPD** (×0.9 per level, faster)
- Lightning: also **CHN** (+1 chain target per level)
- **Flamer**: also **BRN** through DMG upgrades; higher damage increases burn tick damage and displayed burn DPS
- **Healer**: also **TGT** (more simultaneous heal targets); deals 3 damage to monsters in heal range
- **Ice Wizard**: also **SLW** (stronger slow, longer duration, bigger shatter per level)
- **Melee troops take 70% reduced damage from monster attacks**

## Monsters

| Level | Name        | HP   | Speed | Damage | Reward | Leak DMG | Special                                                             |
| ----- | ----------- | ---- | ----- | ------ | ------ | -------- | ------------------------------------------------------------------- |
| 1     | Grunt       | 34   | 1.0   | 4      | 4g     | 1        | —                                                                   |
| 2     | Runner      | 27   | 3.0   | 6      | 6g     | 1        | Fast, penetration (hits each troop once then moves on)              |
| 3     | Brute       | 133  | 0.7   | 14     | 11g    | 1        | Tanky                                                               |
| 4     | Elite       | 245  | 1.0   | 18     | 17g    | 2        | Splits into 2 Brutes on death                                       |
| 5     | Champion    | 667  | 0.9   | 32     | 36g    | 3        | Very tanky                                                          |
| Y     | Necromancer | 220  | 0.8   | 18     | 18g    | 2        | Revives up to 4 dead allies (50% HP), revived take 50% less dmg     |
| B     | Boss        | 1668 | 0.6   | 45     | 200g   | 5        | 2x HP, appears wave 10/20/30, heals 15 HP/s                         |
| S     | Shielded    | 173  | 0.8   | 16     | 15g    | 1        | Regenerating shield (69 HP, overheals to 104)                       |
| X     | Spear       | 50   | 2.0   | 3      | 5g     | 1        | Slows to half speed near troops, attacks closest in 2.5 tile radius |

Boss HP is doubled at spawn (3336 effective) and passively heals 15 HP/s. Necromancers revive dead allies within 2-tile range (up to 4 per Necromancer); revived monsters become `reviveImmune` and take 50% reduced damage. Non-Boss, non-Shielded, non-pass-mode monsters split into 2 of `level-1` on death (e.g. a Brute spawns 2 Runners; a Champion spawns 2 Elites).

Monsters have three attack modes:

- **stop** (default): Stops moving when a troop is in range, attacks, then resumes. Used by Grunt, Brute, Elite, Champion, Boss, Shielded.
- **slow**: Moves at normal speed when no troop is nearby. Slows to half speed when a defense troop is in range and attacks the closest one. Used by Spear.
- **pass**: Always moves at full speed. Deals damage to troops while passing — each troop is hit at most once (penetration). Used by Runner.

Troops have HP and can be destroyed — plan your defenses carefully!

**Melee troops take 70% less damage from monster attacks** — they are your front line. Ranged troops take full damage and must be protected.

## Economy

- **Starting gold**: 1000
- **Max gold**: 1,000,000
- **Starting lives**: 25
- **Sell refund**: 30% of total gold invested, rounded up
- **Upgrade costs**: `round(base × 1.35^(level-1))` (1→2: base cost, 2→3: 1.35× base, 3→4: 1.82× base, 4→5: 2.46× base)

## Controls

| Key                  | Action                             |
| -------------------- | ---------------------------------- |
| Click shop card      | Select troop to place              |
| Click tile           | Place selected troop               |
| Click existing troop | Select for upgrade / sell          |
| Right-click / Esc    | Cancel selection                   |
| Space                | Pause / Resume                     |
| Enter                | Start wave                         |
| R                    | Restart (on win/lose)              |
| Triple-click gold    | Toggle Dev mode confirmation       |
| Alt + D              | Toggle DEV popup (dev mode only)   |
| Speed buttons        | Adjust game speed (1x-128x) in HUD |

## UI Panels

The bottom bar contains buttons for all in-game panels:

| Button       | Panel              | Description                                                            |
| ------------ | ------------------ | ---------------------------------------------------------------------- |
| **Monsters** | Monster info       | HP, speed, damage, reward, and special abilities for all monster types |
| **Controls** | Controls reference | Keyboard shortcuts and mouse controls                                  |
| **DEV**      | Dev tools          | Custom wave spawner with per-monster count controls (dev mode only)    |
| **Settings** | Settings           | Update channel, auto-download, check interval, Save/Cancel             |
| **🔔**       | Notifications      | Update status, download progress, action buttons (Update/Cancel/Restart) |
| **ⓘ**        | About              | Game name, version with release type, author, GitHub repo link         |

### Settings Panel

- **Update channel**: Choose between Release (stable only) or Pre-release (beta, alpha, rc)
- **Auto-download**: When enabled, updates download automatically after confirmation
- **Check interval**: How often to check for updates (15–120 minutes)
- **Check Now**: Manually trigger an update check
- **Save / Cancel**: Persist or discard changes; settings survive reinstalls

### Notification System

- **Toast popups** appear in the bottom-right corner and fade away after a few seconds
- **Notification panel** (bell icon) shows all notifications with timestamps
- **Action buttons** appear inline for actionable notifications:
  - **Update available** → Update / Cancel
  - **Download complete** → Restart & Install
- Click any notification in the panel to replay its toast
- Notifications stack newest on top, oldest on bottom

### About Page

Displays the game name, version with release type (e.g. `v1.6.0`), author (AvCode-exe), and a clickable link to the GitHub repository.

## Auto-Update

The game checks for updates on startup (configurable) and offers to download them:

1. **Check** — queries GitHub Releases for the latest version matching your channel
2. **Notify** — if an update is found, a toast appears and the notification panel shows Update/Cancel buttons
3. **Download** — clicking Update starts the download with a progress bar at the bottom of the screen
4. **Install** — when complete, click Restart & Install to apply the update

**Channel selection:**

- **Release** — only stable releases (e.g. `v1.2.0`)
- **Pre-release** — includes beta, alpha, and RC builds (e.g. `v1.6.0-beta.2`)

Settings persist across reinstalls via `%USERPROFILE%\.tower-defense\settings.json`.

## Tech Stack

- **ES modules** — source organized in `src/` with subdirectories for rendering and UI modules
- **Vanilla JavaScript (ES6+)** — no frameworks, game world rendered on canvas with DOM panels for configuration/help
- **HTML5 Canvas 2D** rendering with `devicePixelRatio` scaling and offscreen canvas caching
- **Background heartbeat** — keeps the main-thread simulation running at full speed when the window is backgrounded (all actual simulation, AI, and rendering still happen on the main thread)
- **Electron 42** desktop app with electron-builder (NSIS)
- **electron-updater** for auto-update via GitHub Releases
- **Vitest** — unit + integration test suite (**1,885 tests**, 49 files, **92.93% branch coverage**)
- **Performance benchmarks** — **50 hot-path benchmarks** across 15 engine areas (tile index, monster index, combat, AoE, projectiles, waves, particles, Healer, economy, state helpers) in `tests/benchmarkHotPaths.test.js`
- **ESLint** — static code analysis for bug detection and code quality
- **Prettier** — consistent code formatting across all source files

## Code Quality

The codebase follows consistent patterns for maintainability:

- **Tile-index spatial lookups** — O(1) neighbor queries via `_monsterTileIndex` and `_troopTileIndex`, with a shared `monstersInRange()` helper eliminating scan duplication
- **Data-driven particle effects** — all 9 effect types defined in a single `EFFECT_DEFS` table with identical configs, spawned via a generic `_spawnEffect()` dispatcher
- **Config-driven design** — all game tuning constants, monster specs, troop specs, and wave definitions live in `config.js`
- **Entity pooling** — projectiles, popups, and tile-index arrays are recycled to minimize GC pressure
- **Offscreen canvas caching** — static grid/path layers rendered once to offscreen canvases
- **Path2D caching** — troop rounded-rectangle paths created once and reused across frames
- **Expanded test coverage** — dedicated coverage for UI helpers, UI constants, input mapping, audio effects, renderer transforms/cache behavior, toast notifications, cursor hit-testing, and release-feed parsing
- **Fixed-timestep simulation** — deterministic game logic decoupled from frame rate via accumulator
- **Zero-allocation coordinate helpers** — `_into` variants (`tileCenterInto`, `pixelToTile`, `shopCardRectInto`) write into pre-allocated output objects
- **6 performance optimizations applied:**
  - **Troop index dirty flag** — `_buildTroopTileIndex()` deferred until troops actually change (~36× faster cleanup, 97% reduction)
  - **Monster tile index swap-remove** — O(n) `indexOf`+`splice` replaced with O(1) tracked-position swap-remove
  - **`monstersInRange` scratch buffer** — per-call array allocation eliminated via game-owned reusable buffer
  - **`_tmpCfg` reuse** — particle config object allocation eliminated per effect spawn
  - **Healer scratch buffer** — Healer `_tryHealAllies` per-frame array allocation eliminated
  - **Pending-attack queue** — `_stepMonsterAttacks` no longer scans all monsters; drains a collected queue instead

## Project Structure

```
src/
  main.js            # App entry point
  game.js            # Core game loop and state
  gameRuntime.js     # Runtime execution and wave orchestration
  config.js          # Game constants and tuning values
  grid.js            # 16x16 grid management
  troop.js           # Troop definitions, upgrades, and combat
  monster.js         # Monster AI, pathfinding, splitting, and attack modes
  projectile.js      # Projectile logic (bullets, chains, splash)
  waveManager.js     # Wave spawning and progression
  pathGenerator.js   # Procedural path generation
  particles.js       # Data-driven particle effects with pooling
  audio.js           # Sound management
  input.js           # Keyboard and mouse input
  gamePersistence.js # Save/load game state
  updateManager.js   # Auto-update logic
  utils.js           # Shared helpers
  rendering/
    renderer.js      # Core Canvas 2D renderer
    gameRenderer.js  # Game-specific rendering (troops, monsters, projectiles)
  ui/
    index.js         # UI module aggregator
    hud.js           # Heads-up display (gold, lives, wave info)
    shop.js          # Troop shop panel
    shieldShop.js    # Shield shop panel
    overlays.js      # Win/lose overlays
    placement.js     # Troop placement logic
    preview.js       # Troop preview on hover
    toast.js         # Toast notification system
    constants.js     # UI layout constants
    utils.js         # UI helper functions
tests/
  helpers.js              # Shared test utilities (makeGame, makeTileIndex, longPath, etc.)
  config.test.js          # CONFIG, MONSTER_SPECS, TROOP_SPECS, WAVES validation
  grid.test.js            # Grid and TILE constants
  utils.test.js           # Utility functions (clamp, lerp, dist, pixelToTile, etc.)
  pathGenerator.test.js   # Procedural path generation
  projectile.test.js      # Projectile logic
  particles.test.js       # Particle effects
  game.test.js            # Core game: canPlace, placeTroop, sellTroop, upgrades, combat
  gameRuntime.test.js     # Runtime loop, pause render loop, resize, and state transitions
  monster.test.js         # Monster constructor, AI, combat, splitting, necromancer, shatter
  monsterIntegration.test.js # Monster spawning, movement, lifecycle, mixed interactions
  troop.test.js           # Troop stats, upgrades, healing, shield, healer, chain lightning
  persistence.test.js     # Save/restore serialization, game world factory
  waveManager.test.js     # Wave queue, necromancer shuffling, custom waves, preview
  updateManager.test.js   # Auto-update filtering, settings, electron integration
  integration.test.js     # End-to-end: melee/ranged combat, selling, upgrading, game speed
  combatIntegration.test.js # Troop-specific combat: splash, chain, mortar, knight, sniper
  goldEconomy.test.js     # Economy: costs, refunds, upgrades, shields, kill rewards
  performance.test.js     # Performance: step throughput, entity scaling, memory stability
  memoryLeak.test.js      # Memory: entity lifecycle, pool recycling, long sessions
  devMode.test.js         # Dev mode economy and spawn mechanics
  placementPreview.test.js # Placement preview DPS/HPS calculations
  versioning.test.js      # Beta release versioning logic
  githubReleaseFeed.test.js # GitHub Atom feed parsing
  uiUtils.test.js         # UI rounded rect, tooltip, text wrapping, toggle hit tests
  uiConstants.test.js     # UI layout constants and color tokens
  input.test.js           # Mouse, wheel, context menu, and keyboard input mapping
  audio.test.js           # AudioManager context, volume, mute, and SFX node chains
  renderer.test.js        # Canvas renderer init, resize, transforms, and static layers
  toast.test.js           # Toast creation, classes, click removal, and timers
  gameRendererCursor.test.js # Cursor hit-testing for UI, troops, placement, and dialogs
  smoke.test.js           # Installer smoke test (entry points, file existence)
electron-main.js     # Electron main process
preload.cjs         # Electron preload script (CommonJS for sandbox compat)
index.html          # Single-page canvas host
css/                # Minimal styles (tray windows, notifications)
```

## Data Storage

The app stores data in the following locations:

| Location                                | Contents                               | Survives uninstall? |
| --------------------------------------- | -------------------------------------- | ------------------- |
| `%USERPROFILE%\.tower-defense\`         | Settings (update channel, preferences) | ✅ Yes              |
| `%APPDATA%\tower-defense\`              | Settings copy + game saves + logs      | ❌ No               |
| `%LOCALAPPDATA%\tower-defense-updater\` | Downloaded update installers           | ❌ No               |

**Details:**

- **`~\.tower-defense\settings.json`** — primary settings file. Persists across reinstalls so your update channel, auto-download preference, and check interval are remembered.
- **`%APPDATA%\tower-defense\settings.json`** — backward-compatibility copy of settings (written alongside the persistent copy).
- **`%APPDATA%\tower-defense\game-save.json`** — in-game save data (troops, waves, gold). Deleted when you start a new game.
- **`%APPDATA%\tower-defense\logs\`** — Electron-generated log files (auto-created).
- **`%LOCALAPPDATA%\tower-defense-updater\`** — cache for downloaded update installers, managed by electron-updater.

To do a clean reset, delete the `.tower-defense` folder in your user profile and the `tower-defense` folder in `%APPDATA%`.

## Building

```bash
npm install          # Install dependencies
npm start            # Run in dev mode
npm run build        # Build NSIS installer (dist/Tower Defense Setup X.X.X.exe)
npm run release      # Build + publish to GitHub Releases (requires GH_TOKEN)
npm run lint         # Check code for bugs and issues
npm run lint:fix     # Auto-fix lint issues
npm run format       # Reformat all code with Prettier
npm run format:check  # Check formatting without modifying files
npm test             # Run test suite (1,885 tests)
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with code coverage report
npm run test:bench    # Run performance hot-path benchmarks (50 tests)
```

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.
