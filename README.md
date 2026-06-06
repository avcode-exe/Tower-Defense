# Tower Defense

A 2D tower defense game built with vanilla JavaScript, HTML5 Canvas, and Electron.

![Icon](icon.png)

---

## Features

- **9 troop types** (hotkeys 1-9) — melee, ranged, splash, chain lightning, and siege
- **7 monster types** — Grunt, Runner, Brute, Elite, Champion, Shielded, Boss
- **Monster melee attacks** — monsters stop and attack adjacent troops, dealing damage
- **Troop HP** — troops have health pools and can be destroyed by monsters
- **Upgradeable troops** — 4 independently upgradeable stats per troop (DMG / RNG / SPD / CHN), up to level 5 each
- **Dev mode** (F2) — unlimited gold + custom wave composition editor
- **Adjustable game speed** — 1x / 2x / 4x / 8x / 16x / 32x / 64x / 128x
- **Web Worker heartbeat** — 16ms tick keeps the main-thread sim running when the window is backgrounded
- **Auto-update** — built-in update checker via GitHub Releases
- **16x16 grid** with procedurally generated winding paths
- **Monster splitting** — non-Boss, non-Shielded monsters split into 2 of `level-1` on death (e.g. Champion → 2 Elite)
- **Sell confirmation** — 30% refund with 3-second global cooldown

## Troops

| # | Name | Type | Cost | HP | Damage | Range | Speed | Special |
|---|------|------|------|----|--------|-------|-------|---------|
| 1 | Swordsman | Melee | 70 | 50 | 9 | 1 | 0.67s | — |
| 2 | Knight | Melee | 120 | 120 | 18 | 1 | 0.9s | — |
| 3 | Archer | Ranged | 70 | 30 | 12 | 3 | 1.2s | — |
| 4 | Machine Gun | Ranged | 150 | 40 | 6 | 4 | 0.25s | High fire rate |
| 5 | Mage | Ranged | 180 | 35 | 32 | 3 | 1.3s | Splash 2.0 tiles |
| 6 | Sniper | Ranged | 250 | 25 | 100 | 10 | 2.5s | Long range |
| 7 | Valkyrie | Melee | 150 | 80 | 22 | 1 | 1.2s | AoE 360° swing |
| 8 | Lightning | Ranged | 300 | 40 | 100 | 2 | 3s | Chain 2 (+1/level) + stun 0.5s |
| 9 | Mortar | Ranged | 200 | 30 | 65 | 8 | 3.0s | Splash 2.5 tiles |

**Upgradeable stats per troop:**
- All troops: **DMG** (×1.2 per level), **RNG** (ranged only, +1 tile/level), **SPD** (×0.9 per level, faster)
- Lightning: also **CHN** (+1 chain target per level)
- **Melee troops take 70% reduced damage from monster attacks**

## Monsters

| Level | Name | HP | Speed | Damage | Reward | Leak DMG | Special |
|-------|------|----|-------|--------|--------|----------|---------|
| 1 | Grunt | 34 | 1.0 | 4 | 4g | 1 | — |
| 2 | Runner | 27 | 1.8 | 3 | 6g | 1 | Fast |
| 3 | Brute | 133 | 0.7 | 14 | 11g | 1 | Tanky |
| 4 | Elite | 245 | 1.0 | 18 | 17g | 2 | Splits into 2 Brutes on death |
| 5 | Champion | 667 | 0.9 | 32 | 36g | 3 | Very tanky |
| B | Boss | 1668 | 0.6 | 45 | 200g | 5 | 2x HP, appears wave 10/20/30, heals 15 HP/s |
|| S | Shielded | 173 | 0.8 | 16 | 15g | 1 | Regenerating shield (69 HP, overheals to 104) |

Boss HP is doubled at spawn (3336 effective) and passively heals 15 HP/s. Non-Boss, non-Shielded monsters split into 2 of `level-1` on death (e.g. a Brute spawns 2 Runners; a Champion spawns 2 Elites).

Monsters can attack adjacent troops, dealing their damage stat per hit. Troops have HP and can be destroyed — plan your defenses carefully!

**Melee troops take 70% less damage from monster attacks** — they are your front line. Ranged troops take full damage and must be protected.

## Economy

- **Starting gold**: 1000
- **Max gold**: 1,000,000
- **Starting lives**: 25
- **Sell refund**: 30% of total gold invested, rounded up
- **Upgrade costs**: `round(base × 1.35^(level-1))` (1→2: base cost, 2→3: 1.35× base, 3→4: 1.82× base, 4→5: 2.46× base)

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
| Alt+C | Toggle Controls panel |
| Alt+M | Toggle Monster Info panel |
| Speed buttons | Adjust game speed (1x-128x) in HUD |

## Tech Stack

- **Vanilla JavaScript (ES6+)** — no frameworks, all UI drawn directly on canvas
- **HTML5 Canvas 2D** rendering with `devicePixelRatio` scaling and offscreen canvas caching
- **Web Worker heartbeat** — 16ms tick that keeps the main-thread simulation running at full speed when the window is backgrounded (all actual simulation, AI, and rendering still happen on the main thread)
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
