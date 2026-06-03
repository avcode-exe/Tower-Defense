# Tower Defense

A 2D tower defense game — **framed Electron desktop app** for Windows with auto-update support.

![Icon](icon.png)

---

## Features

- **16×16 grid** with procedurally generated winding paths (regenerates each game)
- **8 troop types** — melee, ranged, splash AoE, chain lightning with stun
- **Monster splitting** — monsters above level 1 split into 2 of level-1 on death (cascading down to level 1)
- **10 waves** + infinite wave cycling (boss on wave 10)
- **Per-stat upgrade system** — each troop has 3-4 upgradable stats (DMG, RNG, SPD, CHN) with independent level tracks
- **Speed controls** — 1× / 2× / 4× / 8× / 16× / 32× / 64× / 128×
- **Sell confirmation dialog** — prevents accidental sells (50% refund)
- **DEV mode** (F2) — unlimited gold + custom wave composition editor
- **Collapsible panels** — minimize HUD / Shop / Preview / Controls for a full-screen map view (click toggle buttons or use Alt+H/S/P/C)
- **Auto-update** — built-in update checker via GitHub Releases
- **Renders at native resolution** with `devicePixelRatio` support and offscreen canvas caching for static map layers

## Troops

| # | Name | Type | Cost | Damage | Range | Speed | Special |
|---|------|------|------|--------|-------|-------|---------|
| 1 | Swordsman | Melee | 50 | 12 | 1 | 0.67s | — |
| 2 | Knight | Melee | 150 | 22 | 1 | 0.9s | — |
| 3 | Archer | Ranged | 70 | 10 | 3 | 1.2s | — |
| 4 | Machine Gun | Ranged | 200 | 6 | 4 | 0.25s | High fire rate |
| 5 | Mage | Ranged | 200 | 20 | 3 | 1.3s | Splash 1.5 tiles |
| 6 | Sniper | Ranged | 250 | 100 | 10 | 2.5s | Long range |
| 7 | Valkyrie | Melee | 180 | 15 | 1 | 1.5s | AoE 360° swing |
| 8 | Lightning | Ranged | 300 | 100 | 2 | 3s | Chain 4 + stun 0.5s |

**Upgradeable stats per troop:**
- All troops: **DMG** (1.2× per level), **RNG** (ranged only, +1 tile/level), **SPD** (0.9× multiplier per level)
- Lightning: also **CHN** (+1 chain target per level)

## Monsters

| Level | Name | HP | Speed | Reward | Leak DMG |
|-------|------|----|-------|--------|----------|
| 1 | Grunt | 35 | 1.0 | 3g | 1 |
| 2 | Runner | 28 | 1.8 | 5g | 1 |
| 3 | Brute | 139 | 0.7 | 10g | 1 |
| 4 | Elite | 255 | 1.0 | 16g | 2 |
| 5 | Champion | 695 | 0.9 | 35g | 3 |
| B | Boss | 1737 | 0.6 | 80g | 5 |

Boss HP is doubled at spawn (3474 effective). Monsters above level 1 split into 2 of level-1 on death.

## Economy

- **Starting gold**: 1000
- **Max gold**: 1,000,000
- **Starting lives**: 20
- **Sell refund**: 50% of total gold invested, rounded up
- **Upgrade costs**: `base × 2^(level-1)` (1→2: base cost, 2→3: 2× base, 3→4: 4× base, 4→5: 8× base)

## Controls

| Key | Action |
|-----|--------|
| Click shop card (or 1-8) | Select troop to place |
| Click tile | Place selected troop |
| Click existing troop | Select for upgrade / sell |
| Right-click / Esc | Cancel selection |
| Space | Pause / Resume |
| Enter | Start wave |
| R | Restart (on win/lose) |
| F2 → Confirm | Toggle DEV mode |
| Alt+H | Toggle HUD panel |
| Alt+S | Toggle Shop panel |
| Alt+P | Toggle Preview panel |
| Alt+C | Toggle Controls panel |

## Installation

### Option 1 — Installer (recommended)

Download the latest `Tower Defense Setup X.X.X.exe` from the [Releases](https://github.com/avcode-exe/Tower-Defense/releases) page and run it. The app will auto-check for updates on each launch.

### Option 2 — Run from source

```bash
git clone https://github.com/avcode-exe/Tower-Defense.git
cd Tower-Defense
npm install
npm start
```

## Building

```bash
# Build installer only (creates dist/Tower Defense Setup X.X.X.exe)
npm run build

# Build + publish to GitHub Releases (requires GH_TOKEN env var)
npm run release
```

The installer is an NSIS package with:
- Custom install directory
- Desktop shortcut
- Windows Apps & Features uninstall entry

## Publishing updates

1. Bump the `"version"` field in `package.json`
2. `git tag vX.X.X` and `git push origin vX.X.X`
3. `npm run release` (requires `GH_TOKEN` env var with `repo` scope)

All users on the previous version will be prompted to update on their next launch.

## Development

All balance values are in `js/config.js`. Edit `MONSTER_SPECS`, `TROOP_SPECS`, `CONFIG`, or `WAVES` to tune the game.

## Tech Stack

- **Engine**: Vanilla JavaScript, Canvas 2D, Web Worker (render loop)
- **Desktop**: Electron 42, electron-builder (NSIS), electron-updater
- **Rendering**: Fixed-timestep simulation, `devicePixelRatio` scaling, offscreen canvas caching
- **No frameworks** — all UI is drawn directly on the canvas