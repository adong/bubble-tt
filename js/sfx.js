/* Bubble TT: sound effects, all synthesised with Kit.sound.tone and Kit.sound.hiss (no audio files).
   Exposes BT.sfx. Every effect is silent until Kit.sound.init() runs on the first tap or key. */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});
  const S = Kit.sound;
  const { tone, hiss } = S;
  // a little run of notes: o.gap between them, starting o.at seconds from now
  const notes = (list, o = {}) => list.forEach((f, i) => tone({ type: o.type || 'triangle', f, at: (o.at || 0) + i * (o.gap || 0.07), dur: o.dur || 0.16, vol: o.vol || 0.12 }));

  BT.sfx = {
    // a soft "blub" as the bubble leaves the mouth
    blow() {
      tone({ f: 240, to: 640, dur: 0.12, vol: 0.13 });
      tone({ f: 520, to: 980, dur: 0.07, vol: 0.05, at: 0.04 });
      hiss({ f: 1600, to: 900, dur: 0.08, vol: 0.03, q: 2 });
    },
    // "bloop": an enemy is caught
    trap() {
      tone({ type: 'triangle', f: 720, to: 260, dur: 0.22, vol: 0.14 });
      tone({ f: 260, to: 560, dur: 0.16, vol: 0.1, at: 0.12 });
    },
    // the pop itself: a click and a tiny splash
    pop(trapped) {
      tone({ type: 'square', f: trapped ? 900 : 1300, to: trapped ? 1800 : 2200, dur: 0.045, vol: 0.05, lp: 5000 });
      hiss({ filter: 'highpass', f: 3500, dur: 0.05, vol: trapped ? 0.14 : 0.07 });
    },
    fizz() { hiss({ filter: 'highpass', f: 5000, dur: 0.06, vol: 0.03 }); },
    bounce() {
      tone({ f: 170, to: 520, dur: 0.2, vol: 0.2 });
      tone({ type: 'triangle', f: 340, to: 900, dur: 0.12, vol: 0.05, at: 0.03 });
    },
    combo(n) {
      const scale = [523, 659, 784, 1047, 1319, 1568];
      notes(scale.slice(0, Math.min(6, n + 1)), { gap: 0.06, vol: 0.13 });
    },
    collect(streak) { S.coin(streak); },
    jump() { tone({ type: 'square', f: 300, to: 600, dur: 0.1, vol: 0.035, lp: 2000 }); },
    land() { tone({ f: 120, to: 60, dur: 0.06, vol: 0.08 }); },
    // a slide whistle down and a bonk: dizzy, not hurt
    hurt() {
      tone({ type: 'sawtooth', f: 1000, to: 220, dur: 0.5, vol: 0.06, lp: 1800 });
      tone({ f: 220, to: 80, dur: 0.18, vol: 0.3, at: 0.05 });
      [0.55, 0.7, 0.85].forEach((at) => tone({ type: 'triangle', f: 1600, to: 1900, dur: 0.06, vol: 0.05, at }));
    },
    saved() { S.powerup(); tone({ type: 'triangle', f: 1568, dur: 0.3, vol: 0.08, at: 0.3 }); },
    letter() { notes([988, 1319], { gap: 0.08, vol: 0.14 }); },
    word() { notes([523, 659, 784, 1047, 784, 1047, 1319], { gap: 0.1, dur: 0.22, vol: 0.14 }); },
    water() {
      hiss({ filter: 'lowpass', f: 500, to: 2200, dur: 0.9, vol: 0.22, attack: 0.05 });
      for (let i = 0; i < 6; i++) tone({ f: 300 + i * 90, to: 700 + i * 120, dur: 0.06, vol: 0.05, at: 0.1 + i * 0.09 });
    },
    bolt() {
      tone({ type: 'sawtooth', f: 1800, to: 90, dur: 0.4, vol: 0.1, lp: 3200 });
      hiss({ filter: 'highpass', f: 2500, to: 6000, dur: 0.3, vol: 0.12 });
      notes([1319, 1568, 2093], { gap: 0.05, vol: 0.06 });
    },
    hurry() { [0, 0.18, 0.36].forEach((at) => { tone({ type: 'square', f: 880, dur: 0.09, vol: 0.06, at, lp: 3000 }); tone({ type: 'square', f: 660, dur: 0.09, vol: 0.06, at: at + 0.09, lp: 3000 }); }); },
    ghost() { tone({ type: 'sine', f: 420, to: 300, dur: 0.6, vol: 0.12 }); tone({ type: 'sine', f: 630, to: 450, dur: 0.6, vol: 0.06, at: 0.05 }); },
    // the tickle ghost: a giggle
    boop() { [0, 0.08, 0.16, 0.24].forEach((at, i) => tone({ f: 700 - i * 60, to: 900 - i * 60, dur: 0.06, vol: 0.09, at })); },
    escape() { tone({ type: 'sawtooth', f: 160, to: 95, dur: 0.3, vol: 0.12, lp: 700 }); hiss({ filter: 'lowpass', f: 900, dur: 0.15, vol: 0.08 }); },
    clear() { notes([523, 659, 784, 1047, 1319], { gap: 0.09, dur: 0.25, vol: 0.13 }); },
    extraLife() { notes([784, 988, 1175, 1568], { gap: 0.07, vol: 0.13 }); },
    highfive() {
      hiss({ f: 1800, q: 1.2, dur: 0.07, vol: 0.4 });
      hiss({ f: 2400, q: 1.2, dur: 0.05, vol: 0.2, at: 0.05 });
      notes([659, 880, 1109, 1319], { gap: 0.06, vol: 0.1, at: 0.12 });
    },
    buddyIn() { tone({ type: 'sine', f: 400, to: 1200, dur: 0.35, vol: 0.1 }); hiss({ f: 1200, to: 3000, dur: 0.35, vol: 0.05 }); },
    buddyOut() { tone({ type: 'sine', f: 1200, to: 400, dur: 0.35, vol: 0.08 }); },
    gift() { S.coin(4); notes([1047, 1319], { gap: 0.08, vol: 0.08, at: 0.15 }); },
    bossHit() { tone({ f: 180, to: 90, dur: 0.12, vol: 0.3 }); tone({ type: 'square', f: 600, to: 300, dur: 0.06, vol: 0.04 }); },
    bossBump() { tone({ f: 90, to: 45, dur: 0.18, vol: 0.25 }); },
    bossTrap() { notes([392, 523, 659, 784], { gap: 0.1, dur: 0.3, vol: 0.12 }); },
    bossPop() {
      hiss({ filter: 'lowpass', f: 5000, to: 300, dur: 0.6, vol: 0.35 });
      tone({ f: 200, to: 60, dur: 0.4, vol: 0.35 });
      notes([523, 659, 784, 1047, 1319, 1568, 2093], { gap: 0.09, dur: 0.3, vol: 0.12, at: 0.3 });
    },
    click() { S.click(); },
    start() { S.powerup(); },
  };
})();
