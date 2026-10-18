#!/usr/bin/env node
/* Bubble TT level check. Proves that every level in js/levels.js can be finished, with the same rules the game uses.
     1. Map rules: size, solid side walls, nothing starts inside a block or in mid-air, room above every platform
        for a kid's head, holes in the floor have holes in the ceiling.
     2. Reachability: every spot you can stand on can be reached from both start spots (the jump graph is built by
        simulating real jumps and drops).
     3. Play-through: the autopilot plays every level (1 player with three seeds, and 2 players) and must clear it.
        Enemies can't hurt it here, so it proves the level is clearable, not that it's easy.
     4. The check can fail: standing still never clears a level, and broken maps are caught.
   Usage: node tools/check.js            everything
          node tools/check.js 7          just level 7, with details
          node tools/check.js --quick    one seed per level */
'use strict';
const path = require('path');
require(path.join(__dirname, '../js/sim.js'));
require(path.join(__dirname, '../js/levels.js'));
const BT = globalThis.BT;
const { W, H, DT } = BT;

const args = process.argv.slice(2);
const only = args.find((a) => /^\d+$/.test(a));
const quick = args.includes('--quick');
const trace = args.includes('--trace');

// ---------------------------------------------------------------- 1 + 2: the map

function mapProblems(def) {
  const out = [];
  const L = BT.parseLevel(def);
  out.push(...L.errors);
  if (L.errors.length) return { L, out };
  const rows = def.map;
  for (let r = 0; r < H; r++) {
    if (rows[r][0] !== '#' || rows[r][W - 1] !== '#') out.push(`row ${r + 1}: the side walls must be #`);
  }
  const g = L.grid;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!g[y][x]) continue;
      if (y >= H - 3) out.push(`block at row ${H - y}, column ${x + 1} is too close to the ceiling`);
      else if (!g[y + 1][x] && g[y + 2][x]) out.push(`no head room above the block at row ${H - y}, column ${x + 1} (blocks 2 rows apart)`);
    }
  }
  for (let x = 1; x < W - 1; x++) {
    if (g[1][x] && !g[0][x]) out.push(`block right above the floor hole at column ${x + 1}`);
    if (!g[0][x] && g[H - 1][x]) out.push(`floor hole at column ${x + 1} has no ceiling hole above it`);
  }
  const standOk = (s, what) => {
    const c = s.cx, y = s.y;
    if (g[y][c] || (y + 1 < H && g[y + 1][c])) out.push(`${what} starts inside a block`);
    else if (!BT.surf(L, c, y - 1)) out.push(`${what} starts in mid-air (needs a block under it)`);
  };
  standOk(L.spawns.p1, 'Teddy (1)');
  standOk(L.spawns.p2, 'Tommy (2)');
  for (const e of L.spawns.enemies) {
    const what = `${e.kind} at column ${e.cx + 1}, row ${H - e.y}`;
    if (e.kind === 'drone') {
      const k = BT.KINDS.drone;
      if (g[e.y][e.cx] || e.y < 1) out.push(`${what} starts inside a block`);
      else if ([e.cx - 1, e.cx + 1].some((c) => g[e.y][c] && Math.abs(c + 0.5 - e.x) < k.hw + 0.5)) out.push(`${what} is squeezed`);
    } else standOk(e, what);
  }
  const n = L.spawns.enemies.length + (L.spawns.boss ? 1 : 0);
  if (n < 1 || n > 8) out.push(`${n} enemies (needs 1 to 8)`);
  const nav = BT.buildNav(L);
  for (const sp of [L.spawns.p1, L.spawns.p2]) {
    const start = nav.nodeFor(sp.x, sp.y);
    if (!start) continue;
    const seen = BT.reachable(nav, start);
    const miss = nav.nodes.filter((nd) => !seen.has(nd.i));
    if (miss.length) out.push(`from ${sp === L.spawns.p1 ? '1' : '2'} you can't reach: ` + miss.map((m) => `(col ${m.c + 1}, row ${H - m.y})`).join(' '));
  }
  return { L, nav, out };
}

// ---------------------------------------------------------------- 3: play-through

function play(def, index, o) {
  const nav = o.nav || BT.buildNav(BT.parseLevel(def));
  const sim = new BT.Sim(def, { index, nav, mode: o.mode, hero: 'teddy', easy: o.easy, seed: o.seed, ghostPlayers: true });
  const bots = {};
  if (!o.idle) for (const p of sim.players) bots[p.id] = new BT.Bot(sim, p);
  const limit = o.limit || 300;
  let bad = null, popped = 0, escapes = 0, combos = 0, specials = 0, bounces = 0;
  for (let t = 0; t < limit; t += DT) {
    const inputs = {};
    for (const id in bots) inputs[id] = bots[id].input(DT);
    sim.step(DT, inputs);
    for (const ev of sim.events) {
      if (ev.type === 'pop' && ev.trapped) popped++;
      if (ev.type === 'escape') escapes++;
      if (ev.type === 'combo') combos++;
      if (ev.type === 'special') specials++;
      if (ev.type === 'bounce') bounces++;
    }
    sim.events.length = 0;
    if (o.trace && Math.abs((t / 2) % 1) < DT / 2) {
      const p = sim.players[0], b = bots[p.id];
      const nd = sim.nav.nodeFor(p.x, p.y);
      console.log(`  t=${t.toFixed(0).padStart(3)} ${p.id} ${p.x.toFixed(1)},${p.y.toFixed(1)} ${p.state} node ${nd ? nd.c + ',' + nd.y : '-'}` +
        ` goal ${b && b.goal ? b.goal.act + (b.goal.face || '') : '-'} path ${b && b.path ? b.path.length : '-'} edge ${b && b.edge ? (b.edge.walk ? 'walk' : 'prog') : '-'}` +
        ` | ${sim.enemies.map((e) => `${e.kind[0]}${e.state === 'trapped' ? '*' : ''}@${e.x.toFixed(1)},${e.y.toFixed(1)}`).join(' ')}`);
    }
    for (const a of [...sim.players, ...sim.enemies, ...sim.treats, ...sim.bubbles]) {
      if (!isFinite(a.x) || !isFinite(a.y)) bad = 'NaN position';
      else if (a.x < 0.9 || a.x > W - 0.9) bad = `something left the screen at x=${a.x.toFixed(2)}`;
    }
    if (bad) return { ok: false, t, msg: bad };
    if (sim.state === 'clear' || sim.state === 'celebrate' || sim.state === 'done') {
      return { ok: true, t, msg: 'clear', popped, escapes, combos, specials, bounces, score: sim.players.reduce((s, p) => s + p.score, 0) };
    }
  }
  const left = sim.enemies.map((e) => `${e.kind}@${e.x.toFixed(1)},${e.y.toFixed(1)}(${e.state})`).join(' ');
  return { ok: false, t: limit, msg: `not cleared; left: ${left}${sim.boss ? ` boss hp ${sim.boss.hp}` : ''}`, popped, escapes };
}

// ---------------------------------------------------------------- 4: broken maps must be caught

function sabotage() {
  const base = BT.LEVELS[0];
  const edit = (fn) => {
    const m = base.map.slice();
    fn(m);
    return { name: 'broken', tip: '', map: m };
  };
  const put = (m, r, c, ch) => { m[r] = m[r].slice(0, c) + ch + m[r].slice(c + 1); };
  const cases = [
    ['enemy inside a block', edit((m) => put(m, 7, 10, 'z'))],
    ['enemy in mid-air', edit((m) => put(m, 4, 10, 'z'))],
    ['a ledge too high to reach', edit((m) => { put(m, 3, 1, '#'); put(m, 3, 2, '#'); m[7] = '#' + ' '.repeat(24) + '#'; })],
    ['blocks with no head room', edit((m) => put(m, 13, 8, '#'))],
    ['a short row', edit((m) => { m[5] = m[5].slice(1); })],
    ['a missing side wall', edit((m) => put(m, 9, 0, ' '))],
  ];
  let ok = true;
  for (const [what, def] of cases) {
    const caught = mapProblems(def).out.length > 0;
    if (!caught) ok = false;
    console.log(`  sabotage: ${what.padEnd(28)} ${caught ? 'caught' : 'NOT CAUGHT'}`);
  }
  return ok;
}

// ---------------------------------------------------------------- run

let failures = 0;
const t0 = Date.now();
console.log(`Bubble TT level check: ${BT.LEVELS.length} levels`);
BT.LEVELS.forEach((def, i) => {
  if (only && +only !== i + 1) return;
  const { nav, out } = mapProblems(def);
  const name = `L${String(i + 1).padStart(2)} ${def.name.padEnd(20)}`;
  if (out.length) {
    failures++;
    console.log(`${name} MAP  ${out.join('; ')}`);
    return;
  }
  const runs = [];
  for (const seed of quick ? [1] : [1, 2, 3]) runs.push(play(def, i, { nav, seed, mode: '1p', trace: trace && seed === 1 }));
  runs.push(play(def, i, { nav, seed: 9, mode: '2p' }));
  runs.push(play(def, i, { nav, seed: 5, mode: '1p', easy: true }));
  const idle = play(def, i, { nav, seed: 1, mode: '1p', idle: true, limit: 90 });
  const bad = runs.filter((r) => !r.ok);
  if (bad.length || idle.ok) failures++;
  const times = runs.map((r) => (r.ok ? r.t.toFixed(0) + 's' : 'FAIL')).join(' ');
  console.log(`${name} ${bad.length || idle.ok ? 'FAIL' : 'OK  '} nodes ${String(nav.nodes.length).padStart(3)}  clear ${times}  (1p x${quick ? 1 : 3}, 2p, easy)` +
    `  combos ${runs.reduce((s, r) => s + (r.combos || 0), 0)}  escapes ${runs.reduce((s, r) => s + (r.escapes || 0), 0)}` +
    (idle.ok ? '  IDLE RUN CLEARED (check is broken)' : ''));
  for (const r of bad) console.log(`     ${r.msg}`);
  if (only) for (const r of runs) console.log('    ', JSON.stringify(r));
});
if (!only) {
  console.log('Broken maps:');
  if (!sabotage()) failures++;
}
console.log(failures ? `${failures} problem(s)` : `All good (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(failures ? 1 : 0);
