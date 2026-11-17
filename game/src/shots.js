// The screenshot scenes behind ?shot=start|play|end. Each one plays the real rules forward
// from a fresh world for a fixed number of steps, steered by a simple autopilot (aim at the
// nearest shadow, fire when one is close, keep a lantern's distance from it), so the frame
// is what a short game really looks like and the same seed always gives the same frame.

import { FIELD, STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 32;
const END_LIMIT_SECONDS = 600;

/** The nearest living shadow to the keeper, or null when the arena is empty. */
function nearestEnemy(state) {
  let best = null;
  let bestDistance = Infinity;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const d = Math.hypot(e.x - state.player.x, e.y - state.player.y);
    if (d < bestDistance) {
      bestDistance = d;
      best = e;
    }
  }
  return best;
}

/**
 * The autopilot's control for one step. It aims at the nearest shadow and fires when one is
 * near; it keeps its distance in play, and walks straight into the dark when `suicidal`.
 */
function autopilot(state, suicidal) {
  const player = state.player;
  const enemy = nearestEnemy(state);
  const control = { mx: 0, my: 0, aimX: player.aimX, aimY: player.aimY, firing: false };
  if (enemy === null) {
    control.aimX = FIELD.width / 2;
    control.aimY = FIELD.height / 2 - 100;
    return control;
  }
  control.aimX = enemy.x;
  control.aimY = enemy.y;
  const dx = enemy.x - player.x;
  const dy = enemy.y - player.y;
  const d = Math.hypot(dx, dy) || 1;
  control.firing = d < 520;
  let mx = 0;
  let my = 0;
  if (suicidal) {
    mx = dx / d;
    my = dy / d;
  } else if (d < 150) {
    mx = -dx / d;
    my = -dy / d;
  } else if (d > 280) {
    mx = dx / d;
    my = dy / d;
  }
  // A sideways drift keeps the keeper from standing still while it shoots.
  const side = Math.sin(state.time * 1.7) > 0 ? 1 : -1;
  mx += (-dy / d) * 0.45 * side;
  my += (dx / d) * 0.45 * side;
  const length = Math.hypot(mx, my) || 1;
  control.mx = mx / length;
  control.my = my / length;
  return control;
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return the
 * screen to draw over it and the best score to show. The play scene is staged in two passes:
 * first the autopilot plays forward to find the liveliest combat moment, then it replays to
 * exactly that step, so the frame is the game at its busiest and the same seed always gives
 * the same frame.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end') {
    const idle = { mx: 0, my: 0, aimX: FIELD.width / 2, aimY: FIELD.height / 2 - 100, firing: false };
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, idle, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    const WINDOW_SECONDS = 40;
    let bestStep = -1;
    let bestScore = -1;
    for (let index = 0; index < WINDOW_SECONDS / STEP; index += 1) {
      if (world.state.waveState === 'upgrade') world.chooseUpgrade(0);
      const events = world.step(STEP, autopilot(world.state, false), false);
      if (events & EVENT_OVER) break;
      if (world.state.waveState !== 'fighting' || world.state.time < 6) continue;
      let alive = 0;
      let flying = 0;
      let shards = 0;
      for (const e of world.state.enemies) if (e.active) alive += 1;
      for (const b of world.state.bullets) if (b.active) flying += 1;
      for (const e of world.state.embers) if (e.active) shards += 1;
      const liveliness = alive * 3 + flying + shards * 0.25;
      if (liveliness > bestScore) {
        bestScore = liveliness;
        bestStep = index;
      }
    }
    world.reset();
    const steps = bestStep < 0 ? Math.floor(PLAY_SECONDS / STEP) : bestStep + 1;
    for (let index = 0; index < steps; index += 1) {
      if (world.state.waveState === 'upgrade') world.chooseUpgrade(0);
      const events = world.step(STEP, autopilot(world.state, false), false);
      if (events & EVENT_OVER) break;
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  const limit = END_LIMIT_SECONDS;
  const suicidal = true;
  for (let index = 0; index < limit / STEP; index += 1) {
    if (world.state.waveState === 'upgrade') world.chooseUpgrade(0);
    const events = world.step(STEP, autopilot(world.state, suicidal), false);
    if (events & EVENT_OVER) break;
  }
  const over = world.state.player.health === 0;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
