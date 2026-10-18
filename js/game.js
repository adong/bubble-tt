/* Bubble TT: everything around the simulation. Screens, keyboard and touch input, the HUD, the companion button,
   toasts, saving progress, the title-screen demo, and test hooks on window.game. */
(function () {
  'use strict';
  const BT = window.BT, S = Kit.sound;
  const { DT } = BT;
  const $ = (id) => document.getElementById(id);
  const NAME = { teddy: 'TEDDY', tommy: 'TOMMY' };
  const other = (id) => (id === 'tommy' ? 'teddy' : 'tommy');
  const clamp1 = (v) => Math.max(-1, Math.min(1, v));

  // ---------------------------------------------------------------- saving
  const SAVE_KEY = 'bubbleTT.v1';
  const save = { reached: { easy: 1, normal: 1 }, best: 0, hero: 'teddy', easy: false, all: false };
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* storage blocked */ }
  const store = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage blocked */ } };

  const view = new BT.View($('scene'));
  const faces = Kit.portraits([Kit.roster.get('teddy'), Kit.roster.get('tommy')], { size: 160 });
  const navs = [];
  const navFor = (i) => navs[i] || (navs[i] = BT.buildNav(BT.parseLevel(BT.LEVELS[i])));

  const G = {
    screen: 'title', mode: '1p', hero: save.hero === 'tommy' ? 'tommy' : 'teddy', easy: !!save.easy,
    level: 0, startLevel: 0, sim: null, demo: null, held: false, keepAwake: false,
    acc: 0, toasts: [], fade: null, overT: 0, streak: 0, streakT: 0, carry: null, levelCarry: null, touchOn: false,
  };

  // ---------------------------------------------------------------- input
  const keys = new Set();
  const touch = { L: { ax: 0, jump: false, fire: false }, R: { ax: 0, jump: false, fire: false } };

  addEventListener('keydown', (e) => {
    S.init();
    if (/^Arrow|^Space$/.test(e.code)) e.preventDefault();
    const fresh = !keys.has(e.code);
    keys.add(e.code);
    if (fresh && !e.repeat) onKey(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  function onKey(code) {
    const sc = G.screen;
    if (code === 'KeyM') return toggleMute();
    if (sc === 'play') {
      if (code === 'KeyT' || code === 'Enter' || code === 'NumpadEnter') callBuddy();
      else if (code === 'KeyP' || code === 'Escape') pause();
    } else if (sc === 'pause') {
      if (code === 'KeyP' || code === 'Escape' || code === 'Space' || code === 'Enter') resume();
    } else if (sc === 'title') {
      if (code === 'Enter' || code === 'Space') startGame('1p', G.hero);
      else if (code === 'Digit2' || code === 'Numpad2') startGame('2p');
      else if (code === 'Digit1' || code === 'Numpad1') startGame('1p', G.hero);
      else if (code === 'ArrowLeft' || code === 'KeyA') pickHero('teddy');
      else if (code === 'ArrowRight' || code === 'KeyD') pickHero('tommy');
      else if (code === 'KeyE') setEasy(!G.easy);
    } else if (sc === 'over') {
      if (code === 'Enter' || code === 'Space') keepGoing();
      else if (code === 'Escape') toTitle();
    } else if (sc === 'win') {
      if (code === 'Enter' || code === 'Space') startGame(G.mode, G.hero, 0);
      else if (code === 'Escape') toTitle();
    } else if (sc === 'levels' && code === 'Escape') show('title');
  }

  function inputs() {
    const k = (c) => (keys.has(c) ? 1 : 0);
    const L = touch.L, R = touch.R;
    let out;
    if (G.mode === '2p') {
      out = {
        teddy: { ax: clamp1(k('KeyD') - k('KeyA') + L.ax), jump: !!(k('KeyW') || L.jump), fire: !!(k('KeyF') || L.fire) },
        tommy: { ax: clamp1(k('ArrowRight') - k('ArrowLeft') + R.ax), jump: !!(k('ArrowUp') || R.jump), fire: !!(k('KeyL') || R.fire) },
      };
    } else {
      out = {
        [G.hero]: {
          ax: clamp1((k('KeyD') || k('ArrowRight')) - (k('KeyA') || k('ArrowLeft')) + L.ax + R.ax),
          jump: !!(k('KeyW') || k('ArrowUp') || k('Space') || L.jump || R.jump),
          fire: !!(k('KeyF') || k('KeyL') || k('KeyX') || k('KeyJ') || L.fire || R.fire),
        },
      };
    }
    // game.autopilot(): the bot drives the real players (screenshots and demos)
    if (G.auto && G.auto.length && G.auto[0].sim === G.sim) for (const b of G.auto) out[b.p.id] = b.input(DT);
    return out;
  }

  // Touch: a two-way pad (slide your thumb between ◀ and ▶) plus jump and bubble buttons.
  function setupTouch() {
    for (const pad of document.querySelectorAll('#touch .pad')) {
      const side = pad.dataset.side, held = new Map();
      const upd = () => {
        let ax = 0;
        for (const x of held.values()) ax = x;
        touch[side].ax = ax;
        pad.children[0].classList.toggle('on', ax < 0);
        pad.children[1].classList.toggle('on', ax > 0);
      };
      const at = (e) => { const r = pad.getBoundingClientRect(); return e.clientX < r.left + r.width / 2 ? -1 : 1; };
      pad.addEventListener('pointerdown', (e) => { S.init(); pad.setPointerCapture(e.pointerId); held.set(e.pointerId, at(e)); upd(); e.preventDefault(); });
      pad.addEventListener('pointermove', (e) => { if (held.has(e.pointerId)) { held.set(e.pointerId, at(e)); upd(); } });
      const end = (e) => { held.delete(e.pointerId); upd(); };
      pad.addEventListener('pointerup', end);
      pad.addEventListener('pointercancel', end);
    }
    for (const b of document.querySelectorAll('#touch .btns button')) {
      const side = b.parentNode.dataset.side, k = b.dataset.k, held = new Set();
      const upd = () => { touch[side][k] = held.size > 0; b.classList.toggle('on', held.size > 0); };
      b.addEventListener('pointerdown', (e) => { S.init(); b.setPointerCapture(e.pointerId); held.add(e.pointerId); upd(); e.preventDefault(); });
      const end = (e) => { held.delete(e.pointerId); upd(); };
      b.addEventListener('pointerup', end);
      b.addEventListener('pointercancel', end);
    }
    addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && !G.touchOn) { G.touchOn = true; layoutHud(); }
    }, true);
    if (matchMedia('(pointer: coarse)').matches) G.touchOn = true;
  }

  // ---------------------------------------------------------------- flow

  function show(screen) {
    G.screen = screen;
    for (const id of ['title', 'levels', 'pause', 'over', 'win']) $(id).classList.toggle('hidden', id !== screen);
    const playing = screen === 'play' || screen === 'pause' || screen === 'over' || screen === 'win';
    $('hud').classList.toggle('hidden', !playing);
    $('touch').classList.toggle('hidden', screen !== 'play' || !G.touchOn);
    S.music(screen === 'play' ? 'play' : screen === 'pause' ? 'pause' : screen === 'over' ? 'over' : 'title');
    layoutHud();
  }

  function startGame(mode, hero, level) {
    S.init();
    BT.sfx.start();
    G.mode = mode;
    if (hero) { G.hero = hero; save.hero = hero; }
    save.easy = G.easy;
    store();
    G.carry = null;
    G.demo = null;
    clearToasts();
    newLevel(level ?? G.startLevel, true);
    show('play');
  }

  function newLevel(i, first) {
    G.level = i;
    G.levelCarry = G.carry;
    G.sim = new BT.Sim(BT.LEVELS[i], {
      index: i, nav: navFor(i), mode: G.mode, hero: G.hero, easy: G.easy, seed: (Math.random() * 1e9) | 0,
      carry: G.carry, intro: first ? 2.6 : 2.2,
    });
    G.acc = 0;
    G.overT = 0;
    view.setLevel(G.sim);
    view.update(G.sim, 0);
    $('bnNum').textContent = i === BT.LEVELS.length - 1 ? `LEVEL ${i + 1} · THE BIG ONE` : `LEVEL ${i + 1} · ${BT.THEMES[Math.floor(i / 6)].name}`;
    $('bnName').textContent = BT.LEVELS[i].name;
    $('bnTip').textContent = BT.LEVELS[i].tip;
    setupHud();
  }

  function levelDone() {
    const sim = G.sim;
    G.carry = sim.carry();
    const key = G.easy ? 'easy' : 'normal';
    save.reached[key] = Math.max(save.reached[key] || 1, Math.min(BT.LEVELS.length, G.level + 2));
    save.best = Math.max(save.best || 0, total(sim));
    store();
    if (G.level + 1 >= BT.LEVELS.length) return win();
    G.fade = { t: 0, mid: () => newLevel(G.level + 1), called: false };
  }

  const total = (sim) => sim.players.reduce((s, p) => s + (p.buddy ? 0 : p.score), 0);

  function win() {
    $('winText').textContent = `${G.mode === '2p' ? 'Teddy and Tommy' : NAME[G.hero][0] + NAME[G.hero].slice(1).toLowerCase()} scored ${total(G.sim).toLocaleString()} points and saved the moon castle!`;
    show('win');
    view.confetti(120);
  }

  function keepGoing() {
    const c = G.sim.carry();
    c.lives = G.sim.startLives();
    G.carry = c;
    clearToasts();
    newLevel(G.level);
    show('play');
  }

  function pause() {
    if (G.screen !== 'play') return;
    show('pause');
  }

  function resume() {
    if (G.screen !== 'pause') return;
    show('play');
  }

  function toTitle() {
    clearToasts();
    G.sim = null;
    startDemo();
    show('title');
    refreshTitle();
  }

  function callBuddy() {
    const sim = G.sim;
    if (!sim || G.screen !== 'play') return;
    S.init();
    if (!sim.callBuddy() && G.mode === '2p' && sim.hi5Cd > 0) toast(`HIGH FIVE IN ${Math.ceil(sim.hi5Cd)}…`, { life: 0.9 });
  }

  // ---------------------------------------------------------------- the simulation and its events

  function stepSim() {
    const sim = G.sim;
    sim.step(DT, inputs());
    for (const ev of sim.events) handle(ev, sim);
    sim.events.length = 0;
    G.streakT -= DT;
    if (sim.state === 'done' && !G.fade && G.screen === 'play') levelDone();
    if (sim.state === 'over' && G.screen === 'play') {
      G.overT += DT;
      if (G.overT > 1.8) {
        save.best = Math.max(save.best || 0, total(sim));
        store();
        $('overText').textContent = `Out of hearts on level ${G.level + 1}. Everybody's just a bit dizzy!`;
        show('over');
      }
    }
  }

  function handle(ev, sim, quiet) {
    view.onEvent(ev, sim);
    if (quiet) return;
    const fx = BT.sfx;
    const cls = (who) => (who === 'tommy' ? 'm' : 't');
    switch (ev.type) {
      case 'go': toast('GO!', { life: 0.8 }); break;
      case 'blow': fx.blow(); break;
      case 'trap': fx.trap(); break;
      case 'pop': fx.pop(ev.trapped); break;
      case 'fizz': fx.fizz(); break;
      case 'bounce': fx.bounce(); break;
      case 'jump': fx.jump(); break;
      case 'combo':
        fx.combo(ev.n);
        toast(`COMBO x${ev.n}! ${ev.emoji.repeat(Math.min(ev.n, 5))}`, { big: true, life: 1.8 });
        break;
      case 'collect':
        G.streak = G.streakT > 0 ? G.streak + 1 : 0;
        G.streakT = 0.8;
        fx.collect(G.streak);
        break;
      case 'hurt': fx.hurt(); toast(`OOPS! ${NAME[ev.who]} IS DIZZY 💫`, { cls: cls(ev.who), life: 1.4 }); break;
      case 'saved': fx.saved(); toast(`${NAME[ev.by]} SAVED YOU! 🛡️`, { big: true, cls: cls(ev.by), life: 2 }); break;
      case 'letter': fx.letter(); bumpLetters(ev.who); break;
      case 'word': fx.word(); toast(`${ev.word} BONUS! +1 ❤️ 🍬`, { big: true, cls: cls(ev.who), life: 2.6 }); break;
      case 'water': fx.water(); toast('💧 SPLASH!', { life: 1 }); break;
      case 'bolt': fx.bolt(); toast('⚡ ZAP!', { life: 1 }); break;
      case 'hurry': fx.hurry(); toast('HURRY UP! ⏰', { big: true, life: 2 }); break;
      case 'ghost': fx.ghost(); toast('👻 HERE COMES THE TICKLE GHOST!', { life: 2.2 }); break;
      case 'boop': fx.boop(); break;
      case 'escape': fx.escape(); break;
      case 'clear': fx.clear(); toast('CLEAR! 🎉', { big: true, life: 2.4 }); break;
      case 'extraLife': fx.extraLife(); toast('+1 ❤️', { big: true, life: 1.5 }); break;
      case 'highfive': fx.highfive(); toast('✋ HIGH FIVE! BUBBLES EVERYWHERE!', { big: true, life: 2 }); break;
      case 'buddyIn': fx.buddyIn(); toast(`${NAME[ev.who]} IS COMING TO HELP!`, { cls: cls(ev.who), life: 1.8 }); break;
      case 'gift': fx.gift(); toast(`${ev.emoji} ${ev.name} FROM ${NAME[ev.from]}!`, { cls: cls(ev.from), life: 2.2 }); break;
      case 'buddyBye': toast(`BYE BYE, ${NAME[ev.who]}! 👋`, { cls: cls(ev.who), life: 1.4 }); break;
      case 'buddyOut': fx.buddyOut(); break;
      case 'bossHit': fx.bossHit(); break;
      case 'bossBump': fx.bossBump(); break;
      case 'bossTrap': fx.bossTrap(); toast('BIG ZOM IS IN A BUBBLE! POP HIM!', { big: true, life: 2.6 }); break;
      case 'bossPop': fx.bossPop(); toast('YOU DID IT! 🎂', { big: true, life: 3 }); break;
      case 'out': toast(`${NAME[ev.who]} IS OUT OF HEARTS. KEEP GOING, ${NAME[other(ev.who)]}!`, { life: 2.4 }); break;
    }
  }

  // ---------------------------------------------------------------- the title-screen demo

  function startDemo(ix) {
    ix = ix ?? Math.floor(Math.random() * 6);
    const sim = new BT.Sim(BT.LEVELS[ix], { index: ix, nav: navFor(ix), mode: '2p', seed: (Math.random() * 1e9) | 0, ghostPlayers: true, intro: 0.4 });
    G.demo = { sim, ix, t: 0, bots: sim.players.map((p) => new BT.Bot(sim, p)) };
    view.setLevel(sim);
  }

  function demoStep() {
    const d = G.demo;
    if (!d) return;
    const inp = {};
    for (const b of d.bots) inp[b.p.id] = b.input(DT);
    d.sim.step(DT, inp);
    for (const ev of d.sim.events) handle(ev, d.sim, true);
    d.sim.events.length = 0;
    d.t += DT;
    if (d.sim.state === 'done' || d.sim.state === 'over' || d.t > 50) startDemo((d.ix + 1) % 12);
  }

  // ---------------------------------------------------------------- HUD

  function setupHud() {
    const sim = G.sim;
    for (const id of ['teddy', 'tommy']) {
      const card = $('card-' + id);
      card.classList.toggle('hidden', !sim.player(id));
      card.querySelector('.face').src = faces[id];
      card.querySelector('.letters').innerHTML = [...BT.WORDS[id]].map((ch) => `<i>${ch}</i>`).join('');
    }
    const btn = $('callBtn');
    const two = G.mode === '2p';
    const bud = other(G.hero);
    btn.classList.toggle('t', !two && bud === 'teddy');
    btn.querySelector('img').src = two ? faces.teddy : faces[bud];
    btn.querySelector('img').classList.toggle('hidden', two);
    btn.querySelector('.five').classList.toggle('hidden', !two);
    $('buddyBar').classList.toggle('t', bud === 'teddy');
    $('buddyBar').querySelector('img').src = faces[bud];
    $('touch').className = (two ? 'two' : 'one') + (G.screen === 'play' && G.touchOn ? '' : ' hidden');
    G.hudCache = {};
    layoutHud();
    updateHud();
  }

  function layoutHud() {
    const top = document.querySelector('#hud .top');
    const playing = !$('hud').classList.contains('hidden');
    const h = innerHeight;
    if (playing) {
      const tb = top.getBoundingClientRect().bottom;
      view.margins.top = Math.min(h * 0.18, tb + 4);
      view.margins.bottom = G.touchOn && G.screen === 'play' ? Math.min(h * 0.16, 96) : Math.min(h * 0.1, 76);
    } else {
      view.margins.top = 8;
      view.margins.bottom = 8;
    }
    view.margins.side = 6;
    $('touch').classList.toggle('hidden', G.screen !== 'play' || !G.touchOn);
    const bb = $('buddyBar');
    if (G.sim && G.hero === 'tommy' && G.mode === '1p') { bb.style.left = 'auto'; bb.style.right = '12px'; }
    else { bb.style.left = ''; bb.style.right = ''; }
    bb.style.top = (playing ? top.getBoundingClientRect().bottom + 6 : 80) + 'px';
  }
  addEventListener('resize', () => setTimeout(layoutHud, 50));

  function setText(key, el, text) {
    if (G.hudCache[key] === text) return;
    G.hudCache[key] = text;
    el.textContent = text;
  }

  function updateHud() {
    const sim = G.sim;
    if (!sim || !G.hudCache) return;
    for (const id of ['teddy', 'tommy']) {
      const p = sim.player(id);
      if (!p) continue;
      const card = $('card-' + id);
      setText('s' + id, card.querySelector('.score'), p.score.toLocaleString());
      const l = p.letters.join();
      if (G.hudCache['l' + id] !== l) {
        G.hudCache['l' + id] = l;
        [...card.querySelectorAll('.letters i')].forEach((el, i) => el.classList.toggle('on', p.letters[i]));
      }
    }
    setText('lv', $('lvlNum'), String(G.level + 1));
    setText('hearts', $('hearts'), sim.lives > 0 ? '❤️'.repeat(Math.min(sim.lives, 9)) : '💔');
    const B = sim.buddy, here = !!B && B.state !== 'leave' && B.state !== 'bye';
    $('buddyBar').classList.toggle('hidden', !here);
    if (here) {
      $('buddyBar').querySelector('b').style.transform = `scaleX(${Math.max(0, Math.min(1, B.left / 10))})`;
      setText('bb', $('buddyBar').querySelector('em'), sim.shield ? '🛡️' : '');
    }
    const btn = $('callBtn');
    btn.classList.toggle('here', here);
    const bud = other(G.hero);
    let label;
    if (G.mode === '2p') {
      const cd = sim.hi5Cd;
      $('callBtn').querySelector('.cool').style.background = cd > 0 ? `conic-gradient(rgba(10,8,25,0.65) ${(cd / 20) * 360}deg, transparent 0)` : 'none';
      label = cd > 0 ? `HIGH FIVE<small>ready in ${Math.ceil(cd)}</small>` : 'HIGH FIVE! ✋<small>press T</small>';
    } else {
      $('callBtn').querySelector('.cool').style.background = 'none';
      label = here ? `${NAME[bud]} IS HERE!<small>tap for another treat</small>` : `CALL ${NAME[bud]}<small>press T</small>`;
    }
    if (G.hudCache.call !== label) { G.hudCache.call = label; btn.querySelector('em').innerHTML = label; }
    const boss = sim.boss;
    $('bossBar').classList.toggle('hidden', !boss || boss.state === 'gone');
    if (boss) $('bossBar').querySelector('b').style.transform = `scaleX(${Math.max(0, boss.hp / boss.maxHp)})`;
  }

  function bumpLetters(who) {
    const card = $('card-' + who);
    if (!card) return;
    G.toasts.push({ el: null, t: 0, life: 0.5, card });
  }

  // ---------------------------------------------------------------- toasts, banner, fade (timed in game time)

  function toast(text, o = {}) {
    const el = document.createElement('div');
    el.className = 'toast' + (o.big ? ' big' : '') + (o.cls ? ' ' + o.cls : '');
    el.textContent = text;
    $('toasts').appendChild(el);
    G.toasts.push({ el, t: 0, life: o.life || 1.6 });
    const live = G.toasts.filter((q) => q.el);
    if (live.length > 3) { live[0].life = 0; }
  }

  function clearToasts() {
    for (const q of G.toasts) if (q.el) q.el.remove();
    G.toasts = [];
  }

  function updateToasts(dt) {
    for (const q of G.toasts) {
      q.t += dt;
      const a = Math.min(1, q.t * 6, (q.life - q.t) * 4);
      if (q.el) {
        q.el.style.opacity = Math.max(0, a);
        q.el.style.transform = `scale(${0.7 + 0.3 * Math.min(1, q.t * 6) + (q.t < 0.25 ? Math.sin(q.t * 12.5) * 0.08 : 0)})`;
      } else if (q.card) q.card.style.transform = `scale(${1 + Math.sin(Math.min(1, q.t / q.life) * Math.PI) * 0.12})`;
      if (q.t >= q.life) { if (q.el) q.el.remove(); else if (q.card) q.card.style.transform = ''; q.done = true; }
    }
    G.toasts = G.toasts.filter((q) => !q.done);
  }

  function updateBanner() {
    const sim = G.sim;
    const on = G.screen === 'play' && sim && sim.state === 'intro';
    $('banner').classList.toggle('hidden', !on);
    if (on) $('banner').style.opacity = Math.min(1, (sim.introTime - sim.stateT) * 4);
  }

  function updateFade(dt) {
    const f = G.fade;
    if (!f) return;
    f.t += dt;
    $('fade').style.opacity = f.t < 0.35 ? f.t / 0.35 : f.t < 0.5 ? 1 : Math.max(0, 1 - (f.t - 0.5) / 0.35);
    if (f.t >= 0.4 && !f.called) { f.called = true; f.mid(); }
    if (f.t > 0.9) { G.fade = null; $('fade').style.opacity = 0; }
  }

  // ---------------------------------------------------------------- the loop

  function tick(dt) {
    if (G.screen === 'play' && !G.fade) {
      G.acc += dt;
      let n = 0;
      while (G.acc >= DT && n++ < 6) { stepSim(); G.acc -= DT; }
      if (G.acc > DT) G.acc = 0;
    } else if ((G.screen === 'title' || G.screen === 'levels') && G.demo) {
      G.acc += dt;
      let n = 0;
      while (G.acc >= DT && n++ < 6) { demoStep(); G.acc -= DT; }
      if (G.acc > DT) G.acc = 0;
    }
    const sim = activeSim();
    if (sim) view.update(sim, dt);
    updateHud();
    updateToasts(dt);
    updateFade(dt);
    updateBanner();
    view.render();
  }

  const activeSim = () => (G.screen === 'title' || G.screen === 'levels' ? G.demo && G.demo.sim : G.sim);

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (G.held) { view.render(); return; }
    tick(dt);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (!G.keepAwake) { pause(); S.suspend(); }
    } else S.resume();
  });

  // ---------------------------------------------------------------- title screen

  function refreshTitle() {
    $('logo').innerHTML = BT.TITLE.replace(/TT/, '<span class="a">T</span><span class="b">T</span>');
    $('subtitle').textContent = BT.SUBTITLE;
    for (const b of document.querySelectorAll('.kid')) {
      b.querySelector('img').src = faces[b.dataset.hero];
      b.style.transform = b.dataset.hero === G.hero ? 'scale(1.05)' : '';
    }
    $('img2pT').src = faces.teddy;
    $('img2pM').src = faces.tommy;
    for (const b of document.querySelectorAll('#segEasy button')) b.classList.toggle('on', (b.dataset.easy === '1') === G.easy);
    const max = maxLevel();
    if (G.startLevel >= max) G.startLevel = max - 1;
    $('startNum').textContent = String(G.startLevel + 1);
    $('bestLine').textContent = save.best ? `BEST SCORE ${save.best.toLocaleString()}` : '';
    muteIcons();
  }

  const maxLevel = () => (save.all ? BT.LEVELS.length : Math.max(1, save.reached[G.easy ? 'easy' : 'normal'] || 1));

  function pickHero(id) {
    G.hero = id;
    refreshTitle();
  }

  function setEasy(on) {
    G.easy = on;
    save.easy = on;
    store();
    refreshTitle();
  }

  function buildLevelGrid() {
    const grid = $('levelGrid');
    grid.innerHTML = '';
    const max = maxLevel();
    BT.LEVELS.forEach((def, i) => {
      if (i % 6 === 0) {
        const w = document.createElement('div');
        w.className = 'w';
        w.textContent = BT.THEMES[i / 6].name;
        grid.appendChild(w);
      }
      const b = document.createElement('button');
      const locked = i >= max;
      b.textContent = locked ? '🔒' : i === BT.LEVELS.length - 1 ? '👑' : String(i + 1);
      b.title = def.name;
      b.className = (locked ? 'lock' : '') + (i === BT.LEVELS.length - 1 ? ' boss' : '');
      b.style.background = BT.THEMES[Math.floor(i / 6)].ui;
      b.disabled = locked;
      b.onclick = () => { G.startLevel = i; BT.sfx.click(); show('title'); refreshTitle(); };
      grid.appendChild(b);
    });
  }

  function toggleMute() {
    S.init();
    S.toggleMute();
    muteIcons();
  }

  function muteIcons() {
    const m = S.isMuted() ? '🔇' : '🔊';
    $('btnMute').textContent = m;
    $('btnMute2').textContent = m;
  }

  function wire() {
    const click = (id, fn) => $(id).addEventListener('click', (e) => { S.init(); BT.sfx.click(); fn(e); });
    for (const b of document.querySelectorAll('.kid')) b.addEventListener('click', () => startGame('1p', b.dataset.hero));
    click('btn2p', () => startGame('2p'));
    for (const b of document.querySelectorAll('#segEasy button')) b.addEventListener('click', () => { BT.sfx.click(); setEasy(b.dataset.easy === '1'); });
    click('btnLevel', () => { buildLevelGrid(); show('levels'); });
    click('btnLevelsBack', () => show('title'));
    click('btnAll', () => { save.all = true; store(); buildLevelGrid(); });
    click('btnMute', toggleMute);
    click('btnMute2', toggleMute);
    click('btnPause', pause);
    click('btnResume', resume);
    click('btnRestart', () => { G.carry = G.levelCarry; clearToasts(); newLevel(G.level); show('play'); });
    click('btnMenu', toTitle);
    click('btnKeep', keepGoing);
    click('btnOverMenu', toTitle);
    click('btnAgain', () => startGame(G.mode, G.hero, 0));
    click('btnWinMenu', toTitle);
    $('callBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); callBuddy(); });
  }

  // ---------------------------------------------------------------- start

  setupTouch();
  wire();
  const q = new URLSearchParams(location.search);
  if (q.has('level')) {
    G.easy = q.get('easy') === '1' ? true : G.easy;
    startGame(q.get('mode') === '2p' ? '2p' : '1p', q.get('hero') === 'tommy' ? 'tommy' : G.hero, Math.max(0, Math.min(BT.LEVELS.length - 1, (+q.get('level') || 1) - 1)));
  } else {
    startDemo();
    show('title');
    refreshTitle();
  }
  requestAnimationFrame(frame);

  // ---------------------------------------------------------------- test hooks
  // The Browser pane throttles requestAnimationFrame while hidden, so tests drive the game with step().
  window.game = {
    G, view, faces,
    get sim() { return G.sim; },
    step(seconds = 0.5) {
      const n = Math.max(1, Math.round(seconds / DT));
      for (let i = 0; i < n; i++) {
        if (G.screen === 'play' && !G.fade) stepSim();
        else if ((G.screen === 'title' || G.screen === 'levels') && G.demo) demoStep();
        const s = activeSim();
        if (s) view.update(s, DT);
        updateToasts(DT);
        updateFade(DT);
      }
      updateHud();
      updateBanner();
      view.render();
      return this.state();
    },
    hold(on = true) { G.held = on; },
    keepAwake() { G.keepAwake = true; },
    calm() { document.body.classList.add('calm'); },
    start(level = 1, mode = '1p', hero = 'teddy', easy = false) { G.easy = easy; startGame(mode, hero, level - 1); return this.state(); },
    title() { toTitle(); },
    press(code, down = true) { if (down) { if (!keys.has(code)) { keys.add(code); onKey(code); } } else keys.delete(code); },
    touch(side, k, on = true) { if (k === 'pad') touch[side].ax = on; else touch[side][k] = on; },
    call() { callBuddy(); },
    pause, resume,
    // close-up camera for screenshots: game.peek(x, y, zoom), game.peek() to reset
    peek(x, y, zoom) { view.peekAt = x === undefined ? null : { x, y, zoom: zoom || 2 }; view.fit(true); },
    showTouch(on = true) { G.touchOn = on; layoutHud(); setupHud(); },
    state() {
      const s = G.sim;
      return {
        screen: G.screen, level: G.level + 1, mode: G.mode, hero: G.hero, easy: G.easy,
        sim: s && { state: s.state, t: +s.levelT.toFixed(2), lives: s.lives, enemies: s.enemies.map((e) => `${e.kind}:${e.state}`),
          bubbles: s.bubbles.length, treats: s.treats.length, players: s.players.map((p) => `${p.id}${p.buddy ? '(buddy)' : ''}:${p.state}@${p.x.toFixed(1)},${p.y.toFixed(1)} ${p.score}`),
          boss: s.boss && `${s.boss.state} ${s.boss.hp}/${s.boss.maxHp}` },
      };
    },
    // play a level with the autopilot, like tools/check.js does
    check(level, mode = '1p') {
      const i = level - 1, sim = new BT.Sim(BT.LEVELS[i], { index: i, nav: navFor(i), mode, seed: 1, ghostPlayers: true });
      const bots = sim.players.map((p) => new BT.Bot(sim, p));
      for (let t = 0; t < 300; t += DT) {
        const inp = {};
        for (const b of bots) inp[b.p.id] = b.input(DT);
        sim.step(DT, inp);
        sim.events.length = 0;
        if (sim.state === 'clear' || sim.state === 'celebrate' || sim.state === 'done') return `cleared in ${t.toFixed(1)} s`;
      }
      return 'NOT cleared';
    },
    // let the autopilot play the hero (for screenshots and demos)
    autopilot(on = true) {
      if (!on) { G.auto = null; return; }
      const sim = G.sim;
      G.auto = sim.players.filter((p) => !p.buddy).map((p) => new BT.Bot(sim, p));
    },
  };
})();
