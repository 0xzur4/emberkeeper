// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to fit the window, so no rule below depends on screen size.
// Emberkeeper: one palette — a cold indigo night, warm amber lantern light, violet shadows.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 16,
  speed: 300,
  fireInterval: 0.22,
  bulletSpeed: 640,
  damage: 1,
  projectiles: 1,
  spread: 0.12,
  maxHealth: 100,
  invulnerable: 0.8,
  pickupRadius: 90,
  armor: 1,
};

export const BULLET = { radius: 5, life: 1.1 };

/** Enemy kinds, by what they do: shades chase, skitters dart, brutes endure, the boss rules. */
export const ENEMY = {
  shade: { hp: 2, speed: 96, radius: 16, damage: 10, score: 10, embers: 1 },
  skitter: { hp: 1, speed: 195, radius: 11, damage: 6, score: 15, embers: 1 },
  brute: { hp: 9, speed: 56, radius: 28, damage: 18, score: 30, embers: 2 },
  boss: { hp: 70, speed: 46, radius: 46, damage: 25, score: 200, embers: 8 },
};

/** Wave shape: how many creatures a wave holds, and when each kind first appears. */
export const WAVE = {
  baseCount: 6,
  perWave: 3,
  spawnInterval: 0.7,
  skitterFrom: 2,
  bruteFrom: 3,
  bossEvery: 5,
  clearBonus: 25,
};

/** Pooled actors, allocated once at boot so a frame never allocates. */
export const POOL = { bullets: 96, enemies: 48, embers: 160, particles: 240 };

export const PALETTE = {
  backdrop: '#0b0d1a',
  floor: '#12152a',
  grid: '#1a1f3a',
  star: '#2c3460',
  lantern: '#ffb347',
  lanternHot: '#ffe1a1',
  player: '#f7c873',
  cloak: '#7a5c2e',
  bullet: '#ffd97a',
  ember: '#ffcf5c',
  shade: '#4a3566',
  shadeEye: '#c9a7ff',
  skitter: '#5c3a6e',
  brute: '#3d2b52',
  boss: '#2e1f45',
  bossEye: '#ff5c7a',
  panel: '#181c33',
  panelEdge: '#2e3760',
  text: '#f2ead8',
  muted: '#9aa3c7',
  danger: '#ff5c7a',
  heal: '#7ee2a0',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'emberkeeper.best';
