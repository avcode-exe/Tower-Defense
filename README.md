# Tower Defense

A 2D tower defense game built with plain HTML5 + JavaScript.

## Features

- **16×16 grid** with procedurally generated winding paths
- **8 troop types** — melee, ranged, splash, chain lightning, and AoE melee
- **Monster splitting** — each monster above level 1 splits into 2 of level-1 on death (bosses exempt), cascading down to level 1
- **Infinite waves** — waves cycle and scale indefinitely until you're overrun
- **Per-stat upgrade system** — each troop has 3-4 upgradable stats (DMG, RNG, SPD, CHN) with independent level tracks
- **Chain lightning** — Lightning troop hits the closest target then chains to monsters behind it, with stun
- **Speed controls** — 1× / 2× / 4× / 8× / 16× / 32× / 64× / 128×
- **Sell confirmation dialog** — prevents accidental sells

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

Boss HP is doubled at spawn (3474 effective).

Monsters above level 1 split into 2 monsters of level-1 on death. Split children inherit the parent's remaining stun duration if applicable.

## Economy

- **Starting gold**: 1000
- **Max gold**: 1,000,000
- **Starting lives**: 20
- **Sell refund**: 50% of total gold invested (base + all upgrades), rounded up
- **Upgrade costs**: `cost × 2^(level-1)` (1→2: cost×1, 2→3: cost×2, 3→4: cost×4, 4→5: cost×8)

## Controls

- Click a shop card (or press 1-8) then click a tile to place
- Click an existing troop to select stats and sell
- Right-click or Esc to cancel selection
- Space = pause/resume
- Enter = start wave
- R = restart on win/lose
- F2 → confirm → toggle DEV mode (unlimited gold, monster count editor)

## Development

All balance values are in `js/config.js`. Edit `MONSTER_SPECS`, `TROOP_SPECS`, `CONFIG`, or `WAVES` to tune the game.