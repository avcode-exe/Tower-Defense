# Tower Defense

A 2D tower defense game built with vanilla JavaScript, HTML5 Canvas, and Electron.

![Icon](icon.png)

---

## Features

- **9 troop types** (hotkeys 1-9) — melee, ranged, splash, chain lightning, and siege
- **Multiple monster types** — Grunt, Runner, Brute, Elite, Champion, Boss, Shielded
- **Upgradeable troops** — up to level 5 each with increasing stats
- **Dev mode** (F2) — unlimited gold + custom wave composition editor
- **Adjustable game speed** — 1x / 2x / 4x / 8x / 16x / 32x / 64x / 128x
- **Web Worker simulation** — fixed 60Hz timestep for smooth 60fps rendering
- **Auto-update** — built-in update checker via GitHub Releases
- **16x16 grid** with procedurally generated winding paths
- **Monster splitting** — Elite monsters split into 2 Grunts on death
- **Sell confirmation** — 50% refund with 3-second cooldown

## Troops

| # | Name | Type | Cost | Damage | Range | Speed | Special |
|---|------|------|------|--------|-------|-------|---------|
| 1 | Swordsman | Melee | 70 | 12 | 1 | 0.67s | — |
| 2 | Knight | Melee | 150 | 22 | 1 | 0.9s | — |
| 3 | Archer | Ranged | 70 | 10 | 3 | 1.2s | — |
| 4 | Machine Gun | Ranged | 200 | 6 | 4 | 0.25s | High fire rate |
| 5 | Mage | Ranged | 200 | 28 | 3 | 1.3s | Splash 2.0 tiles |
| 6 | Sniper | Ranged | 250 | 100 | 10 | 2.5s | Long range |
| 7 | Valkyrie | Melee | 180 | 15 | 1 | 1.5s | AoE 360° swing |
| 8 | Lightning | Ranged | 300 | 100 | 2 | 3s | Chain 4 + stun 0.5s |
| 9 | Mortar | Ranged | 250 | 35 | 8 | 3.0s | Splash 2.0 tiles |

**Upgradeable stats per troop:**
- All troops: **DMG** (1.2x per level), **RNG** (ranged only, +1 tile/level), **SPD** (0.9x multiplier per level)
- Lightning: also **CHN** (+1 chain target per level)

## Monsters

| Level | Name | HP | Speed | Reward | Leak DMG | Special |
|-------|------|----|-------|--------|----------|---------|
| 1 | Grunt | 34 | 1.0 | 4g | 1 | — |
| 2 | Runner | 27 | 1.8 | 6g | 1 | Fast |
| 3 | Brute | 133 | 0.7 | 11g | 1 | Tanky |
| 4 | Elite | 245 | 1.0 | 17g | 2 | Splits into 2 Grunts on death |
| 5 | Champion | 667 | 0.9 | 36g | 3 | Very tanky |
| B | Boss | 1668 | 0.6 | 81g | 5 | 2x HP, appears wave 10/20/30 |
| S | Shielded | 115 | 0.8 | 15g | 1 | Regenerating shield (60 HP) |

Boss HP is doubled at spawn (3336 effective). Monsters above level 1 split into 2 of level-1 on death.

## Economy

- **Starting gold**: 1000
- **Max gold**: 1,000,000
- **Starting lives**: 20
- **Sell refund**: 50% of total gold invested, rounded up
- **Upgrade costs**: `base x 2^(level-1)` (1->2: base cost, 2->3: 2x base, 3->4: 4x base, 4->5: 8x base)

## Controls

| Key | Action |
|-----|--------|
| Click shop card (or 1-9) | Select troop to place |
| Click tile | Place selected troop |
| Click existing troop | Select for upgrade / sell |
| Right-click / Esc | Cancel selection |
| Space | Pause / Resume |
| Enter | Start wave |
| R | Restart (on win/lose) |
| F2 | Toggle Dev mode |
| F3 | Toggle monster info |
| Alt+C | Toggle Controls panel |
| Alt+M | Toggle Monster Info panel |
| Speed buttons | Adjust game speed (1x-128x) in HUD |

## Tech Stack

- **Vanilla JavaScript (ES6+)** — no frameworks, all UI drawn directly on canvas
- **HTML5 Canvas 2D** rendering with `devicePixelRatio` scaling and offscreen canvas caching
- **Web Worker** for fixed-timestep simulation (60Hz)
- **Electron 42** desktop app with electron-builder (NSIS)
- **electron-updater** for auto-update via GitHub Releases

## Building

```bash
npm install        # Install dependencies
npm start          # Run in dev mode
npm run build      # Build NSIS installer (dist/Tower Defense Setup X.X.X.exe)
npm run release    # Build + publish to GitHub Releases (requires GH_TOKEN)
```

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.
