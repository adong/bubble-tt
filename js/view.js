/* Bubble TT: the Three.js scene. Builds each level from its map, keeps a 3-D model for every kid, enemy, bubble and
   treat in the simulation, and plays the effects (pops, stars, water, lightning, confetti, floating scores).
   Exposes BT.View. The rules live in js/sim.js; this file only draws them. */
(function () {
  'use strict';
  const T = THREE, G = Kit.gfx, BT = window.BT;
  const { W, H } = BT;
  const KID_SCALE = { teddy: 0.8, tommy: 0.76 };
  const TURN = Math.PI / 2 + 0.42; // side-on, turned a little toward the camera so faces show
  const ROBOT_TOPS = ['#ff8a1f', '#2ec4b6', '#a066e8', '#ff4f6d'];
  const BLOB_COLS = ['#ff6fb5', '#8f6bff', '#4fd36a', '#ffb02e'];
  const TINT = { teddy: BT.art.TEDDY, tommy: BT.art.TOMMY };
  const SPECIAL = { water: ['#3a9cff', '💧'], bolt: ['#ffc21f', '⚡'], treat: ['#ffffff', null], letter: ['#ff7ab8', null] };

  const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  function View(canvas) {
    const r = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.outputEncoding = T.sRGBEncoding;
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.shadowMap.enabled = true;
    r.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer = r;
    this.canvas = canvas;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(24, 1, 1, 500);
    this.hemi = new T.HemisphereLight('#ffffff', '#8a7a9a', 0.9);
    this.scene.add(this.hemi);
    const sun = new T.DirectionalLight('#fff4e2', 1.15);
    sun.position.set(W / 2 - 7, H + 12, 24);
    sun.target.position.set(W / 2, H / 2, -1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 17, bottom: -17, near: 1, far: 80 });
    sun.shadow.bias = -0.0008;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.level = null;
    this.actors = new Map();
    this.fx = [];
    this.water = [];
    this.margins = { top: 64, bottom: 8, side: 8 };
    this.size = [0, 0];
    this.shake = 0;
    this.t = 0;
    this.tmp = new T.Vector3();
  }

  // ---------------------------------------------------------------- the level

  View.prototype.setLevel = function (sim) {
    if (this.level) { this.scene.remove(this.level); disposeTree(this.level); }
    for (const v of this.actors.values()) this.drop(v);
    this.actors.clear();
    for (const f of this.fx) this.scene.remove(f.obj);
    this.fx = [];
    const theme = BT.THEMES[Math.min(BT.THEMES.length - 1, Math.floor(sim.index / 6))];
    this.theme = theme;
    const dark = theme.id === 'space' || theme.id === 'castle';
    this.hemi.color.set(dark ? '#dfe3ff' : '#ffffff');
    this.hemi.intensity = dark ? 1.05 : 0.9;
    const g = new T.Group();
    const L = sim.L;
    // the painted wall behind
    const sky = BT.art.backdrop(theme);
    const back = new T.Mesh(new T.PlaneGeometry(84, 56), new T.MeshLambertMaterial({ map: sky, emissive: '#ffffff', emissiveMap: sky, emissiveIntensity: dark ? 0.55 : 0.3 }));
    back.position.set(W / 2, H / 2, -1.2);
    back.receiveShadow = true;
    g.add(back);
    // blocks: one instanced mesh, tinted per block
    const cells = [], caps = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (L.grid[y][x]) cells.push([x, y]);
    const blockMat = new T.MeshStandardMaterial({ map: BT.art.blockTexture(theme.id), roughness: 0.7 });
    const blocks = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1.4), blockMat, cells.length);
    const m = new T.Matrix4(), col = new T.Color();
    cells.forEach(([x, y], i) => {
      m.makeTranslation(x + 0.5, y + 0.5, 0);
      blocks.setMatrixAt(i, m);
      const border = x === 0 || x === W - 1 || y === 0 || y === H - 1;
      if (theme.blocks && !border) col.set(theme.blocks[(x * 7 + y * 3) % theme.blocks.length]);
      else col.set(border ? theme.wall : theme.block);
      blocks.setColorAt(i, col);
      if (y < H - 1 && !L.grid[y + 1][x]) caps.push([x, y, border]);
    });
    blocks.castShadow = blocks.receiveShadow = true;
    g.add(blocks);
    // the top layer of every platform: grass, frosting, glow strip...
    const capMat = new T.MeshStandardMaterial({ map: BT.art.capTexture(theme.id), roughness: 0.6,
      emissive: theme.id === 'space' ? theme.cap : '#000000', emissiveIntensity: theme.id === 'space' ? 0.35 : 0 });
    const capMesh = new T.InstancedMesh(new T.BoxGeometry(1.02, 0.26, 1.48), capMat, Math.max(1, caps.length));
    caps.forEach(([x, y, border], i) => {
      m.makeTranslation(x + 0.5, y + 0.9, 0);
      capMesh.setMatrixAt(i, m);
      if (theme.blocks && !border) col.set(theme.blocks[(x * 7 + y * 3) % theme.blocks.length]).lerp(new T.Color('#ffffff'), 0.35);
      else col.set(theme.cap);
      capMesh.setColorAt(i, col);
    });
    capMesh.count = caps.length;
    capMesh.castShadow = capMesh.receiveShadow = true;
    g.add(capMesh);
    // background decoration from the '+' cells
    if (L.deco.length) {
      const decoMat = new T.MeshStandardMaterial({ color: theme.deco, transparent: true, opacity: 0.55, roughness: 0.5 });
      const deco = new T.InstancedMesh(new T.BoxGeometry(0.94, 0.94, 0.25), decoMat, L.deco.length);
      L.deco.forEach(([x, y], i) => { m.makeTranslation(x + 0.5, y + 0.5, -0.85); deco.setMatrixAt(i, m); });
      g.add(deco);
    }
    this.level = g;
    this.scene.add(g);
    this.fit(true);
  };

  function disposeTree(o) {
    o.traverse((n) => {
      if (n.geometry && !n.isSprite) n.geometry.dispose(); // sprites share one geometry
      if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach((mt) => mt.dispose());
    });
  }

  // Frame the whole level between the HUD at the top and the touch buttons at the bottom.
  View.prototype.fit = function (force) {
    const c = this.canvas, w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
    if (!force && w === this.size[0] && h === this.size[1] && this.marginKey === JSON.stringify(this.margins)) return;
    this.size = [w, h];
    this.marginKey = JSON.stringify(this.margins);
    this.renderer.setSize(w, h, false);
    const mg = this.margins;
    const availH = Math.max(100, h - mg.top - mg.bottom), availW = Math.max(100, w - 2 * mg.side);
    const ppu = Math.min(availH / (H + 0.3), availW / (W + 0.3));
    const vh = h / ppu;
    const d = vh / 2 / Math.tan(T.MathUtils.degToRad(this.camera.fov / 2));
    const bandCy = mg.top + availH / 2;
    this.camY = H / 2 + (bandCy - h / 2) / ppu;
    this.camera.aspect = w / h;
    this.camera.position.set(W / 2, this.camY, d);
    this.camera.lookAt(W / 2, this.camY, 0);
    this.camera.updateProjectionMatrix();
    this.ppu = ppu;
    this.dist = d;
  };

  // ---------------------------------------------------------------- models

  function sprite(map, w, h, o) {
    const s = new T.Sprite(new T.SpriteMaterial(Object.assign({ map, transparent: true, depthWrite: false }, o)));
    s.scale.set(w, h || w, 1);
    return s;
  }

  View.prototype.makeKid = function (p) {
    const entry = Kit.roster.get(p.id);
    const person = Kit.people.build(entry.look);
    person.root.scale.setScalar(KID_SCALE[p.id] || 0.8);
    const root = new T.Group(), tilt = new T.Group(), turn = new T.Group();
    root.add(tilt);
    tilt.add(turn);
    turn.add(person.root);
    const stars = new T.Group();
    for (let i = 0; i < 3; i++) stars.add(sprite(G.emojiTexture('⭐'), 0.45));
    stars.visible = false;
    root.add(stars);
    const v = { kind: 'kid', root, tilt, turn, p: person, stars, ph: Math.random() * 6, yaw: p.face > 0 ? -TURN : TURN, ballT: 0 };
    if (p.buddy) {
      v.tag = G.nameTag(entry.name, entry.tag);
      v.tag.scale.multiplyScalar(0.85);
      root.add(v.tag);
      v.ride = sprite(BT.art.bubbleTexture(TINT[p.id]), 2.7);
      v.ride.position.y = 0.95;
      root.add(v.ride);
    }
    this.scene.add(root);
    return v;
  };

  View.prototype.makeEnemy = function (e) {
    const root = new T.Group(), wig = new T.Group(), turn = new T.Group();
    root.add(wig);
    wig.add(turn);
    const v = { kind: 'enemy', ekind: e.kind, root, wig, turn, ph: Math.random() * 6, yaw: e.dir > 0 ? -TURN : TURN, sq: 0, lastVy: 0 };
    if (e.kind === 'zombie' || e.kind === 'robot') {
      const base = Kit.roster.get(e.kind === 'zombie' ? 'zombie' : 'bolt').look;
      const look = e.kind === 'robot' ? Object.assign({}, base, { top: ROBOT_TOPS[e.id % ROBOT_TOPS.length] }) : base;
      const p = Kit.people.build(look);
      p.root.scale.setScalar(e.kind === 'zombie' ? 0.73 : 0.66);
      turn.add(p.root);
      const hb = p.head.children[0];
      hb.material = hb.material.clone();
      v.p = p;
      v.headMat = hb.material;
      v.headY = e.kind === 'zombie' ? 1.62 : 1.6;
    } else if (e.kind === 'blob') {
      const c = BLOB_COLS[e.id % BLOB_COLS.length];
      const mat = G.std(c, { roughness: 0.25, emissive: c, emissiveIntensity: 0.12 });
      const body = G.mesh(new T.SphereGeometry(0.5, 22, 16), mat, 0, 0.46, 0, turn);
      body.scale.set(1, 0.9, 0.92);
      const white = G.std('#ffffff', { roughness: 0.3 }), black = G.std('#1b1a22', { roughness: 0.3 });
      for (const s of [-1, 1]) {
        G.mesh(new T.SphereGeometry(0.14, 12, 10), white, s * 0.17, 0.6, -0.36, turn, false);
        G.mesh(new T.SphereGeometry(0.07, 10, 8), black, s * 0.17, 0.6, -0.48, turn, false);
      }
      G.mesh(new T.BoxGeometry(0.2, 0.05, 0.05), G.std('#5a1830'), 0, 0.37, -0.45, turn, false);
      G.mesh(new T.SphereGeometry(0.08, 8, 6), G.std('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.6 }), -0.18, 0.82, -0.25, turn, false);
      v.body = body;
      v.headMat = mat;
      v.baseCol = new T.Color(c);
      v.headY = 1.1;
    } else {
      // a little flying robot: a robot head with a propeller
      const metal = G.std('#e6eaef', { metalness: 0.5, roughness: 0.35 });
      G.mesh(new T.BoxGeometry(0.72, 0.52, 0.56), metal, 0, 0.42, 0, turn);
      G.mesh(new T.BoxGeometry(0.6, 0.22, 0.04), G.std('#1b1a22'), 0, 0.46, -0.29, turn, false);
      const eye = new T.MeshBasicMaterial({ color: '#5ef2ff' });
      G.mesh(new T.BoxGeometry(0.12, 0.08, 0.02), eye, -0.14, 0.46, -0.31, turn, false);
      G.mesh(new T.BoxGeometry(0.12, 0.08, 0.02), eye, 0.14, 0.46, -0.31, turn, false);
      G.mesh(new T.BoxGeometry(0.05, 0.22, 0.05), G.std('#2a2a30'), 0, 0.78, 0, turn);
      const prop = new T.Group();
      prop.position.y = 0.9;
      G.mesh(new T.BoxGeometry(0.9, 0.04, 0.12), G.std('#ff8a1f'), 0, 0, 0, prop);
      G.mesh(new T.BoxGeometry(0.12, 0.04, 0.9), G.std('#ff8a1f'), 0, 0, 0, prop);
      turn.add(prop);
      const jet = sprite(G.glowTexture(), 0.6, 0.6, { color: '#7ef6ff', blending: T.AdditiveBlending });
      jet.position.y = 0.08;
      turn.add(jet);
      v.prop = prop;
      v.eye = eye;
      v.headMat = metal;
      v.headY = 1.2;
    }
    v.angry = sprite(G.emojiTexture('💢'), 0.55);
    v.angry.visible = false;
    root.add(v.angry);
    this.scene.add(root);
    v.root.scale.setScalar(0.01);
    v.grow = 0;
    return v;
  };

  View.prototype.makeBoss = function () {
    const root = new T.Group(), body = new T.Group();
    root.add(body);
    const p = Kit.people.build(Kit.roster.get('zombie').look);
    p.root.scale.setScalar(1.85);
    p.root.rotation.y = Math.PI;
    body.add(p.root);
    const crown = sprite(G.emojiTexture('👑'), 1.7);
    crown.position.set(0, 4.55, 0.6);
    body.add(crown);
    const shieldMat = new T.MeshStandardMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.1,
      emissive: '#3fb8ff', emissiveIntensity: 0.35, depthWrite: false });
    const shield = new T.Mesh(new T.SphereGeometry(1, 32, 24), shieldMat);
    root.add(shield);
    const rim = sprite(BT.art.bubbleTexture('#7fe8ff'), 2);
    root.add(rim);
    this.scene.add(root);
    return { kind: 'boss', root, body, p, shield, shieldMat, rim, ph: 0, flash: 0 };
  };

  View.prototype.bubbleMap = function (b) {
    if (b.kind === 'plain') return BT.art.bubbleTexture(TINT[b.owner] || TINT.teddy);
    if (b.kind === 'letter') return BT.art.bubbleTexture(SPECIAL.letter[0], b.letter);
    if (b.kind === 'treat') return BT.art.bubbleTexture('#ffffff', b.treat);
    return BT.art.bubbleTexture(SPECIAL[b.kind][0], SPECIAL[b.kind][1]);
  };

  View.prototype.get = function (o, make) {
    let v = this.actors.get(o);
    if (!v) { v = make(); this.actors.set(o, v); }
    v.seen = true;
    return v;
  };

  View.prototype.drop = function (v) {
    this.scene.remove(v.root);
    disposeTree(v.root);
  };

  // ---------------------------------------------------------------- per frame

  View.prototype.update = function (sim, dt) {
    this.t += dt;
    this.sim = sim;
    for (const v of this.actors.values()) v.seen = false;
    for (const p of sim.players) this.syncKid(this.get(p, () => this.makeKid(p)), p, sim, dt);
    for (const e of sim.enemies) this.syncEnemy(this.get(e, () => this.makeEnemy(e)), e, sim, dt);
    for (const b of sim.bubbles) this.syncBubble(this.get(b, () => ({ kind: 'bubble', root: this.addSprite(this.bubbleMap(b), 1.6), sq: 0 })), b, sim, dt);
    for (const t of sim.treats) this.syncTreat(this.get(t, () => ({ kind: 'treat', root: this.addSprite(G.emojiTexture(t.emoji), 0.95) })), t, dt);
    if (sim.ghost) this.syncGhost(this.get(sim.ghost, () => ({ kind: 'ghost', root: this.addSprite(BT.art.bubbleTexture('#f1ecff', '👻'), 1.9) })), sim.ghost, dt);
    if (sim.boss && sim.boss.state !== 'gone') this.syncBoss(this.get(sim.boss, () => this.makeBoss()), sim.boss, dt);
    for (const z of sim.bolts) this.syncBolt(this.get(z, () => this.makeBolt()), z, dt);
    for (const [o, v] of this.actors) if (!v.seen) { this.drop(v); this.actors.delete(o); }
    this.syncWater(sim);
    this.stepFx(dt);
    this.fit();
    const sh = this.shake > 0 ? (this.shake -= dt) * 0.4 : 0;
    const pk = this.peekAt; // close-up for screenshots (game.peek)
    this.camera.position.set(
      (pk ? pk.x : W / 2) + (sh ? (Math.random() - 0.5) * sh : 0),
      (pk ? pk.y : this.camY) + (sh ? (Math.random() - 0.5) * sh : 0),
      pk ? this.dist / pk.zoom : this.dist);
  };

  View.prototype.addSprite = function (map, size) {
    const s = sprite(map, size);
    this.scene.add(s);
    return s;
  };

  View.prototype.syncKid = function (v, p, sim, dt) {
    const k = 1 - Math.exp(-18 * dt);
    const st = p.state;
    let mode = 'stand', faceCam = false, moving = false, lift = 0, lie = 0, wob = 0;
    if (st === 'play') {
      if (p.blowT > 0) mode = 'blow';
      else if (!p.onGround) mode = 'jump';
      else if (Math.abs(p.vx) > 0.1) { mode = 'run'; moving = true; }
    } else if (st === 'dizzy') { mode = 'dizzy'; lie = 1; }
    else if (st === 'wobble') { mode = 'dizzy'; wob = 1; }
    else if (st === 'hi5' || st === 'hello') { mode = Kit.roster.signature(Kit.roster.get(p.id), 'hello'); faceCam = true; }
    else if (st === 'bye') { mode = Kit.roster.signature(Kit.roster.get(p.id), 'goodbye'); faceCam = true; }
    else if (st === 'give') mode = 'give';
    else if (st === 'enter' || st === 'leave') { mode = p.id === 'tommy' ? 'peace' : 'wave'; faceCam = true; }
    else if (st === 'celebrate') { mode = p.celebrate || 'cheer'; faceCam = true; }
    v.ph += dt * (mode === 'run' ? 11 : mode === 'boxing' ? 7.5 : 5);
    if (mode === 'jumpshot') {
      const c = (this.t * 1.1) % 1;
      lift = Math.sin(Math.min(1, c / 0.6) * Math.PI) * 0.7;
      v.ballT -= dt;
      if (c > 0.3 && v.ballT <= 0) {
        v.ballT = 0.85;
        this.emojiFly('🏀', p.x + 0.2, p.y + 2.2, p.x + (p.x < W / 2 ? 3 : -3), H - 2.5, 0.9, 0.7);
      }
    } else if (mode === 'peace' && st === 'celebrate') lift = Math.abs(Math.sin(this.t * 4)) * 0.25;
    BT.pose(v.p, v.ph, mode, k, { moving });
    v.root.position.set(p.x, p.y + lift + (lie ? 0.28 : 0), 0);
    const target = faceCam || lie ? Math.PI : p.face > 0 ? -TURN : TURN;
    v.yaw += wrapAngle(target - v.yaw) * Math.min(1, dt * 14);
    v.turn.rotation.y = v.yaw;
    const tiltTo = lie ? (p.face > 0 ? 1.35 : -1.35) : wob ? Math.sin(this.t * 14) * 0.25 : 0;
    v.tilt.rotation.z += (tiltTo - v.tilt.rotation.z) * Math.min(1, dt * 12);
    v.root.visible = st !== 'out' && !(p.inv > 0 && st === 'play' && Math.floor(p.inv * 12) % 2 === 0);
    // dizzy stars circle over the head
    v.stars.visible = lie || wob;
    if (v.stars.visible) {
      const hx = lie ? (p.face > 0 ? -1.3 : 1.3) : 0, hy = lie ? 0.45 : 1.9;
      v.stars.children.forEach((s, i) => {
        const a = this.t * 5 + (i * Math.PI * 2) / 3;
        s.position.set(hx + Math.cos(a) * 0.5, hy + Math.sin(a) * 0.18, 0.4);
      });
    }
    if (v.ride) v.ride.visible = st === 'enter' || st === 'leave';
    if (v.tag) v.tag.position.y = lie ? 1.0 : 2.15;
  };

  View.prototype.syncEnemy = function (v, e, sim, dt) {
    const k = 1 - Math.exp(-16 * dt);
    v.grow = Math.min(1, v.grow + dt * 4);
    v.ph += dt * (e.angry ? 12 : 7);
    let scale = v.grow;
    if (e.state === 'trapped') {
      const b = e.bubble;
      scale *= 0.64;
      v.root.position.set(b.x, b.y - (e.h * 0.64) / 2, 0.75);
      v.wig.rotation.z = Math.sin(this.t * 11 + e.id) * 0.28;
      v.yaw += wrapAngle(Math.PI - v.yaw) * Math.min(1, dt * 6);
      if (v.p) BT.pose(v.p, v.ph, 'kick', k);
    } else {
      v.wig.rotation.z *= 0.8;
      v.root.position.set(e.x, e.y, 0);
      const dir = e.kind === 'drone' ? (e.vx < 0 ? -1 : 1) : e.vx ? Math.sign(e.vx) : e.dir;
      v.yaw += wrapAngle((dir > 0 ? -TURN : TURN) - v.yaw) * Math.min(1, dt * 10);
      if (v.p) BT.pose(v.p, v.ph, e.onGround ? (e.stun > 0 ? 'stand' : 'walk') : 'jump', k);
    }
    v.turn.rotation.y = v.yaw;
    if (v.body) {
      if (e.vy > 5 && v.lastVy <= 0.5) v.sq = 1;
      v.lastVy = e.vy;
      v.sq = Math.max(0, v.sq - dt * 4);
      const s = Math.sin(v.sq * Math.PI);
      v.body.scale.set(1 + s * 0.25, 0.9 - s * 0.3 + (e.onGround ? 0 : 0.08), 0.92 + s * 0.2);
    }
    if (v.prop) v.prop.rotation.y += dt * 30;
    v.root.scale.setScalar(Math.max(0.01, scale));
    // red-faced when angry
    const glow = e.angry ? 0.55 + Math.sin(this.t * 10) * 0.2 : 0;
    if (v.headMat) {
      if (v.baseCol) v.headMat.color.copy(v.baseCol).lerp(new T.Color('#ff3030'), e.angry ? 0.6 : 0);
      v.headMat.emissive.set(e.angry ? '#ff2020' : v.baseCol ? v.baseCol : '#000000');
      v.headMat.emissiveIntensity = e.angry ? glow : v.baseCol ? 0.12 : 0;
    }
    if (v.eye) v.eye.color.set(e.angry ? '#ff3b3b' : '#5ef2ff');
    v.angry.visible = e.angry && e.state === 'free';
    v.angry.position.set(0.35, v.headY + 0.15 + Math.sin(this.t * 8) * 0.06, 0.3);
  };

  View.prototype.syncBubble = function (v, b, sim, dt) {
    const s = v.root;
    let size = b.r * 2.15;
    v.sq = Math.max(0, v.sq - dt * 5);
    const w = Math.sin(this.t * 5 + b.id) * 0.045;
    if (b.enemy) {
      // flashes red when he's about to get out
      const f = b.trapT / sim.tune.trap;
      const flash = f > 0.62 && Math.floor(this.t * (f > 0.85 ? 12 : 6)) % 2 === 0;
      s.material.map = flash ? BT.art.bubbleTexture('#ff4040') : this.bubbleMap(b);
      size *= 1.08;
    }
    s.position.set(b.x, b.y, 1.05);
    s.scale.set(size * (1 + w + v.sq * 0.25), size * (1 - w - v.sq * 0.3), 1);
    if (b.phase === 'shot') s.scale.multiplyScalar(0.75 + Math.min(1, b.age * 4) * 0.25);
  };

  View.prototype.syncTreat = function (v, t, dt) {
    v.root.position.set(t.x, t.y + 0.42 + (t.onGround ? Math.sin(this.t * 4 + t.id) * 0.05 : 0), 0.95);
    const sx = t.onGround ? 0.95 : 0.95 * Math.cos(t.t * 9);
    v.root.scale.set(sx, 0.95, 1);
  };

  View.prototype.syncGhost = function (v, g) {
    v.root.position.set(g.x, g.y + Math.sin(this.t * 3) * 0.2, 1.1);
    v.root.material.opacity = g.cd > 0 ? 0.45 + Math.sin(this.t * 20) * 0.2 : 0.9;
    v.root.material.rotation = Math.sin(this.t * 2) * 0.15;
  };

  View.prototype.syncBoss = function (v, B, dt) {
    v.ph += dt * 6;
    const trapped = B.state === 'trapped';
    v.root.position.set(B.x, B.y, 0);
    v.shield.scale.setScalar(B.r);
    v.rim.scale.setScalar(B.r * 2.12);
    v.rim.position.z = 0.4;
    const s = trapped ? 0.75 : 1;
    v.body.scale.setScalar(s);
    v.body.position.y = -1.95 * s;
    v.body.rotation.z = trapped ? Math.sin(this.t * 9) * 0.25 : Math.sin(this.t * 2) * 0.08;
    BT.pose(v.p, v.ph, trapped ? 'kick' : 'walk', 0.3);
    v.flash = Math.max(0, v.flash - dt * 4);
    const hp = Math.max(0, B.hp / B.maxHp);
    const c = trapped ? new T.Color(TINT[B.owner] || TINT.teddy) : new T.Color('#ff7fb8').lerp(new T.Color('#7fe8ff'), hp);
    v.shieldMat.color.copy(c);
    v.shieldMat.emissive.copy(c).lerp(new T.Color('#ffffff'), v.flash);
    v.shieldMat.emissiveIntensity = 0.35 + v.flash;
    v.shieldMat.opacity = 0.2 + v.flash * 0.3;
    v.rim.material.map = BT.art.bubbleTexture(trapped ? TINT[B.owner] || TINT.teddy : hp > 0.5 ? '#7fe8ff' : '#ff7fb8');
  };

  View.prototype.makeBolt = function () {
    const root = new T.Group();
    root.add(sprite(G.glowTexture(), 2.6, 2.6, { color: '#ffe46a', blending: T.AdditiveBlending }));
    const z = sprite(G.emojiTexture('⚡'), 1.5);
    root.add(z);
    root.add(Object.assign(sprite(G.emojiTexture('⭐'), 0.8), {}));
    this.scene.add(root);
    return { kind: 'bolt', root, z };
  };

  View.prototype.syncBolt = function (v, z, dt) {
    v.root.position.set(z.x, z.y, 1.1);
    v.z.material.rotation = Math.sin(this.t * 30) * 0.3;
    v.root.children[2].position.set(-z.dir * 0.5, Math.sin(this.t * 20) * 0.3, 0.1);
    if (Math.random() < 0.7) this.particle({ x: z.x - z.dir * 0.4, y: z.y + (Math.random() - 0.5) * 0.8, vx: -z.dir * 2, vy: (Math.random() - 0.5) * 2, life: 0.4, size: 0.45, color: '#fff27a', add: true });
  };

  // Water: a chain of blue blobs along the wave's path.
  View.prototype.syncWater = function (sim) {
    let n = 0;
    for (const w of sim.waters) {
      for (let i = 0; i < w.trail.length; i += 2) {
        let s = this.water[n];
        if (!s) {
          s = sprite(G.dotTexture(), 1, 1, { color: '#3d9dff', opacity: 0.85 });
          this.scene.add(s);
          this.water.push(s);
        }
        const c = w.trail[i];
        const head = i >= w.trail.length - 2;
        s.visible = true;
        s.position.set(c.x, c.y + 0.35, 0.95);
        const sz = (head ? 1.25 : 0.95) + Math.sin(this.t * 12 + i) * 0.08;
        s.scale.set(sz * 1.2, sz, 1);
        s.material.color.set(head ? '#bfe6ff' : '#3d9dff');
        n++;
      }
      if (!w.done && Math.random() < 0.6) this.particle({ x: w.x, y: w.y + 0.6, vx: (Math.random() - 0.5) * 3, vy: 3 + Math.random() * 2, life: 0.5, size: 0.3, color: '#9fd8ff', grav: 12 });
    }
    for (let i = n; i < this.water.length; i++) this.water[i].visible = false;
  };

  // ---------------------------------------------------------------- effects

  View.prototype.particle = function (o) {
    const map = o.map || G.dotTexture();
    const s = sprite(map, o.size || 0.3, o.size || 0.3, { color: o.color || '#ffffff', blending: o.add ? T.AdditiveBlending : T.NormalBlending });
    s.position.set(o.x, o.y, o.z ?? 1.2);
    this.scene.add(s);
    this.fx.push({ obj: s, vx: o.vx || 0, vy: o.vy || 0, life: o.life || 0.6, max: o.life || 0.6, size: o.size || 0.3,
      grow: o.grow || 0, grav: o.grav || 0, spin: o.spin || 0, fade: o.fade ?? true, rise: o.rise, path: o.path });
  };

  View.prototype.stepFx = function (dt) {
    for (const f of this.fx) {
      f.life -= dt;
      const s = f.obj, a = Math.max(0, f.life / f.max);
      if (f.path) {
        const u = 1 - a, P = f.path;
        s.position.x = P.x0 + (P.x1 - P.x0) * u;
        s.position.y = P.y0 + (P.y1 - P.y0) * u + Math.sin(u * Math.PI) * P.arc;
        s.material.rotation += dt * 8;
      } else {
        f.vy -= f.grav * dt;
        s.position.x += f.vx * dt;
        s.position.y += f.vy * dt;
        s.material.rotation += f.spin * dt;
      }
      const sz = f.size * (1 + f.grow * (1 - a));
      s.scale.set(sz * (f.sx || 1), sz * (f.sy || 1), 1);
      if (f.fade) s.material.opacity = Math.min(1, a * 2.2);
      if (f.life <= 0) {
        this.scene.remove(s);
        s.material.dispose();
        if (f.done) f.done();
      }
    }
    this.fx = this.fx.filter((f) => f.life > 0);
  };

  View.prototype.burst = function (x, y, color, n, speed, size) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const sp = speed * (0.6 + Math.random() * 0.6);
      this.particle({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.45 + Math.random() * 0.2, size: size || 0.28, color, grav: 3 });
    }
  };

  // Floating text ("+500", "COMBO x3!") that rises and fades.
  View.prototype.popup = function (text, x, y, color, big) {
    const s = sprite(BT.art.textTexture(text, color || '#ffffff'), 1, 1);
    const w = big ? 5.5 : 3.2;
    s.position.set(x, y, 1.2);
    this.scene.add(s);
    this.fx.push({ obj: s, vx: 0, vy: big ? 0.7 : 1.4, life: big ? 1.6 : 1.0, max: big ? 1.6 : 1.0, size: w, grow: 0.1, grav: 0, spin: 0, fade: true, sx: 1, sy: 0.25 });
  };

  View.prototype.emojiFly = function (emoji, x0, y0, x1, y1, time, arc, done) {
    const s = sprite(G.emojiTexture(emoji), 1);
    s.position.set(x0, y0, 1.1);
    this.scene.add(s);
    this.fx.push({ obj: s, life: time, max: time, size: 0.9, grow: 0.2, fade: false, path: { x0, y0, x1, y1, arc: arc ?? 2 }, done });
  };

  View.prototype.confetti = function (n) {
    const cols = ['#ff4f6d', '#ffd23f', '#3d9bff', '#2fd6a2', '#a066e8', '#ffffff'];
    for (let i = 0; i < n; i++) {
      this.particle({ x: 1 + Math.random() * (W - 2), y: H - 0.5 + Math.random() * 3, vx: (Math.random() - 0.5) * 2, vy: -1 - Math.random() * 2,
        life: 2.5 + Math.random() * 1.5, size: 0.28, color: cols[i % cols.length], spin: (Math.random() - 0.5) * 10, map: squareTexture(), fade: true });
    }
  };

  let squareTex = null;
  function squareTexture() {
    if (squareTex) return squareTex;
    const [c, g] = G.makeCanvas(16, 16);
    g.fillStyle = '#fff';
    g.fillRect(2, 4, 12, 8);
    return (squareTex = G.toTexture(c));
  }

  View.prototype.kidPos = function (id) {
    const p = this.sim && this.sim.players.find((q) => q.id === id);
    return p ? { x: p.x, y: p.y } : { x: W / 2, y: 2 };
  };

  // React to what happened in the simulation this step.
  View.prototype.onEvent = function (ev, sim) {
    const tint = (who) => TINT[who] || '#ffffff';
    switch (ev.type) {
      case 'blow':
        this.burst(ev.x, ev.y, '#ffffff', 4, 2, 0.18);
        break;
      case 'trap':
        this.burst(ev.x, ev.y, tint(ev.who), 8, 3, 0.25);
        break;
      case 'pop':
        this.burst(ev.x, ev.y, ev.trapped ? '#ffffff' : tint(ev.owner), ev.trapped ? 14 : 8, ev.trapped ? 5 : 3.5, ev.trapped ? 0.32 : 0.22);
        this.particle({ x: ev.x, y: ev.y, life: 0.25, size: 1.4, grow: 0.8, map: BT.art.bubbleTexture(tint(ev.owner)), color: '#ffffff' });
        if (ev.trapped) for (let i = 0; i < 4; i++) this.particle({ x: ev.x, y: ev.y, vx: (Math.random() - 0.5) * 5, vy: 2 + Math.random() * 3, life: 0.7, size: 0.4, map: G.emojiTexture('⭐'), grav: 8 });
        break;
      case 'bounce': {
        const v = [...this.actors.entries()].find(([o]) => o.id === ev.id && o.r);
        if (v) v[1].sq = 1;
        this.burst(ev.x, ev.y + 0.6, '#ffffff', 5, 2, 0.16);
        break;
      }
      case 'collect':
        this.popup('+' + ev.pts, ev.x, ev.y + 1, ev.pts >= 1000 ? '#ffd23f' : '#ffffff', ev.pts >= 5000);
        this.burst(ev.x, ev.y + 0.4, '#fff27a', 6, 2.5, 0.18);
        break;
      case 'combo':
        this.burst(ev.x, ev.y, '#ffd23f', 12 + ev.n * 4, 5, 0.3);
        break;
      case 'hurt':
        for (let i = 0; i < 6; i++) this.particle({ x: ev.x, y: ev.y + 1.2, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 3, life: 0.8, size: 0.4, map: G.emojiTexture('⭐'), grav: 7 });
        break;
      case 'saved':
        this.burst(ev.x, ev.y + 0.9, '#7ef6ff', 18, 4, 0.3);
        this.particle({ x: ev.x, y: ev.y + 0.9, life: 0.5, size: 2.2, grow: 0.6, map: BT.art.bubbleTexture(tint(ev.by)) });
        break;
      case 'escape':
        this.burst(ev.x, ev.y + 0.6, '#ff6060', 10, 3.5, 0.24);
        this.popup('GRR!', ev.x, ev.y + 2, '#ff6060');
        break;
      case 'letter':
        this.popup(ev.letter + '!', ev.x, ev.y + 0.8, '#ff7ab8');
        break;
      case 'water':
        this.burst(ev.x, ev.y, '#5fb4ff', 16, 4, 0.3);
        break;
      case 'bolt':
        this.burst(ev.x, ev.y, '#ffe46a', 14, 5, 0.3);
        break;
      case 'washed':
        this.burst(ev.x, ev.y + 0.6, '#ffffff', 10, 3, 0.25);
        break;
      case 'boop':
        this.popup('TICKLE!', ev.x, ev.y + 2.2, '#e6dcff');
        break;
      case 'clear':
        this.confetti(70);
        break;
      case 'celebrate':
        this.confetti(40);
        break;
      case 'gift': {
        const to = this.kidPos(ev.to);
        this.emojiFly(ev.emoji, ev.x, ev.y + 1.4, to.x, to.y + 1.2, 0.8, 2.2, () => this.burst(to.x, to.y + 1.2, '#fff27a', 10, 3, 0.22));
        break;
      }
      case 'buddyIn':
        this.burst(ev.x, ev.y + 1, tint(ev.who), 12, 3, 0.26);
        break;
      case 'highfive': {
        const s = sprite(G.emojiTexture('✋'), 1.6);
        s.position.set(ev.x, ev.y + 3, 1.2);
        this.scene.add(s);
        this.fx.push({ obj: s, vx: 0, vy: 0.6, life: 1.4, max: 1.4, size: 1.6, grow: 0.6, grav: 0, spin: 0, fade: true });
        this.confetti(30);
        break;
      }
      case 'bossHit': {
        const v = sim.boss && this.actors.get(sim.boss);
        if (v) v.flash = 1;
        this.burst(ev.x, ev.y, '#ffffff', 6, 3, 0.2);
        if (ev.dmg > 1) this.popup('ZAP!', ev.x, ev.y + 1, '#ffe46a');
        break;
      }
      case 'bossBump':
        this.shake = 0.35;
        break;
      case 'bossTrap':
        this.burst(ev.x, ev.y, '#ffffff', 30, 7, 0.4);
        this.shake = 0.4;
        break;
      case 'bossPop':
        this.burst(ev.x, ev.y, '#ffd23f', 40, 9, 0.45);
        this.confetti(120);
        this.shake = 0.6;
        break;
      case 'word':
        this.confetti(60);
        break;
    }
  };

  View.prototype.render = function () {
    this.renderer.render(this.scene, this.camera);
  };

  BT.View = View;
})();
