// Necromancer revive logic — extracted from Game._stepNecromancerRevives
// to reduce the size of game.js.

import { CONFIG } from './config.js';
import { PARTICLES } from './particles.js';

export function stepNecromancerRevives(game) {
  // Reset revive locks for all monsters
  for (let i = 0; i < game.monsters.length; i++) {
    game.monsters[i]._reviveLock = false;
  }

  // Collect dead candidates (alive=false, not necromancer, not reachedEnd, not reviveImmune)
  const deadCandidates = [];
  for (let j = 0; j < game.monsters.length; j++) {
    const target = game.monsters[j];
    if (target.alive || target.level === 'Y' || target.reachedEnd || target.reviveImmune) continue;
    deadCandidates.push(target);
  }

  // Each necromancer revives nearby dead allies
  for (let i = 0; i < game.monsters.length; i++) {
    const necro = game.monsters[i];
    if (!necro.alive || necro.level !== 'Y') continue;

    const range = (necro.spec.reviveRange ?? CONFIG.MONSTER_REVIVE_RANGE) * CONFIG.TILE_SIZE;
    const rangeSq = range * range;
    const maxTargets = necro.spec.reviveMaxTargets ?? CONFIG.MONSTER_REVIVE_MAX_TARGETS;
    const glowDuration = necro.spec.reviveGlowDuration ?? CONFIG.MONSTER_REVIVE_GLOW_DURATION;

    while ((necro.reviveCount || 0) < maxTargets) {
      let best = null;
      let bestDist = Infinity;
      for (let j = 0; j < deadCandidates.length; j++) {
        const target = deadCandidates[j];
        if (target._reviveLock) continue;
        const dx = target.x - necro.x;
        const dy = target.y - necro.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= rangeSq && distSq < bestDist) {
          bestDist = distSq;
          best = target;
        }
      }
      if (!best) break;

      const ratio = necro.spec.reviveHpRatio ?? CONFIG.MONSTER_REVIVE_HP_RATIO;
      best.hp = Math.max(1, Math.round(best.maxHp * ratio));
      best.alive = true;
      best.reviveImmune = true;
      best.reviveDamageRatio = 0.5;
      best.reachedEnd = false;
      necro.reviveCount = (necro.reviveCount || 0) + 1;
      necro.reviveUsed = true;
      resetRevivedMonster(best);
      best.reviveGlow = true;
      best._reviveGlowTimer = necro.spec.reviveGlowDuration ?? glowDuration;
      best._reviveLock = true;
      game._getPopup('Revived', best.x, best.y - 12, 0.9, CONFIG.COLORS.revive);
      PARTICLES.reviveBurst(best.x, best.y, CONFIG.COLORS.revive);
    }
  }
}

export function resetRevivedMonster(m) {
  m.stunTimer = 0;
  m.slowTimer = 0;
  m.speed = CONFIG.MOVEMENT_SPEEDS[m.spec.movementSpeed] || m.spec.speed;
  m.shatterArmed = false;
  m.shatterBonus = 0;
  m._slowColorTint = 0;
  m._reviveGlowTimer = 0;
  if (typeof m.clearBurn === 'function') m.clearBurn();
  m.state = 'MOVING';
  m.attackTarget = null;
  m.attackTimer = 0;
  m._pendingAttack = null;
  m._lastPassTile = -1;
  m._hitTroops = null;
  m._prevTileIdx = -1; // reset for incremental tile index
}
