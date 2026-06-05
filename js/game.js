// Game: orchestrator. Owns all entities, runs the fixed-timestep loop, and
// routes input to logic.

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    RENDERER.init(canvas);

    this.state = 'PRE_WAVE';   // PRE_WAVE | WAVE_ACTIVE | PAUSED | DEFEAT
    this.speed = 1;
    this.gold = CONFIG.STARTING_GOLD;
    this.lives = CONFIG.STARTING_LIVES;
    this.accumulator = 0;
    this.lastTime = 0;
    this.selectedSpec = null;
    this.selectedTroopIndex = -1;
    this.sellCooldownTimer = 0; // global seconds remaining before next sell allowed

    // Wave transition animation.
    this.waveCompleteAnim = { active: false, waveNum: 0 };

    // Web Worker + blob URL (URL must be revoked when the worker terminates).
    this._simWorker = null;
    this._simWorkerURL = null;

    // World.
    this.grid = new Grid();
    this.seed = Math.floor(Math.random() * 0xffffffff);
    this.waypoints = generatePath(this.seed);
    this.pathSegments = this._buildPathSegments(this.waypoints);
    this.markPathTiles();

    // Entities.
    this.monsters = [];
    this.troops = [];
    this.projectiles = [];
    this.popups = []; // floating text popups ({text, x, y, t, color})

    // Reusable buffer for chain lightning (avoids allocation per hit).
    this._chainBuf = [];
    // Reusable projectile impact callback (avoids closure allocation per projectile per frame).
    this._onProjectileImpact = (proj) => this.applyProjectileImpact(proj);

    this.wave = new WaveManager();

    this._resizeHandler = () => RENDERER.resize(canvas);
    window.addEventListener('resize', this._resizeHandler);

    this.devMode = false;
    this.devConfirmPending = false;
    this.resetConfirmPending = false;
    this.sellConfirmPending = false;
    this.sellConfirmTroopIndex = -1;
    this.devMonsterCounts = {1:0, 2:0, 3:0, 4:0, 5:0, B:0, S:0};
  }

  _buildPathSegments(waypoints) {
    const segments = [];
    let total = 0;
    const T = CONFIG.TILE_SIZE;
    for (let i = 1; i < waypoints.length; i++) {
      const [ax, ay] = waypoints[i - 1];
      const [bx, by] = waypoints[i];
      const axp = ax * T + T / 2, ayp = ay * T + T / 2;
      const bxp = bx * T + T / 2, byp = by * T + T / 2;
      const len = dist(axp, ayp, bxp, byp);
      total += len;
      segments.push({ ax: axp, ay: ayp, bx: bxp, by: byp, len, cumStart: total - len });
    }
    return { segments, totalLength: total };
  }

  markPathTiles() {
    for (const [gx, gy] of this.waypoints) {
      this.grid.set(gx, gy, TILE.PATH);
    }
  }

  canPlace(gx, gy, spec) {
    if (!this.devMode && this.gold < spec.cost) return false;
    if (!this.grid.isBuildable(gx, gy)) return false;
    for (let i = 0; i < this.troops.length; i++) {
      const t = this.troops[i];
      if (t.alive && t.gx === gx && t.gy === gy) return false;
    }
    return true;
  }

  placeTroop(spec, gx, gy) {
    if (!this.canPlace(gx, gy, spec)) return false;
    const t = new Troop(spec, gx, gy);
    this.troops.push(t);
    if (!this.devMode) this.gold -= spec.cost;
    return true;
  }

  sellTroop(index) {
    const t = this.troops[index];
    if (!t || !t.alive) return;
    if (this.sellCooldownTimer > 0) return;
    t.alive = false;
    this.grid.set(t.gx, t.gy, TILE.EMPTY);
    RENDERER.markCacheDirty();
    if (!this.devMode) {
      const refund = Math.ceil(t.getTotalInvested() * CONFIG.SELL_REFUND_RATIO);
      this.gold = Math.min(this.gold + refund, CONFIG.MAX_GOLD);
      this.popups.push({ text: '+' + refund, x: t.x, y: t.y, t: 1.2, color: CONFIG.COLORS.gold });
    }
    // Set global sell cooldown (3 seconds between sells).
    this.sellCooldownTimer = CONFIG.SELL_COOLDOWN;
    if (this.selectedTroopIndex === index) this.selectedTroopIndex = -1;
    this.selectedSpec = null;
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
    const m = new Monster(level, this.waypoints, this.pathSegments);
    this.monsters.push(m);
  }

  // Apply damage to a monster and queue reward popup. Returns true if killed.
  damageMonster(m, amount) {
    if (!m.alive) return false;
    const r = m.takeDamage(amount);
    if (r.killed) {
      this.gold = Math.min(this.gold + r.reward, CONFIG.MAX_GOLD);
      this.popups.push({ text: '+' + r.reward, x: m.x, y: m.y - 8, t: 1.2, color: CONFIG.COLORS.gold });
      PARTICLES.spawn(m.x, m.y, PARTICLES.deathBurst(m.spec.color));
      // Split monster: if level > 1, spawn 2 monsters of level-1 at this position.
      if (m.level !== 'B' && m.level !== 'S' && m.level > 1) {
        const childLvl = m.level - 1;
        for (let i = 0; i < 2; i++) {
          const child = new Monster(childLvl, this.waypoints, this.pathSegments);
          child.distance = m.distance;
          child.segIdx = m.segIdx;
          child._updatePosition();
          child.stunTimer = m.stunTimer;
          this.monsters.push(child);
        }
      }
    } else {
      // Shield absorbed all damage — show shield indicator.
      if (r.hpDamage === 0 && amount > 0) {
        this.popups.push({ text: 'Shield!', x: m.x, y: m.y - 6, t: 0.6, color: '#5dade2' });
      } else {
        this.popups.push({ text: String(Math.round(r.hpDamage)), x: m.x, y: m.y - 6, t: 0.6, color: '#fff' });
      }
      PARTICLES.spawn(m.x, m.y, PARTICLES.hitSpark('#fff'));
    }
    return r.killed;
  }

  // One fixed-timestep simulation step.
  step(dt) {
    if (this.state === 'PAUSED' || this.state === 'DEFEAT') return;

    // Wave timer.
    this.wave.update(dt);

    // Spawn due monsters.
    while (true) {
      const lvl = this.wave.popDueMonster();
      if (lvl == null) break;
      this.spawnMonster(lvl);
    }

    // Troops (index loop for speed).
    for (let i = 0; i < this.troops.length; i++) {
      const t = this.troops[i];
      if (!t.alive) continue;
      t.update(dt, this.monsters, this.projectiles, this);
    }

    // Projectiles (index loop for speed).
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (!p.alive) continue;
      p.update(dt, this.monsters, this._onProjectileImpact);
    }

    // Monsters (index loop for speed).
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      if (!m.alive) continue;
      // Defensive kill: if HP somehow reached <=0 outside the damage path,
      // route through damageMonster so split-on-kill / particles / reward
      // all fire consistently.
      if (m.hp <= 0) {
        this.damageMonster(m, 1);
        continue;
      }
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
      const waveNum = this.wave.currentWave + 1;
      this.waveCompleteAnim = { active: true, waveNum: waveNum, startMs: performance.now() };
      if (waveNum % 10 === 0) {
        this.gold = Math.min(this.gold + 500, CONFIG.MAX_GOLD);
        this.popups.push({ text: '+500 Boss Bonus!', x: RENDERER.width / 2, y: RENDERER.height / 2 - 40, t: 2.0, color: CONFIG.COLORS.gold });
      }
      this.wave.onAllSpawnedAndCleared();
      this.state = 'PRE_WAVE';
    }

    // Update popups (index loop).
    for (let i = 0; i < this.popups.length; i++) this.popups[i].t -= dt;
    let ppw = 0;
    for (let i = 0; i < this.popups.length; i++) {
      if (this.popups[i].t > 0) this.popups[ppw++] = this.popups[i];
    }
    this.popups.length = ppw;

    // Update global sell cooldown.
    if (this.sellCooldownTimer > 0) {
      this.sellCooldownTimer = Math.max(0, this.sellCooldownTimer - dt);
    }

    // Update particles.
    PARTICLES.update(dt);
  }

  // Module-scope sort comparator factory for chain lightning: compares by
  // squared distance to a fixed point (x, y). Built once per call but the
  // resulting closure is reused for each comparator invocation, so we
  // avoid allocating a new comparator object per call.
  _chainSortFor(x, y) {
    const dx = x, dy = y;
    return function chainSort(a, b) {
      const da = (a.x - dx) * (a.x - dx) + (a.y - dy) * (a.y - dy);
      const db = (b.x - dx) * (b.x - dx) + (b.y - dy) * (b.y - dy);
      return da - db;
    };
  }

  // Apply damage + optional AoE from a projectile. Also handles reward.
  applyProjectileImpact(proj) {
    const dmg = proj.troop._cachedDamage;
    if (!proj.target || !proj.target.alive) {
      // Dead before impact: resolve at last known position.
      if (proj.troop.spec.chain > 0) {
        this.chainHitAt(proj.lastTargetX, proj.lastTargetY, proj.troop);
      } else if (proj.troop.spec.splash > 0) {
        this.splashAt(proj.lastTargetX, proj.lastTargetY, dmg, proj.troop.spec.splash, proj.troop);
      } else {
        // Direct hit: find closest alive monster to impact point.
        let closest = null, closestDist = CONFIG.TILE_SIZE;
        for (let i = 0; i < this.monsters.length; i++) {
          const m = this.monsters[i];
          if (!m.alive) continue;
          const d = dist(proj.lastTargetX, proj.lastTargetY, m.x, m.y);
          if (d < closestDist) { closestDist = d; closest = m; }
        }
        if (closest) this.damageMonster(closest, dmg);
      }
      return;
    }
    if (proj.troop.spec.chain > 0) {
      this.chainHitAt(proj.target.x, proj.target.y, proj.troop);
    } else if (proj.troop.spec.splash > 0) {
      this.splashAt(proj.target.x, proj.target.y, dmg, proj.troop.spec.splash, proj.troop);
    } else {
      this.damageMonster(proj.target, dmg);
    }
  }

  // Chain lightning: damages the nearest monster to (x,y) then chains to
  // consecutive monsters behind it (lower progress = further from end).
  // Each chain link must be within 1 tile of the previous target.
  chainHitAt(x, y, troop) {
    const damage = troop._cachedDamage;
    const chainCount = troop._cachedChain;
    const stunDuration = troop.spec.stun || 0;
    const maxChainDist = CONFIG.TILE_SIZE * 1.5; // 1.5 tiles max between chain links

    // Apply stun + damage to a single target. Returns true if it split.
    const applyHit = (m, srcX, srcY) => {
      if (!m.alive) return null;
      const countBefore = this.monsters.length;
      if (stunDuration > 0) m.stunTimer = Math.max(m.stunTimer, stunDuration);
      this.damageMonster(m, damage);
      this.popups.push({ text: '\u26A1', x: m.x, y: m.y - 12, t: 0.6, color: '#f1c40f' });
      // Stun any children spawned by split.
      if (stunDuration > 0) {
        for (let j = countBefore; j < this.monsters.length; j++) {
          this.monsters[j].stunTimer = Math.max(this.monsters[j].stunTimer, stunDuration);
        }
      }
      PARTICLES.spawn(srcX, srcY, PARTICLES.chainSpark());
      return m;
    };

    // Find primary target — closest alive monster to (x, y).
    let closestDist = Infinity;
    let closest = null;
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      if (!m.alive) continue;
      const dx = m.x - x, dy = m.y - y;
      const dSq = dx * dx + dy * dy;
      if (dSq < closestDist) { closestDist = dSq; closest = m; }
    }
    if (!closest) return;

    let lastX = closest.x, lastY = closest.y;
    applyHit(closest, x, y);

    // Chain: find up to chainCount monsters behind the primary,
    // each within 1 tile of the previous chain target.
    const primaryProgress = closest.progress;
    let chained = 0;
    // Snapshot alive monsters after primary hit (includes any split children).
    const buf = this._chainBuf;
    buf.length = 0;
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      if (m.alive && m !== closest) buf.push(m);
    }

    for (let i = 0; i < buf.length && chained < chainCount; i++) {
      // Find closest candidate to last chain target that has lower progress.
      let bestDist = Infinity;
      let best = null;
      for (let j = 0; j < buf.length; j++) {
        const m = buf[j];
        if (!m.alive || m.progress >= primaryProgress) continue;
        const dx = m.x - lastX, dy = m.y - lastY;
        const dSq = dx * dx + dy * dy;
        if (dSq < bestDist) { bestDist = dSq; best = m; }
      }
      if (!best || bestDist > maxChainDist * maxChainDist) break; // too far, stop chaining
      lastX = best.x; lastY = best.y;
      applyHit(best, best.x, best.y);
      chained++;
    }
  }

  splashAt(x, y, damage, radiusTiles, troop) {
    const r = radiusTiles * CONFIG.TILE_SIZE;
    const rSq = r * r;
    const rInv = 1 / r;
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      if (!m.alive) continue;
      const dx = x - m.x, dy = y - m.y;
      const dSq = dx * dx + dy * dy;
      if (dSq <= rSq) {
        // Falloff: 100% at center, 50% at edge. Simple linear.
        const falloff = 1 - 0.5 * (Math.sqrt(dSq) * rInv);
            const dmg = Math.max(1, (damage * falloff) | 0);
        this.damageMonster(m, dmg);
      }
    }
    PARTICLES.spawn(x, y, PARTICLES.splashImpact(troop ? troop.spec.color : '#9b59b6'));
  }

  start() {
    // Use a Web Worker for simulation so the game runs at full speed
    // even when the tab is in the background (workers are never throttled).
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    this._resizeHandler = () => RENDERER.resize(this.canvas || document.getElementById('game'));
    window.addEventListener('resize', this._resizeHandler);
    this.lastTime = performance.now();
    this._running = true;

    // Spawn the sim worker.
    try {
      const blob = new Blob([this._simWorkerScript()], { type: 'application/javascript' });
      this._simWorkerURL = URL.createObjectURL(blob);
      this._simWorker = new Worker(this._simWorkerURL);
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

        // Smooth at extreme speeds: if we're accumulating too fast,
        // sync next step to the currently rendered frame using requestAnimationFrame.
        if (this.speed >= 64 && this.accumulator > fixed * 6) {
          this.accumulator = fixed * 4;
        }
      }
    };
    this._simWorker.onerror = (e) => {
      console.error('Sim worker error, falling back to main thread:', e);
      this._simWorker = null;
    };
    this._simWorker.postMessage('start');
    } catch (err) {
      console.warn('Web Worker unavailable, falling back to main-thread loop:', err);
      this._running = true;
      this.lastTime = performance.now();
      const fallbackLoop = () => {
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
        requestAnimationFrame(fallbackLoop);
      };
      requestAnimationFrame(fallbackLoop);
    }
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
    const ctx = RENDERER.ctx;

    // Troops (index loop).
    for (let i = 0; i < this.troops.length; i++) {
      const t = this.troops[i];
      if (!t.alive) continue;
      const x = t.gx * T + 6, y = t.gy * T + 6, s = T - 12;
      // Rounded rect for troops.
      const rr = 4;
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.lineTo(x + s - rr, y);
      ctx.quadraticCurveTo(x + s, y, x + s, y + rr);
      ctx.lineTo(x + s, y + s - rr);
      ctx.quadraticCurveTo(x + s, y + s, x + s - rr, y + s);
      ctx.lineTo(x + rr, y + s);
      ctx.quadraticCurveTo(x, y + s, x, y + s - rr);
      ctx.lineTo(x, y + rr);
      ctx.quadraticCurveTo(x, y, x + rr, y);
      ctx.closePath();
      ctx.fillStyle = t.spec.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Type indicator dot — use fillRect for small radius instead of arc.
      const dotColor = t.spec.type === 'melee' ? '#f1c40f' : '#bdc3c7';
      ctx.fillStyle = dotColor;
      ctx.fillRect(t.x - 2.5, t.y - 5.5, 5, 5);
    }

    // Monsters — batch HP bars by pass.
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      if (!m.alive) continue;
      // Outer shadow/glow — use fillRect for the shadow ring approximation.
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      const shadowR = m.spec.size * 0.5 + 3;
      ctx.beginPath();
      ctx.arc(m.x, m.y, shadowR, 0, 6.2832);
      ctx.fill();
      // Shield ring (when shield is active).
      if (m.shield > 0) {
        const shieldRatio = m.shield / m.maxShield;
        ctx.strokeStyle = 'rgba(93,173,226,' + (0.3 + 0.5 * shieldRatio) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.spec.size * 0.5 + 2, 0, 6.2832 * shieldRatio);
        ctx.stroke();
      }
      // Body.
      ctx.fillStyle = m.spec.color;
      const bodyR = m.spec.size * 0.5;
      ctx.beginPath();
      ctx.arc(m.x, m.y, bodyR, 0, 6.2832);
      ctx.fill();
      // Stun visual indicator.
      if (m.stunTimer > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(m.x, m.y, bodyR, 0, Math.PI * 2);
        ctx.fill();
      }
      // HP bar: only shown when monster has taken damage or has shield.
      if (m.hp < m.maxHp || m.shield < m.maxShield) {
        const w = m.spec.size + 6;
        const barY = m.y - m.spec.size * 0.5 - 10;
        const hx = m.x - w * 0.5;
        // Shield bar (above HP bar, blue).
        if (m.maxShield > 0) {
          ctx.fillStyle = '#223';
          ctx.fillRect(hx, barY - 4, w, 2);
          ctx.fillStyle = '#5dade2';
          ctx.fillRect(hx, barY - 4, w * (m.shield / m.maxShield), 2);
        }
        // HP bar.
        ctx.fillStyle = '#400';
        ctx.fillRect(hx, barY, w, 3);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(hx, barY, w * (m.hp / m.maxHp), 3);
      }
    }

    // Projectiles (world space) — index loop, no trig for arrows when possible.
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (!p.alive) continue;
      if (p.kind === 'arrow' || p.kind === 'bolt') {
        const tdx = p.lastTargetX - p.x;
        const tdy = p.lastTargetY - p.y;
        const d = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
        const nx = tdx / d, ny = tdy / d;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x - nx * 6, p.y - ny * 6);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.5, 0, 6.2832);
        ctx.fill();
      }
    }

    // Popups (world space) — set font/textAlign once.
    if (this.popups.length > 0) {
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (let i = 0; i < this.popups.length; i++) {
        const p = this.popups[i];
        const a = clamp(p.t * 1.667, 0, 1); // 1/0.6
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y - (1.2 - p.t) * 14);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }

    // Particles (world space).
    PARTICLES.draw(ctx);

    RENDERER.restoreTransform();

    // UI overlay (screen space).
    UI.updateHover(RENDERER.hoverPx, RENDERER.hoverPy);
    UI.drawHUD(this);
    UI.drawShop(this);
    UI.drawPreview(this);
    UI.drawSelectedTroopRange(this);
    UI.drawPlacementGhost(this);
    UI.drawWaveTransition(this);
    UI.drawOverlay(this);
    UI.drawDevConfirmDialog(this);
    UI.drawDevRightPanel(this);
  }

  // ===== Input =====
  onMouseDown(px, py, button) {
    // Block all interaction during victory/defeat overlay (only keyboard restart works).
    if (this.state === 'DEFEAT') return;

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
        const rows = UI._devRightButtons;
        if (rows) {
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const tags = ['m10','m1','p1','p10'];
            for (let j = 0; j < tags.length; j++) {
              const b = row[tags[j]];
            if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
              const delta = tags[j] === 'm10' ? -10 : tags[j] === 'm1' ? -1 : tags[j] === 'p1' ? 1 : 10;
              this.devMonsterCounts[row.level] = Math.max(0, (this.devMonsterCounts[row.level] || 0) + delta);
              return;
            }
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
        if (UI._devRightResetBtn && px >= UI._devRightResetBtn.x && px <= UI._devRightResetBtn.x + UI._devRightResetBtn.w
            && py >= UI._devRightResetBtn.y && py <= UI._devRightResetBtn.y + UI._devRightResetBtn.h) {
          this.resetDevMonsterCounts();
          return;
        }
        // Clicks inside panel but not on a button are consumed.
        return;
      }
    }

    // HUD buttons — only active when HUD is expanded.
    if (!UI_LAYOUT.collapsed.hud) {
      // DEV mode toggle.
      const devBtn = { x: 260, y: 14, w: 44, h: 28 };
      if (px >= devBtn.x && px <= devBtn.x + devBtn.w && py >= devBtn.y && py <= devBtn.y + devBtn.h) {
        this.devConfirmPending = true;
        return;
      }

      // Reset button.
      const rstBtn = { x: 310, y: 14, w: 36, h: 28 };
      if (px >= rstBtn.x && px <= rstBtn.x + rstBtn.w && py >= rstBtn.y && py <= rstBtn.y + rstBtn.h) {
        this.resetConfirmPending = true;
        return;
      }

      // Speed buttons.
      const w = RENDERER.width;
      for (let i = 0; i < SPEEDS.length; i++) {
        const r = { x: w - 370 + i * 28, y: 14, w: 26, h: 28 };
        if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
          this.speed = SPEEDS[i];
          return;
        }
      }

      // Start wave / pause button.
      const btn = { x: w - 116, y: 12, w: 90, h: 32 };
      if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
        if (this.state === 'PRE_WAVE') {
          if (this.wave.startNextWave()) {
            if (this.devMode) this.wave.buildCustomFromCounts(this.devMonsterCounts);
            this.state = 'WAVE_ACTIVE';
          }
        } else if (this.state === 'WAVE_ACTIVE') {
          this.state = 'PAUSED';
        } else if (this.state === 'PAUSED') {
          this.state = 'WAVE_ACTIVE';
        }
        return;
      }
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
    if (this.selectedTroopIndex >= 0 && !UI_LAYOUT.collapsed.shop) {
      const sellBtn = { x: 8, y: RENDERER.height - 46, w: 200, h: 34 };
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
    if (this.selectedTroopIndex >= 0 && !UI_LAYOUT.collapsed.shop) {
      const t = this.troops[this.selectedTroopIndex];
      if (t && t.alive) {
        const stats = ['dmg', 'range', 'speed', 'chain'];
        const btnPad = 8;
        const btnGap = 2;
        // Count visible buttons first to compute dynamic width.
        let visibleCount = 0;
        for (const stat of stats) {
          if (!t.canUpgrade(stat)) continue;
          visibleCount++;
        }
        const statBtnW = visibleCount > 0 ? Math.floor((UI_LAYOUT.SHOP_WIDTH - btnPad * 2 - btnGap * (visibleCount - 1)) / visibleCount) : 49;
        let visibleBtnIdx = 0;
        for (let i = 0; i < stats.length; i++) {
          const stat = stats[i];
          if (!t.canUpgrade(stat)) continue;
          const btn = { x: btnPad + visibleBtnIdx * (statBtnW + btnGap), y: RENDERER.height - 88, w: statBtnW, h: 36 };
          visibleBtnIdx++;
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
            const center = tileCenter(tile.gx, tile.gy);
            this.popups.push({ text: 'Invalid!', x: center.x, y: center.y, t: 1.0, color: '#da3633' });
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
        && this.state === 'DEFEAT') {
      this.restart();
      return;
    }
    // Hotkeys for shop.
    for (let i = 0; i < TROOP_SPECS.length; i++) {
      const spec = TROOP_SPECS[i];
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
      if (this.state === 'WAVE_ACTIVE') { this.state = 'PAUSED'; }
      else if (this.state === 'PAUSED') { this.state = 'WAVE_ACTIVE'; }
    }
    if (e.key === 'Enter' && this.state === 'PRE_WAVE') {
      if (this.wave.startNextWave()) {
        if (this.devMode) this.wave.buildCustomFromCounts(this.devMonsterCounts);
        this.state = 'WAVE_ACTIVE';
      }
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
        if (helpEl) {
          helpEl.classList.toggle('collapsed', UI_LAYOUT.collapsed.help);
          const tab = document.getElementById('help-toggle');
          if (tab) tab.textContent = UI_LAYOUT.collapsed.help ? 'Controls ▸' : 'Controls ▾';
        }
        e.preventDefault();
      } else if (e.key === 'm' || e.key === 'M') {
        UI_LAYOUT.collapsed.monsterInfo = !UI_LAYOUT.collapsed.monsterInfo;
        const el = document.getElementById('monster-info');
        if (el) {
          el.classList.toggle('collapsed', UI_LAYOUT.collapsed.monsterInfo);
          const tab = document.getElementById('monster-info-toggle');
          if (tab) tab.textContent = UI_LAYOUT.collapsed.monsterInfo ? 'Monsters ▸' : 'Monsters ▾';
        }
        e.preventDefault();
      }
    }
  }

  restart() {
    if (this._simWorker) { this._simWorker.terminate(); this._simWorker = null; }
    if (this._simWorkerURL) { URL.revokeObjectURL(this._simWorkerURL); this._simWorkerURL = null; }
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    this._running = false;
    this.state = 'PRE_WAVE';
    this.speed = 1;
    this.gold = this.devMode ? 999999 : CONFIG.STARTING_GOLD;
    this.lives = CONFIG.STARTING_LIVES;
    this.selectedSpec = null;
    this.selectedTroopIndex = -1;
    this.sellCooldownTimer = 0;
    this.grid = new Grid();
    this.seed = Math.floor(Math.random() * 0xffffffff);
    this.waypoints = generatePath(this.seed);
    this.pathSegments = this._buildPathSegments(this.waypoints);
    this.markPathTiles();
    RENDERER.markCacheDirty();
    RENDERER._rebuildCache(this.grid);
    this.monsters = [];
    this.troops = [];
    this.projectiles = [];
    this.popups = [];
    this.waveCompleteAnim = { active: false, waveNum: 0 };
    PARTICLES.clear();
    UI.shopScrollY = 0;
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
    const counts = {1:0, 2:0, 3:0, 4:0, 5:0, B:0, S:0};
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
