// 2D icon rendering: isometric block icons, food items, HUD hearts and the title logo.
'use strict';

const Icons = {
  atlas: null,
  cache: {},

  init(atlasCanvas) { this.atlas = atlasCanvas; },

  tileSrc(tile) {
    return [(tile % ATLAS_TILES) * TILE, ((tile / ATLAS_TILES) | 0) * TILE];
  },

  // Isometric cube with top / left / right faces, shaded like the in-game inventory
  block(id) {
    if (this.cache[id]) return this.cache[id];
    const S = 64;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (!isBlock(id)) {
      this.drawItem(ctx, id, S);
    } else {
      const def = BLOCKS[id];
      const pad = 3, s = S - pad * 2;
      const face = (tile, ox, oy, ux, uy, vx, vy, shade) => {
        const [sx, sy] = this.tileSrc(tile);
        ctx.save();
        ctx.setTransform(ux / TILE, uy / TILE, vx / TILE, vy / TILE, ox, oy);
        ctx.drawImage(this.atlas, sx, sy, TILE, TILE, 0, 0, TILE + 0.06, TILE + 0.06);
        if (shade) { ctx.fillStyle = `rgba(0,0,0,${shade})`; ctx.fillRect(0, 0, TILE, TILE); }
        ctx.restore();
      };
      const q = s / 4;
      // left face (+z side shown), right face (+x side), top face
      face(def.tex[4], pad, pad + q, s / 2, q, 0, s / 2, 0.38);
      face(def.tex[0], pad + s / 2, pad + q * 2, s / 2, -q, 0, s / 2, 0.22);
      face(def.tex[2], pad, pad + q, s / 2, -q, s / 2, q, 0);
    }
    const url = c.toDataURL();
    this.cache[id] = url;
    return url;
  },

  drawItem(ctx, id, S) {
    const px = S / 16;
    const paint = (rows, pal) => {
      rows.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch === '.') return;
        ctx.fillStyle = pal[ch];
        ctx.fillRect(x * px, y * px, px, px);
      }));
    };
    if (id === ITEM.APPLE) {
      paint([
        '................',
        '........#.......',
        '.......#g.......',
        '......#gg#......',
        '...####g####....',
        '..#rrrrrrrrr#...',
        '.#rrwwrrrrrrr#..',
        '.#rwwrrrrrrrr#..',
        '.#rwrrrrrrrrr#..',
        '.#rrrrrrrrrrd#..',
        '.#rrrrrrrrrdd#..',
        '..#rrrrrrrddd#..',
        '..#rrrrrrddd#...',
        '...#rrdddd##....',
        '....###d##......',
        '................',
      ], { '#': '#2a0000', r: '#d8202a', w: '#ff9a9a', d: '#9a1018', g: '#4a8a2a' });
    } else if (id === ITEM.BREAD) {
      paint([
        '................',
        '................',
        '................',
        '.....######.....',
        '...##yyyyyy##...',
        '..#yyoyyyoyyy#..',
        '.#yyyyyyyyyyyy#.',
        '.#oooooooooooo#.',
        '.#bbbbbbbbbbbb#.',
        '.#bbbbbbbbbbbb#.',
        '..#bbbbbbbbbb#..',
        '...##########...',
        '................',
      ], { '#': '#3a1a00', y: '#f0c060', o: '#c87a1a', b: '#a8551a' });
    }
  },

  pixel(rows, pal) {
    const key = rows.join('|') + JSON.stringify(pal);
    if (this.cache[key]) return this.cache[key];
    const c = document.createElement('canvas');
    c.width = rows[0].length; c.height = rows.length;
    const ctx = c.getContext('2d');
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(x, y, 1, 1);
    }));
    return (this.cache[key] = c.toDataURL());
  },

  heart(kind) { // 'full' | 'half' | 'empty'
    const rows = [
      '.##...##.',
      '#ff#.#ff#',
      '#fwffffr#',
      '#ffffffr#',
      '.#ffffr#.',
      '..#ffr#..',
      '...#r#...',
      '....#....',
    ];
    const full = { '#': '#000', f: '#ff1313', w: '#ffc8c8', r: '#b80000' };
    const empty = { '#': '#000', f: '#3a1414', w: '#3a1414', r: '#3a1414' };
    if (kind === 'full') return this.pixel(rows, full);
    if (kind === 'empty') return this.pixel(rows, empty);
    const half = rows.map(r => [...r].map((ch, x) => (x >= 5 && ch !== '#' && ch !== '.' ? 'e' : ch)).join(''));
    return this.pixel(half, { ...full, e: '#3a1414' });
  },

  food(kind) {
    const rows = [
      '.....###.',
      '....#bbb#',
      '...#bbbbb',
      '..#bbbbb#',
      '..#bbbb#.',
      '.#w###.',
      '#ww#....',
      '#w#.....',
      '.#......',
    ].map(r => r.padEnd(9, '.'));
    const full = { '#': '#000', b: '#b5672b', w: '#e8e0d0' };
    const empty = { '#': '#000', b: '#3b2414', w: '#3b3430' };
    if (kind === 'full') return this.pixel(rows, full);
    if (kind === 'empty') return this.pixel(rows, empty);
    const half = rows.map(r => [...r].map((ch, x) => (x < 4 && ch !== '#' && ch !== '.' ? 'e' : ch)).join(''));
    return this.pixel(half, { ...full, e: '#3b2414' });
  },
};

// ---------- Title logo: letters built from stone blocks ----------
const GLYPHS = {
  B: ['1111.', '1...1', '1...1', '1111.', '1...1', '1...1', '1111.'],
  L: ['1....', '1....', '1....', '1....', '1....', '1....', '11111'],
  O: ['.111.', '1...1', '1...1', '1...1', '1...1', '1...1', '.111.'],
  C: ['.1111', '1....', '1....', '1....', '1....', '1....', '.1111'],
  K: ['1...1', '1..1.', '1.1..', '11...', '1.1..', '1..1.', '1...1'],
  R: ['1111.', '1...1', '1...1', '1111.', '1.1..', '1..1.', '1...1'],
  A: ['.111.', '1...1', '1...1', '11111', '1...1', '1...1', '1...1'],
  F: ['11111', '1....', '1....', '1111.', '1....', '1....', '1....'],
  T: ['11111', '..1..', '..1..', '..1..', '..1..', '..1..', '..1..'],
};

function drawLogo(canvas, atlasCanvas, text = 'BLOCKCRAFT') {
  const cell = 12, depth = 6, gap = 1;
  const cols = text.length * 5 + (text.length - 1) * gap;
  const W = cols * cell + depth + 8, H = 7 * cell + depth + 8;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const cells = [];
  [...text].forEach((ch, i) => {
    const g = GLYPHS[ch];
    if (!g) return;
    g.forEach((row, y) => [...row].forEach((v, x) => {
      if (v === '1') cells.push([(i * (5 + gap) + x) * cell + 4, y * cell + 4]);
    }));
  });
  // Extruded sides first (dark), then outlines, then textured fronts
  for (let d = depth; d > 0; d--) {
    ctx.fillStyle = d === depth ? '#1a1a1a' : (d % 2 ? '#3a3a3a' : '#444');
    for (const [x, y] of cells) ctx.fillRect(x + d, y + d, cell, cell);
  }
  ctx.fillStyle = '#111';
  for (const [x, y] of cells) ctx.fillRect(x - 1, y - 1, cell + 2, cell + 2);
  // Continuous stone texture across each letter, with a soft bevel
  const pc = document.createElement('canvas');
  pc.width = pc.height = TILE * 3;
  const pctx = pc.getContext('2d');
  pctx.imageSmoothingEnabled = false;
  pctx.drawImage(atlasCanvas, (TEX.stone % ATLAS_TILES) * TILE, ((TEX.stone / ATLAS_TILES) | 0) * TILE, TILE, TILE, 0, 0, pc.width, pc.height);
  ctx.fillStyle = ctx.createPattern(pc, 'repeat');
  for (const [x, y] of cells) ctx.fillRect(x, y, cell, cell);
  const filled = new Set(cells.map(([x, y]) => x + ',' + y));
  for (const [x, y] of cells) {
    if (!filled.has(x + ',' + (y - cell))) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, y, cell, 2); }
    if (!filled.has((x - cell) + ',' + y)) { ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x, y, 2, cell); }
    if (!filled.has(x + ',' + (y + cell))) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x, y + cell - 2, cell, 2); }
    if (!filled.has((x + cell) + ',' + y)) { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x + cell - 2, y, 2, cell); }
  }
}

const SPLASHES = [
  'Also try blocks!', 'Now on phones!', '100% cubes!', 'Punch the tree!', 'Pixel perfect!',
  'Touch to build!', 'Infinite worlds!', 'Watch your step!', 'Mine all day!', 'Squares everywhere!',
  'Made with WebGL!', 'Diamonds deep down!', 'Look up at the clouds!', 'Works offline!', 'Craft away!',
];
