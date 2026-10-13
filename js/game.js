// Core engine: rendering, player physics, touch/keyboard controls and survival rules.
'use strict';

const Settings = {
  data: {
    renderDistance: 4, fov: 70, sensitivity: 1, guiScale: 1, sound: true, volume: 70,
    coords: false, autoJump: true, controls: 'dpad', bobbing: true, clouds: true, hiRes: false,
    invertY: false, splitTouch: false,
  },
  load() {
    try { Object.assign(this.data, JSON.parse(localStorage.getItem('bc_settings') || '{}')); } catch (e) { /* defaults */ }
  },
  save() {
    try { localStorage.setItem('bc_settings', JSON.stringify(this.data)); } catch (e) { /* storage full */ }
  },
};

const Store = {
  list() {
    try { return JSON.parse(localStorage.getItem('bc_worlds') || '[]'); } catch (e) { return []; }
  },
  saveList(l) { localStorage.setItem('bc_worlds', JSON.stringify(l)); },
  load(id) {
    try { return JSON.parse(localStorage.getItem('bc_world_' + id) || 'null'); } catch (e) { return null; }
  },
  save(id, data) { localStorage.setItem('bc_world_' + id, JSON.stringify(data)); },
  remove(id) {
    localStorage.removeItem('bc_world_' + id);
    this.saveList(this.list().filter(w => w.id !== id));
  },
  upsertMeta(meta) {
    const l = this.list().filter(w => w.id !== meta.id);
    l.unshift(meta);
    this.saveList(l);
  },
};

const PLAYER_W = 0.3;   // half width
const PLAYER_H = 1.8;
const EYE = 1.62;
const GRAVITY = 28;
const JUMP_V = 8.6;

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 700);
    this.camera.rotation.order = 'YXZ';
    this.state = 'none';
    this.paused = false;
    this.world = null;
    this.time = 0.05;
    this.clock = performance.now();
    this.fps = 0; this.fpsAcc = 0; this.fpsFrames = 0;
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (!this.isTouch) document.body.classList.add('no-touch');

    this.atlas = buildAtlas();
    Icons.init(this.atlas.canvas);
    const tex = new THREE.CanvasTexture(this.atlas.canvas);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    this.texture = tex;
    this.mat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, alphaTest: 0.5 });
    this.waterMat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide });
    this.scene.fog = new THREE.Fog(0x9cc0ff, 40, 64);

    this.buildSky();
    this.buildOverlays();
    this.buildHand();
    this.particles = [];
    this.tnts = [];

    this.input = { keys: {}, touchX: 0, touchZ: 0, jump: false, sneak: false, flyDown: false, sprint: false };
    this.player = this.newPlayer();
    this.inv = new Array(36).fill(null);
    this.selected = 0;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    this.setupKeyboard();
    this.setupTouch();
    requestAnimationFrame(t => this.loop(t));
  }

  newPlayer() {
    return {
      pos: new THREE.Vector3(8, 60, 8), vel: new THREE.Vector3(), yaw: 0, pitch: 0,
      onGround: false, flying: false, inWater: false, headInWater: false, sneaking: false,
      health: 20, food: 20, exhaustion: 0, regenTimer: 0, starveTimer: 0, hurtTimer: 0,
      fallStart: null, xp: 0, level: 0, stepAcc: 0, bob: 0, spawn: null, cactusTimer: 0,
    };
  }

  // ---------------- scene objects ----------------
  buildSky() {
    const mk = (draw) => {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      draw(c.getContext('2d'));
      const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
      return t;
    };
    const sunTex = mk(ctx => {
      ctx.fillStyle = 'rgba(255,255,160,0.25)'; ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#fff86a'; ctx.fillRect(6, 6, 20, 20);
      ctx.fillStyle = '#ffffd0'; ctx.fillRect(9, 9, 14, 14);
    });
    const moonTex = mk(ctx => {
      ctx.fillStyle = '#dfe6f0'; ctx.fillRect(8, 8, 16, 16);
      ctx.fillStyle = '#a8b0c0'; ctx.fillRect(11, 11, 4, 3); ctx.fillRect(18, 16, 3, 4); ctx.fillRect(12, 19, 3, 2);
    });
    const plane = new THREE.PlaneGeometry(36, 36);
    this.sun = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, fog: false, depthWrite: false }));
    this.moon = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, fog: false, depthWrite: false }));
    this.sun.renderOrder = this.moon.renderOrder = -1;
    this.scene.add(this.sun, this.moon);

    // stars
    const starPos = [];
    const rnd = mulberry32(5);
    for (let i = 0; i < 600; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      starPos.push(r * Math.cos(th) * 500, Math.abs(u) * 500, r * Math.sin(th) * 500);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false }));
    this.stars.renderOrder = -2;
    this.scene.add(this.stars);

    // blocky clouds
    const cc = document.createElement('canvas'); cc.width = cc.height = 64;
    const cx = cc.getContext('2d');
    const pn = new Perlin(77);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const v = pn.noise2(x / 6, y / 6) + pn.noise2(x / 3, y / 3) * 0.4;
      if (v > 0.18) { cx.fillStyle = '#fff'; cx.fillRect(x, y, 1, 1); }
    }
    const ct = new THREE.CanvasTexture(cc);
    ct.magFilter = THREE.NearestFilter; ct.minFilter = THREE.NearestFilter;
    ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.repeat.set(4, 4);
    this.cloudTex = ct;
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(3072, 3072), new THREE.MeshBasicMaterial({ map: ct, transparent: true, opacity: 0.85, fog: false, depthWrite: false, side: THREE.DoubleSide }));
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.position.y = 108;
    this.scene.add(this.clouds);
  }

  buildOverlays() {
    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    this.selBox = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7 }));
    this.selBox.visible = false;
    this.scene.add(this.selBox);

    const crackTex = new THREE.CanvasTexture(makeCrackCanvas());
    crackTex.magFilter = THREE.NearestFilter; crackTex.minFilter = THREE.NearestFilter;
    crackTex.repeat.set(0.1, 1);
    this.crackTex = crackTex;
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.006, 1.006, 1.006),
      new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    this.crack.visible = false;
    this.scene.add(this.crack);
    this.partGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    this.partMats = {};
  }

  blockGeometry(id, size = 1) {
    const g = new THREE.BoxGeometry(size, size, size);
    const uv = g.attributes.uv;
    const def = BLOCKS[id];
    const shades = [0.8, 0.8, 1, 0.5, 0.65, 0.65];
    const cols = [];
    for (let f = 0; f < 6; f++) {
      const tile = def.tex[f];
      const u0 = (tile % ATLAS_TILES) / ATLAS_TILES, v0 = 1 - (((tile / ATLAS_TILES) | 0) + 1) / ATLAS_TILES;
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        uv.setXY(i, u0 + uv.getX(i) * (1 / ATLAS_TILES - 0.001) + 0.0005, v0 + uv.getY(i) * (1 / ATLAS_TILES - 0.001) + 0.0005);
        cols.push(shades[f], shades[f], shades[f]);
      }
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    return g;
  }

  buildHand() {
    this.handScene = new THREE.Scene();
    this.handCam = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
    this.handGroup = new THREE.Group();
    this.handScene.add(this.handGroup);
    this.handMatBlock = new THREE.MeshBasicMaterial({ map: this.texture, vertexColors: true, alphaTest: 0.5 });
    // Arm shown when the selected slot is empty
    const arm = new THREE.BoxGeometry(0.28, 0.28, 0.95);
    const ac = [];
    const sh = [0.75, 0.75, 1, 0.55, 0.85, 0.85];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) ac.push(0.86 * sh[f], 0.64 * sh[f], 0.5 * sh[f]);
    arm.setAttribute('color', new THREE.Float32BufferAttribute(ac, 3));
    this.armMesh = new THREE.Mesh(arm, new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.handItem = null;
    this.handHeldId = -1;
    this.swing = 0;
    this.handDip = 0;
  }

  setHandItem(id) {
    if (id === this.handHeldId) return;
    const old = this.handHeldId;
    this.handHeldId = id;
    this.handDip = old === -1 ? 0 : 1;
    while (this.handGroup.children.length) {
      const c = this.handGroup.children[0];
      this.handGroup.remove(c);
      if (c !== this.armMesh) { c.geometry.dispose(); if (c.material !== this.handMatBlock) { c.material.map && c.material.map.dispose(); c.material.dispose(); } }
    }
    if (!id) {
      this.armMesh.position.set(0.62, -0.62, -0.75);
      this.armMesh.rotation.set(0.25, -0.15, 0.1);
      this.handGroup.add(this.armMesh);
    } else if (isBlock(id)) {
      const m = new THREE.Mesh(this.blockGeometry(id, 0.36), this.handMatBlock);
      m.position.set(0.66, -0.6, -1.25);
      m.rotation.set(0.05, Math.PI / 4 + 0.2, 0);
      this.handGroup.add(m);
    } else {
      const t = new THREE.TextureLoader().load(Icons.block(id));
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
      m.position.set(0.62, -0.5, -1.15);
      m.rotation.set(0, -0.5, 0.2);
      this.handGroup.add(m);
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, Settings.data.hiRes ? 2 : 1.25);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.handCam.aspect = w / h; this.handCam.updateProjectionMatrix();
  }

  applySettings() {
    const s = Settings.data;
    this.camera.fov = s.fov; this.camera.updateProjectionMatrix();
    const R = s.renderDistance * CS;
    this.scene.fog.near = R * 0.5; this.scene.fog.far = R * 0.95;
    this.clouds.visible = s.clouds;
    Sound.enabled = s.sound; Sound.volume = s.volume / 100;
    document.documentElement.style.setProperty('--ui', s.guiScale);
    document.getElementById('dpad').classList.toggle('hidden', s.controls !== 'dpad');
    document.getElementById('joystick').classList.toggle('hidden', s.controls !== 'joystick');
    this.resize();
  }

  // ---------------- world lifecycle ----------------
  clearWorld() {
    if (this.world) {
      this.world.disposeAll();
      this.scene.remove(this.world.group);
    }
    for (const p of this.particles) this.scene.remove(p.mesh);
    for (const t of this.tnts) this.scene.remove(t.mesh);
    this.particles = []; this.tnts = [];
    this.world = null;
  }

  startPanorama() {
    this.clearWorld();
    this.state = 'menu';
    this.paused = false;
    this.world = new World(20240611);
    this.scene.add(this.world.group);
    this.time = 0.12;
    this.panoYaw = 0;
    const h = Math.max(this.world.gen.height(8, 8), SEA) + 14;
    this.camera.position.set(8, h, 8);
    this.applySettings();
    document.body.classList.add('menu-bg');
    document.getElementById('hud').classList.add('hidden');
  }

  async startWorld(meta, onProgress) {
    this.clearWorld();
    this.state = 'loading';
    this.meta = meta;
    const saved = Store.load(meta.id) || {};
    this.world = new World(meta.seed, saved.edits || {}, meta.type);
    this.scene.add(this.world.group);
    this.mode = meta.mode;
    this.difficulty = meta.difficulty || 'normal';
    this.time = saved.time != null ? saved.time : 0.05;
    this.player = this.newPlayer();
    this.inv = new Array(36).fill(null);
    if (saved.inv) saved.inv.forEach((s, i) => { this.inv[i] = s; });
    else this.giveStarterKit();
    this.selected = saved.selected || 0;
    this.applySettings();

    // Pick spawn location
    let spawn = saved.spawn;
    if (!spawn) spawn = this.findSpawn();
    this.player.spawn = spawn;
    const p = saved.player;
    const startX = p ? p.x : spawn.x + 0.5, startZ = p ? p.z : spawn.z + 0.5;

    // Generate & mesh the area around the player with a progress bar
    const R = Settings.data.renderDistance;
    const pcx = Math.floor(startX / CS), pcz = Math.floor(startZ / CS);
    const inRange = (dx, dz) => dx * dx + dz * dz <= (R + 0.5) ** 2;
    let target = 0;
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) if (inRange(dx, dz)) target++;
    for (;;) {
      this.streamChunks(startX, startZ, R, 6, 4);
      let meshed = 0;
      for (const c of this.world.chunks.values()) if (c.built && inRange(c.cx - pcx, c.cz - pcz)) meshed++;
      onProgress && onProgress(Math.min(1, meshed / target));
      if (meshed >= target) break;
      await new Promise(r => setTimeout(r, 0));
      if (this.state !== 'loading') return;
    }

    if (p) {
      this.player.pos.set(p.x, p.y, p.z);
      this.player.yaw = p.yaw; this.player.pitch = p.pitch;
      this.player.health = p.health ?? 20; this.player.food = p.food ?? 20;
      this.player.xp = p.xp || 0; this.player.level = p.level || 0;
      this.player.flying = !!p.flying && this.mode === 'creative';
    } else {
      this.player.pos.set(spawn.x + 0.5, this.world.surfaceHeight(spawn.x, spawn.z) + 1.01, spawn.z + 0.5);
    }
    this.state = 'play';
    this.paused = false;
    this.lastSave = performance.now();
    this.thumbPending = true;
    document.body.classList.remove('menu-bg');
    document.body.classList.toggle('creative', this.mode === 'creative');
    this.handHeldId = -1; this.setHandItem(this.heldId());
    this.hudDirty = true;
  }

  findSpawn() {
    const g = this.world.gen;
    for (let r = 0; r < 200; r += 4) {
      for (let a = 0; a < 8; a++) {
        const x = Math.round(Math.cos(a * Math.PI / 4) * r), z = Math.round(Math.sin(a * Math.PI / 4) * r);
        const h = g.height(x, z);
        if (h > SEA + 1 && !g.treeAt(x, z) && g.biome(x, z) > -0.25) return { x, z };
      }
    }
    return { x: 0, z: 0 };
  }

  giveStarterKit() {
    if (this.mode === 'creative') {
      [B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.PLANKS, B.LOG, B.GLASS, B.BRICKS, B.TNT].forEach((id, i) => { this.inv[i] = { id, count: 1 }; });
    }
  }

  serialize() {
    const p = this.player;
    return {
      edits: this.world.edits, time: this.time, spawn: p.spawn, selected: this.selected,
      inv: this.inv,
      player: { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, health: p.health, food: p.food, xp: p.xp, level: p.level, flying: p.flying },
    };
  }

  save() {
    if (this.state !== 'play' || !this.meta) return true;
    this.meta.lastPlayed = Date.now();
    this.meta.mode = this.mode;
    try {
      Store.save(this.meta.id, this.serialize());
      Store.upsertMeta(this.meta);
      this.lastSave = performance.now();
      return true;
    } catch (e) {
      UI.toast('Could not save: storage is full');
      return false;
    }
  }

  quitToTitle() {
    this.save();
    this.state = 'none';
    this.startPanorama();
  }

  // ---------------- chunk streaming ----------------
  streamChunks(px, pz, R, genBudget, meshBudget) {
    const w = this.world;
    const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
    const need = [];
    const RG = R + 1;
    for (let dx = -RG; dx <= RG; dx++) for (let dz = -RG; dz <= RG; dz++) {
      if (dx * dx + dz * dz > (RG + 0.5) ** 2) continue;
      if (!w.getChunk(pcx + dx, pcz + dz)) need.push([dx * dx + dz * dz, pcx + dx, pcz + dz]);
    }
    need.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < Math.min(genBudget, need.length); i++) w.ensureChunk(need[i][1], need[i][2]);

    const dirty = [];
    for (const c of w.chunks.values()) {
      if (!c.dirty) continue;
      const d = (c.cx - pcx) ** 2 + (c.cz - pcz) ** 2;
      if (d > (R + 0.5) ** 2) continue;
      if (!w.canMesh(c)) continue;
      dirty.push([d, c]);
    }
    dirty.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < Math.min(meshBudget, dirty.length); i++) {
      w.buildMesh(dirty[i][1], this.mat, this.waterMat);
      dirty[i][1].built = true;
    }
    if (Math.random() < 0.05) w.unloadFar(pcx, pcz, R + 3);
  }

  // Rebuild already-visible chunks touched by an edit right away (no frame delay)
  flushEdits() {
    for (const c of this.world.chunks.values()) {
      if (c.dirty && c.built && this.world.canMesh(c)) this.world.buildMesh(c, this.mat, this.waterMat);
    }
  }

  // ---------------- inventory helpers ----------------
  heldId() { const s = this.inv[this.selected]; return s ? s.id : 0; }

  addItem(id, n = 1) {
    if (this.mode === 'creative') return true;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 36 && n > 0; i++) {
        const s = this.inv[i];
        if (pass === 0 && s && s.id === id && s.count < 64) {
          const k = Math.min(n, 64 - s.count); s.count += k; n -= k;
        } else if (pass === 1 && !s) {
          const k = Math.min(n, 64); this.inv[i] = { id, count: k }; n -= k;
        }
      }
    }
    this.hudDirty = true;
    return n === 0;
  }
  countItem(id) { return this.inv.reduce((a, s) => a + (s && s.id === id ? s.count : 0), 0); }
  removeItem(id, n) {
    for (let i = 35; i >= 0 && n > 0; i--) {
      const s = this.inv[i];
      if (s && s.id === id) { const k = Math.min(n, s.count); s.count -= k; n -= k; if (!s.count) this.inv[i] = null; }
    }
    this.hudDirty = true;
  }
  consumeSelected() {
    if (this.mode === 'creative') return;
    const s = this.inv[this.selected];
    if (!s) return;
    if (--s.count <= 0) this.inv[this.selected] = null;
    this.hudDirty = true;
  }
  select(i) {
    if (i === this.selected) return;
    this.selected = (i + 9) % 9;
    this.hudDirty = true;
    UI.showItemName(this.heldId());
  }

  // ---------------- input ----------------
  setupKeyboard() {
    const k = this.input.keys;
    window.addEventListener('keydown', e => {
      if (this.state !== 'play') return;
      if (UI.isTyping()) { if (e.code === 'Escape' && UI.current === 'chat') UI.closeChat(); return; }
      const c = e.code;
      if (c === 'Escape') { if (!this.paused) UI.pause(); return; }
      if (this.paused) { if (c === 'KeyE' && UI.current === 'inventory') UI.closeInventory(); return; }
      k[c] = true;
      if (c.startsWith('Digit')) { const n = +c.slice(5); if (n >= 1 && n <= 9) this.select(n - 1); }
      if (c === 'KeyE') { document.exitPointerLock && document.exitPointerLock(); UI.openInventory(); }
      if (c === 'KeyT' || c === 'Slash') { e.preventDefault(); document.exitPointerLock && document.exitPointerLock(); UI.openChat(c === 'Slash' ? '/' : ''); }
      if (c === 'Space') { this.onJumpPress(); }
      if (c === 'F3') { e.preventDefault(); Settings.data.coords = !Settings.data.coords; Settings.save(); }
      if (c === 'KeyQ') { this.dropSelected(); }
    });
    window.addEventListener('keyup', e => { k[e.code] = false; });

    this.canvas.addEventListener('mousedown', e => {
      if (this.state !== 'play' || this.paused || this.isTouchActive) return;
      if (document.pointerLockElement !== this.canvas) { this.canvas.requestPointerLock && this.canvas.requestPointerLock(); return; }
      if (e.button === 0) { this.breaking = true; this.swing = Math.max(this.swing, 0.01); }
      if (e.button === 2) this.useItem();
      if (e.button === 1) { const t = this.target; if (t && this.mode === 'creative') this.pickBlock(t.id); }
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.breaking = false; });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('mousemove', e => {
      if (document.pointerLockElement !== this.canvas || this.paused) return;
      this.look(e.movementX * 0.0025, e.movementY * 0.0025);
    });
    window.addEventListener('wheel', e => {
      if (this.state !== 'play' || this.paused) return;
      this.select(this.selected + (e.deltaY > 0 ? 1 : -1));
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this.canvas && this.state === 'play' && !this.paused && !this.isTouchActive && UI.current === 'hud') UI.pause();
    });
  }

  look(dx, dy) {
    const s = Settings.data.sensitivity;
    const p = this.player;
    p.yaw -= dx * s;
    p.pitch -= dy * s * (Settings.data.invertY ? -1 : 1);
    p.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, p.pitch));
  }

  pickBlock(id) {
    let slot = this.inv.slice(0, 9).findIndex(s => s && s.id === id);
    if (slot < 0) { this.inv[this.selected] = { id, count: 1 }; slot = this.selected; }
    this.selected = slot; this.hudDirty = true; UI.showItemName(id);
  }

  dropSelected() {
    if (this.mode === 'creative') return;
    this.consumeSelected();
  }

  onJumpPress() {
    const now = performance.now();
    if (this.mode === 'creative' && now - (this.lastJumpPress || 0) < 300) {
      this.player.flying = !this.player.flying;
      this.player.vel.y = 0;
      this.lastJumpPress = 0;
      this.updateFlyButtons();
      return;
    }
    this.lastJumpPress = now;
  }

  updateFlyButtons() {
    document.getElementById('btn-fly-down').classList.toggle('hidden', !this.player.flying);
  }

  setupTouch() {
    const dpad = document.getElementById('dpad');
    const touchKeys = new Map(); // touch id -> key
    const refreshDpad = () => {
      let x = 0, z = 0;
      const active = new Set(touchKeys.values());
      if (active.has('up') || active.has('ul') || active.has('ur')) z = 1;
      if (active.has('down')) z = -1;
      if (active.has('left') || active.has('ul')) x = -1;
      if (active.has('right') || active.has('ur')) x = 1;
      this.input.touchX = x; this.input.touchZ = z;
      if (z <= 0) this.input.sprint = false;
      dpad.classList.toggle('moving', z > 0);
      dpad.querySelectorAll('.dp').forEach(b => b.classList.toggle('active', active.has(b.dataset.k) && b.dataset.k !== 'sneak'));
    };
    const keyAt = (t) => {
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const b = el && el.closest && el.closest('#dpad .dp');
      return b ? b.dataset.k : null;
    };
    dpad.addEventListener('touchstart', e => {
      e.preventDefault();
      this.isTouchActive = true;
      for (const t of e.changedTouches) {
        const k = keyAt(t);
        if (k === 'sneak') { this.toggleSneak(); continue; }
        if (k === 'up') {
          const now = performance.now();
          if (now - (this.lastUpTap || 0) < 300) this.input.sprint = true;
          this.lastUpTap = now;
        }
        if (k) touchKeys.set(t.identifier, k);
      }
      refreshDpad();
    }, { passive: false });
    dpad.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (!touchKeys.has(t.identifier)) continue;
        const k = keyAt(t);
        if (k && k !== 'sneak') touchKeys.set(t.identifier, k);
        else if (!k) touchKeys.set(t.identifier, touchKeys.get(t.identifier)); // keep last while sliding off
      }
      refreshDpad();
    }, { passive: false });
    const dEnd = e => { for (const t of e.changedTouches) touchKeys.delete(t.identifier); refreshDpad(); };
    dpad.addEventListener('touchend', dEnd);
    dpad.addEventListener('touchcancel', dEnd);

    // Joystick
    const joy = document.getElementById('joystick'), knob = document.getElementById('joy-knob');
    let joyId = null;
    const joyMove = t => {
      const r = joy.getBoundingClientRect();
      let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
      const max = r.width / 2;
      const len = Math.hypot(dx, dy);
      if (len > max) { dx *= max / len; dy *= max / len; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.input.touchX = Math.abs(dx / max) > 0.25 ? dx / max : 0;
      this.input.touchZ = Math.abs(dy / max) > 0.25 ? -dy / max : 0;
      this.input.sprint = len >= max * 0.98 && dy < 0;
    };
    joy.addEventListener('touchstart', e => { e.preventDefault(); this.isTouchActive = true; const t = e.changedTouches[0]; joyId = t.identifier; joyMove(t); }, { passive: false });
    joy.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === joyId) joyMove(t); }, { passive: false });
    const jEnd = e => {
      for (const t of e.changedTouches) if (t.identifier === joyId) {
        joyId = null; knob.style.transform = ''; this.input.touchX = 0; this.input.touchZ = 0; this.input.sprint = false;
      }
    };
    joy.addEventListener('touchend', jEnd); joy.addEventListener('touchcancel', jEnd);

    // Jump / fly buttons
    const hold = (id, on, off) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', e => { e.preventDefault(); this.isTouchActive = true; el.classList.add('active'); on(); }, { passive: false });
      const end = e => { e.preventDefault(); el.classList.remove('active'); off(); };
      el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
    };
    hold('btn-jump', () => { this.input.jump = true; this.onJumpPress(); }, () => { this.input.jump = false; });
    hold('btn-fly-down', () => { this.input.flyDown = true; }, () => { this.input.flyDown = false; });

    // Look / tap to place / hold to break
    const lookEl = document.getElementById('touch-look');
    let lookId = null, last = null, start = null, startTime = 0, moved = 0, holdTimer = null;
    lookEl.addEventListener('touchstart', e => {
      e.preventDefault();
      this.isTouchActive = true;
      if (lookId !== null || this.paused) return;
      const t = e.changedTouches[0];
      lookId = t.identifier; last = { x: t.clientX, y: t.clientY }; start = { ...last };
      startTime = performance.now(); moved = 0;
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => { if (lookId !== null && moved < 14) { this.breaking = true; } }, 260);
    }, { passive: false });
    lookEl.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        const dx = t.clientX - last.x, dy = t.clientY - last.y;
        last = { x: t.clientX, y: t.clientY };
        moved = Math.max(moved, Math.hypot(t.clientX - start.x, t.clientY - start.y));
        this.look(dx * 0.0062, dy * 0.0062);
      }
    }, { passive: false });
    const lEnd = e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        clearTimeout(holdTimer);
        const dur = performance.now() - startTime;
        if (!this.breaking && dur < 260 && moved < 14) this.useItem();
        this.breaking = false;
        lookId = null;
      }
    };
    lookEl.addEventListener('touchend', lEnd); lookEl.addEventListener('touchcancel', lEnd);
  }

  toggleSneak() {
    if (this.player.flying) { this.input.flyDown = !this.input.flyDown; return; }
    this.input.sneak = !this.input.sneak;
    document.querySelector('#dpad .center').classList.toggle('on', this.input.sneak);
  }

  // ---------------- interactions ----------------
  reach() { return this.mode === 'creative' ? 7 : 5; }

  updateTarget() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.target = this.world.raycast(this.camera.position, dir, this.reach());
    if (this.target) {
      this.selBox.visible = true;
      this.selBox.position.set(this.target.x + 0.5, this.target.y + 0.5, this.target.z + 0.5);
    } else this.selBox.visible = false;
  }

  useItem() {
    if (this.state !== 'play' || this.paused) return;
    const t = this.target;
    const held = this.heldId();
    this.swing = 0.01;
    if (t && t.id === B.TNT) { this.igniteTNT(t.x, t.y, t.z); return; }
    if (t && t.id === B.TABLE && !isBlock(held)) { UI.openInventory(true); return; }
    if (held >= 100) {
      const food = ITEMS[held].food;
      if (this.mode === 'survival' && this.player.food < 20) {
        this.player.food = Math.min(20, this.player.food + food);
        this.consumeSelected();
        Sound.eat(); setTimeout(() => Sound.burp(), 450);
        this.hudDirty = true;
      }
      return;
    }
    if (!t || !isBlock(held)) return;
    const x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
    const cur = this.world.getBlock(x, y, z);
    if (cur !== B.AIR && cur !== B.WATER) return;
    if (IS_SOLID[held] && this.intersectsPlayer(x, y, z)) return;
    if (held === B.CACTUS) { const below = this.world.getBlock(x, y - 1, z); if (below !== B.SAND && below !== B.CACTUS) return; }
    if (!this.world.setBlock(x, y, z, held)) return;
    this.flushEdits();
    this.consumeSelected();
    Sound.place(BLOCKS[held].sound);
  }

  intersectsPlayer(x, y, z) {
    const p = this.player.pos;
    return x + 1 > p.x - PLAYER_W && x < p.x + PLAYER_W && z + 1 > p.z - PLAYER_W && z < p.z + PLAYER_W && y + 1 > p.y && y < p.y + PLAYER_H;
  }

  breakBlock(t) {
    const def = BLOCKS[t.id];
    this.world.setBlock(t.x, t.y, t.z, B.AIR);
    // let water flow into the gap from the sides or above (one step)
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
      if (this.world.getBlock(t.x + dx, t.y + dy, t.z + dz) === B.WATER) { this.world.setBlock(t.x, t.y, t.z, B.WATER); break; }
    }
    this.flushEdits();
    Sound.breakBlock(def.sound);
    this.spawnParticles(t.x + 0.5, t.y + 0.5, t.z + 0.5, def.tex[2], 10);
    if (this.mode === 'survival') {
      let drop = def.drop === undefined ? t.id : def.drop;
      if (drop === 'leaves') drop = Math.random() < 0.1 ? ITEM.APPLE : null;
      if (drop) { this.addItem(drop, 1); Sound.pop(); }
      const xp = { [B.COAL_ORE]: 1, [B.IRON_ORE]: 2, [B.GOLD_ORE]: 3, [B.DIAMOND_ORE]: 6 }[t.id];
      if (xp) this.addXp(xp);
      this.player.exhaustion += 0.025;
    }
  }

  addXp(n) {
    const p = this.player;
    p.xp += n;
    for (;;) {
      const need = 7 + p.level * 2;
      if (p.xp < need) break;
      p.xp -= need; p.level++;
      Sound.tone(800, 0.25, 0.15, 'triangle', 1200);
    }
    this.hudDirty = true;
  }

  spawnParticles(x, y, z, tile, n, color) {
    const col = color || this.atlas.avg[tile] || [1, 1, 1];
    const key = col.join(',');
    let m = this.partMats[key];
    if (!m) m = this.partMats[key] = new THREE.MeshBasicMaterial({ color: new THREE.Color(col[0], col[1], col[2]) });
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.partGeo, m);
      mesh.position.set(x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, z + (Math.random() - 0.5) * 0.6);
      const s = 0.6 + Math.random() * 0.8;
      mesh.scale.setScalar(s);
      this.scene.add(mesh);
      this.particles.push({ mesh, vel: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 4 + 1, (Math.random() - 0.5) * 4), life: 0.5 + Math.random() * 0.5 });
    }
  }

  igniteTNT(x, y, z, fuse = 2.5) {
    this.world.setBlock(x, y, z, B.AIR);
    this.flushEdits();
    const mesh = new THREE.Mesh(this.blockGeometry(B.TNT, 1), new THREE.MeshBasicMaterial({ map: this.texture, vertexColors: true }));
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.scene.add(mesh);
    this.tnts.push({ mesh, x, y, z, t: fuse, vy: 0 });
    Sound.fuse();
  }

  explode(cx, cy, cz) {
    const R = 3.4;
    const w = this.world;
    const chain = [];
    for (let x = Math.floor(cx - R); x <= cx + R; x++) for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let z = Math.floor(cz - R); z <= cz + R; z++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz);
      if (d > R - Math.random() * 0.8) continue;
      const b = w.getBlock(x, y, z);
      if (b <= 0 || b === B.BEDROCK || b === B.OBSIDIAN || b === B.WATER) continue;
      if (b === B.TNT) { chain.push([x, y, z]); continue; }
      w.setBlock(x, y, z, B.AIR);
    }
    this.flushEdits();
    for (const [x, y, z] of chain) this.igniteTNT(x, y, z, 0.4 + Math.random() * 0.4);
    this.spawnParticles(cx, cy, cz, 0, 30, [0.85, 0.85, 0.85]);
    this.spawnParticles(cx, cy, cz, 0, 10, [1, 0.7, 0.2]);
    Sound.explode();
    const p = this.player;
    const pd = Math.hypot(p.pos.x - cx, p.pos.y + 0.9 - cy, p.pos.z - cz);
    if (pd < 7) {
      const f = 1 - pd / 7;
      const dir = new THREE.Vector3(p.pos.x - cx, p.pos.y + 0.9 - cy, p.pos.z - cz).normalize();
      p.vel.addScaledVector(dir, f * 14);
      if (this.mode === 'survival') this.damage(Math.round(f * 16), 'blown up');
    }
    this.shake = 0.4;
  }

  damage(n, cause) {
    const p = this.player;
    if (this.mode === 'creative' || n <= 0 || p.health <= 0) return;
    const mult = { peaceful: 0.5, easy: 0.75, normal: 1, hard: 1.5 }[this.difficulty] || 1;
    p.health = Math.max(0, p.health - Math.max(1, Math.round(n * mult)));
    p.exhaustion += 0.1;
    Sound.hurt();
    const f = document.getElementById('hurt-flash');
    f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 120);
    this.camShake = 0.25;
    this.hudDirty = true;
    if (p.health <= 0) {
      this.deathCause = cause;
      this.breaking = false;
      UI.showDeath(cause, p.level);
    }
  }

  respawn() {
    const p = this.player;
    const s = p.spawn;
    p.pos.set(s.x + 0.5, this.world.surfaceHeight(s.x, s.z) + 1.01, s.z + 0.5);
    if (!this.world.getChunk(Math.floor(s.x / CS), Math.floor(s.z / CS))) p.pos.y = 80;
    p.vel.set(0, 0, 0);
    p.health = 20; p.food = 20; p.exhaustion = 0; p.fallStart = null;
    this.hudDirty = true;
  }

  // ---------------- physics ----------------
  collides(x, y, z) {
    const w = this.world;
    const x0 = Math.floor(x - PLAYER_W), x1 = Math.floor(x + PLAYER_W - 1e-6);
    const y0 = Math.floor(y), y1 = Math.floor(y + (this.player.sneaking ? 1.5 : PLAYER_H) - 1e-6);
    const z0 = Math.floor(z - PLAYER_W), z1 = Math.floor(z + PLAYER_W - 1e-6);
    for (let bx = x0; bx <= x1; bx++) for (let by = y0; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) {
      const b = w.getBlock(bx, by, bz);
      if (b < 0 || IS_SOLID[b]) return true;
    }
    return false;
  }

  hasSupport(x, y, z) {
    const w = this.world;
    const by = Math.floor(y - 0.05);
    for (const [ox, oz] of [[-PLAYER_W, -PLAYER_W], [PLAYER_W - 1e-3, -PLAYER_W], [-PLAYER_W, PLAYER_W - 1e-3], [PLAYER_W - 1e-3, PLAYER_W - 1e-3]]) {
      const b = w.getBlock(Math.floor(x + ox), by, Math.floor(z + oz));
      if (b < 0 || IS_SOLID[b]) return true;
    }
    return false;
  }

  moveAxis(axis, d) {
    const p = this.player, pos = p.pos;
    const old = pos[axis];
    pos[axis] += d;
    if (axis !== 'y' && p.sneaking && p.onGround && !p.flying && !this.hasSupport(pos.x, pos.y, pos.z)) {
      pos[axis] = old; p.vel[axis] = 0; return false;
    }
    if (!this.collides(pos.x, pos.y, pos.z)) return false;
    if (axis === 'y') {
      if (d < 0) { pos.y = Math.floor(pos.y) + 1; p.onGround = true; }
      else pos.y = Math.floor(pos.y + PLAYER_H) - PLAYER_H - 1e-4;
      if (this.collides(pos.x, pos.y, pos.z)) pos.y = old;
    } else {
      if (d > 0) pos[axis] = Math.floor(pos[axis] + PLAYER_W) - PLAYER_W - 1e-4;
      else pos[axis] = Math.floor(pos[axis] - PLAYER_W) + 1 + PLAYER_W + 1e-4;
      if (this.collides(pos.x, pos.y, pos.z)) pos[axis] = old;
    }
    p.vel[axis] = 0;
    return true;
  }

  updatePlayer(dt) {
    const p = this.player, inp = this.input, k = inp.keys;
    const w = this.world;
    // Wait until the chunk under the player exists
    if (!w.getChunk(Math.floor(p.pos.x / CS), Math.floor(p.pos.z / CS))) return;

    let fx = inp.touchX + (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    let fz = inp.touchZ + (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }
    const jump = inp.jump || k.Space;
    p.sneaking = !p.flying && (inp.sneak || k.ShiftLeft || k.ShiftRight);
    const sprint = (inp.sprint || k.ControlLeft) && fz > 0 && !p.sneaking && (this.mode === 'creative' || p.food > 6);

    const feet = w.getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y + 0.2), Math.floor(p.pos.z));
    const head = w.getBlock(Math.floor(p.pos.x), Math.floor(this.camera.position.y), Math.floor(p.pos.z));
    const wasInWater = p.inWater;
    p.inWater = feet === B.WATER;
    p.headInWater = head === B.WATER;
    if (p.inWater && !wasInWater && p.vel.y < -6) Sound.splash();

    let speed = p.flying ? (sprint ? 21 : 10.9) : sprint ? 5.6 : 4.3;
    if (p.sneaking) speed = 1.3;
    if (p.inWater && !p.flying) speed *= 0.55;

    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    const wx = (-sin * fz + cos * fx) * speed, wz = (-cos * fz - sin * fx) * speed;
    const accel = p.onGround || p.flying ? 14 : 4;
    p.vel.x += (wx - p.vel.x) * Math.min(1, accel * dt);
    p.vel.z += (wz - p.vel.z) * Math.min(1, accel * dt);

    if (p.flying) {
      const up = (jump ? 1 : 0) - (inp.flyDown || k.ShiftLeft ? 1 : 0);
      p.vel.y += (up * 8 - p.vel.y) * Math.min(1, 10 * dt);
    } else if (p.inWater) {
      p.vel.y -= GRAVITY * 0.25 * dt;
      if (jump) p.vel.y = Math.min(p.vel.y + 30 * dt, 3.2);
      p.vel.y = Math.max(p.vel.y, -3.5);
    } else {
      p.vel.y -= GRAVITY * dt;
      p.vel.y = Math.max(p.vel.y, -60);
      if (jump && p.onGround) { p.vel.y = JUMP_V; p.onGround = false; p.exhaustion += sprint ? 0.2 : 0.05; }
    }

    // integrate with sub-steps to avoid tunnelling
    const steps = Math.ceil(Math.max(Math.abs(p.vel.x), Math.abs(p.vel.y), Math.abs(p.vel.z)) * dt / 0.35) || 1;
    const sdt = dt / steps;
    const wasGround = p.onGround;
    p.onGround = false;
    let blockedH = false;
    const ox = p.pos.x, oz = p.pos.z;
    for (let i = 0; i < steps; i++) {
      this.moveAxis('y', p.vel.y * sdt);
      if (this.moveAxis('x', p.vel.x * sdt)) blockedH = true;
      if (this.moveAxis('z', p.vel.z * sdt)) blockedH = true;
    }
    // Auto-jump onto 1-block ledges while walking (mobile convenience)
    if (blockedH && wasGround && !p.flying && Settings.data.autoJump && (fx || fz) && !p.sneaking) {
      const dx = Math.sign(wx) * 0.4, dz = Math.sign(wz) * 0.4;
      if (!this.collides(p.pos.x + dx, p.pos.y + 1.05, p.pos.z + dz)) { p.vel.y = JUMP_V; }
    }
    if (p.flying && p.onGround && this.mode === 'creative' && p.vel.y <= 0 && !jump) { p.flying = false; this.updateFlyButtons(); }
    if (this.mode !== 'creative' && p.flying) { p.flying = false; this.updateFlyButtons(); }

    // fall damage
    if (!p.onGround && !p.inWater && !p.flying) {
      if (p.fallStart === null || p.vel.y > 0) p.fallStart = Math.max(p.fallStart ?? -Infinity, p.pos.y);
    }
    if (p.onGround || p.inWater || p.flying) {
      if (p.fallStart !== null && p.onGround && !p.inWater) {
        const dist = p.fallStart - p.pos.y;
        if (dist > 3.5) this.damage(Math.floor(dist - 3), 'fell from a high place');
        if (dist > 1) Sound.step(this.blockSoundUnder());
      }
      p.fallStart = null;
    }
    if (p.pos.y < -20) { this.damage(4, 'fell out of the world'); if (this.mode === 'creative') { p.pos.y = 90; p.vel.y = 0; } }

    // cactus contact
    p.cactusTimer -= dt;
    if (p.cactusTimer <= 0 && this.touchingBlock(B.CACTUS)) { this.damage(1, 'was pricked to death'); p.cactusTimer = 0.5; }

    // footsteps, bobbing & exhaustion
    const moved = Math.hypot(p.pos.x - ox, p.pos.z - oz);
    if (p.onGround) {
      p.stepAcc += moved;
      if (p.stepAcc > 1.7) { p.stepAcc = 0; Sound.step(this.blockSoundUnder()); }
      p.bob += moved * 2.1;
    }
    p.exhaustion += moved * (sprint ? 0.1 : 0.01);
    this.sprinting = sprint && moved > 0;
  }

  touchingBlock(id) {
    const p = this.player.pos, w = this.world;
    for (let x = Math.floor(p.x - PLAYER_W - 0.05); x <= Math.floor(p.x + PLAYER_W + 0.05); x++)
      for (let y = Math.floor(p.y - 0.05); y <= Math.floor(p.y + PLAYER_H); y++)
        for (let z = Math.floor(p.z - PLAYER_W - 0.05); z <= Math.floor(p.z + PLAYER_W + 0.05); z++)
          if (w.getBlock(x, y, z) === id) return true;
    return false;
  }

  blockSoundUnder() {
    const p = this.player.pos;
    const b = this.world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.1), Math.floor(p.z));
    return (BLOCKS[b] && BLOCKS[b].sound) || 'stone';
  }

  updateSurvival(dt) {
    const p = this.player;
    if (this.mode !== 'survival' || p.health <= 0) return;
    const peaceful = this.difficulty === 'peaceful';
    p.exhaustion += dt * 0.012;
    if (p.exhaustion >= 4) {
      p.exhaustion -= 4;
      if (!peaceful && p.food > 0) { p.food--; this.hudDirty = true; }
    }
    p.regenTimer += dt;
    if (p.health < 20 && (p.food >= 18 || peaceful) && p.regenTimer >= (peaceful ? 1 : 4)) {
      p.regenTimer = 0; p.health++; p.exhaustion += 3; this.hudDirty = true;
    }
    if (p.food <= 0) {
      p.starveTimer += dt;
      const floor = { easy: 10, normal: 1, hard: 0 }[this.difficulty] ?? 1;
      if (p.starveTimer >= 4) { p.starveTimer = 0; if (p.health > floor) this.damage(1, 'starved to death'); }
    }
  }

  updateBreaking(dt) {
    this.breakCooldown = Math.max(0, (this.breakCooldown || 0) - dt);
    const t = this.target;
    if (!this.breaking || !t) { this.breakProgress = 0; this.breakKey = null; this.crack.visible = false; return; }
    const key = t.x + ',' + t.y + ',' + t.z;
    if (key !== this.breakKey) { this.breakKey = key; this.breakProgress = 0; }
    this.swing = Math.max(this.swing, 0.01);
    if (this.mode === 'creative') {
      if (this.breakCooldown <= 0) { this.breakBlock(t); this.breakCooldown = 0.28; this.breakKey = null; }
      this.crack.visible = false;
      return;
    }
    if (this.breakCooldown > 0) return;
    const hardness = BLOCKS[t.id].hardness;
    if (!isFinite(hardness)) { this.crack.visible = false; return; }
    this.breakProgress += dt / hardness;
    this.digSoundT = (this.digSoundT || 0) - dt;
    if (this.digSoundT <= 0) { Sound.dig(BLOCKS[t.id].sound); this.digSoundT = 0.25; this.spawnParticles(t.x + 0.5 + t.nx * 0.5, t.y + 0.5 + t.ny * 0.5, t.z + 0.5 + t.nz * 0.5, BLOCKS[t.id].tex[2], 2); }
    if (this.breakProgress >= 1) {
      this.breakBlock(t);
      this.breakProgress = 0; this.breakKey = null; this.breakCooldown = 0.15;
      this.crack.visible = false;
      return;
    }
    this.crack.visible = true;
    this.crack.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
    this.crackTex.offset.x = Math.min(9, Math.floor(this.breakProgress * 10)) / 10;
  }

  updateTNT(dt) {
    for (let i = this.tnts.length - 1; i >= 0; i--) {
      const t = this.tnts[i];
      t.t -= dt;
      // fall if unsupported
      const below = this.world.getBlock(Math.floor(t.mesh.position.x), Math.floor(t.mesh.position.y - 0.51), Math.floor(t.mesh.position.z));
      if (below === B.AIR || below === B.WATER) { t.vy -= GRAVITY * dt; t.mesh.position.y += t.vy * dt; } else { t.vy = 0; t.mesh.position.y = Math.floor(t.mesh.position.y - 0.5) + 0.5; }
      const flash = Math.floor(t.t * 6) % 2 === 0;
      t.mesh.material.color.setScalar(flash ? 2.2 : 1);
      t.mesh.scale.setScalar(t.t < 0.3 ? 1 + (0.3 - t.t) * 0.6 : 1);
      if (t.t <= 0) {
        this.scene.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.dispose();
        this.tnts.splice(i, 1);
        this.explode(t.mesh.position.x, t.mesh.position.y, t.mesh.position.z);
      }
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) { this.scene.remove(pt.mesh); this.particles.splice(i, 1); continue; }
      pt.vel.y -= 16 * dt;
      pt.mesh.position.addScaledVector(pt.vel, dt);
      const b = this.world && this.world.getBlock(Math.floor(pt.mesh.position.x), Math.floor(pt.mesh.position.y), Math.floor(pt.mesh.position.z));
      if (b > 0 && IS_SOLID[b]) { pt.mesh.position.addScaledVector(pt.vel, -dt); pt.vel.set(0, 0, 0); }
    }
  }

  // ---------------- sky ----------------
  updateSky(dt, center) {
    if (this.state === 'play' && !this.paused) this.time = (this.time + dt / 1200) % 1;
    const a = this.time * Math.PI * 2;
    const sh = Math.sin(a);
    const day = Math.max(0, Math.min(1, sh * 2.5 + 0.35));
    this.daylight = 0.22 + 0.78 * day;
    const dayC = new THREE.Color(0x8db7ff), night = new THREE.Color(0x070a16), dusk = new THREE.Color(0xe08a4a);
    const sky = night.clone().lerp(dayC, day);
    const duskAmt = Math.max(0, 1 - Math.abs(sh) * 4) * (Math.cos(a) > -2 ? 0.55 : 0);
    sky.lerp(dusk, duskAmt * day);
    let fog = sky.clone();
    const p = this.player;
    if (this.state === 'play' && p.headInWater) {
      fog = new THREE.Color(0x1d3c8a).multiplyScalar(this.daylight);
      this.scene.fog.near = 0.5; this.scene.fog.far = 18;
    } else {
      const R = Settings.data.renderDistance * CS;
      this.scene.fog.near = R * 0.5; this.scene.fog.far = R * 0.95;
    }
    this.renderer.setClearColor(fog);
    this.scene.fog.color.copy(fog);
    this.mat.color.setScalar(this.daylight);
    this.waterMat.color.setScalar(this.daylight);
    this.handMatBlock.color.setScalar(Math.max(0.5, this.daylight));
    this.armMesh.material.color.setScalar(Math.max(0.5, this.daylight));

    const dir = new THREE.Vector3(Math.cos(a), sh, 0.25).normalize();
    this.sun.position.copy(center).addScaledVector(dir, 400);
    this.sun.lookAt(center);
    this.moon.position.copy(center).addScaledVector(dir, -400);
    this.moon.lookAt(center);
    this.stars.position.copy(center);
    this.stars.material.opacity = Math.max(0, 1 - day * 1.6);
    this.stars.visible = this.stars.material.opacity > 0.01;
    this.clouds.material.color.setScalar(0.3 + 0.7 * day);
    this.clouds.position.x = center.x; this.clouds.position.z = center.z;
    this.cloudTex.offset.set(center.x / 768 + performance.now() / 600000, -center.z / 768);
  }

  // ---------------- main loop ----------------
  loop(now) {
    requestAnimationFrame(t => this.loop(t));
    let dt = (now - this.clock) / 1000;
    this.clock = now;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) return;
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsFrames / this.fpsAcc); this.fpsAcc = 0; this.fpsFrames = 0; }

    if (this.state === 'menu' && this.world) {
      this.panoYaw += dt * 0.04;
      this.camera.rotation.set(-0.12, this.panoYaw, 0);
      this.streamChunks(this.camera.position.x, this.camera.position.z, Math.min(5, Settings.data.renderDistance + 1), 1, 1);
      this.updateSky(dt, this.camera.position);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.state !== 'play') return;

    const p = this.player;
    if (!this.paused && p.health > 0) {
      let rem = dt;
      while (rem > 0) { const s = Math.min(rem, 1 / 30); this.updatePlayer(s); rem -= s; }
      this.updateSurvival(dt);
    }
    this.streamChunks(p.pos.x, p.pos.z, Settings.data.renderDistance, 1, 2);

    // camera
    const sneakDrop = p.sneaking ? 0.17 : 0;
    this.camera.position.set(p.pos.x, p.pos.y + EYE - sneakDrop, p.pos.z);
    let bobY = 0, bobX = 0;
    if (Settings.data.bobbing && p.onGround) { bobY = Math.abs(Math.sin(p.bob)) * 0.06; bobX = Math.cos(p.bob) * 0.03; }
    this.camera.position.y += bobY;
    this.camShake = Math.max(0, (this.camShake || 0) - dt);
    this.shake = Math.max(0, (this.shake || 0) - dt);
    const shake = this.camShake * 0.15 + this.shake * 0.3;
    this.camera.rotation.set(p.pitch + (Math.random() - 0.5) * shake, p.yaw + (Math.random() - 0.5) * shake, (this.camShake > 0 ? Math.sin(this.camShake * 40) * 0.05 : 0) + bobX * 0.3);
    const targetFov = Settings.data.fov * (this.sprinting ? 1.12 : 1);
    if (Math.abs(this.camera.fov - targetFov) > 0.1) { this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10); this.camera.updateProjectionMatrix(); }

    if (!this.paused) {
      this.updateTarget();
      this.updateBreaking(dt);
      this.updateTNT(dt);
    }
    this.updateParticles(dt);
    this.updateSky(dt, this.camera.position);

    // held item animation
    this.setHandItem(this.heldId());
    if (this.swing > 0) { this.swing += dt * 4; if (this.swing >= 1) this.swing = this.breaking ? 0.01 : 0; }
    this.handDip = Math.max(0, this.handDip - dt * 5);
    const sw = Math.sin(this.swing * Math.PI);
    this.handGroup.position.set(-sw * 0.25 + bobX * 0.6, sw * 0.12 - this.handDip * 0.4 - bobY * 0.5, -sw * 0.15);
    this.handGroup.rotation.set(-sw * 0.7, sw * 0.4, sw * 0.2);

    document.getElementById('underwater').classList.toggle('hidden', !p.headInWater);

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.handScene, this.handCam);

    if (this.thumbPending) { this.thumbPending = false; this.captureThumb(); }
    if (!this.paused && performance.now() - this.lastSave > 30000) { this.save(); }
    UI.updateHud();
  }

  captureThumb() {
    try {
      const c = document.createElement('canvas');
      c.width = 160; c.height = 96;
      const ctx = c.getContext('2d');
      const src = this.canvas;
      const ar = src.width / src.height, tar = c.width / c.height;
      let sw = src.width, sh = src.height, sx = 0, sy = 0;
      if (ar > tar) { sw = sh * tar; sx = (src.width - sw) / 2; } else { sh = sw / tar; sy = (src.height - sh) / 2; }
      ctx.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
      this.meta.thumb = c.toDataURL('image/jpeg', 0.7);
    } catch (e) { /* thumbnail is optional */ }
  }
}
