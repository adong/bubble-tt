/* Bubble TT: the rules of the game. No Three.js here, so tools/check.js can play every level in Node.
   Units are tiles (one tile is one metre in the 3-D view); y points up and y = 0 is the bottom of the floor row.
   Exposes on window.BT (or globalThis.BT in Node):
     Sim          one level being played: players, enemies, bubbles, treats, specials, the companion, the boss
     parseLevel   turns an ASCII map from js/levels.js into a grid and spawn points
     buildNav     the jump graph of a level (where you can stand and how to get from one spot to another)
     Bot          the autopilot: the companion, the title-screen demo and the level check all use it
     TREATS, GIFTS, WORDS, W, H, DT, PHYS */
(function (root) {
  'use strict';
  const BT = (root.BT = root.BT || {});

  const W = 26, H = 20, DT = 1 / 60;
  // Player physics (tiles and seconds). A jump rises about 4.9 tiles: enough for the platforms 4 rows up.
  const PHYS = { walk: 5.5, jumpV: 16, grav: 26, maxFall: 9, hw: 0.36, foot: 0.3, h: 1.6, bounceV: 14.5, bigBounceV: 17.5 };
  // Bubbles: blown fast, they slow down after about 5 tiles, then float up and gather under the ceiling.
  const BUB = { r: 0.75, shotV: 16, decel: 24, rise: 1.7, drift: 2.4, life: 13, specialLife: 26, max: 40, cd: 0.3 };
  const KINDS = {
    zombie: { walk: 2.0, jumpV: 15.6, hw: 0.36, h: 1.5, hop: 0.05, turn: 0.08 },
    robot: { walk: 2.9, jumpV: 15.6, hw: 0.36, h: 1.45, hop: 0.22, turn: 0.12 },
    blob: { walk: 2.3, jumpV: 9.5, hw: 0.42, h: 0.95 },
    drone: { walk: 2.2, hw: 0.45, h: 0.9 },
  };
  // Treats by combo size: one enemy gives a fruit, a chain of five or more gives a whole cake.
  const TREATS = [
    null,
    { pts: 100, emoji: ['🍌', '🍎', '🍒', '🍓'] },
    { pts: 200, emoji: ['🍉', '🍇', '🍑'] },
    { pts: 500, emoji: ['🍪', '🍩', '🧁'] },
    { pts: 1000, emoji: ['🍦', '🍰'] },
    { pts: 2000, emoji: ['🎂'] },
  ];
  // What the companion brings: [emoji, name for the toast].
  const GIFTS = [['🍦', 'ICE CREAM'], ['💧', 'WATER'], ['🧃', 'JUICE BOX'], ['🍪', 'COOKIE'], ['🍉', 'WATERMELON'], ['🍌', 'BANANA']];
  const WORDS = { teddy: 'TEDDY', tommy: 'TOMMY' };
  const ENEMY_CH = { z: 'zombie', r: 'robot', b: 'blob', d: 'drone' };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- level map

  // Map rows are listed top (the ceiling) to bottom (the floor). Legend: # block, + background decoration,
  // 1 Teddy (and the 1-player hero), 2 Tommy, z zombie, r robot, b blob, d flying robot, B the boss.
  function parseLevel(def) {
    const L = { W, H, grid: [], deco: [], spawns: { p1: null, p2: null, enemies: [], boss: null }, errors: [] };
    const rows = def.map || [];
    if (rows.length !== H) L.errors.push(`map has ${rows.length} rows, needs ${H}`);
    for (let r = 0; r < H; r++) {
      const y = H - 1 - r, line = rows[r] || '';
      if (line.length !== W) L.errors.push(`row ${r + 1} is ${line.length} wide, needs ${W}`);
      L.grid[y] = [];
      for (let x = 0; x < W; x++) {
        const ch = line[x] || ' ';
        L.grid[y][x] = ch === '#' ? 1 : 0;
        if (ch === '+') L.deco.push([x, y]);
        else if (ch === '1') L.spawns.p1 = { x: x + 0.5, y, cx: x };
        else if (ch === '2') L.spawns.p2 = { x: x + 0.5, y, cx: x };
        else if (ENEMY_CH[ch]) L.spawns.enemies.push({ kind: ENEMY_CH[ch], x: x + 0.5, y, cx: x });
        else if (ch === 'B') L.spawns.boss = { x: x + 0.5, y, cx: x };
        else if (ch !== '#' && ch !== ' ' && ch !== '.') L.errors.push(`unknown map letter "${ch}" at row ${r + 1}`);
      }
    }
    if (!L.spawns.p1) L.errors.push('no 1 (player start)');
    if (L.spawns.p1 && !L.spawns.p2) L.spawns.p2 = { x: W - L.spawns.p1.x, y: L.spawns.p1.y, cx: W - 1 - L.spawns.p1.cx };
    return L;
  }

  const block = (L, x, y) => (x <= 0 || x >= W - 1 ? true : y < 0 || y >= H ? false : L.grid[y][x] === 1);
  // A block you can stand on: nothing on top of it and room for a kid between it and the ceiling.
  const surf = (L, c, r) => c > 0 && c < W - 1 && r >= 0 && r + 1 + PHYS.h <= H - 1 && L.grid[r][c] === 1 && !L.grid[r + 1][c];

  function supported(L, x, foot, y) {
    if (y !== Math.floor(y)) return false;
    const c0 = Math.floor(x - foot), c1 = Math.floor(x + foot);
    for (let c = c0; c <= c1; c++) if (surf(L, c, y - 1)) return true;
    return false;
  }

  function landAt(L, x, foot, y0, y1) {
    const c0 = Math.floor(x - foot), c1 = Math.floor(x + foot);
    for (let t = Math.floor(y0 + 1e-6); t >= y1 - 1e-9 && t >= 1; t--) {
      for (let c = c0; c <= c1; c++) if (surf(L, c, t - 1)) return t;
    }
    return null;
  }

  // One step for anything that walks, jumps or falls: one-way platforms (jump up through them, land on top),
  // side walls, the ceiling, and holes in the floor that drop you back in from the top.
  function moveBody(L, b, vx, dt) {
    let landed = false;
    b.vx = vx;
    b.x += vx * dt;
    const lo = 1 + b.hw, hi = W - 1 - b.hw;
    b.wall = 0;
    if (b.x < lo) { b.x = lo; b.wall = -1; } else if (b.x > hi) { b.x = hi; b.wall = 1; }
    if (b.onGround && !supported(L, b.x, b.foot, b.y)) { b.onGround = false; b.vy = 0; }
    if (!b.onGround) {
      b.vy = Math.max(b.vy - PHYS.grav * dt, -PHYS.maxFall);
      const y0 = b.y;
      b.y += b.vy * dt;
      if (b.vy <= 0) {
        const t = landAt(L, b.x, b.foot, y0, b.y);
        if (t !== null) { b.y = t; b.vy = 0; b.onGround = true; landed = true; }
      } else if (b.y + b.h > H - 1) { b.y = H - 1 - b.h; b.vy = 0; }
      if (b.y < -b.h - 0.4) { b.y = H - 1 - b.h; b.wrapped = true; }
    }
    return landed;
  }

  function overlapsBlock(L, x, y, hw, h) {
    for (let c = Math.floor(x - hw); c <= Math.floor(x + hw); c++) {
      for (let r = Math.floor(y); r <= Math.floor(y + h - 0.001); r++) if (block(L, c, r)) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- the jump graph

  // Every spot you can stand on is a node; edges are walks to the next tile and jumps or drops simulated with the
  // real physics. The bot follows these edges, and the level check uses the graph to prove every ledge is reachable.
  function buildNav(L) {
    const nodes = [], at = new Map();
    for (let y = 1; y < H - 1; y++) {
      for (let c = 1; c < W - 1; c++) {
        if (surf(L, c, y - 1)) {
          at.set(c * 100 + y, nodes.length);
          nodes.push({ i: nodes.length, c, y, x: c + 0.5, edges: [] });
        }
      }
    }
    const nodeAt = (c, y) => { const i = at.get(c * 100 + y); return i === undefined ? null : nodes[i]; };
    const nodeFor = (x, y) => {
      if (y !== Math.floor(y)) return null;
      return nodeAt(Math.floor(x), y) || nodeAt(Math.floor(x - PHYS.foot), y) || nodeAt(Math.floor(x + PHYS.foot), y);
    };
    const progs = [];
    for (const dir of [-1, 1]) {
      for (const hold of [12, 16, 22, 30, 42, 999]) progs.push({ dir, hold, jump: false });
      for (const hold of [0, 3, 6, 10, 14, 19, 25, 32, 40, 50, 999]) progs.push({ dir, hold, jump: true });
    }
    progs.push({ dir: 0, hold: 0, jump: true });
    for (const n of nodes) {
      const best = new Map();
      const add = (to, e) => {
        if (!to || to === n) return;
        const old = best.get(to.i);
        if (!old || e.cost < old.cost) best.set(to.i, e);
      };
      for (const dir of [-1, 1]) {
        const nb = nodeAt(n.c + dir, n.y);
        if (nb) add(nb, { to: nb.i, walk: true, cost: 60 / PHYS.walk });
      }
      for (const pr of progs) {
        if (!pr.jump && nodeAt(n.c + pr.dir, n.y)) continue; // not at an edge: walking covers it
        const b = { x: n.x, y: n.y, vx: 0, vy: 0, hw: PHYS.hw, foot: PHYS.foot, h: PHYS.h, onGround: true };
        let f = 0, air = false, wraps = 0;
        for (; f < 300; f++) {
          if (f === 0 && pr.jump) { b.vy = PHYS.jumpV; b.onGround = false; }
          b.wrapped = false;
          moveBody(L, b, f < pr.hold ? pr.dir * PHYS.walk : 0, DT);
          if (b.wrapped) wraps++;
          if (!b.onGround) air = true;
          if (air && b.onGround) break;
          if (!pr.jump && f > 40 && !air) break; // walked into a wall instead of off an edge
        }
        if (!(air && b.onGround) || wraps > 1) continue;
        add(nodeFor(b.x, b.y), { to: nodeFor(b.x, b.y)?.i, prog: pr, cost: f + 8 + (pr.jump ? 6 : 0), land: b.x });
      }
      n.edges = [...best.values()];
    }
    // which nodes can reach which (from node 0's component and so on), for the level check
    return { nodes, nodeAt, nodeFor };
  }

  function reachable(nav, from) {
    const seen = new Set([from.i]), q = [from.i];
    while (q.length) {
      const i = q.shift();
      for (const e of nav.nodes[i].edges) if (!seen.has(e.to)) { seen.add(e.to); q.push(e.to); }
    }
    return seen;
  }

  // ---------------------------------------------------------------- the simulation

  function tuning(idx, easy, def) {
    const i = Math.min(idx, 29);
    return {
      speed: (easy ? 0.68 : 1) * (0.86 + i * 0.011),
      trap: def.trap || (easy ? 14 : 10) - i * 0.12, // how long a trapped enemy stays trapped
      hurry: def.hurry || (easy ? 80 : 56 - i * 0.5), // seconds before "HURRY UP!"
      angry: !easy, // in normal mode, hurry-up makes everyone angry
      inv: easy ? 4 : 3, // blinking after a respawn
      ghostV: easy ? 1.1 : 1.6,
      bossHp: easy ? 22 : 34,
    };
  }

  function Sim(def, opts = {}) {
    this.def = def;
    this.opts = opts;
    this.index = opts.index || 0;
    this.L = opts.level || parseLevel(def);
    this.nav = opts.nav || buildNav(this.L);
    this.rng = mulberry32((opts.seed || 1) * 7919 + this.index * 104729);
    this.mode = opts.mode || '1p';
    this.easy = !!opts.easy;
    this.tune = tuning(this.index, this.easy, def);
    this.gatherX = def.gather || W / 2;
    this.events = [];
    this.uid = 1;
    this.t = 0;
    this.levelT = 0;
    this.state = 'intro';
    this.stateT = 0;
    this.introTime = opts.intro ?? 1.4;
    const carry = opts.carry || {};
    this.lives = Math.max(1, carry.lives ?? this.startLives());
    this.nextLife = carry.nextLife || 30000;
    this.ghostPlayers = !!opts.ghostPlayers; // tests and demos: enemies can't hurt anybody
    this.players = [];
    const ids = this.mode === '2p' ? ['teddy', 'tommy'] : [opts.hero || 'teddy'];
    ids.forEach((id, i) => {
      const sp = i === 0 ? this.L.spawns.p1 : this.L.spawns.p2;
      const p = this.makePlayer(id, sp);
      p.score = (carry.scores && carry.scores[id]) || 0;
      if (carry.letters && carry.letters[id]) p.letters = carry.letters[id].slice();
      this.players.push(p);
    });
    this.hero = this.players[0];
    this.enemies = this.L.spawns.enemies.map((s) => this.makeEnemy(s.kind, s.x, s.y));
    this.bubbles = [];
    this.treats = [];
    this.bolts = [];
    this.waters = [];
    this.popQ = [];
    this.chains = [];
    this.ghost = null;
    this.hurried = false;
    this.boss = null;
    if (this.L.spawns.boss) {
      const s = this.L.spawns.boss;
      this.boss = { id: this.uid++, x: s.x, y: s.y + 3, vx: 2.4, vy: 1.6, r: 2.5, hp: this.tune.bossHp, maxHp: this.tune.bossHp,
        state: 'shield', t: 0, pause: 0, turnT: 6, spitT: 8, hitT: 0 };
    }
    this.specialT = this.boss ? 3 : 10 + this.rng() * 4;
    this.shield = false;
    this.buddy = null;
    this.giftIx = Math.floor(this.rng() * GIFTS.length);
    this.hi5Cd = 0;
    this.hi5T = 0;
  }

  Sim.prototype.startLives = function () {
    return this.mode === '2p' ? (this.easy ? 8 : 5) : this.easy ? 5 : 3;
  };

  Sim.prototype.emit = function (type, o) {
    o = o || {};
    o.type = type;
    this.events.push(o);
    return o;
  };

  Sim.prototype.makePlayer = function (id, sp) {
    return {
      id, x: sp.x, y: sp.y, vx: 0, vy: 0, hw: PHYS.hw, foot: PHYS.foot, h: PHYS.h, onGround: true,
      face: sp.x < W / 2 ? 1 : -1, state: 'play', st: 0, inv: 0, fireCd: 0, jumpWas: false, jumpBuf: 0, coyote: 0,
      blowT: 0, bounceT: 0, bounceId: 0, spawn: sp, buddy: false, score: 0, letters: [false, false, false, false, false],
      credit: id, celebrate: null, saidHi: false,
    };
  };

  Sim.prototype.makeEnemy = function (kind, x, y) {
    const k = KINDS[kind];
    const e = {
      id: this.uid++, kind, x, y, vx: 0, vy: 0, hw: k.hw, foot: 0.2, h: k.h, onGround: kind !== 'drone',
      dir: x < W / 2 ? 1 : -1, state: 'free', angry: false, stun: 0, jumpCd: 1 + this.rng() * 2, airVx: 0, edgeX: -1,
      drop: false, t: this.rng() * 10, bubble: null, spawnT: 0,
    };
    if (kind === 'drone') {
      e.y = y + 0.05;
      e.vx = e.dir;
      e.vy = this.rng() < 0.5 ? 0.7 : -0.7;
    }
    return e;
  };

  Sim.prototype.active = function () {
    return this.players.filter((p) => p.state === 'play' && !p.buddy);
  };

  Sim.prototype.player = function (id) {
    return this.players.find((p) => p.id === id && !p.buddy) || null;
  };

  Sim.prototype.addScore = function (id, pts, x, y) {
    const p = this.player(id) || this.hero;
    p.score += pts;
    const total = this.players.reduce((s, q) => s + (q.buddy ? 0 : q.score), 0);
    while (total >= this.nextLife) {
      this.nextLife += this.nextLife < 60000 ? 30000 : 60000;
      this.lives = Math.min(9, this.lives + 1);
      this.emit('extraLife', { who: p.id, x, y });
    }
  };

  // ---------------------------------------------------------------- the main step

  // inputs: { teddy: { ax, jump, fire }, tommy: {...} } where ax is -1..1 and jump / fire are "held".
  Sim.prototype.step = function (dt, inputs) {
    inputs = inputs || {};
    this.t += dt;
    this.stateT += dt;
    if (this.state === 'intro') {
      if (this.stateT >= this.introTime) { this.state = 'play'; this.stateT = 0; this.emit('go'); }
      return;
    }
    if (this.state === 'over' || this.state === 'done') return;
    if (this.state === 'play') this.levelT += dt;
    this.hi5Cd = Math.max(0, this.hi5Cd - dt);
    if (this.hi5T > 0) this.hi5T -= dt;

    for (const p of this.players) {
      const inp = p.buddy ? (p.state === 'play' && this.buddyBot ? this.buddyBot.input(dt) : {}) : inputs[p.id] || {};
      this.stepPlayer(p, inp, dt);
    }
    this.stepBuddy(dt);
    for (const b of this.bubbles) this.stepBubble(b, dt);
    this.separateBubbles(dt);
    this.touchBubbles();
    this.stepPops(dt);
    this.bubbles = this.bubbles.filter((b) => !b.dead);
    for (const e of this.enemies) this.stepEnemy(e, dt);
    this.hurtCheck();
    this.stepTreats(dt);
    this.stepBolts(dt);
    this.stepWaters(dt);
    if (this.boss) this.stepBoss(dt);
    this.enemies = this.enemies.filter((e) => e.state !== 'gone');
    if (this.state === 'play') {
      this.stepSpecials(dt);
      this.stepHurry(dt);
      if (!this.enemies.length && !this.popQ.length && (!this.boss || this.boss.state === 'gone')) {
        this.state = 'clear';
        this.stateT = 0;
        this.ghost = null;
        this.emit('clear');
      } else if (this.players.every((p) => p.buddy || p.state === 'out')) {
        this.state = 'over';
        this.stateT = 0;
        this.emit('gameover');
      }
    } else if (this.state === 'clear' && this.stateT > 3.2) {
      for (const t of this.treats) this.collect(t, this.nearestPlayer(t, true) || this.hero);
      this.treats = [];
      this.state = 'celebrate';
      this.stateT = 0;
      const pose = this.index % 2 ? 'jumpshot' : 'boxing';
      for (const p of this.players) {
        if (p.state === 'out' || p.state === 'dizzy') this.respawn(p);
        if (p.state === 'leave') continue;
        p.state = 'celebrate';
        p.celebrate = p.id === 'teddy' ? pose : 'peace';
        p.vx = 0;
      }
      this.emit('celebrate', { pose });
    } else if (this.state === 'celebrate' && this.stateT > 2.8) {
      this.state = 'done';
      this.emit('done');
    }
  };

  Sim.prototype.stepPlayer = function (p, inp, dt) {
    p.st += dt;
    p.inv = Math.max(0, p.inv - dt);
    p.blowT = Math.max(0, p.blowT - dt);
    p.bounceT = Math.max(0, p.bounceT - dt);
    p.fireCd -= dt;
    if (p.state === 'dizzy') {
      if (!p.onGround) moveBody(this.L, p, 0, dt);
      if (p.st > 1.6) {
        if (this.lives > 0 || this.state !== 'play') this.respawn(p);
        else { p.state = 'out'; this.emit('out', { who: p.id }); }
      }
      return;
    }
    if (p.state === 'wobble' || p.state === 'hi5') {
      if (!p.onGround) moveBody(this.L, p, 0, dt);
      if (p.st > (p.state === 'hi5' ? 1.3 : 0.8)) { p.state = 'play'; p.st = 0; }
      return;
    }
    if (p.state === 'celebrate') {
      if (!p.onGround) moveBody(this.L, p, 0, dt);
      return;
    }
    if (p.state !== 'play') return;
    const ax = this.state === 'play' || this.state === 'clear' ? clamp(inp.ax || 0, -1, 1) : 0;
    if (ax) p.face = ax > 0 ? 1 : -1;
    if (inp.jump && !p.jumpWas) p.jumpBuf = 0.12;
    p.jumpWas = !!inp.jump;
    p.jumpHeld = !!inp.jump;
    if (p.onGround) p.coyote = 0.08;
    else p.coyote -= dt;
    if (p.jumpBuf > 0 && (p.onGround || p.coyote > 0) && p.vy <= 0) {
      p.vy = PHYS.jumpV;
      p.onGround = false;
      p.jumpBuf = 0;
      p.coyote = 0;
      this.emit('jump', { who: p.id });
    }
    p.jumpBuf -= dt;
    const wasAir = !p.onGround;
    p.wrapped = false;
    if (moveBody(this.L, p, ax * PHYS.walk, dt) && wasAir) this.emit('land', { who: p.id });
    if (inp.fire && p.fireCd <= 0 && this.state === 'play') {
      this.blow(p);
      p.fireCd = BUB.cd;
    }
  };

  Sim.prototype.respawn = function (p) {
    const sp = p.spawn;
    Object.assign(p, { x: sp.x, y: sp.y, vx: 0, vy: 0, onGround: true, state: 'play', st: 0, inv: this.tune.inv });
    this.emit('respawn', { who: p.id });
  };

  Sim.prototype.hurt = function (p, e) {
    if (p.buddy || p.inv > 0 || p.state !== 'play' || this.ghostPlayers || this.state !== 'play') return;
    if (e && e.stun !== undefined) {
      e.stun = 0.7;
      e.dir = e.x < p.x ? -1 : 1;
    }
    if (this.shield && this.buddy && this.mode === '1p' && this.buddy.state !== 'leave') {
      this.shield = false;
      p.inv = 2;
      this.emit('saved', { who: p.id, by: this.buddy.id, x: p.x, y: p.y });
      if (this.buddy.state === 'play') { this.buddy.state = 'hello'; this.buddy.st = 0.4; }
      return;
    }
    this.lives = Math.max(0, this.lives - 1);
    p.state = 'dizzy';
    p.st = 0;
    p.vx = 0;
    this.emit('hurt', { who: p.id, x: p.x, y: p.y });
  };

  Sim.prototype.nearestPlayer = function (o, any) {
    let best = null, bd = 1e9;
    for (const p of this.players) {
      if (p.buddy || (!any && p.state !== 'play') || p.state === 'out') continue;
      const d = Math.abs(p.x - o.x) + Math.abs(p.y - o.y) * 1.5;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };

  // ---------------------------------------------------------------- bubbles

  Sim.prototype.blow = function (p) {
    const b = this.makeBubble('plain', p.x + p.face * 0.55, p.y + 0.9, p.id);
    b.phase = 'shot';
    b.vx = p.face * BUB.shotV;
    b.credit = p.credit;
    p.blowT = 0.22;
    this.emit('blow', { who: p.id, x: b.x, y: b.y, id: b.id });
    if (b.x < 1 + b.r || b.x > W - 1 - b.r) { b.x = clamp(b.x, 1 + b.r, W - 1 - b.r); b.phase = 'float'; }
    this.trapCheck(b);
    const plain = this.bubbles.filter((q) => q.kind === 'plain' && !q.enemy && q.phase === 'float');
    if (this.bubbles.length > BUB.max && plain.length) this.pop(plain[0], null, { quiet: true });
  };

  Sim.prototype.makeBubble = function (kind, x, y, owner) {
    const b = {
      id: this.uid++, kind, x, y, vx: 0, vy: 0, r: BUB.r, phase: 'float', owner: owner || 'teddy', credit: owner || 'teddy',
      age: 0, life: kind === 'plain' ? BUB.life + this.rng() * 2 : BUB.specialLife, enemy: null, trapT: 0,
      driftRow: -1, driftTo: x, dead: false, letter: null, treat: null,
    };
    this.bubbles.push(b);
    return b;
  };

  Sim.prototype.trapCheck = function (b) {
    if (b.phase !== 'shot' || b.kind !== 'plain' || b.enemy) return;
    for (const e of this.enemies) {
      if (e.state !== 'free' || e.spawnT > 0) continue;
      const nx = clamp(b.x, e.x - e.hw, e.x + e.hw), ny = clamp(b.y, e.y, e.y + e.h);
      if (Math.hypot(b.x - nx, b.y - ny) < b.r + 0.1) {
        e.state = 'trapped';
        e.bubble = b;
        e.vx = e.vy = 0;
        b.enemy = e;
        b.phase = 'float';
        b.vx *= 0.15;
        b.trapT = 0;
        this.emit('trap', { who: b.owner, id: b.id, kind: e.kind, x: b.x, y: b.y });
        return;
      }
    }
    const B = this.boss;
    if (B && B.state === 'shield' && Math.hypot(b.x - B.x, b.y - B.y) < B.r + b.r * 0.6) this.bossHit(b, 1);
  };

  Sim.prototype.stepBubble = function (b, dt) {
    if (b.dead) return;
    b.age += dt;
    const L = this.L;
    if (b.phase === 'shot') {
      const sp = Math.abs(b.vx) - BUB.decel * dt;
      if (sp <= 1.5) { b.phase = 'float'; b.vx = Math.sign(b.vx) * 0.6; }
      else b.vx = Math.sign(b.vx) * sp;
      b.x += b.vx * dt;
      if (b.x < 1 + b.r || b.x > W - 1 - b.r) { b.x = clamp(b.x, 1 + b.r, W - 1 - b.r); b.phase = 'float'; b.vx = 0; }
      this.trapCheck(b);
    } else {
      const r = b.r, topRow = Math.floor(b.y + r + 0.02);
      const lid = topRow >= H - 1;
      const blocked = lid || block(L, Math.floor(b.x - 0.35), topRow) || block(L, Math.floor(b.x + 0.35), topRow);
      if (blocked) {
        if (lid) {
          b.y = Math.min(b.y, H - 1 - r);
          b.vx += (clamp((this.gatherX - b.x) * 0.9, -BUB.drift, BUB.drift) - b.vx) * Math.min(1, dt * 2.5);
        } else {
          if (b.driftRow !== topRow) { b.driftRow = topRow; b.driftTo = this.openColumn(b.x, topRow); }
          b.y = Math.min(b.y, topRow - r);
          b.vx += (clamp((b.driftTo - b.x) * 3, -BUB.drift, BUB.drift) - b.vx) * Math.min(1, dt * 5);
        }
        b.vy = Math.min(b.vy, 0) * 0.8;
      } else {
        b.driftRow = -1;
        b.vy += (BUB.rise - b.vy) * Math.min(1, dt * 3);
        b.vx *= 1 - Math.min(1, dt * 1.5);
      }
      b.x = clamp(b.x + b.vx * dt, 1 + r, W - 1 - r);
      b.y = clamp(b.y + b.vy * dt, 1 + r * 0.6, H - 1 - r);
      const B = this.boss;
      if (B && B.state === 'shield' && b.kind === 'plain' && !b.enemy && Math.hypot(b.x - B.x, b.y - B.y) < B.r + r * 0.6) this.bossHit(b, 1);
    }
    if (b.dead) return;
    if (b.enemy) {
      b.trapT += dt;
      if (b.trapT >= this.tune.trap) this.escape(b);
    } else if (b.age > b.life && b.phase === 'float') this.pop(b, null, { quiet: true });
  };

  // The column nearest to x where a bubble can rise through the row above it (ties go toward the gathering spot).
  Sim.prototype.openColumn = function (x, row) {
    const c0 = Math.floor(x), pref = this.gatherX >= x ? 1 : -1;
    for (let d = 1; d < W; d++) {
      for (const s of [pref, -pref]) {
        const c = c0 + s * d;
        if (c > 0 && c < W - 1 && !block(this.L, c, row)) return c + 0.5;
      }
    }
    return x;
  };

  Sim.prototype.separateBubbles = function () {
    const bs = this.bubbles;
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      if (a.phase !== 'float' || a.dead) continue;
      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j];
        if (b.phase !== 'float' || b.dead) continue;
        let dx = b.x - a.x, dy = b.y - a.y;
        const min = a.r + b.r - 0.08;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-4) { dx = this.rng() - 0.5; dy = 0.1; d = Math.hypot(dx, dy); }
        const push = (min - d) * 0.25;
        const ux = dx / d, uy = dy / d;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
        a.x = clamp(a.x, 1 + a.r, W - 1 - a.r); b.x = clamp(b.x, 1 + b.r, W - 1 - b.r);
        a.y = Math.min(a.y, H - 1 - a.r); b.y = Math.min(b.y, H - 1 - b.r);
      }
    }
  };

  // Players and floating bubbles: land on an empty one to bounce, touch any other way to pop it.
  Sim.prototype.touchBubbles = function () {
    for (const p of this.players) {
      if (p.state !== 'play') continue;
      for (const b of this.bubbles) {
        if (b.dead || b.phase !== 'float' || b.popping) continue;
        const ny = clamp(b.y, p.y + 0.35, p.y + p.h - 0.35);
        if (Math.hypot(b.x - p.x, b.y - ny) > b.r + p.hw - 0.05) continue;
        if (p.bounceT > 0 && p.bounceId === b.id) continue;
        if (p.vy < 0 && p.y > b.y + b.r * 0.15 && b.kind === 'plain' && !b.enemy) {
          p.vy = p.jumpHeld ? PHYS.bigBounceV : PHYS.bounceV;
          p.onGround = false;
          p.bounceT = 0.3;
          p.bounceId = b.id;
          b.vy = -2.5;
          b.squash = 1;
          this.emit('bounce', { who: p.id, id: b.id, x: b.x, y: b.y });
          continue;
        }
        this.pop(b, p, { touch: true });
      }
    }
  };

  // Pop a bubble. Bubbles touching it pop a moment later (a chain), and every enemy in the chain counts toward the combo.
  Sim.prototype.pop = function (b, p, o) {
    if (b.dead || b.popping) return;
    o = o || {};
    if (o.quiet) {
      b.dead = true;
      this.emit('fizz', { id: b.id, x: b.x, y: b.y });
      return;
    }
    const chain = o.chain || { owner: p ? p.credit : b.credit, face: p ? p.face : 1, enemies: [], count: 0, pending: 0, x: b.x, y: b.y };
    if (!o.chain) this.chains.push(chain);
    b.popping = true;
    chain.pending++;
    this.popQ.push({ b, t: o.chain ? 0.07 : 0, chain });
  };

  Sim.prototype.stepPops = function (dt) {
    for (const q of this.popQ) q.t -= dt;
    const ready = this.popQ.filter((q) => q.t <= 0);
    this.popQ = this.popQ.filter((q) => q.t > 0);
    for (const q of ready) {
      const b = q.b, ch = q.chain;
      b.dead = true;
      ch.pending--;
      this.emit('pop', { id: b.id, x: b.x, y: b.y, kind: b.kind, owner: b.owner, trapped: !!b.enemy, by: ch.owner, chained: !!q.chained });
      if (b.enemy) {
        b.enemy.state = 'gone';
        ch.count++;
        ch.enemies.push({ x: b.x, y: b.y, kind: b.enemy.kind });
      } else if (b.kind === 'plain') this.addScore(ch.owner, 10);
      if (b.kind === 'letter') this.takeLetter(ch.owner, b.letter, b.x, b.y);
      if (b.kind === 'treat') this.spawnTreat(b.x, b.y, b.treat, 500, ch.owner, 0.5);
      if (b.kind === 'water') this.startWater(b, ch);
      if (b.kind === 'bolt') this.startBolt(b, ch);
      // the chain: bubbles touching this one pop a moment later (water and lightning wait for a kid to pop them)
      for (const o of this.bubbles) {
        if (o.dead || o.popping || o.phase !== 'float' || o.kind === 'water' || o.kind === 'bolt') continue;
        if (Math.hypot(o.x - b.x, o.y - b.y) < b.r + o.r + 0.25) {
          o.popping = true;
          ch.pending++;
          this.popQ.push({ b: o, t: 0.07, chain: ch, chained: true });
        }
      }
    }
    for (const ch of this.chains) {
      if (ch.pending > 0 || ch.paid) continue;
      ch.paid = true;
      this.payChain(ch);
    }
    this.chains = this.chains.filter((c) => !c.paid);
  };

  // Every enemy in a chain turns into a treat; the bigger the chain, the bigger the treats.
  Sim.prototype.payChain = function (ch) {
    const n = ch.enemies.length;
    if (!n) return;
    const tr = TREATS[Math.min(5, n)];
    ch.enemies.forEach((en, i) => {
      const emoji = tr.emoji[Math.floor(this.rng() * tr.emoji.length)];
      this.spawnTreat(en.x, en.y, emoji, tr.pts, ch.owner, 1, i);
    });
    if (n >= 2) this.emit('combo', { n, x: ch.x, y: ch.y, who: ch.owner, emoji: tr.emoji[0], pts: tr.pts });
  };

  Sim.prototype.escape = function (b) {
    const e = b.enemy;
    b.dead = true;
    e.state = 'free';
    e.bubble = null;
    e.angry = true;
    e.x = clamp(b.x, 1 + e.hw, W - 1 - e.hw);
    e.y = b.y - e.h / 2;
    e.vy = e.kind === 'drone' ? 0.8 : 4;
    e.onGround = false;
    e.airVx = 0;
    if (e.kind === 'drone') { e.vx = this.rng() < 0.5 ? -1 : 1; e.y = clamp(e.y, 1, H - 1 - e.h); }
    this.emit('escape', { id: e.id, kind: e.kind, x: e.x, y: e.y });
  };

  // ---------------------------------------------------------------- treats, letters, water, lightning

  Sim.prototype.spawnTreat = function (x, y, emoji, pts, owner, kick = 1, i = 0) {
    const t = {
      id: this.uid++, x: clamp(x, 1.4, W - 1.4), y, vx: (this.rng() - 0.5) * 4 * kick + (i % 2 ? 0.6 : -0.6) * Math.min(i, 3) * 0.5,
      vy: 5 + this.rng() * 3 * kick, hw: 0.3, foot: 0.25, h: 0.6, onGround: false, emoji, pts, owner, t: 0,
    };
    this.treats.push(t);
    this.emit('treat', { id: t.id, emoji, x, y });
    return t;
  };

  Sim.prototype.stepTreats = function (dt) {
    const magnet = this.state === 'clear' && this.stateT > 1.0;
    for (const t of this.treats) {
      t.t += dt;
      if (magnet) {
        const p = this.nearestPlayer(t, true);
        if (p) {
          const k = Math.min(1, dt * (3 + this.stateT * 2));
          t.x += (p.x - t.x) * k;
          t.y += (p.y + 0.8 - t.y) * k;
        }
      } else {
        moveBody(this.L, t, t.onGround ? 0 : t.vx, dt);
        if (t.onGround) t.vx = 0;
      }
      if (t.t < 0.35 && !magnet) continue;
      for (const p of this.players) {
        if (p.state !== 'play' && p.state !== 'celebrate') continue;
        if (Math.abs(t.x - p.x) < 0.75 && t.y + t.h > p.y - 0.1 && t.y < p.y + p.h) {
          this.collect(t, p);
          break;
        }
      }
    }
    this.treats = this.treats.filter((t) => !t.taken);
  };

  Sim.prototype.collect = function (t, p) {
    if (t.taken) return;
    t.taken = true;
    const who = p ? p.credit : t.owner;
    this.addScore(who, t.pts, t.x, t.y);
    this.emit('collect', { id: t.id, who, emoji: t.emoji, pts: t.pts, x: t.x, y: t.y });
  };

  Sim.prototype.missingLetters = function () {
    const out = new Set();
    for (const p of this.players) {
      if (p.buddy) continue;
      const w = WORDS[p.id];
      p.letters.forEach((has, i) => { if (!has) out.add(w[i]); });
    }
    return [...out];
  };

  Sim.prototype.takeLetter = function (who, letter, x, y) {
    const order = [this.player(who) || this.hero, ...this.players.filter((p) => !p.buddy && p.id !== who)];
    for (const p of order) {
      const w = WORDS[p.id];
      const i = [...w].findIndex((ch, k) => ch === letter && !p.letters[k]);
      if (i < 0) continue;
      p.letters[i] = true;
      this.addScore(p.id, 100, x, y);
      this.emit('letter', { who: p.id, letter, i, x, y });
      if (p.letters.every(Boolean)) {
        p.letters = [false, false, false, false, false];
        this.lives = Math.min(9, this.lives + 1);
        this.addScore(p.id, 5000, x, y);
        this.emit('word', { who: p.id, word: w });
        for (let k = 0; k < 10; k++) {
          const tr = TREATS[1 + (k % 4)];
          this.spawnTreat(2 + this.rng() * (W - 4), H - 2.5, tr.emoji[k % tr.emoji.length], 200, p.id, 0.4);
        }
      }
      return;
    }
    this.addScore(who, 100, x, y);
  };

  Sim.prototype.stepSpecials = function (dt) {
    this.specialT -= dt;
    if (this.specialT > 0) return;
    const specials = this.bubbles.filter((b) => b.kind !== 'plain' && !b.dead).length;
    if (this.boss) {
      this.specialT = 3.5;
      if (this.boss.state === 'shield' && specials < 3) this.spawnSpecial('bolt');
      return;
    }
    this.specialT = 12 + this.rng() * 5;
    if (specials >= 2) return;
    const kinds = [];
    if (this.missingLetters().length) kinds.push('letter', 'letter');
    if (this.index >= 4) kinds.push('water');
    if (this.index >= 7) kinds.push('bolt');
    if (!kinds.length) kinds.push('letter');
    this.spawnSpecial(kinds[Math.floor(this.rng() * kinds.length)]);
  };

  Sim.prototype.spawnSpecial = function (kind, x) {
    const b = this.makeBubble(kind, x ?? 3 + this.rng() * (W - 6), 1.9, null);
    b.vy = 1;
    if (kind === 'letter') {
      const m = this.missingLetters();
      b.letter = m.length ? m[Math.floor(this.rng() * m.length)] : 'T';
    }
    this.emit('special', { id: b.id, kind, letter: b.letter, x: b.x, y: b.y });
    return b;
  };

  // A wave of water runs along the platforms (falling off edges, turning at walls) and washes enemies into treats.
  Sim.prototype.startWater = function (b, ch) {
    const w = { id: this.uid++, x: b.x, y: b.y - 0.5, vx: 0, vy: 0, hw: 0.3, foot: 0.3, h: 0.6, onGround: false,
      dir: ch.face || 1, t: 0, trail: [], owner: ch.owner, hits: 0, done: false };
    this.waters.push(w);
    this.emit('water', { id: w.id, x: b.x, y: b.y });
  };

  Sim.prototype.stepWaters = function (dt) {
    for (const w of this.waters) {
      w.t += dt;
      if (!w.done) {
        w.wrapped = false;
        moveBody(this.L, w, w.dir * 8, dt);
        if (w.wall) w.dir = -w.wall;
        w.trail.push({ x: w.x, y: w.y });
        if (w.trail.length > 36) w.trail.shift();
        if (w.wrapped || w.t > 5) w.done = true;
        for (const e of this.enemies) {
          if (e.state !== 'free') continue;
          for (let i = w.trail.length - 1; i >= Math.max(0, w.trail.length - 12); i--) {
            const c = w.trail[i];
            if (Math.abs(c.x - e.x) < e.hw + 0.4 && c.y < e.y + e.h && c.y + 0.8 > e.y) {
              this.washAway(e, w);
              break;
            }
          }
        }
      } else if (w.trail.length) w.trail.splice(0, 2);
    }
    this.waters = this.waters.filter((w) => !w.done || w.trail.length);
  };

  Sim.prototype.washAway = function (e, src) {
    e.state = 'gone';
    src.hits++;
    const tr = TREATS[Math.min(5, src.hits)];
    this.spawnTreat(e.x, e.y + 0.5, tr.emoji[Math.floor(this.rng() * tr.emoji.length)], tr.pts, src.owner, 0.6);
    this.emit('washed', { id: e.id, kind: e.kind, x: e.x, y: e.y, n: src.hits });
  };

  // Star lightning zooms across the screen at the bubble's height.
  Sim.prototype.startBolt = function (b, ch) {
    const bolt = { id: this.uid++, x: b.x, y: b.y, dir: ch.face || 1, owner: ch.owner, hits: 0, bossHit: false, t: 0 };
    this.bolts.push(bolt);
    this.emit('bolt', { id: bolt.id, x: b.x, y: b.y, dir: bolt.dir });
  };

  Sim.prototype.stepBolts = function (dt) {
    for (const z of this.bolts) {
      z.t += dt;
      z.x += z.dir * 15 * dt;
      for (const e of this.enemies) {
        if (e.state !== 'free') continue;
        if (Math.abs(e.x - z.x) < e.hw + 0.5 && z.y > e.y - 0.9 && z.y < e.y + e.h + 0.9) this.washAway(e, z);
      }
      const B = this.boss;
      if (B && B.state === 'shield' && !z.bossHit && Math.hypot(B.x - z.x, B.y - z.y) < B.r + 0.4) {
        z.bossHit = true;
        this.bossHit(null, 5, z);
      }
      if (z.x < 0.5 || z.x > W - 0.5) z.done = true;
    }
    this.bolts = this.bolts.filter((z) => !z.done);
  };

  // ---------------------------------------------------------------- enemies

  Sim.prototype.stepEnemy = function (e, dt) {
    if (e.state === 'trapped') {
      const b = e.bubble;
      e.x = b.x;
      e.y = b.y - e.h / 2;
      return;
    }
    if (e.state !== 'free') return;
    e.t += dt;
    if (e.spawnT > 0) { e.spawnT -= dt; return; }
    const k = KINDS[e.kind], L = this.L;
    const spd = k.walk * this.tune.speed * (e.angry ? 1.55 : 1);
    if (e.kind === 'drone') return this.stepDrone(e, dt, spd);
    let vx;
    const target = this.nearestPlayer(e);
    if (e.stun > 0) {
      e.stun -= dt;
      vx = e.onGround ? 0 : e.airVx;
    } else if (e.kind === 'blob') {
      if (e.onGround) {
        const big = this.rng() < 0.2 || (target && target.y > e.y + 2.5 && this.rng() < 0.35);
        e.vy = big ? 15.2 : k.jumpV + this.rng() * 1.5;
        e.onGround = false;
        e.squash = 1;
        if (target && this.rng() < 0.3) e.dir = target.x < e.x ? -1 : 1;
      }
      vx = e.dir * spd;
    } else if (e.onGround) {
      e.jumpCd -= dt;
      if (this.rng() < k.turn * dt) e.dir = -e.dir;
      const ahead = supported(L, e.x + e.dir * (e.hw + 0.2), 0.05, e.y);
      if (!ahead) {
        const cx = Math.floor(e.x);
        if (e.edgeX !== cx) {
          e.edgeX = cx;
          const below = target && target.y < e.y - 1;
          e.drop = this.rng() < (below ? 0.8 : 0.3);
        }
        if (!e.drop) e.dir = -e.dir;
      } else e.edgeX = -1;
      vx = e.dir * spd;
      e.airVx = vx;
      if (e.jumpCd <= 0) {
        if (target && target.y > e.y + 2.5 && this.surfaceAbove(e)) {
          e.vy = k.jumpV;
          e.onGround = false;
          e.airVx = 0;
          e.jumpCd = (e.angry ? 0.8 : 1.4) + this.rng() * 2;
          vx = 0;
        } else if (this.rng() < k.hop * dt * 60 * 0.05) {
          e.vy = 9;
          e.onGround = false;
          e.jumpCd = 1 + this.rng();
        }
      }
    } else vx = e.airVx;
    moveBody(L, e, vx, dt);
    if (e.wall) { e.dir = -e.wall; if (!e.onGround) e.airVx = 0; }
  };

  Sim.prototype.surfaceAbove = function (e) {
    for (let t = Math.ceil(e.y + 2); t <= e.y + 4.6; t++) {
      for (const dx of [-0.3, 0, 0.3]) if (surf(this.L, Math.floor(e.x + dx), t - 1)) return true;
    }
    return false;
  };

  Sim.prototype.stepDrone = function (e, dt, spd) {
    const L = this.L;
    if (e.stun > 0) e.stun -= dt;
    e.vx = (e.vx < 0 ? -1 : 1) * spd * 0.8;
    e.vy = (e.vy < 0 ? -1 : 1) * spd * 0.6;
    if (overlapsBlock(L, e.x, e.y, e.hw, e.h)) {
      // escaped from a bubble inside a platform: drift out before bouncing off anything again
      e.x = clamp(e.x + e.vx * dt, 1 + e.hw, W - 1 - e.hw);
      e.y = clamp(e.y + (e.vy || -1) * dt, 1, H - 1 - e.h);
      return;
    }
    const nx = e.x + e.vx * dt;
    if (nx < 1 + e.hw || nx > W - 1 - e.hw || overlapsBlock(L, nx, e.y, e.hw, e.h)) e.vx = -e.vx;
    else e.x = nx;
    const ny = e.y + e.vy * dt;
    if (ny < 1 || ny + e.h > H - 1 || overlapsBlock(L, e.x, ny, e.hw, e.h)) e.vy = -e.vy;
    else e.y = ny;
    if (this.rng() < 0.15 * dt) e.vy = -e.vy;
  };

  Sim.prototype.hurtCheck = function () {
    if (this.state !== 'play') return;
    for (const p of this.players) {
      if (p.state !== 'play' || p.buddy || p.inv > 0) continue;
      for (const e of this.enemies) {
        if (e.state !== 'free' || e.spawnT > 0) continue;
        if (Math.abs(e.x - p.x) < e.hw + p.hw - 0.22 && e.y < p.y + p.h - 0.3 && e.y + e.h > p.y + 0.25) {
          this.hurt(p, e);
          break;
        }
      }
      const B = this.boss;
      if (B && B.state === 'shield' && p.state === 'play') {
        const ny = clamp(B.y, p.y + 0.3, p.y + p.h - 0.3);
        if (Math.hypot(B.x - p.x, B.y - ny) < B.r + p.hw - 0.3) this.hurt(p, null);
      }
      const G = this.ghost;
      if (G && G.cd <= 0 && p.state === 'play' && Math.hypot(G.x - p.x, G.y - (p.y + 0.8)) < 1.15) {
        p.state = 'wobble';
        p.st = 0;
        G.cd = 2.5;
        G.vx = (G.x - p.x) * 3;
        G.vy = 3;
        this.emit('boop', { who: p.id, x: p.x, y: p.y });
      }
    }
  };

  // ---------------------------------------------------------------- hurry up

  Sim.prototype.stepHurry = function (dt) {
    if (!this.hurried && this.levelT >= this.tune.hurry) {
      this.hurried = true;
      if (this.tune.angry) for (const e of this.enemies) if (e.state === 'free') e.angry = true;
      this.emit('hurry');
    }
    if (this.hurried && !this.ghost && this.levelT >= this.tune.hurry + 5) {
      this.ghost = { x: W / 2, y: H - 2, vx: 0, vy: -1, cd: 1 };
      this.emit('ghost');
    }
    const G = this.ghost;
    if (!G) return;
    G.cd -= dt;
    const p = this.nearestPlayer(G);
    if (p && G.cd <= 0) {
      const dx = p.x - G.x, dy = p.y + 0.8 - G.y, d = Math.hypot(dx, dy) || 1;
      G.vx += ((dx / d) * this.tune.ghostV - G.vx) * dt * 1.5;
      G.vy += ((dy / d) * this.tune.ghostV - G.vy) * dt * 1.5;
    } else {
      G.vx *= 1 - dt;
      G.vy *= 1 - dt;
    }
    G.x = clamp(G.x + G.vx * dt, 1.8, W - 1.8);
    G.y = clamp(G.y + G.vy * dt, 1.5, H - 1.8);
  };

  // ---------------------------------------------------------------- the boss

  Sim.prototype.bossHit = function (b, dmg, bolt) {
    const B = this.boss;
    if (b) b.dead = true;
    B.hp -= dmg;
    B.hitT = 0.25;
    this.emit('bossHit', { x: b ? b.x : bolt.x, y: b ? b.y : bolt.y, hp: B.hp, max: B.maxHp, dmg });
    if (B.hp <= 0) {
      B.state = 'trapped';
      B.t = 0;
      B.r = 2.1;
      B.vx = 0;
      B.vy = 0.8;
      B.owner = b ? b.owner : bolt.owner;
      this.emit('bossTrap', { x: B.x, y: B.y });
    }
  };

  Sim.prototype.stepBoss = function (dt) {
    const B = this.boss;
    B.t += dt;
    B.hitT = Math.max(0, B.hitT - dt);
    if (B.state === 'shield') {
      if (this.state === 'play') {
        if (B.pause > 0) B.pause -= dt;
        else {
          const spd = (this.easy ? 2.0 : 2.8) * (B.hp < B.maxHp / 2 ? 1.2 : 1);
          const n = Math.hypot(B.vx, B.vy) || 1;
          B.x += (B.vx / n) * spd * dt;
          B.y += (B.vy / n) * spd * 0.7 * dt;
          if (B.x < 1 + B.r) { B.x = 1 + B.r; B.vx = Math.abs(B.vx); }
          if (B.x > W - 1 - B.r) { B.x = W - 1 - B.r; B.vx = -Math.abs(B.vx); }
          if (B.y < 1 + B.r) { B.y = 1 + B.r; B.vy = Math.abs(B.vy); this.emit('bossBump', { x: B.x, y: B.y - B.r }); }
          if (B.y > H - 1 - B.r) { B.y = H - 1 - B.r; B.vy = -Math.abs(B.vy); }
        }
        B.turnT -= dt;
        if (B.turnT <= 0) {
          B.turnT = 5 + this.rng() * 3;
          B.pause = 0.8;
          B.vx = (this.rng() < 0.5 ? -1 : 1) * (0.6 + this.rng());
          B.vy = (this.rng() < 0.5 ? -1 : 1) * (0.5 + this.rng());
          this.emit('bossWobble', { x: B.x, y: B.y });
        }
        B.spitT -= dt;
        const blobs = this.enemies.filter((e) => e.kind === 'blob').length;
        if (B.spitT <= 0) {
          B.spitT = 8;
          if (blobs < (this.easy ? 1 : 2)) {
            const e = this.makeEnemy('blob', B.x, Math.max(1, B.y - B.r));
            e.onGround = false;
            e.vy = 6;
            this.enemies.push(e);
            this.emit('bossSpit', { x: B.x, y: B.y });
          }
        }
      }
    } else if (B.state === 'trapped') {
      // the giant bubble drifts over to the nearest kid, so it's easy to pop
      const p = this.nearestPlayer(B);
      const tx = p ? p.x : W / 2, ty = p ? p.y + 1 : H / 2;
      const dx = tx - B.x, dy = ty - B.y, d = Math.hypot(dx, dy) || 1;
      const v = B.t < 1.2 ? 0.3 : 2.2;
      B.x = clamp(B.x + (dx / d) * v * dt, 1 + B.r, W - 1 - B.r);
      B.y = clamp(B.y + (dy / d) * v * dt, 1 + B.r * 0.7, H - 1 - B.r);
      for (const p of this.players) {
        if (p.state !== 'play') continue;
        const ny = clamp(B.y, p.y + 0.3, p.y + p.h - 0.3);
        if (Math.hypot(B.x - p.x, B.y - ny) < B.r + p.hw) {
          B.state = 'gone';
          this.emit('bossPop', { x: B.x, y: B.y, who: p.credit });
          this.spawnTreat(B.x, B.y, '🎂', 10000, p.credit, 0.3);
          for (let k = 0; k < 14; k++) {
            const tr = TREATS[1 + (k % 5)];
            this.spawnTreat(B.x + (this.rng() - 0.5) * 3, B.y + (this.rng() - 0.5) * 2, tr.emoji[k % tr.emoji.length], tr.pts, p.credit, 1.6);
          }
          for (const e of this.enemies) if (e.state === 'free') this.washAway(e, { hits: 0, owner: p.credit });
          for (const b of this.bubbles) if (b.enemy) { b.enemy.state = 'gone'; b.dead = true; this.spawnTreat(b.x, b.y, '🍬', 300, p.credit); }
          break;
        }
      }
    }
  };

  // ---------------------------------------------------------------- the companion and the high five

  // 1 player: the other brother comes to help for about 10 s. Calling again while he's here brings another treat.
  Sim.prototype.callBuddy = function () {
    if (this.mode === '2p') return this.highFive();
    if (this.state !== 'play' && this.state !== 'intro') return false;
    const hero = this.hero;
    const id = hero.id === 'tommy' ? 'teddy' : 'tommy';
    const B = this.buddy;
    if (B && B.state !== 'leave' && B.state !== 'bye') {
      B.left = 10;
      this.shield = true;
      if (B.state === 'play' || B.state === 'hello') { B.state = 'give'; B.st = 0; B.gave = false; }
      else B.moreGifts = (B.moreGifts || 0) + 1;
      this.emit('buddyAgain', { who: id });
      return true;
    }
    let x = clamp(hero.x + (hero.x < W / 2 ? 2.5 : -2.5), 2, W - 2);
    for (let d = 0; d < W; d++) {
      const c = Math.floor(x) + (d % 2 ? -1 : 1) * Math.ceil(d / 2);
      if (c > 0 && c < W - 1 && this.columnHasFloor(c)) { x = c + 0.5; break; }
    }
    const p = this.makePlayer(id, { x, y: H - 1 - PHYS.h });
    p.buddy = true;
    p.credit = hero.id;
    p.state = 'enter';
    p.onGround = false;
    p.left = 10;
    p.face = hero.x < x ? -1 : 1;
    p.spawn = { x, y: H - 1 - PHYS.h };
    this.players.push(p);
    this.buddy = p;
    this.buddyBot = new Bot(this, p);
    this.shield = true;
    this.emit('buddyIn', { who: id, x, y: p.y });
    return true;
  };

  Sim.prototype.columnHasFloor = function (c) {
    for (let r = 0; r < H - 3; r++) if (surf(this.L, c, r)) return true;
    return false;
  };

  Sim.prototype.stepBuddy = function (dt) {
    const p = this.buddy;
    if (!p) return;
    if (p.state === 'enter') {
      // floats down inside a big bubble
      p.y -= 4 * dt;
      const t = landAt(this.L, p.x, p.foot, p.y + 4 * dt, p.y);
      if (t !== null) { p.y = t; p.onGround = true; p.vy = 0; p.state = 'hello'; p.st = 0; this.emit('buddyLand', { who: p.id }); }
      if (p.y < 1) { p.y = 1; p.state = 'hello'; p.st = 0; }
      return;
    }
    if (p.state === 'leave') {
      p.y += 5 * dt;
      if (p.y > H + 1) {
        this.players = this.players.filter((q) => q !== p);
        this.buddy = null;
        this.shield = false;
      }
      return;
    }
    if (this.state === 'celebrate') return;
    p.left -= dt;
    if (p.state === 'hello') {
      if (!p.onGround) moveBody(this.L, p, 0, dt);
      if (p.st > 1.1) { p.state = p.gave ? 'play' : 'give'; p.st = 0; }
    } else if (p.state === 'give') {
      if (!p.onGround) moveBody(this.L, p, 0, dt);
      p.face = this.hero.x < p.x ? -1 : 1;
      if (!p.gave && p.st > 0.25) {
        p.gave = true;
        const g = GIFTS[this.giftIx++ % GIFTS.length];
        this.addScore(this.hero.id, 500, this.hero.x, this.hero.y);
        this.emit('gift', { from: p.id, to: this.hero.id, emoji: g[0], name: g[1], x: p.x, y: p.y });
      }
      if (p.st > 0.9) {
        if (p.moreGifts) { p.moreGifts--; p.st = 0; p.gave = false; }
        else { p.state = 'play'; p.st = 0; }
      }
    } else if (p.state === 'play' && p.left <= 0) {
      p.state = 'bye';
      p.st = 0;
      this.emit('buddyBye', { who: p.id });
    } else if (p.state === 'bye') {
      if (!p.onGround) moveBody(this.L, p, 0, dt);
      if (p.st > 1.2) { p.state = 'leave'; p.st = 0; this.shield = false; this.emit('buddyOut', { who: p.id }); }
    }
  };

  // 2 players: the brothers high-five (both signature moves) and the screen fills with bonus bubbles.
  Sim.prototype.highFive = function () {
    if (this.state !== 'play' || this.hi5Cd > 0) return false;
    const ps = this.players.filter((p) => !p.buddy && p.state === 'play');
    if (!ps.length) return false;
    this.hi5Cd = 20;
    this.hi5T = 1.3;
    for (const p of ps) { p.state = 'hi5'; p.st = 0; p.inv = Math.max(p.inv, 1.6); }
    this.emit('highfive', { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps[0].y });
    for (let i = 0; i < 16; i++) {
      const b = this.makeBubble('plain', 2 + ((i + 0.5) / 16) * (W - 4) + (this.rng() - 0.5), 1.8 + this.rng() * 2.5, i % 2 ? 'tommy' : 'teddy');
      b.vy = 2 + this.rng() * 2;
      b.life = 16;
    }
    for (let i = 0; i < 3; i++) {
      const b = this.makeBubble('treat', 4 + this.rng() * (W - 8), 2 + this.rng() * 3, null);
      b.treat = ['🍪', '🍩', '🧁', '🍦', '🍓'][Math.floor(this.rng() * 5)];
    }
    if (this.enemies.some((e) => e.state === 'free') || this.boss) this.spawnSpecial('bolt', W / 2 + (this.rng() - 0.5) * 6);
    if (this.missingLetters().length) this.spawnSpecial('letter');
    return true;
  };

  // What the game carries to the next level.
  Sim.prototype.carry = function () {
    const scores = {}, letters = {};
    for (const p of this.players) if (!p.buddy) { scores[p.id] = p.score; letters[p.id] = p.letters.slice(); }
    return { lives: this.lives, scores, letters, nextLife: this.nextLife };
  };

  // ---------------------------------------------------------------- the bot

  // The autopilot. It follows the jump graph to spots where it can blow a bubble at an enemy, or jump into a
  // trapped bubble to pop it. Used by the companion, the title demo and tools/check.js.
  function Bot(sim, p, opts) {
    this.sim = sim;
    this.p = p;
    this.opts = opts || {};
    this.path = null;
    this.edge = null;
    this.goal = null;
    this.phase = null;
    this.f = 0;
    this.wait = 0;
    this.lastNode = null;
    this.stuck = 0;
    this.wander = null;
  }

  Bot.prototype.input = function (dt) {
    const sim = this.sim, p = this.p, nav = sim.nav;
    const out = { ax: 0, jump: false, fire: false };
    dt = dt || DT;
    if (p.state !== 'play' || (sim.state !== 'play' && sim.state !== 'clear')) { this.reset(); return out; }
    if (this.opts.fire !== false && sim.state === 'play' && this.lineUp()) out.fire = true;
    if (this.edge) return this.follow(out, dt);
    if (!p.onGround) return out;
    const node = nav.nodeFor(p.x, p.y);
    if (!node) {
      out.ax = p.x < W / 2 ? 1 : -1;
      return out;
    }
    if (node === this.lastNode) this.stuck += dt;
    else { this.stuck = 0; this.lastNode = node; }
    // at the goal: do the action
    if (this.path && !this.path.length && this.goal) {
      const g = this.goal;
      this.path = null;
      if (g.act === 'jump') { out.jump = true; return out; }
      if (g.act === 'fire' && g.face) {
        if (p.face !== g.face) out.ax = g.face * 0.02;
        else if (sim.state === 'play' && this.opts.fire !== false) out.fire = true;
        this.wait = 0.12;
        return out;
      }
    }
    if (this.wait > 0) { this.wait -= dt; return out; }
    this.plan(node);
    if (this.path && this.path.length) {
      this.edge = this.path.shift();
      this.edgeFrom = node.i;
      this.phase = this.edge.walk ? null : 'center';
      return this.follow(out, dt);
    }
    return out;
  };

  // Follow the current edge: walk to the next tile, or line up on the tile centre and replay a jump or a drop.
  Bot.prototype.follow = function (out, dt) {
    const p = this.p, nav = this.sim.nav, e = this.edge;
    const to = nav.nodes[e.to], from = nav.nodes[this.edgeFrom];
    const toward = (x) => clamp((x - p.x) / (PHYS.walk * dt), -1, 1);
    if (e.walk) {
      if (!p.onGround) { this.reset(); return out; }
      out.ax = toward(to.x);
      if (Math.abs(to.x - p.x) < 1e-3) this.edge = null;
      return out;
    }
    if (this.phase === 'center') {
      if (!p.onGround) { this.reset(); return out; }
      if (Math.abs(from.x - p.x) > 1e-3) { out.ax = toward(from.x); return out; }
      this.phase = 'run';
      this.f = 0;
      this.air = false;
    }
    const pr = e.prog;
    out.ax = this.f < pr.hold ? pr.dir : 0;
    out.jump = pr.jump && this.f === 0;
    this.f++;
    if (!p.onGround) this.air = true;
    if ((this.air && p.onGround) || this.f > 320) this.edge = null;
    return out;
  };

  Bot.prototype.reset = function () {
    this.edge = null;
    this.path = null;
    this.phase = null;
  };

  // Blow a bubble when an enemy is right in front.
  Bot.prototype.lineUp = function () {
    const p = this.p, y = p.y + 0.9;
    if (p.fireCd > 0) return false;
    for (const e of this.sim.enemies) {
      if (e.state !== 'free' || e.spawnT > 0) continue;
      const dx = (e.x - p.x) * p.face;
      if (dx > 0 && dx < 4.8 && y > e.y - 0.5 && y < e.y + e.h + 0.5) return true;
    }
    const B = this.sim.boss;
    if (B && B.state === 'shield') {
      const dx = (B.x - p.x) * p.face;
      if (dx > 0 && dx < 7 && Math.abs(B.y - y) < B.r) return true;
    }
    return false;
  };

  // Pick the cheapest goal: a spot under a trapped bubble, or a spot in line with an enemy.
  Bot.prototype.plan = function (node) {
    const sim = this.sim, nav = sim.nav, p = this.p;
    const dist = new Float64Array(nav.nodes.length).fill(Infinity);
    const prev = new Int32Array(nav.nodes.length).fill(-1);
    const prevE = new Array(nav.nodes.length);
    dist[node.i] = 0;
    const open = [node.i];
    const done = new Uint8Array(nav.nodes.length);
    while (open.length) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (dist[open[k]] < dist[open[bi]]) bi = k;
      const i = open.splice(bi, 1)[0];
      if (done[i]) continue;
      done[i] = 1;
      for (const e of nav.nodes[i].edges) {
        const d = dist[i] + e.cost;
        if (d < dist[e.to]) { dist[e.to] = d; prev[e.to] = i; prevE[e.to] = e; open.push(e.to); }
      }
    }
    let best = null, bestCost = Infinity;
    const consider = (n, cost, goal) => {
      if (cost < bestCost) { bestCost = cost; best = { n, goal }; }
    };
    const apex = (PHYS.jumpV * PHYS.jumpV) / (2 * PHYS.grav);
    // trapped bubbles (and special bubbles, which are fun to pop)
    for (const b of sim.bubbles) {
      if (b.dead || b.phase !== 'float') continue;
      const want = b.enemy ? 0 : b.kind === 'letter' || b.kind === 'treat' ? 120 : b.kind === 'bolt' && sim.boss ? 40 : -1;
      if (want < 0) continue;
      const urgency = b.enemy ? -Math.min(200, b.trapT * 20) : 0;
      for (const n of nav.nodes) {
        if (!isFinite(dist[n.i]) || Math.abs(n.x - b.x) > 0.55) continue;
        const head = n.y + PHYS.h;
        if (n.y <= b.y + b.r && head >= b.y - b.r) consider(n, dist[n.i] + want + urgency, { act: 'none' });
        else if (head < b.y - b.r && Math.min(head + apex, H - 1) >= b.y - b.r + 0.15) consider(n, dist[n.i] + 30 + want + urgency, { act: 'jump' });
      }
    }
    // free enemies: a spot in line with them, a few tiles away
    if (sim.state === 'play') {
      const targets = sim.enemies.filter((e) => e.state === 'free').map((e) => ({ x: e.x, y0: e.y - 0.4, y1: e.y + e.h + 0.4, near: 1.0, far: 4.4 }));
      const B = sim.boss;
      if (B && B.state === 'shield') targets.push({ x: B.x, y0: B.y - B.r + 0.3, y1: B.y + B.r - 0.3, near: B.r + 0.8, far: B.r + 5 });
      if (B && B.state === 'trapped') targets.push({ x: B.x, y0: B.y - B.r, y1: B.y + B.r, near: 0, far: B.r + 0.2, touch: true });
      for (const tg of targets) {
        for (const n of nav.nodes) {
          if (!isFinite(dist[n.i])) continue;
          const sy = n.y + 0.9, dx = tg.x - n.x;
          if (tg.touch) {
            if (Math.abs(dx) < tg.far && n.y + PHYS.h + apex > tg.y0 && n.y < tg.y1) consider(n, dist[n.i] + 20, { act: 'jump' });
            continue;
          }
          if (sy < tg.y0 || sy > tg.y1) continue;
          const ad = Math.abs(dx);
          if (ad < tg.near || ad > tg.far) continue;
          consider(n, dist[n.i] + 60 + Math.abs(ad - 2.5) * 4, { act: 'fire', face: dx > 0 ? 1 : -1 });
        }
      }
    }
    // after the clear (the companion picks up treats)
    if (!best && sim.state === 'clear') {
      for (const t of sim.treats) {
        const n = nav.nodeFor(Math.floor(t.x) + 0.5, t.y);
        if (n && isFinite(dist[n.i])) consider(n, dist[n.i], { act: 'none' });
      }
    }
    // stuck, or nothing to do: wander somewhere new
    if (!best || this.stuck > 3) {
      this.stuck = 0;
      const ok = nav.nodes.filter((n) => isFinite(dist[n.i]) && n !== node);
      if (!ok.length) { this.path = null; return; }
      const n = ok[Math.floor(sim.rng() * ok.length)];
      best = { n, goal: { act: 'none' } };
    }
    const path = [];
    for (let i = best.n.i; i !== node.i && i >= 0; i = prev[i]) path.unshift(prevE[i]);
    this.path = path;
    this.goal = best.goal;
    if (!path.length && best.goal.act === 'none') this.wait = 0.2;
  };

  Object.assign(BT, { W, H, DT, PHYS, BUB, KINDS, TREATS, GIFTS, WORDS, Sim, Bot, parseLevel, buildNav, reachable, surf, block, supported, moveBody, mulberry32 });
})(typeof window !== 'undefined' ? window : globalThis);
