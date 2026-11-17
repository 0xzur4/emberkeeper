// Sound, synthesised live with WebAudio: no audio files, no network. Every effect is one
// short oscillator envelope, so a frame never allocates and a missing AudioContext (or a
// browser that refuses it before a gesture) only silences the game, never breaks it.

export function createAudio() {
  let context = null;
  let master = null;

  function unlock() {
    if (context !== null) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.16;
      master.connect(context.destination);
    } catch {
      context = null;
    }
  }

  /** One tone: `type` wave, `from` to `to` Hz over `seconds`, starting now. */
  function tone(type, from, to, seconds, volume) {
    if (context === null || master === null) return;
    try {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(from, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + seconds);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(now);
      oscillator.stop(now + seconds + 0.02);
    } catch {
      // A tone that cannot play is a missed sound, never a broken game.
    }
  }

  return {
    unlock,
    shoot() {
      tone('square', 720, 340, 0.07, 0.5);
    },
    hit() {
      tone('triangle', 240, 170, 0.05, 0.4);
    },
    kill() {
      tone('sine', 520, 90, 0.16, 0.7);
    },
    pickup() {
      tone('sine', 880, 1320, 0.09, 0.5);
    },
    waveClear() {
      tone('sine', 523, 523, 0.1, 0.5);
      setTimeout(() => tone('sine', 659, 659, 0.1, 0.5), 90);
      setTimeout(() => tone('sine', 784, 784, 0.16, 0.5), 180);
    },
    upgrade() {
      tone('triangle', 392, 392, 0.1, 0.5);
      setTimeout(() => tone('triangle', 523, 523, 0.12, 0.5), 80);
      setTimeout(() => tone('triangle', 659, 659, 0.18, 0.5), 160);
    },
    hurt() {
      tone('sawtooth', 160, 55, 0.25, 0.8);
    },
    boss() {
      tone('sawtooth', 90, 45, 0.5, 0.7);
      setTimeout(() => tone('sawtooth', 110, 55, 0.4, 0.6), 200);
    },
    gameOver() {
      tone('sine', 392, 392, 0.22, 0.6);
      setTimeout(() => tone('sine', 311, 311, 0.22, 0.6), 200);
      setTimeout(() => tone('sine', 233, 110, 0.5, 0.6), 400);
    },
  };
}
