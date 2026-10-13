// Menus, HUD, inventory, settings and chat.
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const UI = {
  current: 'title',
  settingsFrom: 'title',
  howtoFrom: 'title',
  invPicked: null,
  creativeTab: 0,
  hudCache: {},

  init() {
    Settings.load();
    this.game = new Game();
    const atlas = this.game.atlas.canvas;
    document.documentElement.style.setProperty('--dirt', `url(${tileDataURL(atlas, TEX.dirt, 4, 0.55)})`);
    drawLogo($('#logo'), atlas);
    $('#splash').textContent = SPLASHES[(Math.random() * SPLASHES.length) | 0];

    this.buildHotbar();
    this.bindActions();
    this.bindCreateForm();
    this.bindChat();
    this.game.startPanorama();
    this.show('title');

    document.addEventListener('pointerdown', () => Sound.unlock(), { capture: true });
    document.addEventListener('touchstart', () => Sound.unlock(), { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game.state === 'play') { if (!this.game.paused) this.pause(); else this.game.save(); }
    });
    window.addEventListener('pagehide', () => this.game.save());
    $('#import-file').addEventListener('change', e => this.importWorld(e.target.files[0]));
  },

  show(name) {
    const map = {
      title: '#screen-title', worlds: '#screen-worlds', create: '#screen-create', settings: '#screen-settings',
      howto: '#screen-howto', loading: '#screen-loading', pause: '#screen-pause', inventory: '#screen-inventory',
      death: '#screen-death', chat: '#screen-chat',
    };
    for (const k in map) $(map[k]).classList.toggle('hidden', k !== name);
    this.current = name;
    const inGame = this.game.state === 'play';
    $('#hud').classList.toggle('hidden', !inGame);
    // hide touch controls behind overlays
    $$('.touch-ctl').forEach(el => { el.style.visibility = name === 'hud' ? '' : 'hidden'; });
  },

  bindActions() {
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      Sound.click();
      const a = el.dataset.action;
      switch (a) {
        case 'play': this.renderWorlds(); this.show('worlds'); break;
        case 'settings':
          this.settingsFrom = this.current; this.renderSettings('video'); this.show('settings'); break;
        case 'settings-back': Settings.save(); this.show(this.settingsFrom); break;
        case 'howto': this.howtoFrom = this.current; this.show('howto'); break;
        case 'fullscreen': this.fullscreen(); break;
        case 'back':
          if (this.current === 'create') { this.renderWorlds(); this.show('worlds'); }
          else if (this.current === 'howto') this.show(this.howtoFrom);
          else this.show('title');
          break;
        case 'soon': this.toast('Multiplayer is not available yet'); break;
        case 'create-new': this.resetCreateForm(); this.show('create'); break;
        case 'create-world': this.createWorld(); break;
        case 'import': $('#import-file').click(); break;
        case 'resume': this.resume(); break;
        case 'export': this.exportWorld(); break;
        case 'save-quit': this.game.quitToTitle(); this.show('title'); break;
        case 'close-inv': this.closeInventory(); break;
        case 'respawn': this.game.respawn(); this.resume(); break;
        case 'close-chat': this.closeChat(); break;
      }
    });
    $('#btn-pause').addEventListener('click', () => { Sound.click(); this.pause(); });
    $('#btn-chat').addEventListener('click', () => { Sound.click(); this.openChat(''); });
    $('#settings-nav').addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (b) { Sound.click(); this.renderSettings(b.dataset.tab); }
    });
  },

  fullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    try {
      const p = req.call(el);
      if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
    } catch (e) { /* not allowed */ }
  },

  toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  },

  modal({ title, text, okText = 'OK', cancelText = 'Cancel', input = null, onOk }) {
    $('#modal-title').textContent = title;
    const p = $('#modal-text');
    p.textContent = text || '';
    let inp = null;
    if (input !== null) {
      inp = document.createElement('input');
      inp.className = 'mc-input'; inp.value = input; inp.maxLength = 32;
      p.appendChild(inp);
    }
    $('#modal-ok').textContent = okText;
    $('#modal-cancel').textContent = cancelText;
    $('#modal').classList.remove('hidden');
    const close = () => { $('#modal').classList.add('hidden'); $('#modal-ok').onclick = $('#modal-cancel').onclick = null; };
    $('#modal-ok').onclick = () => { Sound.click(); close(); onOk && onOk(inp ? inp.value : undefined); };
    $('#modal-cancel').onclick = () => { Sound.click(); close(); };
    if (inp) setTimeout(() => inp.focus(), 50);
  },

  isTyping() {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
  },

  // ---------------- worlds ----------------
  renderWorlds() {
    const list = Store.list();
    const box = $('#worlds-list');
    box.innerHTML = '';
    if (!list.length) {
      box.innerHTML = '<div class="worlds-empty">You have no worlds yet.<br>Tap <b>Create New</b> to start!</div>';
      return;
    }
    const fallbackThumb = tileDataURL(this.game.atlas.canvas, TEX.grass_side, 4);
    for (const w of list) {
      const card = document.createElement('div');
      card.className = 'world-card';
      const date = new Date(w.lastPlayed || w.created).toLocaleDateString();
      card.innerHTML = `
        <div class="world-thumb"></div>
        <div class="world-info">
          <div class="world-name"></div>
          <div class="world-meta">${date} &middot; ${w.mode === 'creative' ? 'Creative' : 'Survival'}${w.type === 'flat' ? ' &middot; Flat' : ''}</div>
        </div>
        <div class="world-actions">
          <button class="mc-btn" data-w="edit" title="Rename">&#9998;</button>
          <button class="mc-btn" data-w="del" title="Delete">&#128465;</button>
        </div>`;
      card.querySelector('.world-name').textContent = w.name;
      card.querySelector('.world-thumb').style.backgroundImage = `url(${w.thumb || fallbackThumb})`;
      card.addEventListener('click', e => {
        const b = e.target.closest('[data-w]');
        Sound.click();
        if (!b) return this.enterWorld(w);
        if (b.dataset.w === 'del') {
          this.modal({
            title: 'Delete World', text: `"${w.name}" will be lost forever! (A long time!)`, okText: 'Delete',
            onOk: () => { Store.remove(w.id); this.renderWorlds(); },
          });
        } else {
          this.modal({
            title: 'Rename World', input: w.name, okText: 'Save',
            onOk: v => { if (v && v.trim()) { w.name = v.trim(); Store.upsertMeta(w); this.renderWorlds(); } },
          });
        }
      });
      box.appendChild(card);
    }
  },

  bindCreateForm() {
    $$('.mc-seg').forEach(seg => seg.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      Sound.click();
      $$('button', seg).forEach(x => x.classList.toggle('active', x === b));
    }));
  },
  segValue(id) { const b = $(`#${id} .active`); return b ? b.dataset.v : null; },
  resetCreateForm() {
    const n = Store.list().length;
    $('#cw-name').value = n ? `My World (${n + 1})` : 'My World';
    $('#cw-seed').value = '';
  },

  createWorld() {
    const seedText = $('#cw-seed').value.trim();
    const seed = seedText ? seedFromString(seedText) : (Math.random() * 2147483647) | 0;
    const meta = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: $('#cw-name').value.trim() || 'My World',
      seed, mode: this.segValue('cw-mode'), difficulty: this.segValue('cw-diff'), type: this.segValue('cw-type'),
      created: Date.now(), lastPlayed: Date.now(),
    };
    try { Store.upsertMeta(meta); } catch (e) { this.toast('Storage is full'); return; }
    this.enterWorld(meta);
  },

  async enterWorld(meta) {
    if (this.game.isTouch) this.fullscreen();
    this.show('loading');
    $('#loading-title').textContent = 'Generating world';
    const tips = ['Building terrain', 'Planting trees', 'Carving caves', 'Filling oceans', 'Hiding diamonds'];
    let ti = 0;
    $('#loading-bar').style.width = '0%';
    await this.game.startWorld(meta, f => {
      $('#loading-bar').style.width = Math.round(f * 100) + '%';
      if (Math.random() < 0.08) $('#loading-tip').textContent = tips[ti++ % tips.length];
    });
    if (this.game.state !== 'play') return;
    this.hudCache = {};
    this.game.updateFlyButtons();
    $('#dpad .center').classList.remove('on');
    this.game.input.sneak = false;
    this.show('hud');
    $('#chat-log').innerHTML = '';
    this.showItemName(this.game.heldId());
  },

  exportWorld() {
    const g = this.game;
    g.save();
    const blob = new Blob([JSON.stringify({ format: 'blockcraft-world', version: 1, meta: g.meta, data: Store.load(g.meta.id) })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = g.meta.name.replace(/[^\w\- ]+/g, '_') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },

  importWorld(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const j = JSON.parse(r.result);
        if (j.format !== 'blockcraft-world' || !j.meta) throw new Error('bad file');
        const meta = { ...j.meta, id: Date.now().toString(36) + 'i', lastPlayed: Date.now() };
        Store.save(meta.id, j.data || {});
        Store.upsertMeta(meta);
        this.renderWorlds();
        this.toast('World imported!');
      } catch (e) { this.toast('That file is not a valid world'); }
    };
    r.readAsText(file);
    $('#import-file').value = '';
  },

  // ---------------- pause / death ----------------
  pause() {
    const g = this.game;
    if (g.state !== 'play') return;
    g.paused = true; g.breaking = false;
    g.thumbPending = true;
    document.exitPointerLock && document.pointerLockElement && document.exitPointerLock();
    this.show('pause');
    setTimeout(() => g.save(), 60);
  },
  resume() {
    const g = this.game;
    g.paused = false;
    g.clock = performance.now();
    this.show('hud');
    if (!g.isTouch && g.canvas.requestPointerLock) g.canvas.requestPointerLock();
  },
  showDeath(cause, level) {
    $('#death-msg').textContent = `Player ${cause}. Score: ${level}`;
    this.game.paused = true;
    document.exitPointerLock && document.pointerLockElement && document.exitPointerLock();
    this.show('death');
  },

  // ---------------- HUD ----------------
  buildHotbar() {
    const hb = $('#hotbar');
    hb.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.game.select(i); });
      hb.appendChild(s);
    }
    if (this.game.isTouch) {
      const more = document.createElement('div');
      more.className = 'slot more';
      more.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Sound.click(); this.openInventory(); });
      hb.appendChild(more);
    }
  },

  slotHTML(s) {
    if (!s) return '';
    const cnt = s.count > 1 && this.game.mode !== 'creative' ? `<span class="cnt">${s.count}</span>` : '';
    return `<img src="${Icons.block(s.id)}" alt="">${cnt}`;
  },

  updateHud() {
    const g = this.game, p = g.player;
    if (g.hudDirty) {
      g.hudDirty = false;
      $$('#hotbar .slot:not(.more)').forEach((el, i) => {
        el.classList.toggle('sel', i === g.selected);
        const s = g.inv[i];
        const key = s ? s.id + ':' + s.count : '';
        if (el.dataset.k !== key || this.hudCache.mode !== g.mode) { el.dataset.k = key; el.innerHTML = this.slotHTML(s); }
      });
      this.hudCache.mode = g.mode;
      const hk = p.health + '/' + p.food;
      if (this.hudCache.hk !== hk) {
        this.hudCache.hk = hk;
        let h = '', f = '';
        for (let i = 0; i < 10; i++) {
          const hv = p.health - i * 2, fv = p.food - i * 2;
          h += `<img src="${Icons.heart(hv >= 2 ? 'full' : hv === 1 ? 'half' : 'empty')}">`;
          f += `<img src="${Icons.food(fv >= 2 ? 'full' : fv === 1 ? 'half' : 'empty')}">`;
        }
        $('#hearts').innerHTML = h; $('#hunger').innerHTML = f;
      }
      $('#xpfill').style.width = (p.xp / (7 + p.level * 2) * 100) + '%';
      $('#xplevel').textContent = p.level > 0 ? p.level : '';
    }
    $('#hearts').classList.toggle('shake', p.health <= 4 && Math.random() < 0.3);
    $('#hunger').classList.toggle('shake', p.food <= 0 && Math.random() < 0.3);

    const now = performance.now();
    if (now - (this.dbgT || 0) > 250) {
      this.dbgT = now;
      $('#debug-info').textContent = Settings.data.coords
        ? `Position: ${Math.floor(p.pos.x)}, ${Math.floor(p.pos.y)}, ${Math.floor(p.pos.z)}\n${g.fps} fps  Chunks: ${g.world.chunks.size}`
        : '';
      // fade old chat lines
      $$('#chat-log .chat-line').forEach(l => {
        const age = now - +l.dataset.t;
        if (age > 8000) l.style.opacity = '0';
        if (age > 9500) l.remove();
      });
    }
  },

  showItemName(id) {
    const el = $('#item-name');
    el.textContent = id ? itemName(id) : '';
    el.classList.add('show');
    clearTimeout(this.nameTimer);
    this.nameTimer = setTimeout(() => el.classList.remove('show'), 1500);
  },

  // ---------------- inventory ----------------
  openInventory(crafting) {
    const g = this.game;
    if (g.state !== 'play' || g.player.health <= 0) return;
    g.paused = true; g.breaking = false;
    this.invPicked = null;
    $('#inv-title').textContent = g.mode === 'creative' ? 'Creative Inventory' : crafting ? 'Crafting' : 'Inventory';
    this.renderInventory();
    this.show('inventory');
  },
  closeInventory() {
    this.game.hudDirty = true;
    this.resume();
  },

  islot(s, extraClass = '') {
    const d = document.createElement('div');
    d.className = 'islot ' + extraClass;
    d.innerHTML = this.slotHTML(s);
    return d;
  },

  renderInventory() {
    const g = this.game;
    const body = $('#inv-body');
    body.innerHTML = '';
    if (g.mode === 'creative') {
      const col = document.createElement('div');
      col.className = 'inv-col grow';
      const tabs = document.createElement('div');
      tabs.className = 'inv-tabs';
      CREATIVE_TABS.forEach((t, i) => {
        const b = document.createElement('button');
        b.className = 'inv-tab' + (i === this.creativeTab ? ' active' : '');
        b.title = t.name;
        b.innerHTML = `<img src="${Icons.block(t.icon)}" alt="">`;
        b.onclick = () => { Sound.click(); this.creativeTab = i; this.renderInventory(); };
        tabs.appendChild(b);
      });
      col.appendChild(tabs);
      const lbl = document.createElement('div');
      lbl.className = 'inv-label'; lbl.textContent = CREATIVE_TABS[this.creativeTab].name;
      col.appendChild(lbl);
      const grid = document.createElement('div');
      grid.className = 'inv-grid scroll';
      const items = CREATIVE_TABS[this.creativeTab].items;
      const n = Math.max(27, Math.ceil(items.length / 9) * 9);
      for (let i = 0; i < n; i++) {
        const id = items[i];
        const el = this.islot(id ? { id, count: 1 } : null);
        if (id) el.onclick = () => {
          Sound.pop();
          // Put in the first empty hotbar slot, otherwise replace the selected one
          let slot = g.inv.slice(0, 9).findIndex(s => s && s.id === id);
          if (slot < 0) slot = g.inv.slice(0, 9).findIndex(s => !s);
          if (slot < 0) slot = g.selected;
          g.inv[slot] = { id, count: 1 };
          g.selected = slot;
          g.hudDirty = true;
          this.renderInventory();
        };
        grid.appendChild(el);
      }
      col.appendChild(grid);
      const hl = document.createElement('div');
      hl.className = 'inv-label'; hl.textContent = 'Hotbar (tap the selected slot again to clear it)';
      col.appendChild(hl);
      const hot = document.createElement('div');
      hot.className = 'inv-grid inv-hotbar';
      for (let i = 0; i < 9; i++) {
        const el = this.islot(g.inv[i], i === g.selected ? 'sel' : '');
        el.onclick = () => {
          Sound.click();
          if (i === g.selected) g.inv[i] = null;
          g.selected = i; g.hudDirty = true; this.renderInventory();
        };
        hot.appendChild(el);
      }
      col.appendChild(hot);
      body.appendChild(col);
      return;
    }

    // Survival: storage + hotbar + crafting list
    const col = document.createElement('div');
    col.className = 'inv-col grow';
    const mkLabel = t => { const l = document.createElement('div'); l.className = 'inv-label'; l.textContent = t; return l; };
    col.appendChild(mkLabel('Inventory'));
    const main = document.createElement('div');
    main.className = 'inv-grid';
    const hot = document.createElement('div');
    hot.className = 'inv-grid inv-hotbar';
    const slotClick = i => () => {
      const inv = g.inv;
      if (this.invPicked === null) {
        if (inv[i]) { this.invPicked = i; Sound.click(); }
        else if (i < 9) { g.selected = i; }
      } else {
        const a = this.invPicked;
        if (a !== i) {
          if (inv[i] && inv[a] && inv[i].id === inv[a].id) {
            const k = Math.min(inv[a].count, 64 - inv[i].count);
            inv[i].count += k; inv[a].count -= k;
            if (!inv[a].count) inv[a] = null;
          } else { const t = inv[i]; inv[i] = inv[a]; inv[a] = t; }
          Sound.pop();
        }
        this.invPicked = null;
      }
      g.hudDirty = true;
      this.renderInventory();
    };
    for (let i = 9; i < 36; i++) {
      const el = this.islot(g.inv[i], this.invPicked === i ? 'picked' : '');
      el.onclick = slotClick(i);
      main.appendChild(el);
    }
    for (let i = 0; i < 9; i++) {
      const el = this.islot(g.inv[i], (this.invPicked === i ? 'picked ' : '') + (i === g.selected ? 'sel' : ''));
      el.onclick = slotClick(i);
      hot.appendChild(el);
    }
    col.appendChild(main);
    col.appendChild(hot);
    body.appendChild(col);

    const rc = document.createElement('div');
    rc.className = 'inv-col';
    rc.appendChild(mkLabel('Crafting'));
    const list = document.createElement('div');
    list.className = 'recipe-list';
    for (const r of RECIPES) {
      const can = r.ing.every(([id, n]) => g.countItem(id) >= n);
      const row = document.createElement('div');
      row.className = 'recipe' + (can ? ' can' : '');
      const ri = (id, n) => `<span class="ri"><img src="${Icons.block(id)}" alt="">${n > 1 ? `<span class="cnt">${n}</span>` : ''}</span>`;
      row.innerHTML = r.ing.map(([id, n]) => ri(id, n)).join('') + '<span class="arrow">&rarr;</span>' + ri(r.out[0], r.out[1]) +
        `<span class="rname"></span><button class="mc-btn"${can ? '' : ' disabled'}>Craft</button>`;
      row.querySelector('.rname').textContent = itemName(r.out[0]);
      row.querySelector('button').onclick = () => {
        if (!r.ing.every(([id, n]) => g.countItem(id) >= n)) return;
        r.ing.forEach(([id, n]) => g.removeItem(id, n));
        if (!g.addItem(r.out[0], r.out[1])) this.toast('Inventory full');
        Sound.pop();
        this.renderInventory();
      };
      list.appendChild(row);
    }
    rc.appendChild(list);
    body.appendChild(rc);
  },

  // ---------------- settings ----------------
  renderSettings(tab) {
    $$('#settings-nav [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const box = $('#settings-content');
    box.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'mc-panel';
    box.appendChild(panel);
    const s = Settings.data;
    const apply = () => { Settings.save(); this.game.applySettings(); };
    const heading = t => { const h = document.createElement('h2'); h.textContent = t; panel.appendChild(h); };
    const slider = (label, key, min, max, step, fmt = v => v) => {
      const row = document.createElement('div');
      row.className = 'set-row';
      row.innerHTML = `<span class="lbl"></span><input type="range" class="mc-range" min="${min}" max="${max}" step="${step}"><span class="val"></span>`;
      row.querySelector('.lbl').textContent = label;
      const r = row.querySelector('input'), v = row.querySelector('.val');
      r.value = s[key]; v.textContent = fmt(s[key]);
      r.addEventListener('input', () => { s[key] = parseFloat(r.value); v.textContent = fmt(s[key]); apply(); });
      r.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
      panel.appendChild(row);
    };
    const toggle = (label, key) => {
      const row = document.createElement('div');
      row.className = 'set-row';
      row.innerHTML = `<span class="lbl"></span><div class="mc-toggle${s[key] ? ' on' : ''}"></div>`;
      row.querySelector('.lbl').textContent = label;
      const t = row.querySelector('.mc-toggle');
      t.onclick = () => { Sound.click(); s[key] = !s[key]; t.classList.toggle('on', s[key]); apply(); };
      panel.appendChild(row);
    };
    const choice = (label, key, opts) => {
      const row = document.createElement('div');
      row.className = 'set-row';
      row.innerHTML = '<span class="lbl"></span><div class="mc-seg" style="width:50%;margin:0"></div>';
      row.querySelector('.lbl').textContent = label;
      const seg = row.querySelector('.mc-seg');
      for (const [v, name] of opts) {
        const b = document.createElement('button');
        b.textContent = name; b.className = s[key] === v ? 'active' : '';
        b.onclick = () => { Sound.click(); s[key] = v; $$('button', seg).forEach(x => x.classList.toggle('active', x === b)); apply(); };
        seg.appendChild(b);
      }
      panel.appendChild(row);
    };

    if (tab === 'video') {
      heading('Video');
      slider('Render Distance', 'renderDistance', 2, 8, 1, v => v + ' chunks');
      slider('Field of View', 'fov', 50, 110, 1);
      slider('GUI Scale', 'guiScale', 0.7, 1.4, 0.05, v => Math.round(v * 100) + '%');
      toggle('View Bobbing', 'bobbing');
      toggle('Render Clouds', 'clouds');
      toggle('High Resolution', 'hiRes');
      toggle('Show Coordinates', 'coords');
    } else if (tab === 'controls') {
      heading('Touch Controls');
      choice('Movement', 'controls', [['dpad', 'D-Pad'], ['joystick', 'Joystick']]);
      slider('Sensitivity', 'sensitivity', 0.3, 3, 0.05, v => Math.round(v * 100) + '%');
      toggle('Auto Jump', 'autoJump');
      toggle('Invert Y-Axis', 'invertY');
    } else if (tab === 'audio') {
      heading('Audio');
      toggle('Sound', 'sound');
      slider('Volume', 'volume', 0, 100, 1, v => v + '%');
    } else {
      heading('Storage');
      const worlds = Store.list();
      let bytes = 0;
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); bytes += (localStorage.getItem(k) || '').length * 2; }
      const p = document.createElement('p');
      p.style.fontSize = '17px';
      p.textContent = `${worlds.length} world(s) saved, using about ${(bytes / 1024).toFixed(0)} KB on this device. Install the game with "Add to Home Screen" from your browser menu to play full-screen and offline.`;
      panel.appendChild(p);
      const b = document.createElement('button');
      b.className = 'mc-btn';
      b.textContent = 'Delete All Worlds';
      b.disabled = this.game.state === 'play';
      b.onclick = () => this.modal({
        title: 'Delete All Worlds', text: 'Every saved world on this device will be removed.', okText: 'Delete',
        onOk: () => { for (const w of Store.list()) Store.remove(w.id); this.renderSettings('storage'); this.toast('All worlds deleted'); },
      });
      panel.appendChild(b);
    }
  },

  // ---------------- chat ----------------
  bindChat() {
    $('#chat-form').addEventListener('submit', e => {
      e.preventDefault();
      const v = $('#chat-input').value.trim();
      $('#chat-input').value = '';
      if (v) this.runChat(v);
      this.closeChat();
    });
  },
  openChat(prefix) {
    const g = this.game;
    if (g.state !== 'play') return;
    g.paused = true; g.breaking = false;
    this.show('chat');
    const inp = $('#chat-input');
    inp.value = prefix || '';
    setTimeout(() => inp.focus(), 30);
  },
  closeChat() {
    $('#chat-input').blur();
    this.resume();
  },
  chat(msg, color) {
    for (const box of [$('#chat-log'), $('#chat-hist')]) {
      const l = document.createElement('div');
      l.className = 'chat-line';
      l.dataset.t = performance.now();
      if (color) l.style.color = color;
      l.textContent = msg;
      box.appendChild(l);
      while (box.children.length > 40) box.firstChild.remove();
    }
  },
  runChat(text) {
    const g = this.game, p = g.player;
    if (!text.startsWith('/')) { this.chat('<Steve> ' + text); return; }
    const [cmd, ...args] = text.slice(1).split(/\s+/);
    const yellow = '#ffff55', red = '#ff5555';
    switch (cmd.toLowerCase()) {
      case 'help':
        this.chat('Commands: /time set <day|noon|night|midnight>, /gamemode <survival|creative>, /tp <x> <y> <z>, /give <block> [count], /seed, /spawnpoint, /kill, /clear', yellow);
        break;
      case 'time': {
        const v = { day: 0.05, noon: 0.25, sunset: 0.48, night: 0.55, midnight: 0.75, sunrise: 0.98 }[args[1]];
        const n = parseInt(args[1], 10);
        if (args[0] === 'set' && (v !== undefined || !isNaN(n))) { g.time = v !== undefined ? v : ((n / 24000) % 1); this.chat('Set the time', yellow); }
        else this.chat('Usage: /time set <day|noon|night|midnight|0-24000>', red);
        break;
      }
      case 'gamemode': case 'gm': {
        const m = { s: 'survival', survival: 'survival', 0: 'survival', c: 'creative', creative: 'creative', 1: 'creative' }[(args[0] || '').toLowerCase()];
        if (!m) { this.chat('Usage: /gamemode <survival|creative>', red); break; }
        g.mode = m;
        if (m === 'survival') p.flying = false;
        document.body.classList.toggle('creative', m === 'creative');
        g.updateFlyButtons(); g.hudDirty = true; this.hudCache = {};
        this.chat(`Set own game mode to ${m[0].toUpperCase() + m.slice(1)} Mode`, yellow);
        break;
      }
      case 'tp': {
        const v = args.map((a, i) => a.startsWith('~') ? (+a.slice(1) || 0) + p.pos.getComponent(i) : parseFloat(a));
        if (v.length !== 3 || v.some(isNaN)) { this.chat('Usage: /tp <x> <y> <z>', red); break; }
        p.pos.set(v[0], v[1], v[2]); p.vel.set(0, 0, 0); p.fallStart = null;
        this.chat(`Teleported to ${v.map(n => n.toFixed(1)).join(', ')}`, yellow);
        break;
      }
      case 'give': {
        const q = (args[0] || '').toLowerCase().replace(/_/g, ' ');
        const all = { ...BLOCKS, ...ITEMS };
        const id = Object.keys(all).find(k => all[k].name.toLowerCase() === q || all[k].name.toLowerCase().includes(q));
        if (!q || !id || +id === B.WATER) { this.chat('Unknown item. Try /give stone 64', red); break; }
        const n = Math.max(1, Math.min(640, parseInt(args[1], 10) || 1));
        if (g.mode === 'creative') g.pickBlock(+id); else g.addItem(+id, n);
        this.chat(`Gave ${n} [${all[id].name}] to Steve`, yellow);
        break;
      }
      case 'seed': this.chat(`Seed: [${g.meta.seed}]`, yellow); break;
      case 'spawnpoint':
        p.spawn = { x: Math.floor(p.pos.x), z: Math.floor(p.pos.z) };
        this.chat('Set spawn point', yellow); break;
      case 'kill':
        if (g.mode === 'creative') { g.respawn(); this.chat('Respawned', yellow); }
        else g.damage(1000, 'fell out of the world');
        break;
      case 'clear': g.inv.fill(null); g.hudDirty = true; this.chat('Cleared the inventory', yellow); break;
      default: this.chat(`Unknown command: ${cmd}. Type /help for help.`, red);
    }
  },
};

window.addEventListener('load', () => {
  UI.init();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
