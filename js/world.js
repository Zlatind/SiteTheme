// Terrain generation, chunk storage, meshing and ray casting.
'use strict';

const CS = 16;          // chunk size (x/z)
const CH = 96;          // world height
const SEA = 30;

// ---------- Perlin noise ----------
class Perlin {
  constructor(seed) {
    const rand = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = (rand() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  static fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  static lerp(a, b, t) { return a + t * (b - a); }
  static grad2(h, x, y) {
    switch (h & 7) {
      case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
      case 4: return x; case 5: return -x; case 6: return y; default: return -y;
    }
  }
  static grad3(h, x, y, z) {
    const hh = h & 15;
    const u = hh < 8 ? x : y;
    const v = hh < 4 ? y : hh === 12 || hh === 14 ? x : z;
    return ((hh & 1) ? -u : u) + ((hh & 2) ? -v : v);
  }
  noise2(x, y) {
    const P = this.perm;
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = Perlin.fade(x), v = Perlin.fade(y);
    const a = P[X] + Y, b = P[X + 1] + Y;
    return Perlin.lerp(
      Perlin.lerp(Perlin.grad2(P[a], x, y), Perlin.grad2(P[b], x - 1, y), u),
      Perlin.lerp(Perlin.grad2(P[a + 1], x, y - 1), Perlin.grad2(P[b + 1], x - 1, y - 1), u), v) * 0.7;
  }
  noise3(x, y, z) {
    const P = this.perm;
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = Perlin.fade(x), v = Perlin.fade(y), w = Perlin.fade(z);
    const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z, Bb = P[X + 1] + Y, BA = P[Bb] + Z, BB = P[Bb + 1] + Z;
    const g = Perlin.grad3, l = Perlin.lerp;
    return l(
      l(l(g(P[AA], x, y, z), g(P[BA], x - 1, y, z), u), l(g(P[AB], x, y - 1, z), g(P[BB], x - 1, y - 1, z), u), v),
      l(l(g(P[AA + 1], x, y, z - 1), g(P[BA + 1], x - 1, y, z - 1), u), l(g(P[AB + 1], x, y - 1, z - 1), g(P[BB + 1], x - 1, y - 1, z - 1), u), v), w);
  }
  fbm2(x, y, oct) {
    let s = 0, a = 1, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += this.noise2(x * f, y * f) * a; n += a; a *= 0.5; f *= 2; }
    return s / n;
  }
}

function hash2(x, z, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function hash3(x, y, z, seed) { return hash2(x + Math.imul(y, 912931), z - Math.imul(y, 3571), seed); }

function seedFromString(s) {
  s = String(s).trim();
  if (/^-?\d+$/.test(s)) return parseInt(s, 10) | 0;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

// ---------- Terrain generator ----------
class Generator {
  constructor(seed, type) {
    this.seed = seed;
    this.flat = type === 'flat';
    this.n1 = new Perlin(seed);
    this.n2 = new Perlin(seed + 1);
    this.n3 = new Perlin(seed + 2);
    this.cave = new Perlin(seed + 3);
    this.cave2 = new Perlin(seed + 4);
  }
  biome(x, z) {
    return this.n3.fbm2(x / 260, z / 260, 2); // <-0.25 desert, >0.3 snowy
  }
  height(x, z) {
    if (this.flat) return 4;
    const base = this.n1.fbm2(x / 90, z / 90, 4);
    const detail = this.n2.fbm2(x / 30, z / 30, 2);
    const mount = Math.max(0, this.n2.fbm2(x / 160 + 100, z / 160, 3) * 2 - 0.15);
    let h = SEA + 2 + base * 16 + detail * 4 + mount * mount * 70;
    return Math.max(4, Math.min(CH - 12, Math.floor(h)));
  }
  treeAt(x, z) {
    if (this.flat) return null;
    // Trees placed on a jittered grid so they never overlap
    const gx = Math.floor(x / 5), gz = Math.floor(z / 5);
    const r = hash2(gx, gz, this.seed + 99);
    if (r > 0.42) return null;
    const tx = gx * 5 + 1 + Math.floor(hash2(gx, gz, this.seed + 7) * 3);
    const tz = gz * 5 + 1 + Math.floor(hash2(gx, gz, this.seed + 8) * 3);
    if (tx !== x || tz !== z) return null;
    const h = this.height(x, z);
    if (h <= SEA + 1) return null;
    const bio = this.biome(x, z);
    if (bio < -0.25) return hash2(x, z, this.seed + 5) < 0.35 ? { h, cactus: 1 + Math.floor(hash2(x, z, this.seed + 6) * 3) } : null;
    // fewer trees in plains
    const forest = this.n3.fbm2(x / 70 + 50, z / 70, 2);
    if (forest < -0.05 && r > 0.08) return null;
    return { h, trunk: 4 + Math.floor(hash2(x, z, this.seed + 3) * 3) };
  }
  generate(cx, cz) {
    const data = new Uint8Array(CS * CS * CH);
    const x0 = cx * CS, z0 = cz * CS;
    const idx = (x, y, z) => x + z * CS + y * CS * CS;
    if (this.flat) {
      for (let lx = 0; lx < CS; lx++) for (let lz = 0; lz < CS; lz++) {
        data[idx(lx, 0, lz)] = B.BEDROCK;
        for (let y = 1; y < 4; y++) data[idx(lx, y, lz)] = B.DIRT;
        data[idx(lx, 4, lz)] = B.GRASS;
      }
      return data;
    }
    for (let lx = 0; lx < CS; lx++) for (let lz = 0; lz < CS; lz++) {
      const x = x0 + lx, z = z0 + lz;
      const h = this.height(x, z);
      const bio = this.biome(x, z);
      const desert = bio < -0.25;
      const snowy = bio > 0.3 || h > 62;
      const beach = h <= SEA + 1;
      for (let y = 0; y <= Math.max(h, SEA); y++) {
        let id = B.AIR;
        if (y === 0) id = B.BEDROCK;
        else if (y <= 2 && hash3(x, y, z, this.seed) < 0.5) id = B.BEDROCK;
        else if (y < h - 3) {
          id = B.STONE;
          const r = hash3(x, y, z, this.seed + 11);
          if (r < 0.012 && y < 70) id = B.COAL_ORE;
          else if (r < 0.019 && y < 50) id = B.IRON_ORE;
          else if (r < 0.022 && y < 30) id = B.GOLD_ORE;
          else if (r < 0.0235 && y < 16) id = B.DIAMOND_ORE;
          else if (r > 0.992) id = B.GRAVEL;
        } else if (y < h) id = desert || beach ? B.SAND : B.DIRT;
        else if (y === h) {
          if (desert || beach) id = h < SEA - 2 ? (hash2(x, z, this.seed + 21) < 0.3 ? B.CLAY : B.GRAVEL) : B.SAND;
          else if (snowy) id = B.SNOW_GRASS;
          else id = B.GRASS;
        } else if (y <= SEA) id = B.WATER;

        // carve caves (never break through the sea floor)
        if (id !== B.AIR && id !== B.WATER && id !== B.BEDROCK && y > 3 && y < h - 4 + (h > SEA + 3 ? 4 : 0)) {
          const c1 = this.cave.noise3(x / 22, y / 14, z / 22);
          const c2 = this.cave2.noise3(x / 22, y / 14, z / 22);
          if (c1 * c1 + c2 * c2 < 0.0055) id = B.AIR;
        }
        data[idx(lx, y, lz)] = id;
      }
      // pumpkins scattered on grass
      if (!desert && !beach && !snowy && hash2(x, z, this.seed + 77) < 0.002 && h + 1 < CH) data[idx(lx, h + 1, lz)] = B.PUMPKIN;
    }
    // Trees, including ones rooted in neighbouring chunks that overhang this one
    for (let x = x0 - 3; x < x0 + CS + 3; x++) for (let z = z0 - 3; z < z0 + CS + 3; z++) {
      const t = this.treeAt(x, z);
      if (!t) continue;
      const put = (wx, wy, wz, id, replace) => {
        const lx = wx - x0, lz = wz - z0;
        if (lx < 0 || lz < 0 || lx >= CS || lz >= CS || wy < 0 || wy >= CH) return;
        const i = idx(lx, wy, lz);
        if (replace || data[i] === B.AIR) data[i] = id;
      };
      if (t.cactus) {
        for (let k = 1; k <= t.cactus; k++) put(x, t.h + k, z, B.CACTUS, true);
        continue;
      }
      const top = t.h + t.trunk;
      for (let dy = -2; dy <= 1; dy++) {
        const rad = dy <= -1 ? 2 : 1;
        for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && (dy === 1 || hash3(x + dx, top + dy, z + dz, this.seed) < 0.5)) continue;
          put(x + dx, top + dy, z + dz, B.LEAVES, false);
        }
      }
      for (let k = 1; k <= t.trunk; k++) put(x, t.h + k, z, B.LOG, true);
      put(x, t.h, z, B.DIRT, true);
    }
    return data;
  }
}

// ---------- Mesh building ----------
// Face table: direction, 4 corners (position + uv). Triangles are (0,1,2),(2,1,3).
const FACES = [
  { dir: [1, 0, 0], shade: 0.8, corners: [[1, 1, 1, 0, 1], [1, 0, 1, 0, 0], [1, 1, 0, 1, 1], [1, 0, 0, 1, 0]] },
  { dir: [-1, 0, 0], shade: 0.8, corners: [[0, 1, 0, 0, 1], [0, 0, 0, 0, 0], [0, 1, 1, 1, 1], [0, 0, 1, 1, 0]] },
  { dir: [0, 1, 0], shade: 1.0, corners: [[0, 1, 1, 1, 1], [1, 1, 1, 0, 1], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0]] },
  { dir: [0, -1, 0], shade: 0.5, corners: [[1, 0, 1, 1, 0], [0, 0, 1, 0, 0], [1, 0, 0, 1, 1], [0, 0, 0, 0, 1]] },
  { dir: [0, 0, 1], shade: 0.65, corners: [[0, 0, 1, 0, 0], [1, 0, 1, 1, 0], [0, 1, 1, 0, 1], [1, 1, 1, 1, 1]] },
  { dir: [0, 0, -1], shade: 0.65, corners: [[1, 0, 0, 0, 0], [0, 0, 0, 1, 0], [1, 1, 0, 0, 1], [0, 1, 0, 1, 1]] },
];
const AO_CURVE = [0.45, 0.62, 0.8, 1.0];
const UV_PAD = 0.0008;

class MeshBuffers {
  constructor() { this.pos = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

class Chunk {
  constructor(cx, cz, data) {
    this.cx = cx; this.cz = cz; this.data = data;
    this.mesh = null; this.waterMesh = null;
    this.dirty = true;
  }
}

class World {
  constructor(seed, edits, type) {
    this.seed = seed;
    this.gen = new Generator(seed, type);
    this.chunks = new Map();
    this.edits = edits || {}; // "cx,cz" -> { index: id }
    this.group = new THREE.Group();
  }
  key(cx, cz) { return cx + ',' + cz; }
  getChunk(cx, cz) { return this.chunks.get(this.key(cx, cz)); }

  ensureChunk(cx, cz) {
    const k = this.key(cx, cz);
    let c = this.chunks.get(k);
    if (c) return c;
    const data = this.gen.generate(cx, cz);
    const ed = this.edits[k];
    if (ed) for (const i in ed) data[i] = ed[i];
    c = new Chunk(cx, cz, data);
    this.chunks.set(k, c);
    // neighbours may now be meshable / need edge faces refreshed
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = this.getChunk(cx + dx, cz + dz);
      if (n) n.dirty = true;
    }
    return c;
  }

  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= CH) return B.AIR;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = this.chunks.get(cx + ',' + cz);
    if (!c) return -1;
    return c.data[(x - cx * CS) + (z - cz * CS) * CS + y * CS * CS];
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= CH) return false;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = this.getChunk(cx, cz);
    if (!c) return false;
    const lx = x - cx * CS, lz = z - cz * CS;
    const i = lx + lz * CS + y * CS * CS;
    c.data[i] = id;
    const k = this.key(cx, cz);
    (this.edits[k] || (this.edits[k] = {}))[i] = id;
    c.dirty = true;
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CS - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CS - 1) this.markDirty(cx, cz + 1);
    return true;
  }
  markDirty(cx, cz) { const c = this.getChunk(cx, cz); if (c) c.dirty = true; }

  canMesh(c) {
    return this.getChunk(c.cx + 1, c.cz) && this.getChunk(c.cx - 1, c.cz) &&
      this.getChunk(c.cx, c.cz + 1) && this.getChunk(c.cx, c.cz - 1);
  }

  buildMesh(c, material, waterMaterial) {
    const solid = new MeshBuffers(), water = new MeshBuffers();
    const x0 = c.cx * CS, z0 = c.cz * CS;
    const data = c.data;
    // Neighbour lookup: fast path inside the chunk, world lookup at edges
    const get = (lx, y, lz) => {
      if (y < 0) return B.BEDROCK;
      if (y >= CH) return B.AIR;
      if (lx >= 0 && lz >= 0 && lx < CS && lz < CS) return data[lx + lz * CS + y * CS * CS];
      const v = this.getBlock(x0 + lx, y, z0 + lz);
      return v < 0 ? B.STONE : v;
    };
    const occ = (lx, y, lz) => IS_OPAQUE[get(lx, y, lz)];
    const aoTmp = [0, 0, 0, 0];

    for (let y = 0; y < CH; y++) for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const id = data[lx + lz * CS + y * CS * CS];
      if (id === B.AIR) continue;
      const def = BLOCKS[id];
      const isWater = id === B.WATER;
      const isCactus = id === B.CACTUS;
      const buf = isWater ? water : solid;
      for (let f = 0; f < 6; f++) {
        const face = FACES[f];
        const [dx, dy, dz] = face.dir;
        const nb = get(lx + dx, y + dy, lz + dz);
        if (isWater) {
          if (nb !== B.AIR && !(IS_TRANSPARENT[nb] && nb !== B.WATER)) continue;
        } else if (!isCactus) {
          if (IS_OPAQUE[nb]) continue;
          if (nb === id && id !== B.LEAVES) continue; // glass next to glass etc.
        } else if (IS_OPAQUE[nb] && dy !== 0) continue;
        const tile = def.tex[f];
        const u0 = (tile % ATLAS_TILES) / ATLAS_TILES, v0 = 1 - (((tile / ATLAS_TILES) | 0) + 1) / ATLAS_TILES;
        const tw = 1 / ATLAS_TILES;
        const waterTop = isWater && get(lx, y + 1, lz) !== B.WATER;
        const glow = def.glow ? 1.25 : 1;
        // ambient occlusion per vertex
        for (let k = 0; k < 4; k++) {
          const cnr = face.corners[k];
          if (isWater || def.glow) { aoTmp[k] = 3; continue; }
          const nx = lx + dx, ny = y + dy, nz = lz + dz;
          let s1, s2, cc;
          if (dx !== 0) {
            const oy = cnr[1] ? 1 : -1, oz = cnr[2] ? 1 : -1;
            s1 = occ(nx, ny + oy, nz); s2 = occ(nx, ny, nz + oz); cc = occ(nx, ny + oy, nz + oz);
          } else if (dy !== 0) {
            const ox = cnr[0] ? 1 : -1, oz = cnr[2] ? 1 : -1;
            s1 = occ(nx + ox, ny, nz); s2 = occ(nx, ny, nz + oz); cc = occ(nx + ox, ny, nz + oz);
          } else {
            const ox = cnr[0] ? 1 : -1, oy = cnr[1] ? 1 : -1;
            s1 = occ(nx + ox, ny, nz); s2 = occ(nx, ny + oy, nz); cc = occ(nx + ox, ny + oy, nz);
          }
          aoTmp[k] = s1 && s2 ? 0 : 3 - s1 - s2 - cc;
        }
        const n = buf.n;
        for (let k = 0; k < 4; k++) {
          const cnr = face.corners[k];
          let px = lx + cnr[0], py = y + cnr[1], pz = lz + cnr[2];
          if (isCactus && dx !== 0) px = lx + (cnr[0] ? 0.9375 : 0.0625);
          if (isCactus && dz !== 0) pz = lz + (cnr[2] ? 0.9375 : 0.0625);
          if (waterTop && cnr[1] === 1) py -= 0.12;
          buf.pos.push(x0 + px, py, z0 + pz);
          buf.uv.push(u0 + (cnr[3] ? tw - UV_PAD : UV_PAD), v0 + (cnr[4] ? tw - UV_PAD : UV_PAD));
          const b = Math.min(1.3, face.shade * AO_CURVE[aoTmp[k]] * glow);
          buf.col.push(b, b, b);
        }
        if (aoTmp[0] + aoTmp[3] > aoTmp[1] + aoTmp[2]) buf.idx.push(n, n + 1, n + 3, n, n + 3, n + 2);
        else buf.idx.push(n, n + 1, n + 2, n + 2, n + 1, n + 3);
        buf.n += 4;
      }
    }
    this.disposeChunkMesh(c);
    if (solid.n) { c.mesh = new THREE.Mesh(solid.toGeometry(), material); this.group.add(c.mesh); }
    if (water.n) { c.waterMesh = new THREE.Mesh(water.toGeometry(), waterMaterial); c.waterMesh.renderOrder = 1; this.group.add(c.waterMesh); }
    c.dirty = false;
  }

  disposeChunkMesh(c) {
    if (c.mesh) { this.group.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh = null; }
    if (c.waterMesh) { this.group.remove(c.waterMesh); c.waterMesh.geometry.dispose(); c.waterMesh = null; }
  }

  unloadFar(pcx, pcz, radius) {
    for (const [k, c] of this.chunks) {
      if (Math.abs(c.cx - pcx) > radius || Math.abs(c.cz - pcz) > radius) {
        this.disposeChunkMesh(c);
        this.chunks.delete(k);
      }
    }
  }

  disposeAll() {
    for (const c of this.chunks.values()) this.disposeChunkMesh(c);
    this.chunks.clear();
  }

  surfaceHeight(x, z) {
    for (let y = CH - 1; y > 0; y--) {
      const b = this.getBlock(x, y, z);
      if (b > 0 && IS_SOLID[b]) return y;
    }
    return 0;
  }

  // Voxel DDA ray cast (Amanatides & Woo). Returns hit block and the face normal.
  raycast(origin, dir, maxDist) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
    const tdx = sx ? Math.abs(1 / dir.x) : Infinity, tdy = sy ? Math.abs(1 / dir.y) : Infinity, tdz = sz ? Math.abs(1 / dir.z) : Infinity;
    let tmx = sx > 0 ? (x + 1 - origin.x) * tdx : sx < 0 ? (origin.x - x) * tdx : Infinity;
    let tmy = sy > 0 ? (y + 1 - origin.y) * tdy : sy < 0 ? (origin.y - y) * tdy : Infinity;
    let tmz = sz > 0 ? (z + 1 - origin.z) * tdz : sz < 0 ? (origin.z - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    while (t <= maxDist) {
      const b = this.getBlock(x, y, z);
      if (b > 0 && b !== B.WATER) return { x, y, z, id: b, nx, ny, nz, dist: t };
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }
}
