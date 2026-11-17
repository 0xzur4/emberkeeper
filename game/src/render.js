// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. The lantern's glow lights the arena; shadows are violet blobs with glowing eyes;
// canvas text carries the HUD and the panels. A frame allocates nothing after boot.

import { FIELD, FONT, PALETTE } from './config.js';
import { KIND_BOSS, KIND_BRUTE, KIND_SHADE, KIND_SKITTER } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

/** Upgrade card geometry, shared with main.js so clicks land on the cards drawn here. */
const CARD = { width: 300, height: 210, gap: 28, top: 250 };
export function upgradeCardRect(index) {
  const total = CARD.width * 3 + CARD.gap * 2;
  const x = (FIELD.width - total) / 2 + index * (CARD.width + CARD.gap);
  return { x, y: CARD.top, width: CARD.width, height: CARD.height };
}

const PANEL = { width: 640, top: 120, line: 34, bottom: 76 };

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

/** Deterministic starfield: the same index always gives the same star. */
function starAt(index) {
  const a = Math.sin(index * 127.1) * 43758.5453;
  const b = Math.sin(index * 311.7) * 12543.1234;
  return {
    x: (a - Math.floor(a)) * FIELD.width,
    y: (b - Math.floor(b)) * FIELD.height,
    r: 1 + ((a * 7) % 1 + 1) % 1 * 1.6,
    twinkle: (index * 37) % 100,
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('Score ');
  const bestLabel = cachedLabel('Best ');
  const waveLabel = cachedLabel('Wave ');
  const finalLabel = cachedLabel('Score ');
  const embersLabel = cachedLabel('Embers ');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function roundRect(x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
  }

  function drawFloor(state) {
    context.fillStyle = PALETTE.floor;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.strokeStyle = PALETTE.grid;
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 80; x < FIELD.width; x += 80) {
      context.moveTo(x, 0);
      context.lineTo(x, FIELD.height);
    }
    for (let y = 80; y < FIELD.height; y += 80) {
      context.moveTo(0, y);
      context.lineTo(FIELD.width, y);
    }
    context.stroke();
    // Stars twinkle on a slow, deterministic cycle.
    for (let i = 0; i < 90; i += 1) {
      const s = starAt(i);
      const alpha = 0.25 + 0.35 * Math.abs(Math.sin((state.time + s.twinkle) * 0.5));
      context.globalAlpha = alpha;
      context.fillStyle = PALETTE.star;
      context.beginPath();
      context.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    // The lantern's warm light pools around the keeper.
    const glow = context.createRadialGradient(state.player.x, state.player.y, 10, state.player.x, state.player.y, 320);
    glow.addColorStop(0, 'rgba(255, 179, 71, 0.20)');
    glow.addColorStop(1, 'rgba(255, 179, 71, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function drawEmber(e) {
    const pulse = 1 + 0.25 * Math.sin(performance.now() / 180 + e.x);
    context.fillStyle = PALETTE.ember;
    context.save();
    context.translate(e.x, e.y);
    context.rotate(Math.PI / 4);
    const s = 5 * pulse;
    context.fillRect(-s, -s, s * 2, s * 2);
    context.restore();
  }

  function drawEnemy(e, time) {
    const flash = e.flash > 0;
    const body = e.kind === KIND_BRUTE ? PALETTE.brute : e.kind === KIND_SKITTER ? PALETTE.skitter : e.kind === KIND_BOSS ? PALETTE.boss : PALETTE.shade;
    const eye = e.kind === KIND_BOSS ? PALETTE.bossEye : PALETTE.shadeEye;
    context.fillStyle = flash ? '#ffffff' : body;
    context.beginPath();
    context.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    context.fill();
    // Wobbling horns so the kinds read apart at a glance.
    context.strokeStyle = flash ? '#ffffff' : body;
    context.lineWidth = 4;
    context.beginPath();
    if (e.kind === KIND_SKITTER) {
      context.moveTo(e.x - e.radius * 0.7, e.y - e.radius * 0.4);
      context.lineTo(e.x - e.radius * 1.3, e.y - e.radius * 1.1);
      context.moveTo(e.x + e.radius * 0.7, e.y - e.radius * 0.4);
      context.lineTo(e.x + e.radius * 1.3, e.y - e.radius * 1.1);
    } else if (e.kind === KIND_BRUTE || e.kind === KIND_BOSS) {
      context.moveTo(e.x - e.radius * 0.5, e.y - e.radius * 0.8);
      context.lineTo(e.x - e.radius * 0.9, e.y - e.radius * 1.25);
      context.moveTo(e.x + e.radius * 0.5, e.y - e.radius * 0.8);
      context.lineTo(e.x + e.radius * 0.9, e.y - e.radius * 1.25);
    }
    context.stroke();
    // Eyes, always watching the keeper.
    const eyeR = e.kind === KIND_BOSS ? 7 : 3.5;
    const eyeGap = e.radius * 0.38;
    const eyeY = e.y - e.radius * 0.15;
    context.fillStyle = eye;
    context.beginPath();
    context.arc(e.x - eyeGap, eyeY, eyeR, 0, Math.PI * 2);
    context.arc(e.x + eyeGap, eyeY, eyeR, 0, Math.PI * 2);
    context.fill();
    if (e.kind === KIND_BOSS) {
      context.fillStyle = eye;
      context.beginPath();
      context.arc(e.x, eyeY - e.radius * 0.45, eyeR, 0, Math.PI * 2);
      context.fill();
      // The boss wears its health above its head.
      const barW = e.radius * 2;
      const barY = e.y - e.radius - 18;
      context.fillStyle = PALETTE.panelEdge;
      context.fillRect(e.x - barW / 2, barY, barW, 7);
      context.fillStyle = PALETTE.danger;
      context.fillRect(e.x - barW / 2, barY, barW * Math.max(0, e.hp / e.maxHp), 7);
    } else if (e.hp < e.maxHp) {
      const barW = e.radius * 1.6;
      const barY = e.y - e.radius - 10;
      context.fillStyle = PALETTE.panelEdge;
      context.fillRect(e.x - barW / 2, barY, barW, 4);
      context.fillStyle = PALETTE.shadeEye;
      context.fillRect(e.x - barW / 2, barY, barW * Math.max(0, e.hp / e.maxHp), 4);
    }
    void time;
  }

  function drawPlayer(state) {
    const p = state.player;
    const blink = p.invuln > 0 && Math.floor(p.invuln * 10) % 2 === 0;
    if (blink) return;
    const aim = Math.atan2(p.aimY - p.y, p.aimX - p.x);
    // Cloak: a triangle pointing where the keeper walks.
    context.fillStyle = PALETTE.cloak;
    context.beginPath();
    context.moveTo(p.x + Math.cos(aim) * p.radius * 1.1, p.y + Math.sin(aim) * p.radius * 1.1);
    context.arc(p.x, p.y, p.radius, aim + 2.2, aim - 2.2);
    context.closePath();
    context.fill();
    // The keeper's hood.
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(p.x, p.y, p.radius * 0.62, 0, Math.PI * 2);
    context.fill();
    // The lantern itself, held out toward the aim.
    const lx = p.x + Math.cos(aim) * (p.radius + 10);
    const ly = p.y + Math.sin(aim) * (p.radius + 10);
    const lamp = context.createRadialGradient(lx, ly, 1, lx, ly, 22);
    lamp.addColorStop(0, PALETTE.lanternHot);
    lamp.addColorStop(0.5, PALETTE.lantern);
    lamp.addColorStop(1, 'rgba(255, 179, 71, 0)');
    context.fillStyle = lamp;
    context.beginPath();
    context.arc(lx, ly, 22, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.lanternHot;
    context.beginPath();
    context.arc(lx, ly, 6, 0, Math.PI * 2);
    context.fill();
  }

  function drawHud(state) {
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 18, 28, PALETTE.text, 'left');
    text(waveLabel(state.wave), FIELD.width / 2, 18, 28, PALETTE.text, 'center');
    const left = state.spawnQueue.length + state.enemies.filter((e) => e.active).length;
    text(`Shadows ${left}`, FIELD.width / 2, 52, 18, PALETTE.muted, 'center');
    // Lantern health: a flame bar, top right.
    const barW = 220;
    const barX = FIELD.width - 24 - barW;
    text('Lantern', barX - 12, 18, 22, PALETTE.text, 'right');
    context.fillStyle = PALETTE.panelEdge;
    roundRect(barX, 22, barW, 18, 9);
    context.fill();
    const ratio = Math.max(0, state.player.health / state.player.maxHealth);
    context.fillStyle = ratio > 0.5 ? PALETTE.lantern : ratio > 0.25 ? '#ff8a3d' : PALETTE.danger;
    if (ratio > 0) {
      roundRect(barX, 22, barW * ratio, 18, 9);
      context.fill();
    }
    text(embersLabel(state.embersCollected), FIELD.width - 24, 52, 18, PALETTE.ember, 'right');
    text('WASD move · mouse aim · hold click to shoot · P pause', 24, FIELD.height - 30, 16, PALETTE.muted, 'left');
  }

  function drawAim(state) {
    const p = state.player;
    context.strokeStyle = 'rgba(255, 217, 122, 0.8)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(p.aimX, p.aimY, 10, 0, Math.PI * 2);
    context.moveTo(p.aimX - 15, p.aimY);
    context.lineTo(p.aimX - 5, p.aimY);
    context.moveTo(p.aimX + 5, p.aimY);
    context.lineTo(p.aimX + 15, p.aimY);
    context.moveTo(p.aimX, p.aimY - 15);
    context.lineTo(p.aimX, p.aimY - 5);
    context.moveTo(p.aimX, p.aimY + 5);
    context.lineTo(p.aimX, p.aimY + 15);
    context.stroke();
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(11, 13, 26, 0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    roundRect(x, y, PANEL.width, height, 16);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    roundRect(x, y, PANEL.width, height, 16);
    context.stroke();
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 48, PALETTE.lantern, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 22, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 40, 24, PALETTE.ember, 'center');
  }

  function drawUpgrade(state) {
    context.fillStyle = 'rgba(11, 13, 26, 0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.textBaseline = 'alphabetic';
    text(`Wave ${state.wave} cleared`, FIELD.width / 2, 120, 40, PALETTE.lantern, 'center');
    text('Choose one blessing for the lantern', FIELD.width / 2, 168, 24, PALETTE.muted, 'center');
    text(`Bonus +${25 * state.wave} score`, FIELD.width / 2, 204, 20, PALETTE.ember, 'center');
    const choices = state.choices || [];
    for (let index = 0; index < choices.length; index += 1) {
      const rect = upgradeCardRect(index);
      const choice = choices[index];
      context.fillStyle = PALETTE.panel;
      roundRect(rect.x, rect.y, rect.width, rect.height, 14);
      context.fill();
      context.strokeStyle = PALETTE.panelEdge;
      context.lineWidth = 2;
      roundRect(rect.x, rect.y, rect.width, rect.height, 14);
      context.stroke();
      text(`[${index + 1}]`, rect.x + rect.width / 2, rect.y + 52, 26, PALETTE.ember, 'center');
      text(choice.name, rect.x + rect.width / 2, rect.y + 100, 26, PALETTE.text, 'center');
      // The description wraps onto two lines at the card's middle.
      const words = choice.desc.split(' ');
      const half = Math.ceil(words.length / 2);
      text(words.slice(0, half).join(' '), rect.x + rect.width / 2, rect.y + 142, 19, PALETTE.muted, 'center');
      text(words.slice(half).join(' '), rect.x + rect.width / 2, rect.y + 170, 19, PALETTE.muted, 'center');
    }
    text('Click a card or press 1, 2 or 3', FIELD.width / 2, CARD.top + CARD.height + 52, 22, PALETTE.ember, 'center');
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Screen shake: a deterministic wobble while the lantern burns, never random.
    const shakeX = state.shake > 0 ? Math.sin(state.time * 61) * state.shake * 0.6 : 0;
    const shakeY = state.shake > 0 ? Math.cos(state.time * 53) * state.shake * 0.6 : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawFloor(state);
    for (const e of state.embers) if (e.active) drawEmber(e);
    for (const e of state.enemies) if (e.active) drawEnemy(e, state.time);
    for (const b of state.bullets) {
      if (!b.active) continue;
      context.fillStyle = PALETTE.bullet;
      context.beginPath();
      context.arc(b.x, b.y, 5, 0, Math.PI * 2);
      context.fill();
    }
    for (const p of state.particles) {
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    drawPlayer(state);
    if (screen === SCREEN_TITLE) {
      drawPanel('EMBERKEEPER', ['The last lantern is yours to keep.', 'Shadows close in from the dark. Hold them back.', 'Move with WASD or arrows. Aim with the mouse.', 'Hold click to shoot embers. Gather the fallen ones.', bestLabel(best)], 'Click or press Space to begin');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PLAY) drawAim(state);
    else if (screen === SCREEN_UPGRADE) drawUpgrade(state);
    else if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The shadows wait for no one. Except now.'], 'Press P to keep the lantern lit');
    } else if (screen === SCREEN_OVER) {
      const lines = [finalLabel(state.score), bestLabel(best), `You held the light through wave ${state.wave}.`, ''];
      drawPanel('The light goes out', lines, 'Press Space or click to light it again');
    }
    // A red wash while the lantern burns from a hit.
    if (state.flash > 0) {
      context.fillStyle = `rgba(255, 92, 122, ${state.flash * 0.5})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
