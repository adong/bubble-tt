/* Bubble TT: everything painted on canvases. The five worlds (colours, block faces, backdrops) and the bubble
   pictures. Exposes BT.THEMES and BT.art. */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});
  const G = Kit.gfx;

  // One theme per world (six levels each). `block` tints the platforms, `wall` the border, `cap` the top layer.
  BT.THEMES = [
    { id: 'backyard', name: 'BACKYARD', sky: ['#5fb8f5', '#c9ecff'], block: '#c8874a', wall: '#8b5a34', cap: '#62c94e', deco: '#ffffff', ink: '#5b3a1e', ui: '#62c94e' },
    { id: 'toys', name: 'TOY ROOM', sky: ['#ffd98a', '#fff3d6'], block: '#ffffff', wall: '#7d57d6', cap: '#ffffff', deco: '#ff7aa8', ink: '#5a3d9a', ui: '#ff9f2e',
      blocks: ['#ef5361', '#3f8efc', '#ffc93c', '#47c46e', '#a066e8'] },
    { id: 'candy', name: 'CANDY LAND', sky: ['#ff9fd0', '#ffe7f4'], block: '#8a4f2c', wall: '#c24f8f', cap: '#ff8cc6', deco: '#ffffff', ink: '#7a2a55', ui: '#ff6fb5' },
    { id: 'space', name: 'SPACE', sky: ['#0b1033', '#2b2f78'], block: '#b2bfdc', wall: '#59648e', cap: '#6ef2ff', deco: '#ffd84a', ink: '#c9d6ff', ui: '#6ef2ff' },
    { id: 'castle', name: 'MOON CASTLE', sky: ['#24194f', '#6c55b6'], block: '#c3b2ef', wall: '#7b67b9', cap: '#eee4ff', deco: '#ffe48a', ink: '#ece2ff', ui: '#c49bff' },
  ];

  const cache = {};
  const once = (key, fn) => cache[key] || (cache[key] = fn());

  // The front face of a block: drawn light so the theme colour (an instance colour) tints it.
  function blockTexture(id) {
    return once('block' + id, () => {
      const [c, g] = G.makeCanvas(128, 128);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 128, 128);
      if (id === 'backyard') {
        // packed earth bricks
        g.fillStyle = '#e9e1d6';
        g.fillRect(0, 0, 128, 128);
        g.strokeStyle = 'rgba(80,45,15,0.45)';
        g.lineWidth = 5;
        for (let y = 0; y < 128; y += 42) {
          g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke();
          const off = (y / 42) % 2 ? 0 : 64;
          for (let x = off; x < 128; x += 128) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 42); g.stroke(); }
        }
        g.fillStyle = 'rgba(90,50,20,0.25)';
        for (let i = 0; i < 14; i++) { g.beginPath(); g.arc((i * 47) % 128, (i * 83) % 128, 4, 0, 7); g.fill(); }
      } else if (id === 'toys') {
        // a wooden toy block: bevelled edges and a star
        g.fillStyle = '#f2f2f2';
        g.fillRect(0, 0, 128, 128);
        g.fillStyle = 'rgba(255,255,255,1)';
        g.fillRect(0, 0, 128, 12);
        g.fillRect(0, 0, 12, 128);
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.fillRect(0, 116, 128, 12);
        g.fillRect(116, 0, 12, 128);
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 14 : 32, a = -Math.PI / 2 + (i * Math.PI) / 5;
          g.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r);
        }
        g.fill();
      } else if (id === 'candy') {
        // a chocolate wafer
        g.fillStyle = '#efe4dc';
        g.fillRect(0, 0, 128, 128);
        g.strokeStyle = 'rgba(60,25,10,0.35)';
        g.lineWidth = 4;
        for (let i = 16; i < 128; i += 32) {
          g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke();
          g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
        }
      } else if (id === 'space') {
        // a metal panel with rivets and a light
        g.fillStyle = '#eef2fa';
        g.fillRect(0, 0, 128, 128);
        g.strokeStyle = 'rgba(30,40,80,0.45)';
        g.lineWidth = 6;
        g.strokeRect(4, 4, 120, 120);
        g.fillStyle = 'rgba(30,40,80,0.5)';
        for (const [x, y] of [[16, 16], [112, 16], [16, 112], [112, 112]]) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
        g.fillStyle = '#7ef6ff';
        g.fillRect(40, 58, 48, 12);
      } else {
        // castle stones
        g.fillStyle = '#f1edf9';
        g.fillRect(0, 0, 128, 128);
        g.strokeStyle = 'rgba(50,30,100,0.4)';
        g.lineWidth = 5;
        for (let y = 0; y <= 128; y += 32) {
          g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke();
          const off = (y / 32) % 2 ? 32 : 0;
          for (let x = off; x < 128; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); }
        }
      }
      return G.toTexture(c);
    });
  }

  // The layer on top of a platform: grass, frosting with sprinkles, a glow strip, pale stone.
  function capTexture(id) {
    return once('cap' + id, () => {
      const [c, g] = G.makeCanvas(128, 64);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 128, 64);
      if (id === 'backyard') {
        g.fillStyle = '#dff7d6';
        for (let x = 0; x < 128; x += 8) {
          g.beginPath(); g.moveTo(x, 64); g.lineTo(x + 4, 30 + ((x * 7) % 18)); g.lineTo(x + 8, 64); g.fill();
        }
      } else if (id === 'candy') {
        const cols = ['#ffe14d', '#57d3ff', '#7cf27a', '#ffffff', '#b98bff'];
        for (let i = 0; i < 26; i++) {
          g.fillStyle = cols[i % cols.length];
          g.save();
          g.translate((i * 37) % 128, 10 + ((i * 23) % 40));
          g.rotate(i);
          g.fillRect(-6, -2, 12, 4);
          g.restore();
        }
      } else if (id === 'space') {
        g.fillStyle = 'rgba(0,0,0,0.25)';
        for (let x = 4; x < 128; x += 16) g.fillRect(x, 26, 8, 12);
      } else if (id === 'toys') {
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(0, 54, 128, 10);
      }
      return G.toTexture(c);
    });
  }

  // The big painted wall behind the level.
  function backdrop(theme) {
    return once('sky' + theme.id, () => {
      const [c, g] = G.makeCanvas(1024, 768);
      const gr = g.createLinearGradient(0, 0, 0, 768);
      gr.addColorStop(0, theme.sky[0]);
      gr.addColorStop(1, theme.sky[1]);
      g.fillStyle = gr;
      g.fillRect(0, 0, 1024, 768);
      const R = BT.art.rng(theme.id.length * 977);
      if (theme.id === 'backyard') {
        g.fillStyle = 'rgba(255,255,255,0.85)';
        for (let i = 0; i < 9; i++) cloud(g, R() * 1024, 60 + R() * 300, 40 + R() * 40);
        g.fillStyle = '#7fcf6a';
        g.beginPath(); g.moveTo(0, 768);
        for (let x = 0; x <= 1024; x += 64) g.lineTo(x, 610 + Math.sin(x / 140) * 30);
        g.lineTo(1024, 768); g.fill();
        g.fillStyle = '#d9a46a';
        for (let x = 10; x < 1024; x += 46) { g.fillRect(x, 560, 30, 130); g.beginPath(); g.moveTo(x, 560); g.lineTo(x + 15, 540); g.lineTo(x + 30, 560); g.fill(); }
        g.fillRect(0, 590, 1024, 14);
        g.fillStyle = '#ffd84a';
        g.beginPath(); g.arc(880, 110, 56, 0, 7); g.fill();
      } else if (theme.id === 'toys') {
        g.fillStyle = 'rgba(255,255,255,0.45)';
        for (let x = 0; x < 1024; x += 64) g.fillRect(x, 0, 28, 768);
        g.fillStyle = 'rgba(255,140,90,0.35)';
        for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(R() * 1024, R() * 768, 6 + R() * 10, 0, 7); g.fill(); }
        g.fillStyle = '#c98b52';
        g.fillRect(0, 700, 1024, 68);
        g.font = `90px ${G.EMOJI_FONT}`;
        g.globalAlpha = 0.35;
        ['🧸', '🚂', '🪀', '🎲', '🪁', '🚀'].forEach((e, i) => g.fillText(e, 40 + i * 170, 200 + (i % 2) * 300));
        g.globalAlpha = 1;
      } else if (theme.id === 'candy') {
        for (let i = 0; i < 14; i++) {
          const x = R() * 1024, y = 80 + R() * 600, r = 20 + R() * 40;
          g.fillStyle = 'rgba(255,255,255,0.4)';
          g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
          g.strokeStyle = 'rgba(255,90,170,0.35)';
          g.lineWidth = 6;
          g.beginPath();
          for (let a = 0; a < 12; a += 0.2) g.lineTo(x + Math.cos(a) * a * r / 12, y + Math.sin(a) * a * r / 12);
          g.stroke();
        }
        g.fillStyle = '#ff7fbf';
        g.beginPath(); g.moveTo(0, 768);
        for (let x = 0; x <= 1024; x += 32) g.lineTo(x, 640 + Math.sin(x / 90) * 40);
        g.lineTo(1024, 768); g.fill();
      } else if (theme.id === 'space') {
        for (let i = 0; i < 260; i++) {
          g.fillStyle = `rgba(255,255,255,${0.3 + R() * 0.7})`;
          const s = R() < 0.1 ? 3 : 1.6;
          g.fillRect(R() * 1024, R() * 768, s, s);
        }
        planet(g, 820, 170, 70, '#ff9a5c', true);
        planet(g, 150, 560, 46, '#6ad1ff', false);
        planet(g, 620, 640, 26, '#c48bff', false);
      } else {
        for (let i = 0; i < 160; i++) {
          g.fillStyle = `rgba(255,255,255,${0.2 + R() * 0.6})`;
          g.fillRect(R() * 1024, R() * 500, 2, 2);
        }
        g.fillStyle = '#fff4c2';
        g.beginPath(); g.arc(800, 150, 80, 0, 7); g.fill();
        g.fillStyle = 'rgba(230,210,140,0.6)';
        for (const [x, y, r] of [[770, 130, 14], [830, 180, 10], [810, 110, 8]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
        g.fillStyle = 'rgba(60,40,120,0.75)';
        for (const [x, w, h] of [[60, 120, 330], [220, 90, 250], [700, 110, 300], [880, 130, 380]]) {
          g.fillRect(x, 768 - h, w, h);
          for (let k = 0; k < w; k += 30) g.fillRect(x + k, 768 - h - 22, 18, 22);
          g.fillStyle = 'rgba(255,220,120,0.7)';
          g.fillRect(x + w / 2 - 10, 768 - h + 50, 20, 30);
          g.fillStyle = 'rgba(60,40,120,0.75)';
        }
      }
      return G.toTexture(c);
    });
  }

  function cloud(g, x, y, r) {
    for (const [dx, dy, k] of [[0, 0, 1], [r * 0.9, 6, 0.75], [-r * 0.9, 8, 0.7], [r * 0.4, -r * 0.4, 0.8]]) {
      g.beginPath(); g.arc(x + dx, y + dy, r * k, 0, 7); g.fill();
    }
  }

  function planet(g, x, y, r, col, ring) {
    const gr = g.createRadialGradient(x - r / 3, y - r / 3, r / 6, x, y, r);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.2, col);
    gr.addColorStop(1, G.shade(col, -0.5));
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    if (ring) {
      g.strokeStyle = 'rgba(255,230,180,0.7)';
      g.lineWidth = 8;
      g.beginPath(); g.ellipse(x, y, r * 1.7, r * 0.45, -0.3, 0, 7); g.stroke();
    }
  }

  // A soap bubble: clear in the middle, a coloured rim and two shine spots. Tinted per brother and per kind.
  function bubbleTexture(tint, inner) {
    return once('bub' + tint + (inner || ''), () => {
      const [c, g] = G.makeCanvas(160, 160);
      const h = 80;
      const gr = g.createRadialGradient(h, h, 20, h, h, 76);
      gr.addColorStop(0, hexA(tint, 0.06));
      gr.addColorStop(0.72, hexA(tint, 0.22));
      gr.addColorStop(0.9, hexA(tint, 0.75));
      gr.addColorStop(1, hexA(tint, 0));
      g.fillStyle = gr;
      g.beginPath(); g.arc(h, h, 78, 0, 7); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.lineWidth = 3;
      g.beginPath(); g.arc(h, h, 70, 0, 7); g.stroke();
      if (inner) {
        g.font = /^[A-Z]$/.test(inner) ? `bold 86px ${G.FONT}` : `76px ${G.EMOJI_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        if (/^[A-Z]$/.test(inner)) {
          g.lineWidth = 10;
          g.strokeStyle = '#ffffff';
          g.strokeText(inner, h, h + 6);
          g.fillStyle = '#ff3d7f';
          g.fillText(inner, h, h + 6);
        } else g.fillText(inner, h, h + 6);
      }
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath(); g.ellipse(52, 46, 17, 10, -0.7, 0, 7); g.fill();
      g.beginPath(); g.arc(112, 116, 6, 0, 7); g.fill();
      return G.toTexture(c);
    });
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // Text on a transparent canvas, for floating "+500" and "COMBO" sprites.
  function textTexture(text, color, size = 64) {
    return once('txt' + text + color + size, () => {
      const [c, g] = G.makeCanvas(512, 128);
      g.font = `${size}px ${G.FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 12;
      g.strokeStyle = '#1b1530';
      g.strokeText(text, 256, 68);
      g.fillStyle = color;
      g.fillText(text, 256, 68);
      return G.toTexture(c);
    });
  }

  BT.art = {
    blockTexture, capTexture, backdrop, bubbleTexture, textTexture,
    rng(seed) {
      let a = seed;
      return () => {
        a = (a * 1664525 + 1013904223) >>> 0;
        return a / 4294967296;
      };
    },
    TEDDY: '#3d9bff',
    TOMMY: '#2fd6a2',
  };
})();
