# 2D Tower Defense - Development Plan

## 1. Game Concept

A 2D grid-based tower defense on a 32x32 map. A randomly generated winding path
crosses the map from one edge to another. Monsters travel along the path and
the player places static defense troops on empty tiles to defeat them. Defeated
monsters award coins; the player buys troops with coins and can sell them at
half price.

- **Win condition:** survive all 10 waves.
- **Lose condition:** player lives reach 0.
- **Tech stack:** plain JavaScript + HTML5 Canvas, single-folder, no build step.
- **Style:** simple geometric shapes for v1 (colored circles/rects with outlines),
  pixel-art pass later.

## 2. Architecture

Single-page app, no frameworks. Game loop driven by `requestAnimationFrame`
with a fixed-timestep simulation accumulator so gameplay is deterministic
regardless of frame rate.

```
index.html
css/style.css
js/
  main.js          - bootstraps Game
  game.js          - Game class, loop, state machine
  config.js        - all balance numbers
  utils.js         - seeded RNG, math, geometry
  grid.js          - 32x32 grid, tile states
  pathGenerator.js - randomized DFS path builder
  monster.js       - Monster class + monster specs
  troop.js         - Troop class + troop specs
  projectile.js    - Projectile + AoE
  waveManager.js   - wave data, spawning, win/lose
  economy.js       - gold, buy, sell
  combat.js        - target selection + damage resolution
  input.js         - mouse + keyboard
  ui.js            - HUD + shop rendering
  renderer.js      - canvas draw helpers
```

Game states: `MENU`, `PRE_WAVE` (build phase), `WAVE_ACTIVE`, `PAUSED`,
`VICTORY`, `DEFEAT`. Transitions are explicit in `Game`.

## 3. Map and Path

- Logical 32x32 grid, each cell renders at 32 px (1024x1024 play area, scaled
  to viewport with letterboxing).
- Tile states: `EMPTY`, `PATH`, `BUILDABLE` (same as empty but visually
  highlighted in placement mode), `BLOCKED` (decoration, off-limits for v1).
- Buildable rule: only `EMPTY`/`BUILDABLE` tiles are valid for troops.
- Path generation algorithm:
  1. Pick random START cell on the left edge, random END cell on the right edge.
  2. Run randomized DFS (recursive backtracker) to carve a maze that visits
     every cell. This produces a spanning tree.
  3. Walk the tree from START to END to get the unique path between them.
  4. Reject paths shorter than 50 tiles or that hug the outer wall and
     regenerate.
- Reproducible: support a `seed` parameter; default = random.

## 4. Monsters (5 levels + Boss)

All monsters are data-driven via `MONSTER_SPECS` in `config.js`.

| Lvl | Name      | HP   | Speed | Reward | Leak |
|----:|-----------|-----:|------:|-------:|-----:|
|  1  | Grunt     |   30 |  1.00 |      6 |    1 |
|  2  | Runner    |   25 |  1.80 |      9 |    1 |
|  3  | Brute     |  120 |  0.70 |     18 |    1 |
|  4  | Elite     |  220 |  1.00 |     35 |    2 |
|  5  | Champion  |  600 |  0.90 |     90 |    3 |
|  B  | Boss      | 1500 |  0.60 |    250 |    5 |

A monster follows the waypoint list using an interpolated position
(`progress` along total path length). When it reaches the end it deals
`leak` damage to the player and is removed.

## 5. Troops (buy with coins, sell at 50%)

Two categories:

- **Melee (range = 1):** occupies the cell and hits monsters on that tile.
  Cheap, high sustained DPS, body-block when placed on or adjacent to the path.
- **Ranged (range > 1):** fires a projectile at the furthest-along monster
  in range. Cannot fire if a monster is in the troop's own tile (no cheese).

Initial roster (`TROOP_SPECS` in `config.js`):

| Type    | Name       | Cost | Damage | Range | AtkSpd | Splash | HP  |
|---------|------------|-----:|-------:|------:|-------:|-------:|----:|
| Melee   | Swordsman  |   50 |     12 |     1 |    1.0 |      0 | 200 |
| Melee   | Knight     |  150 |     22 |     1 |    1.1 |      0 | 500 |
| Ranged  | Archer     |   70 |     10 |     4 |    1.2 |      0 |  80 |
| Ranged  | Crossbow   |  120 |     28 |     5 |    0.7 |      0 |  80 |
| Ranged  | Mage       |  200 |     18 |     4 |    0.9 |      1 |  80 |
| Ranged  | Cannon     |  250 |     60 |     5 |    0.4 |      2 | 100 |

Selling: refund `floor(cost / 2)`. Selling during a wave is allowed (with a
short 0.5s cooldown per tile to prevent spam). Selecting an existing troop
shows its range and a "Sell" button.

## 6. Combat Resolution Order (per fixed step)

1. Troops pick / refresh targets every 0.2 s.
2. Melee troops deal damage directly to the monster on their tile.
3. Ranged troops spawn a `Projectile` toward the target's current position.
4. Projectiles update, on arrival apply damage and optional AoE (splash
   radius in tiles, circle-vs-center-point test).
5. Monsters update HP; on death award reward and spawn a coin popup; on
   reaching the end deal leak damage to player lives and despawn.

This ordering avoids order-dependence bugs and makes damage predictable.

## 7. Economy

- Starting gold: 150.
- Coin popup on monster kill (`+N` floating text).
- Selling refund: `Math.floor(cost / 2)`.
- "Start Wave" button is enabled in `PRE_WAVE`; spawning begins on click and
  state moves to `WAVE_ACTIVE`.

## 8. Wave Structure (10 waves)

| Wave | Composition |
|-----:|-------------|
|  1   | 8x Grunt |
|  2   | 12x Grunt |
|  3   | 10x Runner |
|  4   | 8x Brute, 6x Runner |
|  5   | 12x Brute |
|  6   | 8x Elite, 8x Brute |
|  7   | 12x Elite |
|  8   | 10x Elite, 8x Runner |
|  9   | 15x Elite, 4x Champion |
| 10   | 6x Champion, 1x Boss |

Spawn cadence: 0.7 s between monsters, halved for Runners (0.4 s).
Between waves: full build phase. Next-wave preview shows total monster count.

## 9. UI / HUD

- **Top bar:** gold, lives, current wave, Start Wave button, speed
  (1x/2x/3x), pause.
- **Right panel:** shop cards with name, cost, range, hotkey 1-6, click
  to select for placement.
- **Bottom strip:** next-wave preview (count + icons).
- **Center:** the 1024x1024 play area, scaled to fit.
- **On-canvas feedback:** range circle on selected troop / placement ghost,
  red tile highlight for invalid placement, floating damage numbers, coin
  popups, HP bars above monsters.

Keyboard:
- `Space` - pause / resume
- `1`-`6` - select troop in shop
- `Esc` / right-click - cancel placement
- `Enter` - start wave

## 10. Visual & Audio

- v1 visuals: filled circles for monsters (color by level), colored squares
  for troops (color by type), thin path lines, gold coin icon, red heart
  icon. Minimal but readable.
- Future: sprite sheets, parallax background, hit/place/sell/victory/defeat
  sounds, ambient music.

## 11. Build Phases

| Phase | Deliverable |
|------:|-------------|
| 0 | Skeleton: HTML, CSS, canvas, main loop, state machine |
| 1 | Grid + randomized DFS path generator + render |
| 2 | Monster waypoint following, leak detection, lives |
| 3 | Troops (melee & ranged) + projectiles + AoE + target selection |
| 4 | Shop UI: buy, sell (50% refund), range preview, hotkeys |
| 5 | Wave manager: 10-wave data, spawning, win/lose screens |
| 6 | Polish: damage numbers, coin popups, speed controls, pause, balance pass |

## 12. Balance Targets

- Wave 1 winnable with 1-2 Swordsmen.
- Wave 5 forces at least one ranged troop.
- Wave 10 winnable with mixed composition (frontline melee + 2-3 ranged).
- No single troop is strictly optimal; melee and ranged serve different roles.
- Random path never produces an unwinnable layout (length >= 50 tiles).

## 13. Future / Post-v1

- Map seeds (daily challenge), seeded leaderboard.
- Multiple map themes (forest, desert, ice).
- Troop upgrades (3 tiers each).
- Element system with monster resistances.
- Hero unit with active abilities.
- Endless mode.
- Save / load mid-game.
