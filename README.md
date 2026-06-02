# Tower Defense

A 2D tower defense game built with plain HTML5 + JavaScript.

## Features

- **16×16 grid** with procedurally generated winding paths
- **7 troop types** with distinct roles — melee, ranged, AoE splash, and AoE melee
- **Monster splitting** — each monster above level 1 splits into 2 of level-1 on death (bosses exempt), cascading down to level 1
- **Infinite waves** — waves cycle and scale indefinitely until you're overrun
- **Upgrade system** — troops level up 1→5, scaling damage by 1.2× per level
- **Speed controls** — 1× / 2× / 4× / 8× / 16× / 32×

## Troops

| # | Name | Type | Cost | Damage | Range | Speed | Special |
|---|------|------|------|--------|-------|-------|---------|
| 1 | Swordsman | Melee | 50 | 12 | 1 | 0.67s | — |
| 2 | Knight | Melee | 150 | 22 | 1 | 0.9s | — |
| 3 | Archer | Ranged | 70 | 10 | 3 | 1.2s | — |
| 4 | Machine Gun | Ranged | 200 | 6 | 4 | 0.25s | High fire rate |
| 5 | Mage | Ranged | 200 | 25 | 4 | 1.1s | Splash 1.5 tiles |
| 6 | Sniper | Ranged | 250 | 100 | 10 | 2.5s | Long range |
| 7 | Valkyrie | Melee | 180 | 15 | 1 | 1.5s | AoE 360° swing |

## Monsters

| Level | Name | HP | Speed | Reward | Leak DMG |
|-------|------|----|-------|--------|----------|
| 1 | Grunt | 31 | 1.0 | 4g | 1 |
| 2 | Runner | 26 | 1.8 | 6g | 1 |
| 3 | Brute | 126 | 0.7 | 11g | 1 |
| 4 | Elite | 231 | 1.0 | 17g | 2 |
| 5 | Champion | 630 | 0.9 | 36g | 3 |
| B | Boss | 1575 | 0.6 | 81g | 5 |

Monsters have 5% bonus HP applied on spawn.

## Economy

- **Starting gold**: 300
- **Starting lives**: 20
- **Sell refund**: 50% of total gold invested (base + upgrades), rounded up
- **Upgrade costs**: `cost × 2^(level-1)` (1→2: cost×1, 2→3: cost×2, 3→4: cost×4, 4→5: cost×8)

## Controls

- Click a shop card (or press 1-7) then click a tile to place
- Click an existing troop to select; press Sell to remove (50% refund)
- Right-click or Esc to cancel selection
- Space = pause/resume
- Enter = start wave
- R = restart on win/lose
- F2 → confirm → toggle DEV mode (unlimited gold, monster count editor)

## Development

All balance values are in `js/config.js`. Edit `MONSTER_SPECS`, `TROOP_SPECS`, or `WAVES` to tune the game.