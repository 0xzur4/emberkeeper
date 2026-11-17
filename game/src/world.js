// The game's rules and state, with no drawing and no browser in it: the keeper, the
// lantern's health, the waves of shadows, the embers they drop and the upgrades between
// waves. step() advances one fixed step and returns what happened as bit flags, so the
// caller can react (and play sounds) without the world knowing about screens or sound.

import { BULLET, ENEMY, FIELD, PLAYER, POOL, WAVE } from './config.js';

export const KIND_SHADE = 'shade';
export const KIND_SKITTER = 'skitter';
export const KIND_BRUTE = 'brute';
export const KIND_BOSS = 'boss';

export const EVENT_SHOT = 1;
export const EVENT_HIT = 2;
export const EVENT_KILL = 4;
export const EVENT_PICKUP = 8;
export const EVENT_WAVE_CLEAR = 16;
export const EVENT_OVER = 32;
export const EVENT_BOSS = 64;
export const EVENT_HURT = 128;

/** The upgrades a wave-clear offers: each one changes the keeper in a way that matters. */
export const UPGRADES = [
  { id: 'rapid-wick', name: 'Rapid Wick', desc: 'Shoot 18% faster.', apply(p) { p.fireInterval *= 0.82; } },
  { id: 'twin-flame', name: 'Twin Flame', desc: 'Fire one extra ember per shot.', apply(p) { p.projectiles = Math.min(5, p.projectiles + 1); } },
  { id: 'long-burn', name: 'Long Burn', desc: 'Lantern +30 max, mend 30 now.', apply(p) { p.maxHealth += 30; p.health = Math.min(p.maxHealth, p.health + 30); } },
  { id: 'swift-boots', name: 'Swift Boots', desc: 'Move 12% faster.', apply(p) { p.speed *= 1.12; } },
  { id: 'heavy-embers', name: 'Heavy Embers', desc: 'Embers hit 30% harder.', apply(p) { p.damage *= 1.3; } },
  { id: 'wide-net', name: 'Wide Net', desc: 'Gather embers from 40% further.', apply(p) { p.pickupRadius *= 1.4; } },
  { id: 'thick-glass', name: 'Thick Glass', desc: 'Shadows hurt 20% less.', apply(p) { p.armor *= 0.8; } },
  { id: 'bright-flare', name: 'Bright Flare', desc: 'Embers fly 15% faster, hit 10% harder.', apply(p) { p.bulletSpeed *= 1.15; p.damage *= 1.1; } },
];

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2, radius: PLAYER.radius,
    speed: PLAYER.speed, fireTimer: 0, invuln: 0,
    health: PLAYER.maxHealth, maxHealth: PLAYER.maxHealth,
    fireInterval: PLAYER.fireInterval, damage: PLAYER.damage,
    bulletSpeed: PLAYER.bulletSpeed, projectiles: PLAYER.projectiles,
    spread: PLAYER.spread, pickupRadius: PLAYER.pickupRadius, armor: PLAYER.armor,
    aimX: FIELD.width / 2, aimY: FIELD.height / 2 - 100,
  };
  const bullets = [];
  for (let i = 0; i < POOL.bullets; i += 1) bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, damage: 1 });
  const enemies = [];
  for (let i = 0; i < POOL.enemies; i += 1) enemies.push({ active: false, kind: KIND_SHADE, x: 0, y: 0, hp: 1, maxHp: 1, speed: 0, radius: 10, damage: 0, score: 0, embers: 0, wobble: 0, flash: 0 });
  const embers = [];
  for (let i = 0; i < POOL.embers; i += 1) embers.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, value: 5 });
  const particles = [];
  for (let i = 0; i < POOL.particles; i += 1) particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 3, color: '#ffd97a' });

  const state = {
    player, bullets, enemies, embers, particles,
    wave: 1, waveState: 'fighting', spawnQueue: [], spawnTimer: 0,
    choices: null, score: 0, kills: 0, embersCollected: 0,
    time: 0, shake: 0, flash: 0,
  };

  function free(pool) {
    for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i];
    return null;
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const p = free(particles);
      if (p === null) return;
      const angle = random() * Math.PI * 2;
      const power = speed * (0.4 + random() * 0.8);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * power;
      p.vy = Math.sin(angle) * power;
      p.maxLife = 0.4 + random() * 0.4;
      p.life = p.maxLife;
      p.size = 2 + random() * 3;
      p.color = color;
    }
  }

  function dropEmbers(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      const e = free(embers);
      if (e === null) return;
      const angle = random() * Math.PI * 2;
      e.active = true;
      e.x = x;
      e.y = y;
      e.vx = Math.cos(angle) * 60;
      e.vy = Math.sin(angle) * 60;
      e.value = 5;
    }
  }

  function spawnEnemy(kind) {
    const e = free(enemies);
    if (e === null) return null;
    const def = ENEMY[kind];
    // Pick an edge point at least 260 away from the keeper; retry a few times.
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 8; tries += 1) {
      const edge = Math.floor(random() * 4);
      if (edge === 0) { x = random() * FIELD.width; y = -def.radius; }
      else if (edge === 1) { x = FIELD.width + def.radius; y = random() * FIELD.height; }
      else if (edge === 2) { x = random() * FIELD.width; y = FIELD.height + def.radius; }
      else { x = -def.radius; y = random() * FIELD.height; }
      if (distance(x, y, player.x, player.y) >= 260) break;
    }
    e.active = true;
    e.kind = kind;
    e.x = x;
    e.y = y;
    e.hp = def.hp;
    e.maxHp = def.hp;
    e.speed = def.speed;
    e.radius = def.radius;
    e.damage = def.damage;
    e.score = def.score;
    e.embers = def.embers;
    e.wobble = random() * Math.PI * 2;
    e.flash = 0;
    return e;
  }

  function rollChoices() {
    const pool = UPGRADES.filter((u) => !(u.id === 'twin-flame' && player.projectiles >= 5));
    const picks = [];
    while (picks.length < 3 && pool.length > 0) {
      const index = Math.floor(random() * pool.length);
      picks.push(pool.splice(index, 1)[0]);
    }
    return picks;
  }

  function startWave(number) {
    state.wave = number;
    state.waveState = 'fighting';
    state.choices = null;
    const count = WAVE.baseCount + WAVE.perWave * (number - 1);
    const queue = [];
    if (number % WAVE.bossEvery === 0) queue.push(KIND_BOSS);
    for (let i = 0; i < count; i += 1) {
      const roll = random();
      if (number >= WAVE.bruteFrom && roll < 0.15) queue.push(KIND_BRUTE);
      else if (number >= WAVE.skitterFrom && roll < 0.4) queue.push(KIND_SKITTER);
      else queue.push(KIND_SHADE);
    }
    // Shuffle the queue so the wave never arrives in one clump of a kind.
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const tmp = queue[i];
      queue[i] = queue[j];
      queue[j] = tmp;
    }
    state.spawnQueue = queue;
    state.spawnTimer = 0.6;
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.speed = PLAYER.speed;
    player.fireTimer = 0;
    player.invuln = 0;
    player.health = PLAYER.maxHealth;
    player.maxHealth = PLAYER.maxHealth;
    player.fireInterval = PLAYER.fireInterval;
    player.damage = PLAYER.damage;
    player.bulletSpeed = PLAYER.bulletSpeed;
    player.projectiles = PLAYER.projectiles;
    player.spread = PLAYER.spread;
    player.pickupRadius = PLAYER.pickupRadius;
    player.armor = PLAYER.armor;
    player.aimX = FIELD.width / 2;
    player.aimY = FIELD.height / 2 - 100;
    for (const b of bullets) b.active = false;
    for (const e of enemies) e.active = false;
    for (const e of embers) e.active = false;
    for (const p of particles) p.active = false;
    state.score = 0;
    state.kills = 0;
    state.embersCollected = 0;
    state.time = 0;
    state.shake = 0;
    state.flash = 0;
    startWave(1);
  }

  /** Take an offered upgrade and open the next wave. False when no choice is open. */
  function chooseUpgrade(index) {
    if (state.waveState !== 'upgrade' || state.choices === null) return false;
    const choice = state.choices[index];
    if (choice === undefined) return false;
    choice.apply(player);
    startWave(state.wave + 1);
    return true;
  }

  function fireBullets(events) {
    const base = Math.atan2(player.aimY - player.y, player.aimX - player.x);
    const count = player.projectiles;
    for (let i = 0; i < count; i += 1) {
      const b = free(bullets);
      if (b === null) break;
      const offset = (i - (count - 1) / 2) * player.spread;
      const angle = base + offset;
      b.active = true;
      b.x = player.x + Math.cos(angle) * (player.radius + 4);
      b.y = player.y + Math.sin(angle) * (player.radius + 4);
      b.vx = Math.cos(angle) * player.bulletSpeed;
      b.vy = Math.sin(angle) * player.bulletSpeed;
      b.life = BULLET.life;
      b.damage = player.damage;
    }
    return events | EVENT_SHOT;
  }

  /**
   * One fixed step. `control` is { mx, my, aimX, aimY, firing }. With `harmless` set (the
   * title screen's backdrop) shadows drift but nothing touches the keeper and nothing scores.
   */
  function step(dt, control, harmless) {
    let events = 0;
    state.time += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 30);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt);

    player.aimX = control.aimX;
    player.aimY = control.aimY;
    player.x = Math.min(FIELD.width - player.radius, Math.max(player.radius, player.x + control.mx * player.speed * dt));
    player.y = Math.min(FIELD.height - player.radius, Math.max(player.radius, player.y + control.my * player.speed * dt));
    if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
    if (player.fireTimer > 0) player.fireTimer -= dt;

    if (harmless) {
      // Title backdrop: keep a few shadows drifting, circling the keeper at a distance.
      let alive = 0;
      for (const e of enemies) if (e.active) alive += 1;
      if (alive < 6) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          spawnEnemy(KIND_SHADE);
          state.spawnTimer = 1.2;
        }
      }
      for (const e of enemies) {
        if (!e.active) continue;
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        const want = 220;
        const toward = d > want ? 1 : -0.4;
        e.x += (dx / d) * e.speed * 0.45 * toward * dt;
        e.y += (dy / d) * e.speed * 0.45 * toward * dt;
      }
      return events;
    }

    if (control.firing && player.fireTimer <= 0) {
      events = fireBullets(events);
      player.fireTimer = player.fireInterval;
    }

    // Spawn the wave, one creature at a time.
    if (state.waveState === 'fighting' && state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        const kind = state.spawnQueue.shift();
        const spawned = spawnEnemy(kind);
        if (spawned !== null && kind === KIND_BOSS) events |= EVENT_BOSS;
        state.spawnTimer = WAVE.spawnInterval;
      }
    }

    // Bullets fly, and die on the first shadow they touch.
    for (const b of bullets) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
        b.active = false;
        continue;
      }
      for (const e of enemies) {
        if (!e.active) continue;
        const rr = BULLET.radius + e.radius;
        if (Math.abs(b.x - e.x) > rr || Math.abs(b.y - e.y) > rr) continue;
        if (distance(b.x, b.y, e.x, e.y) > rr) continue;
        b.active = false;
        e.hp -= b.damage;
        e.flash = 0.09;
        const knock = e.kind === KIND_BOSS ? 0 : e.kind === KIND_BRUTE ? 2 : 7;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        e.x += (dx / d) * knock;
        e.y += (dy / d) * knock;
        events |= EVENT_HIT;
        if (e.hp <= 0) {
          e.active = false;
          state.score += e.score;
          state.kills += 1;
          dropEmbers(e.x, e.y, e.embers);
          burst(e.x, e.y, e.kind === KIND_BOSS ? '#ff5c7a' : '#c9a7ff', e.kind === KIND_BOSS ? 40 : 12, 220);
          events |= EVENT_KILL;
        }
        break;
      }
    }

    // Shadows close in; skitters zigzag, the rest walk straight at the lantern.
    for (const e of enemies) {
      if (!e.active) continue;
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      let vx = (dx / d) * e.speed;
      let vy = (dy / d) * e.speed;
      if (e.kind === KIND_SKITTER) {
        const wobble = Math.sin(state.time * 6 + e.wobble) * 0.7;
        const px = -dy / d;
        const py = dx / d;
        vx += px * e.speed * wobble;
        vy += py * e.speed * wobble;
      }
      e.x += vx * dt;
      e.y += vy * dt;
      // Touching the keeper burns the lantern.
      if (player.invuln === 0 && distance(e.x, e.y, player.x, player.y) < e.radius + player.radius) {
        const damage = Math.max(1, Math.round(e.damage * player.armor));
        player.health -= damage;
        player.invuln = PLAYER.invulnerable;
        state.shake = 10;
        state.flash = 0.25;
        const push = 26;
        player.x = Math.min(FIELD.width - player.radius, Math.max(player.radius, player.x + (dx / d) * -push));
        player.y = Math.min(FIELD.height - player.radius, Math.max(player.radius, player.y + (dy / d) * -push));
        burst(player.x, player.y, '#ff5c7a', 10, 180);
        events |= EVENT_HURT;
        if (player.health <= 0) {
          player.health = 0;
          burst(player.x, player.y, '#ffb347', 50, 300);
          return events | EVENT_OVER;
        }
      }
    }

    // Shadows keep their distance from each other instead of stacking into one blob.
    for (let i = 0; i < enemies.length; i += 1) {
      const a = enemies[i];
      if (!a.active) continue;
      for (let j = i + 1; j < enemies.length; j += 1) {
        const b = enemies[j];
        if (!b.active) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }

    // Embers drift, then hurry to the keeper when close enough to feel the lantern.
    for (const e of embers) {
      if (!e.active) continue;
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < player.pickupRadius) {
        e.vx += (dx / d) * 900 * dt;
        e.vy += (dy / d) * 900 * dt;
      } else {
        e.vx *= 1 - 2 * dt;
        e.vy *= 1 - 2 * dt;
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (d < player.radius + 14) {
        e.active = false;
        state.score += e.value;
        state.embersCollected += 1;
        player.health = Math.min(player.maxHealth, player.health + 1);
        events |= EVENT_PICKUP;
      }
    }

    // Ember bursts fade.
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.5 * dt;
      p.vy *= 1 - 2.5 * dt;
    }

    // The wave is done when the queue is empty and the last shadow is gone.
    if (state.waveState === 'fighting' && state.spawnQueue.length === 0) {
      let alive = false;
      for (const e of enemies) if (e.active) { alive = true; break; }
      if (!alive) {
        state.score += WAVE.clearBonus * state.wave;
        state.waveState = 'upgrade';
        state.choices = rollChoices();
        events |= EVENT_WAVE_CLEAR;
      }
    }
    return events;
  }

  reset();
  return { state, reset, step, chooseUpgrade };
}
