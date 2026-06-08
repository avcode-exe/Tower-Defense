# Tower Defense

A 2D tower defense game built with vanilla JavaScript, HTML5 Canvas, and Electron.

![Icon](icon.png)

---

## Features

- **10 troop types** — melee, ranged, splash, chain lightning, siege, and **Ice Wizard** (splash + slow + shatter)
- **7 monster types** — Grunt, Runner, Brute, Elite, Champion, Shielded, Boss
- **Slow & Shatter** — Ice Wizard slows enemies (50% speed, 2.5s); next hit on slowed target deals +50% bonus damage. **Splash 1.5 tiles** applies slow to all hit monsters.
- **Monster melee attacks** — monsters stop and attack adjacent troops, dealing damage
- **Troop HP** — troops have health pools and can be destroyed by monsters
- **Upgradeable troops** — 4 independently upgradeable stats per troop (DMG / RNG / SPD / CHN), up to level 5 each; Ice Wizard adds **SLW** (slow power/duration/shatter)
- **Dev mode** (F2) — unlimited gold + custom wave composition editor
- **Adjustable game speed** — 1x / 2x / 4x / 8x / 16x / 32x / 64x / 128x
- **Web Worker heartbeat** — 16ms tick keeps the main-thread sim running when the window is backgrounded
- **Auto-update** — built-in update checker via GitHub Releases with channel selection (stable / pre-release)
- **Notification system** — bell icon with toast popups, notification panel with action buttons
- **Settings panel** — persistent settings with Save/Cancel, update channel selection, check interval
- **About page** — game info, version, and GitHub repo link
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
| 0 | Ice Wizard | Ranged | 200 | 60 | 8 | 3 | 1.4s | Splash 1.5 tiles, Slow 50% (2.5s) + Shatter +50% |

**Upgradeable stats per troop:**
- All troops: **DMG** (×1.2 per level), **RNG** (ranged only, +1 tile/level), **SPD** (×0.9 per level, faster)
- Lightning: also **CHN** (+1 chain target per level)
- **Ice Wizard**: also **SLW** (stronger slow, longer duration, bigger shatter per level)
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
| S | Shielded | 173 | 0.8 | 16 | 15g | 1 | Regenerating shield (69 HP, overheals to 104) |

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
| Click shop card | Select troop to place |
| Click tile | Place selected troop |
| Click existing troop | Select for upgrade / sell |
| Right-click / Esc | Cancel selection |
| Space | Pause / Resume |
| Enter | Start wave |
| R | Restart (on win/lose) |
| F2 | Toggle Dev mode |
| Speed buttons | Adjust game speed (1x-128x) in HUD |

## UI Panels

The bottom bar contains buttons for all in-game panels:

| Button | Panel | Description |
|--------|-------|-------------|
| **Monsters** | Monster info | HP, speed, damage, reward, and special abilities for all monster types |
| **Controls** | Controls reference | Keyboard shortcuts and mouse controls |
| **Settings** | Settings | Update channel, auto-download, check interval, Save/Cancel |
| **🔔** | Notifications | Update status, download progress, action buttons (Update/Skip/Restart) |
| **ⓘ** | About | Game name, version with release type, author, GitHub repo link |

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
  - **Update available** → Update / Skip
  - **Download complete** → Restart & Install
- Click any notification in the panel to replay its toast
- Notifications stack newest on top, oldest on bottom

### About Page

Displays the game name, version with release type (e.g. `v1.3.0-beta.1 (Beta)`), author (AvCode-exe), and a clickable link to the GitHub repository.

## Auto-Update

The game checks for updates on startup (configurable) and offers to download them:

1. **Check** — queries GitHub Releases for the latest version matching your channel
2. **Notify** — if an update is found, a toast appears and the notification panel shows Update/Skip buttons
3. **Download** — clicking Update starts the download with a progress bar at the bottom of the screen
4. **Install** — when complete, click Restart & Install to apply the update

**Channel selection:**
- **Release** — only stable releases (e.g. `v1.2.0`)
- **Pre-release** — includes beta, alpha, and RC builds (e.g. `v1.3.0-beta.1`)

Settings persist across reinstalls via `%USERPROFILE%\.tower-defense\settings.json`.

## Tech Stack

- **Vanilla JavaScript (ES6+)** — no frameworks, all UI drawn directly on canvas
- **HTML5 Canvas 2D** rendering with `devicePixelRatio` scaling and offscreen canvas caching
- **Web Worker heartbeat** — 16ms tick that keeps the main-thread simulation running at full speed when the window is backgrounded (all actual simulation, AI, and rendering still happen on the main thread)
- **Electron 42** desktop app with electron-builder (NSIS)
- **electron-updater** for auto-update via GitHub Releases

## Data Storage

The app stores data in the following locations:

| Location | Contents | Survives uninstall? |
|----------|----------|---------------------|
| `%USERPROFILE%\.tower-defense\` | Settings (update channel, preferences) | ✅ Yes |
| `%APPDATA%\tower-defense\` | Settings copy + game saves + logs | ❌ No |
| `%LOCALAPPDATA%\tower-defense-updater\` | Downloaded update installers | ❌ No |

**Details:**

- **`~\.tower-defense\settings.json`** — primary settings file. Persists across reinstalls so your update channel, auto-download preference, and check interval are remembered.
- **`%APPDATA%\tower-defense\settings.json`** — backward-compatibility copy of settings (written alongside the persistent copy).
- **`%APPDATA%\tower-defense\game-save.json`** — in-game save data (troops, waves, gold). Deleted when you start a new game.
- **`%APPDATA%\tower-defense\logs\`** — Electron-generated log files (auto-created).
- **`%LOCALAPPDATA%\tower-defense-updater\`** — cache for downloaded update installers, managed by electron-updater.

To do a clean reset, delete the `.tower-defense` folder in your user profile and the `tower-defense` folder in `%APPDATA%`.

## Building

```bash
npm install        # Install dependencies
npm start          # Run in dev mode
npm run build      # Build NSIS installer (dist/Tower Defense Setup X.X.X.exe)
npm run release    # Build + publish to GitHub Releases (requires GH_TOKEN)
```

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.
