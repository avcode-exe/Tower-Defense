// Game: orchestrator. Owns all entities, runs the fixed-timestep loop, and
// routes input to logic.

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    RENDERER.init(canvas);

    this.state = 'PRE_WAVE';   // PRE_WAVE | WAVE_ACTIVE | PAUSED | VICTORY | DEFEAT
    this.paused = false;
    this.speed = 1;
    this.gold = CONFIG.STARTING_GOLD;
    this.lives = CONFIG.STARTING_LIVES;
    this.accumulator = 0;
    this.lastTime = 0;
    this.selectedSpec = null;
    this.selectedTroopIndex = -1;
    this.sellCooldown = new Map(); // troopId -> seconds remaining

    // World.
    this.grid = new Grid();
    this.seed = Math.floor(Math.random() * 0xffffffff);
    this.waypoints = generatePath(this.seed);
    this.markPathTiles();

    // Entities.
    this.monsters = [];
    this.troops = [];
    this.projectiles = [];
    this.popups = []; // floating text popups ({text, x, y, t, color})

    this.wave = new WaveManager();

    // Static 0/1/2/etc. spawn id counter used for popup stability.
    this._idCounter = 0;

    window.addEventListener('resize', () => RENDERER.resize(canvas));

    this.devMode = false;
    this.devWarningTimer = 0;
    this.devConfirmPending = false;
    this.resetConfirmPending = false;
    this.sellConfirmPending = false;
    this.sellConfirmTroopIndex = -1;
    this.devMonsterCounts = {1:0, 2:0, 3:0, 4:0, 5:0, B:0};
  }

  markPathTiles() {
    for (const [gx, gy] of this.waypoints) {
      this.grid.set(gx, gy, TILE.PATH);
    }
  }

  canPlace(gx, gy, spec) {
    if (!this.devMode && this.gold < spec.cost) return false;
    if (!this.grid.isBuildable(gx, gy)) return false;
    for (const t of this.troops) {
      if (t.alive && t.gx === gx && t.gy === gy) return false;
    }
    return true;
  }

  placeTroop(spec, gx, gy) {
    if (!this.canPlace(gx, gy, spec)) return false;
    const t = new Troop(spec, gx, gy);
    t._id = this._idCounter++;
    this.troops.push(t);
    if (!this.devMode) this.gold -= spec.cost;
    return true;
  }

  sellTroop(index) {
    const t = this.troops[index];
    if (!t || !t.alive) return;
    const cd = this.sellCooldown.get(t._id) || 0;
    if (cd > 0) return;
    t.alive = false;
    this.grid.set(t.gx, t.gy, TILE.EMPTY);
    RENDERER.markCacheDirty();
    if (!this.devMode) {
      const refund = Math.ceil(t.getTotalInvested() * CONFIG.SELL_REFUND_RATIO);
      this.gold = Math.min(this.gold + refund, CONFIG.MAX_GOLD);
      this.popups.push({ text: '+' + refund, x: t.x, y: t.y, t: 1.2, color: CONFIG.COLORS.gold });
    }
    if (this.selectedTroopIndex === index) this.selectedTroopIndex = -1;
  }

  upgradeTroopStat(index, stat) {
    const t = this.troops[index];
    if (!t || !t.alive) return;
    if (t.isMaxed(stat)) return;
    const cost = t.getUpgradeCost(stat);
    if (this.gold < cost) return;
    this.gold -= cost;
    t.upgradeStat(stat);
    this.popups.push({ text: stat.toUpperCase() + ' +1', x: t.x, y: t.y - 10, t: 1.2, color: '#f1c40f' });
  }

  spawnMonster(level) {
    const m = new Monster(level, this.waypoints);
    m._id = this._idCounter++;
    this.monsters.push(m);
  }

  // Apply damage to a monster and queue reward popup. Returns true if killed.
  damageMonster(m, amount) {
    if (!m.alive) return false;
    const r = m.takeDamage(amount);
    if (r.killed) {
      this.gold = Math.min(this.gold + r.reward, CONFIG.MAX_GOLD);
      this.popups.push({ text: '+' + r.reward, x: m.x, y: m.y - 8, t: 1.2, color: CONFIG.COLORS.gold });
      // Split monster: if level > 1, spawn 2 monsters of level-1 at this position.
      if (m.level !== 'B' && m.level > 1) {
        const childLvl = m.level - 1;
        for (let i = 0; i < 2; i++) {
          const child = new Monster(childLvl, this.waypoints);
          child._id = this._idCounter++;
          child.distance = m.distance;
          child.segIdx = m.segIdx;
          child._updatePosition();
          child.stunTimer = m.stunTimer;
          this.monsters.push(child);
        }
      }
    } else {
      this.popups.push({ text: String(amount), x: m.x, y: m.y - 6, t: 0.6, color: '#fff' });
    }
    return r.killed;
  }

  // One fixed-timestep simulation step.
  step(dt) {
    if (this.state === 'PAUSED' || this.state === 'VICTORY' || this.state === 'DEFEAT') return;

    // Wave timer.
    this.wave.update(dt);

    // Spawn due monsters.
    while (true) {
      const lvl = this.wave.popDueMonster();
      if (lvl == null) break;
      this.spawnMonster(lvl);
    }

    // Troops.
    for (const t of this.troops) {
      if (!t.alive) continue;
      t.update(dt, this.monsters, this.projectiles, this);
    }

    // Projectiles.
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.update(dt, this.monsters, (proj) => this.applyProjectileImpact(proj));
    }

    // Monsters.
    for (const m of this.monsters) {
      if (!m.alive) continue;
      // Safety: force-kill if HP dropped below zero without being caught.
      if (m.hp <= 0) { m.alive = false; continue; }
      m.update(dt);
      if (m.reachedEnd) {
        m.alive = false;
        this.lives -= m.leak;
        this.popups.push({ text: '-' + m.leak, x: m.x, y: m.y - 8, t: 1.0, color: CONFIG.COLORS.heart });
        if (this.lives <= 0) {
          this.lives = 0;
          this.state = 'DEFEAT';
        }
      }
    }

    // Melee damage is now routed through game.damageMonster inside Troop.update
    // so reward/popup logic stays in one place.

    // Cleanup dead (in-place, no allocation).
    let mw = 0;
    for (let i = 0; i < this.monsters.length; i++) {
      if (this.monsters[i].alive) this.monsters[mw++] = this.monsters[i];
    }
    this.monsters.length = mw;
    let pw = 0;
    for (let i = 0; i < this.projectiles.length; i++) {
      if (this.projectiles[i].alive) this.projectiles[pw++] = this.projectiles[i];
    }
    this.projectiles.length = pw;
    let tw = 0;
    for (let i = 0; i < this.troops.length; i++) {
      if (this.troops[i].alive) this.troops[tw++] = this.troops[i];
    }
    this.troops.length = tw;

    // Wave completion.
    if (this.state === 'WAVE_ACTIVE' && this.wave.spawnIndex >= this.wave.queue.length
        && this.monsters.length === 0) {
      this.wave.onAllSpawnedAndCleared();
      this.state = 'PRE_WAVE';
    }

    // Update popups.
    for (const p of this.popups) p.t -= dt;
    this.popups = this.popups.filter(p => p.t > 0);

    // Update sell cooldowns.
    for (const [id, cd] of this.sellCooldown) {
      const v = cd - dt;
      if (v <= 0) this.sellCooldown.delete(id);
      else this.sellCooldown.set(id, v);
    }
  }

  // Apply damage + optional AoE from a projectile. Also handles reward.
  applyProjectileImpact(proj) {
    if (!proj.target || !proj.target.alive) {
      // Dead before impact: do damage at last position with splash only.
      if (proj.troop.spec.chain > 0) {
        this.chainHitAt(proj.lastTargetX, proj.lastTargetY, proj.troop);
      } else {
        this.splashAt(proj.lastTargetX, proj.lastTargetY, proj.troop.getDamage(), proj.troop.spec.splash, proj.troop);
      }
      return;
    }
    if (proj.troop.spec.chain > 0) {
      // Chain lightning: hit primary target, then chain to consecutive monsters behind it.
      this.chainHitAt(proj.target.x, proj.target.y, proj.troop);
    } else if (proj.troop.spec.splash > 0) {
      this.splashAt(proj.target.x, proj.target.y, proj.troop.getDamage(), proj.troop.spec.splash, proj.troop);
    } else {
      this.damageMonster(proj.target, proj.troop.getDamage());
    }
  }

  // Chain lightning: damages the nearest monster to (x,y) then chains to
  // consecutive monsters behind it (lower progress = further from end).
  chainHitAt(x, y, troop) {
    const damage = troop.getDamage();
    const chainCount = troop.getChain();
    const stunDuration = troop.spec.stun || 0;

    // Find alive monsters sorted by proximity to impact point.
    const alive = this.monsters.filter(m => m.alive);
    alive.sort((a, b) => dist(a.x, a.y, x, y) - dist(b.x, b.y, x, y));

    // Hit the closest one first as primary, then pick the next chainCount
    // monsters with lower progress (behind it along the path).
    if (alive.length === 0) return;
    const primary = alive[0];
    // Apply stun + damage to a single target. Returns true if it split.
    const hitAndStun = (m) => {
      if (!m.alive) return false;
      const countBefore = this.monsters.length;
      if (stunDuration > 0) m.stunTimer = Math.max(m.stunTimer, stunDuration);
      this.damageMonster(m, damage);
      this.popups.push({ text: '⚡', x: m.x, y: m.y - 12, t: 0.6, color: '#f1c40f' });
      // Apply stun to any split children (last entries pushed).
      if (stunDuration > 0) {
        for (let i = countBefore; i < this.monsters.length; i++) {
          this.monsters[i].stunTimer = Math.max(this.monsters[i].stunTimer, stunDuration);
        }
      }
      return this.monsters.length > countBefore;
    };

    hitAndStun(primary);

    // Chain: monsters behind the primary (lower progress), sorted by progress descending.
    const rest = alive.slice(1).filter(m => m.alive && m.progress < primary.progress);
    rest.sort((a, b) => b.progress - a.progress);
    for (let i = 0; i < chainCount && i < rest.length; i++) {
      hitAndStun(rest[i]);
    }
  }

  splashAt(x, y, damage, radiusTiles, troop) {
    const r = radiusTiles * CONFIG.TILE_SIZE;
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const d = dist(x, y, m.x, m.y);
      if (d <= r) {
        // Falloff: 100% at center, 50% at edge. Simple linear.
        const falloff = 1 - 0.5 * (d / r);
        const dmg = Math.max(1, Math.floor(damage * falloff));
        this.damageMonster(m, dmg);
      }
    }
    // Splash VFX placeholder: just log; visual is the projectile disappearing.
  }

  start() {
    // Use a Web Worker for simulation so the game runs at full speed
    // even when the tab is in the background (workers are never throttled).
    this.lastTime = performance.now();
    this._running = true;

    // Spawn the sim worker.
    const blob = new Blob([this._simWorkerScript()], { type: 'application/javascript' });
    this._simWorker = new Worker(URL.createObjectURL(blob));
    this._simWorker.onmessage = (e) => {
      if (e.data === 'tick') {
        if (!this._running) return;
        const now = performance.now();
        const realDt = Math.min(0.1, (now - this.lastTime) / 1000);
        this.lastTime = now;
        const fixed = CONFIG.FIXED_TIMESTEP;
        const simDt = realDt * this.speed;
        this.accumulator += simDt;
        const maxSteps = Math.max(8, this.speed * 4);
        this.accumulator = Math.min(this.accumulator, fixed * maxSteps);
        let safety = maxSteps;
        while (this.accumulator >= fixed && safety-- > 0) {
          this.step(fixed);
          this.accumulator -= fixed;
        }
        this.render();
      }
    };
    this._simWorker.postMessage('start');
  }

  _simWorkerScript() {
    return 'let id; onmessage=function(e){if(e.data==="start"){id=setInterval(function(){postMessage("tick")},16)}else if(e.data==="stop"){clearInterval(id)}};';
  }

  // ===== Rendering =====
  render() {
    RENDERER.beginFrame();
    RENDERER.drawStaticLayers(this.grid);
    RENDERER.applyMapTransform();

    const T = CONFIG.TILE_SIZE;

    // Troops.
    for (const t of this.troops) {
      if (!t.alive) continue;
      const x = t.gx * T + 6, y = t.gy * T + 6, s = T - 12;
      // Rounded rect for troops.
      const c = RENDERER.ctx;
      const rr = 4;
      c.beginPath();
      c.moveTo(x + rr, y);
      c.lineTo(x + s - rr, y);
      c.quadraticCurveTo(x + s, y, x + s, y + rr);
      c.lineTo(x + s, y + s - rr);
      c.quadraticCurveTo(x + s, y + s, x + s - rr, y + s);
      c.lineTo(x + rr, y + s);
      c.quadraticCurveTo(x, y + s, x, y + s - rr);
      c.lineTo(x, y + rr);
      c.quadraticCurveTo(x, y, x + rr, y);
      c.closePath();
      c.fillStyle = t.spec.color;
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.12)';
      c.lineWidth = 1.5;
      c.stroke();
      // Type indicator dot.
      RENDERER.fillCircle(t.x, t.y - 3, 2.5, t.spec.type === 'melee' ? '#f1c40f' : '#bdc3c7');
    }

    // Monsters.
    for (const m of this.monsters) {
      if (!m.alive) continue;
      // Outer shadow/glow.
      RENDERER.fillCircle(m.x, m.y, m.spec.size / 2 + 3, 'rgba(0,0,0,0.4)');
      // Body.
      RENDERER.fillCircle(m.x, m.y, m.spec.size / 2, m.spec.color);
      // HP bar: only shown when monster has taken damage.
      if (m.hp < m.maxHp) {
        const w = m.spec.size + 6;
        const h = 3;
        const x = m.x - w / 2, y = m.y - m.spec.size / 2 - 10;
        RENDERER.fillRect(x, y, w, h, '#400');
        RENDERER.fillRect(x, y, w * (m.hp / m.maxHp), h, '#2ecc71');
      }
    }

    // Projectiles (world space, no extra transform).
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      if (p.kind === 'arrow' || p.kind === 'bolt') {
        const angle = Math.atan2(p.lastTargetY - p.y, p.lastTargetX - p.x);
        RENDERER.ctx.strokeStyle = p.color;
        RENDERER.ctx.lineWidth = 2;
        RENDERER.ctx.beginPath();
        RENDERER.ctx.moveTo(p.x - Math.cos(angle) * 6, p.y - Math.sin(angle) * 6);
        RENDERER.ctx.lineTo(p.x, p.y);
        RENDERER.ctx.stroke();
      } else {
        RENDERER.fillCircle(p.x, p.y, p.size / 2, p.color);
      }
    }

    // Popups (world space).
    for (const p of this.popups) {
      const a = clamp(p.t / 0.6, 0, 1);
      RENDERER.ctx.globalAlpha = a;
      RENDERER.ctx.fillStyle = p.color;
      RENDERER.ctx.font = 'bold 12px system-ui, sans-serif';
      RENDERER.ctx.textAlign = 'center';
      RENDERER.ctx.fillText(p.text, p.x, p.y - (1.2 - p.t) * 14);
    }
    RENDERER.ctx.globalAlpha = 1;
    RENDERER.ctx.textAlign = 'left';

    RENDERER.restoreTransform();

    // UI overlay (screen space).
    UI.updateHover(RENDERER.hoverPx, RENDERER.hoverPy);
    UI.drawHUD(this);
    UI.drawShop(this);
    UI.drawPreview(this);
    UI.drawSelectedTroopRange(this);
    UI.drawPlacementGhost(this);
    UI.drawOverlay(this);
    UI.drawDevConfirmDialog(this);
    UI.drawDevRightPanel(this);
  }

  // ===== Input =====
  onMouseDown(px, py, button) {
    // Block all interaction during victory/defeat overlay (only keyboard restart works).
    if (this.state === 'VICTORY' || this.state === 'DEFEAT') return;

    if (button === 2) {
      this.selectedSpec = null;
      this.selectedTroopIndex = -1;
      return;
    }

    // Panel toggle clicks — checked first, before everything else
    if (UI.handleToggleClick(px, py)) return;

    // Confirmation dialog clicks (intercepts everything while shown).
    if (this.devConfirmPending || this.resetConfirmPending || this.sellConfirmPending) {
      if (UI._devConfirmYes && px >= UI._devConfirmYes.x && px <= UI._devConfirmYes.x + UI._devConfirmYes.w && py >= UI._devConfirmYes.y && py <= UI._devConfirmYes.y + UI._devConfirmYes.h) {
        if (this.sellConfirmPending) {
          this.sellConfirmPending = false;
          this.sellTroop(this.sellConfirmTroopIndex);
          this.sellConfirmTroopIndex = -1;
          this.devConfirmPending = false;
          this.resetConfirmPending = false;
        } else if (this.resetConfirmPending) {
          this.devConfirmPending = false;
          this.resetConfirmPending = false;
          this.resetGame();
        } else {
          this.devConfirmPending = false;
          this.resetConfirmPending = false;
          this.toggleDevMode();
        }
        return;
      }
      if (UI._devConfirmNo && px >= UI._devConfirmNo.x && px <= UI._devConfirmNo.x + UI._devConfirmNo.w && py >= UI._devConfirmNo.y && py <= UI._devConfirmNo.y + UI._devConfirmNo.h) {
        this.devConfirmPending = false;
        this.resetConfirmPending = false;
        this.sellConfirmPending = false;
        this.sellConfirmTroopIndex = -1;
        return;
      }
      return; // all clicks consumed while dialog is shown
    }

    // Right-panel clicks in dev mode (non-modal — clicks outside pass through).
    if (this.devMode && this.state === 'PRE_WAVE' && UI._devRightPanelRect) {
      if (px >= UI._devRightPanelRect.x && px <= UI._devRightPanelRect.x + UI._devRightPanelRect.w
          && py >= UI._devRightPanelRect.y && py <= UI._devRightPanelRect.y + UI._devRightPanelRect.h) {
        // Inside the panel — check buttons.
        for (const row of UI._devRightButtons || []) {
          for (const tag of ['m10','m1','p1','p10']) {
            const b = row[tag];
            if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
              const delta = tag === 'm10' ? -10 : tag === 'm1' ? -1 : tag === 'p1' ? 1 : 10;
              this.devMonsterCounts[row.level] = Math.max(0, (this.devMonsterCounts[row.level] || 0) + delta);
              return;
            }
          }
        }
        if (UI._devRightStartBtn && px >= UI._devRightStartBtn.x && px <= UI._devRightStartBtn.x + UI._devRightStartBtn.w
            && py >= UI._devRightStartBtn.y && py <= UI._devRightStartBtn.y + UI._devRightStartBtn.h) {
          if (this.wave.startNextWave()) {
            this.wave.buildCustomFromCounts(this.devMonsterCounts);
            this.state = 'WAVE_ACTIVE';
          }
          return;
        }
        // Clicks inside panel but not on a button are consumed.
        return;
      }
    }

    // HUD: DEV mode toggle.
    const devBtn = { x: 260, y: 14, w: 44, h: 28 };
    if (px >= devBtn.x && px <= devBtn.x + devBtn.w && py >= devBtn.y && py <= devBtn.y + devBtn.h) {
      this.devConfirmPending = true;
      return;
    }

    // HUD: Reset button.
    const rstBtn = { x: 310, y: 14, w: 36, h: 28 };
    if (px >= rstBtn.x && px <= rstBtn.x + rstBtn.w && py >= rstBtn.y && py <= rstBtn.y + rstBtn.h) {
      this.resetConfirmPending = true;
      return;
    }

    // HUD: speed buttons.
    const w = RENDERER.width;
    const speeds = [1, 2, 4, 8, 16, 32, 64, 128];
    for (let i = 0; i < speeds.length; i++) {
      const r = { x: w - 370 + i * 28, y: 14, w: 26, h: 28 };
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
        this.speed = speeds[i];
        return;
      }
    }

    // HUD: start wave / pause button.
    const btn = { x: w - 116, y: 14, w: 90, h: 28 };
    if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
      if (this.state === 'PRE_WAVE') {
        if (this.wave.startNextWave()) {
          if (this.devMode) this.wave.buildCustomFromCounts(this.devMonsterCounts);
          this.state = 'WAVE_ACTIVE';
        }
      } else if (this.state === 'WAVE_ACTIVE') {
        this.paused = !this.paused;
        this.state = this.paused ? 'PAUSED' : 'WAVE_ACTIVE';
      } else if (this.state === 'PAUSED') {
        this.paused = false;
        this.state = 'WAVE_ACTIVE';
      }
      return;
    }

    // Shop clicks.
    const shopIdx = UI.hitShop(px, py);
    if (shopIdx >= 0) {
      const spec = TROOP_SPECS[shopIdx];
      this.selectedSpec = (this.selectedSpec === spec) ? null : spec;
      this.selectedTroopIndex = -1;
      return;
    }

    // Sell button — show confirmation dialog.
    if (this.selectedTroopIndex >= 0) {
      const sellBtn = { x: 8, y: RENDERER.height - 60, w: 200, h: 36 };
      if (px >= sellBtn.x && px <= sellBtn.x + sellBtn.w
          && py >= sellBtn.y && py <= sellBtn.y + sellBtn.h) {
        if (this.devMode) {
          this.sellTroop(this.selectedTroopIndex);
        } else {
          this.sellConfirmTroopIndex = this.selectedTroopIndex;
          this.sellConfirmPending = true;
        }
        return;
      }
    }

    // Upgrade buttons (4 stats).
    if (this.selectedTroopIndex >= 0) {
      const t = this.troops[this.selectedTroopIndex];
      if (t && t.alive) {
        const stats = ['dmg', 'range', 'speed', 'chain'];
        const statBtnW = 49;
        for (let i = 0; i < stats.length; i++) {
          const stat = stats[i];
          if (t.isMaxed(stat)) continue;
          const btn = { x: 8 + i * (statBtnW + 2), y: RENDERER.height - 102, w: statBtnW, h: 36 };
          if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
            this.upgradeTroopStat(this.selectedTroopIndex, stat);
            return;
          }
        }
      }
    }

    // Map clicks.
    if (px >= UI_LAYOUT.shopWidth && py >= UI_LAYOUT.hudHeight
        && py <= RENDERER.height - UI_LAYOUT.previewHeight) {
      const world = RENDERER.toWorld(px, py);
      const tile = pixelToTile(world.x, world.y);
      if (inBounds(tile.gx, tile.gy)) {
        // Try to select an existing troop first.
        const tIdx = this.findTroopAtTile(tile.gx, tile.gy);
        if (tIdx >= 0) {
          this.selectedTroopIndex = tIdx;
          this.selectedSpec = null;
          return;
        }
        // Otherwise place the selected spec.
        if (this.selectedSpec) {
          if (this.placeTroop(this.selectedSpec, tile.gx, tile.gy)) {
            // Keep selected for repeat placement.
          } else {
            this.selectedTroopIndex = -1;
          }
          return;
        }
        this.selectedTroopIndex = -1;
      }
    }
  }

  findTroopAtTile(gx, gy) {
    for (let i = 0; i < this.troops.length; i++) {
      const t = this.troops[i];
      if (t.alive && t.gx === gx && t.gy === gy) return i;
    }
    return -1;
  }

  onKeyDown(e) {
    // Toggle dev mode.
    if (e.key === 'F2') {
      this.devConfirmPending = true;
      return;
    }
    // Restart.
    if ((e.key === 'r' || e.key === 'R')
        && (this.state === 'VICTORY' || this.state === 'DEFEAT')) {
      this.restart();
      return;
    }
    // Hotkeys for shop.
    for (const spec of TROOP_SPECS) {
      if (e.key === spec.hotkey) {
        this.selectedSpec = (this.selectedSpec === spec) ? null : spec;
        this.selectedTroopIndex = -1;
        return;
      }
    }
    if (e.key === 'Escape') {
      this.selectedSpec = null;
      this.selectedTroopIndex = -1;
    }
    if (e.key === ' ') {
      e.preventDefault();
      if (this.state === 'WAVE_ACTIVE') { this.paused = true; this.state = 'PAUSED'; }
      else if (this.state === 'PAUSED') { this.paused = false; this.state = 'WAVE_ACTIVE'; }
    }
    if (e.key === 'Enter' && this.state === 'PRE_WAVE') {
      if (this.wave.startNextWave()) this.state = 'WAVE_ACTIVE';
    }
    // Panel toggle shortcuts: Alt+H (HUD), Alt+S (Shop), Alt+P (Preview), Alt+C (Controls/Help)
    if (e.altKey) {
      if (e.key === 'h' || e.key === 'H') {
        UI_LAYOUT.collapsed.hud = !UI_LAYOUT.collapsed.hud;
        RENDERER.resize(document.getElementById('game'));
        e.preventDefault();
      } else if (e.key === 's' || e.key === 'S') {
        UI_LAYOUT.collapsed.shop = !UI_LAYOUT.collapsed.shop;
        RENDERER.resize(document.getElementById('game'));
        e.preventDefault();
      } else if (e.key === 'p' || e.key === 'P') {
        UI_LAYOUT.collapsed.preview = !UI_LAYOUT.collapsed.preview;
        RENDERER.resize(document.getElementById('game'));
        e.preventDefault();
      } else if (e.key === 'c' || e.key === 'C') {
        UI_LAYOUT.collapsed.help = !UI_LAYOUT.collapsed.help;
        const helpEl = document.getElementById('help');
        if (helpEl) helpEl.style.display = UI_LAYOUT.collapsed.help ? 'none' : '';
        e.preventDefault();
      }
    }
  }

  restart() {
    if (this._simWorker) { this._simWorker.postMessage('stop'); this._simWorker.terminate(); this._simWorker = null; }
    this._running = false;
    this.state = 'PRE_WAVE';
    this.paused = false;
    this.speed = 1;
    this.gold = this.devMode ? 999999 : CONFIG.STARTING_GOLD;
    this.lives = CONFIG.STARTING_LIVES;
    this.selectedSpec = null;
    this.selectedTroopIndex = -1;
    this.grid = new Grid();
    this.seed = Math.floor(Math.random() * 0xffffffff);
    this.waypoints = generatePath(this.seed);
    this.markPathTiles();
    RENDERER.markCacheDirty();
    this.monsters = [];
    this.troops = [];
    this.projectiles = [];
    this.popups = [];
    this.wave = new WaveManager();
    this.devMonsterCounts = this._defaultDevCounts();
    this.start(); // re-start the background loop
  }

  toggleDevMode() {
    this.devMode = !this.devMode;
    this.restart();
  }

  resetGame() {
    this.devMode = false;
    this.devConfirmPending = false;
    this.restart();
  }

  _defaultDevCounts() {
    const counts = {1:0, 2:0, 3:0, 4:0, 5:0, B:0};
    const preview = this.wave.getNextWavePreview();
    if (preview) {
      for (const [level, count] of preview) {
        counts[level] = count;
      }
    }
    return counts;
  }

  resetDevMonsterCounts() {
    this.devMonsterCounts = this._defaultDevCounts();
  }
}
