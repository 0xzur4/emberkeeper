// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, upgrade, paused and game over.
//
// ?seed=N fixes the spawn pattern. ?shot=start|play|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BOSS, EVENT_HURT, EVENT_KILL, EVENT_OVER, EVENT_PICKUP, EVENT_SHOT, EVENT_WAVE_CLEAR } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_UPGRADE_1, ACTION_UPGRADE_2, ACTION_UPGRADE_3, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, upgradeCardRect } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Playing. Wave 1. The lantern is full.`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    audio.gameOver();
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function playSounds(events) {
    if (events & EVENT_SHOT) audio.shoot();
    if (events & EVENT_KILL) audio.kill();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_HURT) audio.hurt();
    if (events & EVENT_BOSS) audio.boss();
    if (events & EVENT_WAVE_CLEAR) {
      audio.waveClear();
      screen = SCREEN_UPGRADE;
      announce(`Wave ${world.state.wave} cleared. Choose a blessing.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (screen === SCREEN_UPGRADE) {
      if (actions & ACTION_UPGRADE_1 && world.chooseUpgrade(0)) {
        audio.upgrade();
        screen = SCREEN_PLAY;
        announce(`Wave ${world.state.wave}. The lantern burns on.`);
        return;
      }
      if (actions & ACTION_UPGRADE_2 && world.chooseUpgrade(1)) {
        audio.upgrade();
        screen = SCREEN_PLAY;
        announce(`Wave ${world.state.wave}. The lantern burns on.`);
        return;
      }
      if (actions & ACTION_UPGRADE_3 && world.chooseUpgrade(2)) {
        audio.upgrade();
        screen = SCREEN_PLAY;
        announce(`Wave ${world.state.wave}. The lantern burns on.`);
        return;
      }
      if (actions & ACTION_CONFIRM) {
        const click = input.clickPoint();
        if (click !== null) {
          for (let index = 0; index < 3; index += 1) {
            const rect = upgradeCardRect(index);
            if (click.x >= rect.x && click.x <= rect.x + rect.width && click.y >= rect.y && click.y <= rect.y + rect.height && world.chooseUpgrade(index)) {
              audio.upgrade();
              screen = SCREEN_PLAY;
              announce(`Wave ${world.state.wave}. The lantern burns on.`);
              return;
            }
          }
        }
      }
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { mx: 0, my: 0, aimX: world.state.player.x, aimY: world.state.player.y - 100, firing: false }, true);
      return;
    }
    const move = input.move();
    const aim = input.aim();
    const events = world.step(STEP, { mx: move.x, my: move.y, aimX: aim.x, aimY: aim.y, firing: input.firing() }, false);
    playSounds(events);
    if (events & EVENT_OVER) endGame();
    else if (events & EVENT_HURT) announce(`The lantern burns. ${Math.max(0, Math.round(world.state.player.health))} left.`);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting shadows close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  // The first gesture unlocks sound (browsers refuse audio before one).
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  // A handle for scripted playtests: the world, the screen, and the best score.
  window.__emberkeeper = { world, get screen() { return screen; }, get best() { return best; } };

  announce('Emberkeeper. Press Space or click to light the lantern.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
