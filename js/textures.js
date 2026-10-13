// Procedurally generated 16x16 pixel-art textures packed into a 256x256 atlas.
// Everything is drawn in code, so the game ships with no external image assets.
'use strict';

const TILE = 16;
const ATLAS_TILES = 16; // tiles per row

const TEX = {
  grass_top: 0, grass_side: 1, dirt: 2, stone: 3, cobblestone: 4, planks: 5,
  log_side: 6, log_top: 7, leaves: 8, sand: 9, water: 10, glass: 11, bricks: 12,
  bedrock: 13, gravel: 14, coal_ore: 15, iron_ore: 16, gold_ore: 17, diamond_ore: 18,
  table_top: 19, table_side: 20, table_front: 21, wool_white: 22, wool_red: 23,
  glowstone: 24, tnt_side: 25, tnt_top: 26, stone_bricks: 27, obsidian: 28,
  snow: 29, grass_side_snow: 30, bookshelf: 31, tnt_bottom: 32, wool_blue: 33,
  wool_yellow: 34, cactus_side: 35, cactus_top: 36, pumpkin_side: 37, pumpkin_top: 38,
  pumpkin_face: 39, mossy_cobble: 40, clay: 41,
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

class TileCanvas {
  constructor(seed) {
    this.d = new Uint8ClampedArray(TILE * TILE * 4);
    this.rand = mulberry32(seed * 9973 + 17);
  }
  set(x, y, r, g, b, a = 255) {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
    const i = (y * TILE + x) * 4;
    this.d[i] = clamp255(r); this.d[i + 1] = clamp255(g); this.d[i + 2] = clamp255(b); this.d[i + 3] = a;
  }
  get(x, y) {
    const i = (y * TILE + x) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  }
  noise(base, amount, alpha = 255) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const n = (this.rand() - 0.5) * amount;
      this.set(x, y, base[0] + n, base[1] + n, base[2] + n, alpha);
    }
  }
  speckle(color, count, size = 1) {
    for (let i = 0; i < count; i++) {
      const x = (this.rand() * TILE) | 0, y = (this.rand() * TILE) | 0;
      for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
        const n = (this.rand() - 0.5) * 20;
        this.set(x + dx, y + dy, color[0] + n, color[1] + n, color[2] + n);
      }
    }
  }
  ore(color, highlight) {
    this.stone();
    const clusters = 4 + ((this.rand() * 2) | 0);
    for (let c = 0; c < clusters; c++) {
      const cx = 2 + ((this.rand() * 11) | 0), cy = 2 + ((this.rand() * 11) | 0);
      const pts = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]];
      for (const [dx, dy] of pts) {
        if (this.rand() < 0.75) {
          const hi = dx + dy < 1 && this.rand() < 0.5;
          const col = hi ? highlight : color;
          this.set(cx + dx, cy + dy, col[0], col[1], col[2]);
        }
      }
    }
  }
  stone() {
    this.noise([125, 125, 125], 28);
    for (let i = 0; i < 9; i++) {
      const x = (this.rand() * TILE) | 0, y = (this.rand() * TILE) | 0, len = 2 + ((this.rand() * 3) | 0);
      for (let k = 0; k < len; k++) this.set(x + k, y, 104, 104, 104);
    }
  }
}

function drawTile(id, t) {
  const R = () => t.rand();
  switch (id) {
    case TEX.grass_top: {
      t.noise([96, 158, 54], 34);
      t.speckle([78, 128, 40], 30);
      t.speckle([118, 184, 70], 18);
      break;
    }
    case TEX.dirt: {
      t.noise([134, 96, 67], 30);
      t.speckle([105, 75, 52], 26);
      t.speckle([160, 120, 88], 10);
      break;
    }
    case TEX.grass_side:
    case TEX.grass_side_snow: {
      drawTile(TEX.dirt, t);
      const snow = id === TEX.grass_side_snow;
      for (let x = 0; x < TILE; x++) {
        const depth = 3 + ((R() * 3) | 0) - (x % 3 === 0 ? 1 : 0);
        for (let y = 0; y < depth; y++) {
          const n = (R() - 0.5) * 30;
          if (snow) t.set(x, y, 240 + n / 3, 248 + n / 3, 250 + n / 3);
          else t.set(x, y, 96 + n, 158 + n, 54 + n);
        }
      }
      break;
    }
    case TEX.stone: t.stone(); break;
    case TEX.cobblestone:
    case TEX.mossy_cobble: {
      // Voronoi-style rounded stones with dark mortar between them
      const pts = [];
      for (let i = 0; i < 9; i++) pts.push([R() * 16, R() * 16, 100 + R() * 50]);
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        let d1 = 1e9, d2 = 1e9, shade = 0;
        for (const p of pts) for (let ox = -16; ox <= 16; ox += 16) for (let oy = -16; oy <= 16; oy += 16) {
          const d = (x - p[0] - ox) ** 2 + (y - p[1] - oy) ** 2;
          if (d < d1) { d2 = d1; d1 = d; shade = p[2]; } else if (d < d2) d2 = d;
        }
        const edge = Math.sqrt(d2) - Math.sqrt(d1) < 1.1;
        const n = (R() - 0.5) * 16;
        if (edge) t.set(x, y, 70 + n, 70 + n, 70 + n);
        else t.set(x, y, shade + n, shade + n, shade + n);
        if (id === TEX.mossy_cobble && !edge && R() < 0.3) t.set(x, y, 80 + n, 120 + n, 60 + n);
      }
      break;
    }
    case TEX.planks: {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const n = (R() - 0.5) * 14 + Math.sin(x * 0.9 + y * 3) * 4;
        let c = [162, 130, 78];
        if (y % 4 === 3) c = [110, 86, 52];
        t.set(x, y, c[0] + n, c[1] + n, c[2] + n);
      }
      for (let row = 0; row < 4; row++) {
        const x = (row % 2 === 0 ? 4 : 11) + ((R() * 2) | 0);
        t.set(x, row * 4 + 1, 110, 86, 52);
      }
      break;
    }
    case TEX.log_side: {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const stripe = (x * 7 + ((y / 5) | 0) * 3) % 5 === 0;
        const n = (R() - 0.5) * 16;
        const c = stripe ? [76, 58, 34] : [104, 82, 50];
        t.set(x, y, c[0] + n, c[1] + n, c[2] + n);
      }
      break;
    }
    case TEX.log_top: {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const dx = x - 7.5, dy = y - 7.5;
        const r = Math.max(Math.abs(dx), Math.abs(dy));
        const n = (R() - 0.5) * 12;
        if (r > 6.5) t.set(x, y, 104 + n, 82 + n, 50 + n);
        else if ((r | 0) % 2 === 0) t.set(x, y, 180 + n, 146 + n, 90 + n);
        else t.set(x, y, 150 + n, 118 + n, 70 + n);
      }
      break;
    }
    case TEX.leaves: {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const v = R();
        const n = (R() - 0.5) * 40;
        if (v < 0.18) t.set(x, y, 0, 0, 0, 0);
        else t.set(x, y, 58 + n, 122 + n, 34 + n);
      }
      break;
    }
    case TEX.sand: {
      t.noise([219, 207, 160], 20);
      t.speckle([196, 182, 134], 22);
      break;
    }
    case TEX.water: {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const w = Math.sin((x + y * 0.5) * 0.8) * 10 + (R() - 0.5) * 10;
        t.set(x, y, 50 + w, 98 + w, 220 + w, 180);
      }
      break;
    }
    case TEX.glass: {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const border = x === 0 || y === 0 || x === 15 || y === 15;
        const streak = (x - y === 3 || x - y === 4 || x - y === -6) && x > 2 && x < 13;
        if (border) t.set(x, y, 220, 236, 240, 255);
        else if (streak) t.set(x, y, 255, 255, 255, 200);
        else t.set(x, y, 0, 0, 0, 0);
      }
      break;
    }
    case TEX.bricks: {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const row = (y / 4) | 0;
        const off = row % 2 ? 4 : 0;
        const mortar = y % 4 === 3 || (x + off) % 8 === 7;
        const n = (R() - 0.5) * 22;
        if (mortar) t.set(x, y, 190 + n / 2, 182 + n / 2, 172 + n / 2);
        else t.set(x, y, 150 + n, 74 + n / 2, 58 + n / 2);
      }
      break;
    }
    case TEX.stone_bricks: {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const row = (y / 8) | 0;
        const off = row % 2 ? 4 : 0;
        const mortar = y % 8 === 7 || (x + off) % 8 === 7;
        const hi = y % 8 === 0 || (x + off) % 8 === 0;
        const n = (R() - 0.5) * 14;
        if (mortar) t.set(x, y, 82 + n, 82 + n, 82 + n);
        else if (hi) t.set(x, y, 140 + n, 140 + n, 140 + n);
        else t.set(x, y, 118 + n, 118 + n, 118 + n);
      }
      break;
    }
    case TEX.bedrock: {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const v = R();
        const c = v < 0.3 ? 40 : v < 0.6 ? 80 : v < 0.85 ? 110 : 150;
        t.set(x, y, c, c, c);
      }
      break;
    }
    case TEX.gravel: {
      t.noise([128, 122, 120], 24);
      for (let i = 0; i < 22; i++) {
        const x = (R() * 15) | 0, y = (R() * 15) | 0;
        const c = R() < 0.5 ? [90, 84, 82] : [168, 160, 158];
        t.set(x, y, ...c); t.set(x + 1, y, ...c); t.set(x, y + 1, ...c);
      }
      break;
    }
    case TEX.coal_ore: t.ore([38, 38, 38], [70, 70, 70]); break;
    case TEX.iron_ore: t.ore([196, 160, 128], [228, 196, 166]); break;
    case TEX.gold_ore: t.ore([240, 206, 50], [255, 244, 140]); break;
    case TEX.diamond_ore: t.ore([70, 214, 206], [180, 255, 250]); break;
    case TEX.table_top: {
      drawTile(TEX.planks, t);
      for (let i = 0; i < TILE; i++) {
        t.set(i, 0, 90, 66, 38); t.set(i, 15, 90, 66, 38); t.set(0, i, 90, 66, 38); t.set(15, i, 90, 66, 38);
      }
      for (let i = 2; i < 14; i++) { t.set(i, 5, 90, 66, 38); t.set(i, 10, 90, 66, 38); t.set(5, i, 90, 66, 38); t.set(10, i, 90, 66, 38); }
      break;
    }
    case TEX.table_side:
    case TEX.table_front: {
      drawTile(TEX.planks, t);
      for (let x = 0; x < TILE; x++) for (let y = 0; y < 3; y++) t.set(x, y, 128 + (R() - 0.5) * 14, 98, 58);
      if (id === TEX.table_side) {
        // saw
        for (let x = 3; x < 13; x++) t.set(x, 7, 180, 180, 186);
        for (let x = 3; x < 13; x += 2) t.set(x, 8, 140, 140, 146);
        for (let y = 6; y < 10; y++) t.set(13, y, 96, 70, 40);
      } else {
        // hammer & tools
        for (let y = 5; y < 13; y++) t.set(5, y, 96, 70, 40);
        for (let x = 3; x < 8; x++) { t.set(x, 5, 150, 150, 156); t.set(x, 6, 120, 120, 126); }
        for (let y = 5; y < 13; y++) t.set(11, y, 96, 70, 40);
        t.set(10, 5, 200, 200, 210); t.set(12, 5, 200, 200, 210); t.set(11, 4, 200, 200, 210);
      }
      break;
    }
    case TEX.wool_white:
    case TEX.wool_red:
    case TEX.wool_blue:
    case TEX.wool_yellow: {
      const base = {
        [TEX.wool_white]: [232, 232, 232], [TEX.wool_red]: [172, 44, 40],
        [TEX.wool_blue]: [52, 64, 168], [TEX.wool_yellow]: [236, 196, 48],
      }[id];
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const n = (R() - 0.5) * 18 + ((x + y * 2) % 4 === 0 ? -10 : 0);
        t.set(x, y, base[0] + n, base[1] + n, base[2] + n);
      }
      break;
    }
    case TEX.glowstone: {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const v = R();
        const n = (R() - 0.5) * 20;
        if (v < 0.25) t.set(x, y, 140 + n, 100 + n, 50 + n);
        else if (v < 0.7) t.set(x, y, 220 + n, 172 + n, 90 + n);
        else t.set(x, y, 255, 236 + n, 170 + n);
      }
      break;
    }
    case TEX.tnt_side: {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const n = (R() - 0.5) * 16;
        if (y >= 5 && y <= 10) t.set(x, y, 230 + n / 2, 230 + n / 2, 230 + n / 2);
        else t.set(x, y, 196 + n, 50 + n / 2, 36 + n / 2);
        if (x % 4 === 3 && (y < 5 || y > 10)) t.set(x, y, 150, 34, 24);
      }
      // "TNT" letters
      const L = [
        [1, 0], [2, 0], [3, 0], [2, 1], [2, 2], [2, 3],
        [5, 0], [5, 1], [5, 2], [5, 3], [6, 1], [7, 2], [8, 0], [8, 1], [8, 2], [8, 3],
        [10, 0], [11, 0], [12, 0], [11, 1], [11, 2], [11, 3],
      ];
      for (const [x, y] of L) t.set(x + 1, y + 6, 30, 30, 30);
      break;
    }
    case TEX.tnt_top:
    case TEX.tnt_bottom: {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const n = (R() - 0.5) * 16;
        t.set(x, y, 196 + n, 50 + n / 2, 36 + n / 2);
      }
      if (id === TEX.tnt_top) {
        for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) t.set(x, y, 60, 50, 40);
        t.set(7, 7, 220, 210, 190); t.set(8, 8, 220, 210, 190);
      }
      break;
    }
    case TEX.obsidian: {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const n = (R() - 0.5) * 14;
        t.set(x, y, 20 + n, 14 + n, 34 + n);
      }
      t.speckle([60, 40, 96], 16);
      break;
    }
    case TEX.snow: t.noise([244, 250, 252], 10); break;
    case TEX.bookshelf: {
      drawTile(TEX.planks, t);
      const colors = [[150, 40, 40], [40, 80, 150], [50, 120, 50], [170, 140, 50], [110, 50, 120]];
      for (const row of [1, 9]) {
        for (let x = 1; x < 15; x++) {
          const c = colors[(x * 3 + row) % colors.length];
          for (let y = row; y < row + 6; y++) t.set(x, y, c[0] + (y === row ? 30 : 0), c[1], c[2]);
          if (x % 3 === 0) x++;
        }
        for (let x = 0; x < TILE; x++) t.set(x, row + 6, 90, 66, 38);
      }
      break;
    }
    case TEX.cactus_side: {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const n = (R() - 0.5) * 18;
        const rib = x % 4 === 1;
        t.set(x, y, (rib ? 40 : 70) + n, (rib ? 110 : 140) + n, (rib ? 30 : 50) + n);
        if (x === 0 || x === 15) t.set(x, y, 0, 0, 0, 0);
      }
      for (let i = 0; i < 8; i++) t.set(((R() * 14) | 0) + 1, (R() * 16) | 0, 30, 30, 20);
      break;
    }
    case TEX.cactus_top: {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const n = (R() - 0.5) * 18;
        const ring = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) > 5.5;
        t.set(x, y, (ring ? 60 : 100) + n, (ring ? 130 : 170) + n, (ring ? 40 : 70) + n);
        if (x === 0 || x === 15 || y === 0 || y === 15) t.set(x, y, 0, 0, 0, 0);
      }
      break;
    }
    case TEX.pumpkin_side:
    case TEX.pumpkin_face: {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const n = (R() - 0.5) * 16;
        const groove = x % 5 === 0;
        t.set(x, y, (groove ? 196 : 222) + n, (groove ? 104 : 128) + n, 24 + n / 2);
      }
      if (id === TEX.pumpkin_face) {
        const dark = [60, 30, 0];
        for (const [x, y] of [[3, 5], [4, 5], [4, 4], [11, 5], [12, 5], [11, 4]]) t.set(x, y, ...dark);
        for (let x = 3; x < 13; x++) t.set(x, 10, ...dark);
        for (let x = 4; x < 12; x++) t.set(x, 11, ...dark);
        t.set(6, 10, 222, 128, 24); t.set(9, 11, 222, 128, 24);
      }
      break;
    }
    case TEX.pumpkin_top: {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const n = (R() - 0.5) * 16;
        t.set(x, y, 214 + n, 120 + n, 22 + n / 2);
      }
      for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) t.set(x, y, 100, 80, 30);
      break;
    }
    case TEX.clay: t.noise([160, 166, 178], 14); break;
    default:
      t.noise([255, 0, 255], 0);
  }
}

// Ten crack stages used by the block-breaking overlay
function makeCrackCanvas() {
  const c = document.createElement('canvas');
  c.width = TILE * 10; c.height = TILE;
  const ctx = c.getContext('2d');
  const rand = mulberry32(4242);
  // Generate a set of crack paths, then reveal more of them each stage
  const paths = [];
  for (let i = 0; i < 14; i++) {
    let x = 8 + (rand() - 0.5) * 4, y = 8 + (rand() - 0.5) * 4;
    const pts = [];
    const ang = rand() * Math.PI * 2;
    for (let k = 0; k < 9; k++) {
      pts.push([x | 0, y | 0]);
      x += Math.cos(ang + (rand() - 0.5) * 1.4) * 1.2;
      y += Math.sin(ang + (rand() - 0.5) * 1.4) * 1.2;
    }
    paths.push(pts);
  }
  for (let s = 0; s < 10; s++) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    const visible = Math.round(((s + 1) / 10) * paths.length);
    const lenFrac = 0.4 + 0.6 * ((s + 1) / 10);
    for (let p = 0; p < visible; p++) {
      const pts = paths[p];
      const n = Math.max(2, Math.round(pts.length * lenFrac));
      for (let k = 0; k < n; k++) {
        const [x, y] = pts[k];
        if (x >= 0 && y >= 0 && x < 16 && y < 16) ctx.fillRect(s * TILE + x, y, 1, 1);
      }
    }
  }
  return c;
}

function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE * ATLAS_TILES;
  const ctx = canvas.getContext('2d');
  const tileCanvases = {};
  for (const name in TEX) {
    const id = TEX[name];
    const t = new TileCanvas(id + 1);
    drawTile(id, t);
    const img = new ImageData(t.d, TILE, TILE);
    ctx.putImageData(img, (id % ATLAS_TILES) * TILE, ((id / ATLAS_TILES) | 0) * TILE);
    tileCanvases[id] = t;
  }
  // Average colour of each tile, used for break particles
  const avg = {};
  for (const id in tileCanvases) {
    const d = tileCanvases[id].d;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 100) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    avg[id] = n ? [r / n / 255, g / n / 255, b / n / 255] : [1, 1, 1];
  }
  return { canvas, avg };
}

// Returns a data URL of a single tile scaled up (used for menu backgrounds)
function tileDataURL(atlasCanvas, tileId, scale = 4, darken = 0) {
  const c = document.createElement('canvas');
  c.width = c.height = TILE * scale;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlasCanvas, (tileId % ATLAS_TILES) * TILE, ((tileId / ATLAS_TILES) | 0) * TILE, TILE, TILE, 0, 0, c.width, c.height);
  if (darken) { ctx.fillStyle = `rgba(0,0,0,${darken})`; ctx.fillRect(0, 0, c.width, c.height); }
  return c.toDataURL();
}
