(() => {
  'use strict';

  /* ================= 工具 ================= */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const TAU = Math.PI * 2;

  function pathPoly(ctx, x, y, r, n, rot) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = rot + i / n * TAU;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
  function line(ctx, x1, y1, x2, y2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function polyline(ctx, pts) {
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();
  }

  /* ================= 地图 ================= */
  const COLS = 16, ROWS = 10;
  const MAP = [
    '###########.....',
    '..........#.....',
    '..........#.....',
    '..##########....',
    '..#............',
    '..#............',
    '..#............',
    '..##############',
    '...............#',
    '...............#'
  ];

  function buildGridPath() {
    const start = [0, 0], end = [ROWS - 1, COLS - 1];
    const prev = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    const q = [start];
    prev[0][0] = [0, 0];
    while (q.length) {
      const [r, c] = q.shift();
      if (r === end[0] && c === end[1]) break;
      for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS || MAP[nr][nc] !== '#') continue;
        if (prev[nr][nc]) continue;
        prev[nr][nc] = [r, c];
        q.push([nr, nc]);
      }
    }
    const pts = [];
    let cur = end;
    while (cur) {
      pts.push({ c: cur[1] + .5, r: cur[0] + .5 });
      const p = prev[cur[0]][cur[1]];
      if (!p || (p[0] === cur[0] && p[1] === cur[1])) break;
      cur = p;
    }
    pts.reverse();
    return pts;
  }
  const PATH_GRID = buildGridPath();

  let pathPx = [], segLens = [], pathLen = 0, pathArrows = [];
  function rebuildPath(cell) {
    pathPx = PATH_GRID.map(p => ({ x: p.c * cell, y: p.r * cell }));
    segLens = [];
    pathLen = 0;
    for (let i = 1; i < pathPx.length; i++) {
      const s = dist(pathPx[i - 1].x, pathPx[i - 1].y, pathPx[i].x, pathPx[i].y);
      segLens.push(s);
      pathLen += s;
    }
    pathArrows = [];
    for (let d = cell * .8; d < pathLen - cell * .6; d += cell * 1.6) {
      const p = pointAt(d);
      pathArrows.push({ x: p.x, y: p.y, angle: p.angle });
    }
  }
  function pointAt(d) {
    if (d <= 0) return { x: pathPx[0].x, y: pathPx[0].y, angle: 0 };
    if (d >= pathLen) {
      const a = pathPx[pathPx.length - 1], b = pathPx[pathPx.length - 2];
      return { x: a.x, y: a.y, angle: Math.atan2(a.y - b.y, a.x - b.x) };
    }
    let rem = d;
    for (let i = 0; i < segLens.length; i++) {
      if (rem <= segLens[i]) {
        const a = pathPx[i], b = pathPx[i + 1], t = rem / segLens[i];
        return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), angle: Math.atan2(b.y - a.y, b.x - a.x) };
      }
      rem -= segLens[i];
    }
    const a = pathPx[pathPx.length - 1], b = pathPx[pathPx.length - 2];
    return { x: a.x, y: a.y, angle: Math.atan2(a.y - b.y, a.x - b.x) };
  }

  /* ================= 配置 ================= */
  const TOTAL_WAVES = 20;
  const LEVELS = {
    easy:   { name: '新兵', hpMul: .75, gold: 230, lives: 26 },
    normal: { name: '精英', hpMul: 1,   gold: 200, lives: 20 },
    hard:   { name: '王牌', hpMul: 1.5, gold: 170, lives: 15 }
  };
  const ENEMY_TYPES = {
    normal: { name: '突进者', hp: 46, speed: 74, reward: 7, r: 11, color: '#ff8a5c',
      role: '炮灰', tip: '数量多但很脆，加农炮溅射轻松清场。' },
    fast: { name: '穿梭者', hp: 27, speed: 152, reward: 9, r: 8, color: '#ffd166',
      role: '高速', tip: '跑得飞快、最容易漏怪，冰霜塔减速后交给激光塔处理。' },
    tank: { name: '重装者', hp: 180, speed: 44, reward: 16, r: 15, color: '#ff5d73',
      role: '重甲', tip: '血厚走得慢，狙击塔或电弧塔集火最划算。' },
    boss: { name: '虫巢母体', hp: 1150, speed: 31, reward: 130, r: 22, color: '#c56cff',
      role: 'BOSS', tip: '每 10 波出现，提前留金币升级狙击塔再开波。' }
  };
  const TOWER_TYPES = {
    cannon: { name: '加农炮', icon: '💥', key: '1', cost: 50,  color: '#ff9f43',
      role: '群伤主力', desc: '溅射清群，开局首选',
      tip: '万金油主力，打成群小怪最赚。开局先造 2 座撑场，中期优先升到 2 级。',
      levels: [
        { damage: 20, rate: 1.05, range: 125, splash: 48 },
        { damage: 32, rate: 1.20, range: 138, splash: 58 },
        { damage: 50, rate: 1.38, range: 152, splash: 70 }
      ] },
    frost: { name: '冰霜塔', icon: '❄️', key: '2', cost: 60, color: '#7fd7ff',
      role: '减速控场', desc: '减速留人，为输出争取时间',
      tip: '本身伤害低，但能让敌人停在火力范围内。遇到高速敌人（穿梭者）必造，和激光/加农搭配效果翻倍。',
      levels: [
        { damage: 4,  rate: 1.4, range: 108, splash: 52, slow: .42, slowDur: 1.7 },
        { damage: 6,  rate: 1.6, range: 120, splash: 62, slow: .34, slowDur: 2.2 },
        { damage: 9,  rate: 1.8, range: 134, splash: 74, slow: .26, slowDur: 2.8 }
      ] },
    laser: { name: '激光塔', icon: '🔆', key: '3', cost: 75, color: '#35e0ff',
      role: '高频单体', desc: '高频切割，持续输出',
      tip: '射速极快的单点输出，清落单敌人很快。中期补 1-2 座，配合冰霜塔覆盖整段航道。',
      levels: [
        { damage: 8,  rate: 6.5, range: 118 },
        { damage: 12, rate: 7.5, range: 132 },
        { damage: 18, rate: 8.5, range: 148 }
      ] },
    tesla: { name: '电弧塔', icon: '⚡', key: '4', cost: 110, color: '#c77dff',
      role: '连锁爆发', desc: '连锁闪电，克制扎堆小怪',
      tip: '闪电在敌人之间弹跳，打密集阵型收益极高。单体输出一般，别指望它单挑重装者。',
      levels: [
        { damage: 26, rate: 1.5, range: 120, chain: 3, chainDrop: .62 },
        { damage: 38, rate: 1.7, range: 132, chain: 4, chainDrop: .62 },
        { damage: 56, rate: 1.9, range: 146, chain: 5, chainDrop: .62 }
      ] },
    sniper: { name: '狙击塔', icon: '🎯', key: '5', cost: 130, color: '#b18cff',
      role: '远程斩杀', desc: '超远程重击，点名坦克/BOSS',
      tip: '一发入魂的高单点伤害。放中后段能提前点名高危目标，前期偏贵，中后期性价比极高。',
      levels: [
        { damage: 95,  rate: .55, range: 215 },
        { damage: 150, rate: .60, range: 235 },
        { damage: 240, rate: .66, range: 260 }
      ] }
  };

  function hpMulFor(wave) {
    return LEVELS[game.diff].hpMul * (1 + (wave - 1) * .13 + Math.pow(wave, 1.6) * .012);
  }

  /* ================= DOM ================= */
  const $ = s => document.querySelector(s);
  const canvas = $('#game'), ctx = canvas.getContext('2d');
  const ui = {
    gold: $('#gold'), lives: $('#lives'), wave: $('#wave'), enemies: $('#enemies'),
    waveBtn: $('#waveBtn'), toolbar: $('#toolbar'),
    towerPanel: $('#towerPanel'), tpName: $('#tpName'), tpLevel: $('#tpLevel'),
    tpDesc: $('#tpDesc'), tpStats: $('#tpStats'), tpTip: $('#tpTip'), tpUpgrade: $('#tpUpgrade'),
    tpSell: $('#tpSell'), tpClose: $('#tpClose'),
    speedBtn: $('#speedBtn'), pauseBtn: $('#pauseBtn'), soundBtn: $('#soundBtn'), hudGuideBtn: $('#hudGuideBtn'),
    pauseLabel: $('#pauseLabel'), toast: $('#toast'), hurt: $('#hurt'),
    startScreen: $('#startScreen'), startBtn: $('#startBtn'), diffBtns: document.querySelectorAll('.diff-btn'),
    bestRecord: $('#bestRecord'), guideBtn: $('#guideBtn'),
    guideScreen: $('#guideScreen'), guideTowers: $('#guideTowers'), guideEnemies: $('#guideEnemies'), guideClose: $('#guideClose'),
    overScreen: $('#gameOverScreen'), ovWave: $('#ovWave'), ovScore: $('#ovScore'), ovBest: $('#ovBest'),
    retryBtn: $('#retryBtn'), changeBtn: $('#changeBtn'),
    victoryScreen: $('#victoryScreen'), vWave: $('#vWave'), vScore: $('#vScore'), vBest: $('#vBest'),
    continueBtn: $('#continueBtn'), vRetryBtn: $('#vRetryBtn'), vChangeBtn: $('#vChangeBtn')
  };

  /* ================= 音频 ================= */
  const audio = {
    ctx: null,
    muted: (() => { try { return localStorage.getItem('galaxyDefenseMuted') === '1'; } catch (e) { return false; } })(),
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    tone(freq, end, dur, type, vol, delay) {
      if (this.muted || !this.ctx) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, end), t0 + dur);
      g.gain.setValueAtTime(vol || .06, t0);
      g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t0); o.stop(t0 + dur + .03);
    },
    noise(dur, vol, freq) {
      if (this.muted || !this.ctx) return;
      const c = this.ctx, len = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5);
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 900;
      const g = c.createGain(); g.gain.value = vol || .08;
      src.connect(f); f.connect(g); g.connect(c.destination); src.start();
    },
    shoot(kind) {
      switch (kind) {
        case 'cannon': this.tone(220, 70, .09, 'triangle', .07); break;
        case 'laser':  this.tone(1100, 2400, .05, 'sawtooth', .035); break;
        case 'frost':  this.tone(700, 320, .14, 'sine', .05); break;
        case 'tesla':  this.tone(180, 520, .09, 'square', .04); this.noise(.08, .02, 2600); break;
        case 'sniper': this.tone(520, 70, .18, 'sine', .09); break;
      }
    },
    boom() { this.noise(.22, .12, 900); this.tone(160, 45, .25, 'sine', .1); },
    death() { this.noise(.12, .06, 1400); this.tone(300, 90, .12, 'triangle', .05); },
    hurt() { this.tone(220, 80, .2, 'sawtooth', .09); },
    build() { this.tone(300, 600, .08, 'sine', .06); this.tone(600, 900, .06, 'sine', .05, .05); },
    sell() { this.tone(500, 240, .1, 'triangle', .05); },
    upgrade() { this.tone(400, 800, .09, 'sine', .06); this.tone(600, 1200, .09, 'sine', .06, .07); },
    wave() { this.tone(180, 360, .18, 'square', .05); this.tone(360, 720, .2, 'square', .04, .14); },
    bonus() { this.tone(660, 880, .12, 'sine', .05); },
    over() { this.tone(300, 60, .8, 'sawtooth', .08); },
    win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, .18, 'sine', .08, i * .15)); }
  };

  /* ================= 实体 ================= */
  class Enemy {
    constructor(type, wave) {
      const t = ENEMY_TYPES[type], mul = hpMulFor(wave), s = game.cell / 48;
      this.type = type;
      this.name = t.name;
      this.r = t.r * s;
      this.maxHp = Math.round(t.hp * mul);
      this.hp = this.maxHp;
      this.speed = t.speed * (1 + Math.min(.25, wave * .006)) * s;
      this.reward = t.reward;
      this.color = t.color;
      this.slowT = 0; this.slowF = 1;
      this.alive = true; this.escaped = false; this.flash = 0;
      this.dist = 0;
      const p = pointAt(0);
      this.x = p.x; this.y = p.y; this.angle = p.angle;
    }
    update(dt) {
      if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slowF = 1; }
      this.flash = Math.max(0, this.flash - dt * 6);
      this.dist += this.speed * this.slowF * dt;
      if (this.dist >= pathLen) { this.escaped = true; return; }
      const p = pointAt(this.dist);
      this.x = p.x; this.y = p.y; this.angle = p.angle;
    }
    render(ctx) {
      const r = this.r;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.lineWidth = Math.max(1.5, r * .12);
      if (this.slowT > 0) {
        ctx.beginPath(); ctx.arc(0, 0, r * 1.3, 0, TAU);
        ctx.fillStyle = 'rgba(155,232,255,.22)'; ctx.fill();
      }
      if (this.type === 'normal') {
        ctx.beginPath(); ctx.arc(0, 0, r * .85, 0, TAU);
        ctx.fillStyle = this.color; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(r * 1.05, 0); ctx.lineTo(r * .45, -r * .4); ctx.lineTo(r * .45, r * .4); ctx.closePath();
        ctx.fillStyle = '#ffe0d1'; ctx.fill();
        ctx.beginPath(); ctx.arc(-r * .2, 0, r * .5, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fill();
      } else if (this.type === 'fast') {
        ctx.beginPath();
        ctx.moveTo(r * 1.15, 0); ctx.lineTo(-r * .8, r * .7); ctx.lineTo(-r * .45, 0); ctx.lineTo(-r * .8, -r * .7);
        ctx.closePath();
        ctx.fillStyle = this.color; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.stroke();
      } else if (this.type === 'tank') {
        pathPoly(ctx, 0, 0, r, 6, Math.PI / 6);
        ctx.fillStyle = '#c04a5e'; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.stroke();
        pathPoly(ctx, 0, 0, r * .62, 6, Math.PI / 6);
        ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, r * .3, 0, TAU); ctx.fillStyle = this.color; ctx.fill();
      } else {
        pathPoly(ctx, 0, 0, r * 1.05, 5, -Math.PI / 2);
        ctx.fillStyle = this.color; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 2; ctx.stroke();
        const pr = r * .45 * (.8 + .2 * Math.sin(game.time * 6));
        ctx.beginPath(); ctx.arc(0, 0, pr, 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, r * 1.35, 0, TAU);
        ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.stroke();
      }
      if (this.flash > 0) {
        ctx.globalAlpha = Math.min(1, this.flash);
        ctx.beginPath(); ctx.arc(0, 0, r * .95, 0, TAU);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      if (this.hp < this.maxHp) {
        const w = r * 2.2, pct = Math.max(0, this.hp / this.maxHp);
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillRect(this.x - w / 2, this.y - r - 9, w, 4);
        ctx.fillStyle = pct > .5 ? '#4ade80' : pct > .25 ? '#facc15' : '#f87171';
        ctx.fillRect(this.x - w / 2, this.y - r - 9, w * pct, 4);
      }
    }
  }

  class Tower {
    constructor(c, r, type, g) {
      this.c = c; this.r = r; this.type = type; this.game = g;
      this.x = (c + .5) * g.cell;
      this.y = (r + .5) * g.cell;
      this.level = 0;
      this.cd = 0;
      this.angle = -Math.PI / 2;
      this.recoil = 0;
      this.spent = TOWER_TYPES[type].cost;
      this.pulse = Math.random() * TAU;
    }
    get def() { return TOWER_TYPES[this.type]; }
    get stats() { return this.def.levels[this.level]; }
    get range() { return this.stats.range * this.game.cellScale; }
    upgradeCost() { return Math.round(this.def.cost * .8 * (this.level + 1)); }
    sellValue() { return Math.round(this.spent * .7); }
    acquire() {
      let best = null, gd = -1;
      for (const e of this.game.enemies) {
        if (!e.alive) continue;
        if (dist(e.x, e.y, this.x, this.y) > this.range) continue;
        if (e.dist > gd) { gd = e.dist; best = e; }
      }
      return best;
    }
    update(dt, time) {
      this.cd -= dt;
      this.recoil = Math.max(0, this.recoil - dt * 4);
      this.pulse += dt;
      if (this.cd > 0) return;
      const st = this.stats, target = this.acquire();
      if (!target) return;
      this.angle = Math.atan2(target.y - this.y, target.x - this.x);
      this.cd = 1 / st.rate;
      this.fire(target, st);
    }
    fire(target, st) {
      const g = this.game;
      this.recoil = 1;
      switch (this.type) {
        case 'cannon':
          g.projectiles.push(new Projectile(this, target, st, 'cannon', g));
          g.audio.shoot('cannon');
          break;
        case 'laser':
          g.damageEnemy(target, st.damage);
          g.beams.push({ kind: 'laser', x1: this.x, y1: this.y, x2: target.x, y2: target.y, life: .12, total: .12 });
          g.audio.shoot('laser');
          break;
        case 'frost':
          g.projectiles.push(new Projectile(this, target, st, 'frost', g));
          g.audio.shoot('frost');
          break;
        case 'tesla': {
          g.audio.shoot('tesla');
          const segs = [];
          let dmg = st.damage, cur = target, hit = [];
          for (let i = 0; i < st.chain; i++) {
            if (!cur || !cur.alive) break;
            g.damageEnemy(cur, dmg);
            hit.push(cur);
            segs.push({ x1: this.x, y1: this.y, x2: cur.x, y2: cur.y });
            let nx = null, nd = Infinity;
            for (const e of g.enemies) {
              if (!e.alive || hit.indexOf(e) >= 0) continue;
              const dd = dist(e.x, e.y, cur.x, cur.y);
              if (dd < nd) { nd = dd; nx = e; }
            }
            dmg *= st.chainDrop;
            cur = nx;
          }
          if (segs.length) g.beams.push({ kind: 'tesla', segs, life: .16, total: .16 });
          break;
        }
        case 'sniper':
          g.projectiles.push(new Projectile(this, target, st, 'sniper', g));
          g.audio.shoot('sniper');
          break;
      }
    }
    render(ctx) {
      const cell = this.game.cell, x = this.x, y = this.y;
      const col = this.def.color;
      ctx.beginPath(); ctx.arc(x, y, cell * .42, 0, TAU);
      ctx.fillStyle = 'rgba(10,18,34,.92)'; ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = col + '55'; ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(x + (i - 1) * cell * .16, y + cell * .36, cell * .045, 0, TAU);
        ctx.fillStyle = i < this.level ? col : 'rgba(255,255,255,.12)';
        ctx.fill();
      }
      switch (this.type) {
        case 'cannon': {
          ctx.save(); ctx.translate(x, y); ctx.rotate(this.angle);
          ctx.fillStyle = '#2b3a55';
          ctx.fillRect(cell * .06, -cell * .07, cell * .44, cell * .14);
          ctx.fillStyle = col;
          ctx.fillRect(cell * .06, -cell * .04, cell * .44 - this.recoil * cell * .1, cell * .08);
          ctx.restore();
          ctx.beginPath(); ctx.arc(x, y, cell * .2, 0, TAU);
          ctx.fillStyle = '#3d5178'; ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
          break;
        }
        case 'laser': {
          const glow = .12 + .05 * Math.sin(this.pulse * 4);
          ctx.beginPath(); ctx.arc(x, y, cell * .34, 0, TAU);
          ctx.fillStyle = `rgba(53,224,255,${glow.toFixed(3)})`; ctx.fill();
          ctx.save(); ctx.translate(x, y); ctx.rotate(this.angle);
          ctx.beginPath();
          ctx.moveTo(cell * .32, 0); ctx.lineTo(0, cell * .18); ctx.lineTo(-cell * .3, 0); ctx.lineTo(0, -cell * .18);
          ctx.closePath();
          ctx.fillStyle = col; ctx.fill();
          ctx.beginPath(); ctx.arc(cell * .15, 0, cell * .07, 0, TAU);
          ctx.fillStyle = '#fff'; ctx.fill();
          ctx.restore();
          break;
        }
        case 'frost': {
          pathPoly(ctx, x, y, cell * .3, 6, this.pulse * .8);
          ctx.fillStyle = '#1f3a52'; ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,.65)';
          ctx.lineWidth = 1.5;
          line(ctx, x - cell * .14, y, x + cell * .14, y);
          line(ctx, x, y - cell * .14, x, y + cell * .14);
          line(ctx, x - cell * .1, y - cell * .1, x + cell * .1, y + cell * .1);
          line(ctx, x - cell * .1, y + cell * .1, x + cell * .1, y - cell * .1);
          const pr = .2 + .08 * Math.sin(this.pulse * 3);
          ctx.beginPath(); ctx.arc(x, y, cell * (.34 + pr), 0, TAU);
          ctx.strokeStyle = `rgba(127,215,255,${(.35 - pr * .5).toFixed(3)})`;
          ctx.lineWidth = 1.5; ctx.stroke();
          break;
        }
        case 'tesla': {
          const glow = .14 + .06 * Math.sin(this.pulse * 5);
          ctx.beginPath(); ctx.arc(x, y, cell * .34, 0, TAU);
          ctx.fillStyle = `rgba(199,125,255,${glow.toFixed(3)})`; ctx.fill();
          ctx.beginPath(); ctx.arc(x, y, cell * .22, 0, TAU);
          ctx.fillStyle = '#35205c'; ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
          for (let i = 0; i < 3; i++) {
            const a = this.pulse * 2 + i * TAU / 3;
            ctx.beginPath(); ctx.arc(x + Math.cos(a) * cell * .3, y + Math.sin(a) * cell * .3, cell * .05, 0, TAU);
            ctx.fillStyle = '#fff'; ctx.fill();
          }
          break;
        }
        case 'sniper': {
          ctx.save(); ctx.translate(x, y); ctx.rotate(this.angle);
          ctx.fillStyle = '#313f5e';
          ctx.fillRect(cell * .06, -cell * .04, cell * .52, cell * .08);
          ctx.fillStyle = col;
          ctx.fillRect(cell * .06, -cell * .022, cell * .52 - this.recoil * cell * .12, cell * .044);
          ctx.restore();
          ctx.beginPath(); ctx.arc(x, y, cell * .18, 0, TAU);
          ctx.fillStyle = '#2b2f4e'; ctx.fill();
          ctx.strokeStyle = col; ctx.stroke();
          ctx.beginPath(); ctx.arc(x + cell * .08, y, cell * .05, 0, TAU);
          ctx.fillStyle = col; ctx.fill();
          break;
        }
      }
    }
  }

  class Projectile {
    constructor(tower, target, st, kind, g) {
      this.game = g;
      this.x = tower.x; this.y = tower.y;
      this.target = target;
      this.kind = kind;
      this.dmg = st.damage;
      this.splash = (st.splash || 0) * g.cellScale;
      this.slow = st.slow || 0;
      this.slowDur = st.slowDur || 0;
      this.speed = (kind === 'sniper' ? 1000 : 340) * g.cellScale;
      this.alive = true;
    }
    update(dt) {
      if (!this.target || !this.target.alive) {
        if (this.kind !== 'sniper') this.impact(this.x, this.y, null);
        this.alive = false;
        return;
      }
      const d = dist(this.x, this.y, this.target.x, this.target.y);
      const step = this.speed * dt;
      if (d <= step) {
        this.impact(this.target.x, this.target.y, this.target);
        this.alive = false;
        return;
      }
      this.x += (this.target.x - this.x) / d * step;
      this.y += (this.target.y - this.y) / d * step;
    }
    impact(x, y, hit) {
      const g = this.game;
      if (hit && hit.alive) g.damageEnemy(hit, this.dmg);
      if (this.splash > 0) {
        for (const e of g.enemies) {
          if (!e.alive || e === hit) continue;
          if (dist(e.x, e.y, x, y) <= this.splash) {
            g.damageEnemy(e, this.dmg, this.slow ? { slow: this.slow, slowDur: this.slowDur } : null);
          }
        }
        if (this.kind === 'cannon') g.explode(x, y, g.cell * .55);
        else g.freezeRing(x, y, this.splash);
      }
      if (this.kind === 'sniper' && hit && hit.alive) g.hitSpark(x, y);
    }
    render(ctx) {
      if (this.kind === 'cannon') {
        ctx.beginPath(); ctx.arc(this.x, this.y, 4, 0, TAU);
        ctx.fillStyle = '#ffd166'; ctx.fill();
        ctx.beginPath(); ctx.arc(this.x - 4, this.y, 6, 0, TAU);
        ctx.fillStyle = 'rgba(255,159,67,.3)'; ctx.fill();
      } else if (this.kind === 'frost') {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(Math.atan2(this.target.y - this.y, this.target.x - this.x));
        ctx.fillStyle = '#bfeaff';
        ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(0, 4); ctx.lineTo(-4, 0); ctx.lineTo(0, -4); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else {
        line(ctx, this.x - 8, this.y, this.x + 2, this.y);
        ctx.beginPath(); ctx.arc(this.x, this.y, 3, 0, TAU);
        ctx.fillStyle = '#e6d9ff'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#b18cff'; line(ctx, this.x - 14, this.y, this.x + 4, this.y);
      }
    }
  }

  /* ================= 波次 ================= */
  const waveMgr = {
    queue: [], timer: 0, active: false,
    build(n) {
      this.queue = [];
      const list = [];
      let budget = 9 + n * 3.5;
      const pool = [['normal', 1]];
      if (n >= 3) pool.push(['fast', 1.4]);
      if (n >= 5) pool.push(['tank', 2.8]);
      while (budget > 0) {
        let total = 0;
        for (const p of pool) total += p[1];
        let roll = Math.random() * total, type = pool[0][0];
        for (const p of pool) { roll -= p[1]; if (roll <= 0) { type = p[0]; break; } }
        const cost = type === 'tank' ? 2.8 : (type === 'fast' ? 1.4 : 1);
        if (budget < cost) break;
        budget -= cost;
        list.push(type);
      }
      if (n % 10 === 0) { list.push('boss'); list.push('normal'); list.push('normal'); }
      for (let i = list.length - 1; i; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      const interval = Math.max(.42, .95 - n * .018);
      for (const t of list) this.queue.push({ type: t, delay: interval });
      this.active = true;
      this.timer = .8;
    },
    update(dt) {
      if (!this.active) return;
      this.timer -= dt;
      if (this.timer <= 0 && this.queue.length) {
        const item = this.queue.shift();
        game.spawnEnemy(item.type);
        this.timer = item.delay;
      }
    }
  };

  /* ================= 特效 ================= */
  function burst(x, y, col, n, speed, size, life) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = speed * (.4 + Math.random() * .8);
      game.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: life || .5, max: life || .5,
        size: size || 2.5, col,
        g: 40
      });
    }
  }
  function ring(x, y, col, maxR) {
    game.particles.push({ kind: 'ring', x, y, r: 6, vr: (maxR - 6) / .35, col, life: .35, max: .35 });
  }
  function fxText(x, y, str, col, size) {
    game.texts.push({ x, y, str, col: col || '#ffd166', size: size || 14, life: 1, max: 1 });
  }

  /* ================= 游戏对象 ================= */
  const game = {
    state: 'menu', diff: 'normal', speed: 1, paused: false, endless: false,
    gold: 0, lives: 0, wave: 0, score: 0,
    enemies: [], towers: [], projectiles: [], particles: [], beams: [], texts: [],
    cell: 48, cellScale: 1, canvasW: 0, canvasH: 0, ox: 0, oy: 0,
    placingType: null, hover: null, selected: null,
    shake: 0, hurtFlash: 0, time: 0,
    best: (() => {
      try { return JSON.parse(localStorage.getItem('galaxyDefenseBest')) || { wave: 0, score: 0 }; }
      catch (e) { return { wave: 0, score: 0 }; }
    })(),
    audio,
    reset() {
      const lv = LEVELS[this.diff];
      this.gold = lv.gold;
      this.lives = lv.lives;
      this.wave = 0;
      this.score = 0;
      this.endless = false;
      this.speed = 1;
      this.paused = false;
      this.enemies = []; this.towers = []; this.projectiles = [];
      this.particles = []; this.beams = []; this.texts = [];
      this.selected = null; this.placingType = null; this.hover = null;
      waveMgr.active = false; waveMgr.queue = [];
      ui.speedBtn.querySelector('small').textContent = '1x';
      ui.pauseLabel.classList.remove('show');
    },
    start(diff) {
      this.diff = diff;
      this.reset();
      this.state = 'playing';
      ui.startScreen.classList.remove('show');
      ui.overScreen.classList.remove('show');
      ui.victoryScreen.classList.remove('show');
      syncHUD(); renderToolbar(); setWaveBtn(true);
      toast('部署炮塔，抵御虫群！');
    },
    startNextWave() {
      if (this.state !== 'playing' || waveMgr.active) return;
      this.wave++;
      waveMgr.build(this.wave);
      audio.wave();
      setWaveBtn(false);
      syncHUD();
      toast('第 ' + this.wave + ' 波来袭！');
    },
    spawnEnemy(type) {
      this.enemies.push(new Enemy(type, this.wave));
    },
    towerAt(c, r) {
      return this.towers.find(t => t.c === c && t.r === r) || null;
    },
    canPlace(c, r) {
      return c >= 0 && c < COLS && r >= 0 && r < ROWS && MAP[r][c] === '.' && !this.towerAt(c, r);
    },
    tryBuild(c, r, type) {
      const def = TOWER_TYPES[type];
      if (this.gold < def.cost) { toast('金币不足'); return false; }
      if (!this.canPlace(c, r)) { toast('这里无法建造'); return false; }
      this.gold -= def.cost;
      this.towers.push(new Tower(c, r, type, this));
      this.placingType = null;
      audio.build();
      syncHUD(); renderToolbar();
      fxText((c + .5) * this.cell, (r + .5) * this.cell - this.cell * .35, '建造', '#9be8ff', 12);
      return true;
    },
    upgradeTower(t) {
      if (t.level >= 2) return;
      const cost = t.upgradeCost();
      if (this.gold < cost) { toast('金币不足'); return; }
      this.gold -= cost;
      t.spent += cost;
      t.level++;
      audio.upgrade();
      fxText(t.x, t.y - this.cell * .4, '升级!', '#c77dff', 14);
      syncHUD(); syncPanel(); renderToolbar();
    },
    sellTower(t) {
      const val = t.sellValue();
      this.gold += val;
      this.towers = this.towers.filter(x => x !== t);
      if (this.selected === t) this.selected = null;
      audio.sell();
      fxText(t.x, t.y, '+' + val, '#ffd166', 13);
      syncHUD(); syncPanel(); renderToolbar();
    },
    damageEnemy(e, dmg, opt) {
      if (!e || !e.alive) return;
      e.hp -= dmg;
      e.flash = 1;
      if (opt) {
        if (opt.slow) { e.slowF = Math.min(e.slowF, opt.slow); e.slowT = Math.max(e.slowT, opt.slowDur); }
      }
      if (e.hp <= 0) {
        e.alive = false;
        this.onKill(e);
      }
    },
    onKill(e) {
      this.gold += e.reward;
      this.score += e.reward;
      burst(e.x, e.y, '255,209,102', 10, 110, 2.5, .45);
      burst(e.x, e.y, '255,140,90', 6, 80, 2, .4);
      fxText(e.x, e.y - e.r - 12, '+' + e.reward, '#ffd166', 12);
      if (e.type === 'boss') {
        this.shake = 9;
        ring(e.x, e.y, '199,125,255', this.cell * 2.2);
        burst(e.x, e.y, '199,125,255', 30, 220, 3.5, .7);
        fxText(e.x, e.y - e.r - 22, 'BOSS 击破!', '#c77dff', 18);
        audio.boom();
      } else {
        audio.death();
      }
      syncHUD();
    },
    onEscape(e) {
      e.alive = false;
      this.lives--;
      this.shake = 8;
      this.hurtFlash = 1;
      audio.hurt();
      if (this.lives <= 0) {
        this.lives = 0;
        this.gameOver();
      }
      syncHUD();
    },
    onWaveEnded() {
      if (this.state !== 'playing') return;
      const bonus = 20 + this.wave * 3;
      this.gold += bonus;
      this.score += bonus;
      audio.bonus();
      fxText(this.ox + COLS * this.cell / 2, this.oy + ROWS * this.cell / 2 + this.cell * 1.4, '波次奖励 +' + bonus, '#9be8ff', 15);
      syncHUD();
      setWaveBtn(true);
      toast('第 ' + this.wave + ' 波守住！可继续部署或开始下一波');
      if (this.wave >= TOTAL_WAVES && !this.endless) this.victory();
    },
    explode(x, y, radius) {
      burst(x, y, '255,209,102', 14, 190, 3, .4);
      burst(x, y, '255,159,67', 9, 130, 2.5, .5);
      ring(x, y, '255,159,67', radius);
      audio.boom();
    },
    freezeRing(x, y, radius) {
      burst(x, y, '155,232,255', 10, 90, 2.5, .5);
      ring(x, y, '155,232,255', radius);
    },
    hitSpark(x, y) {
      burst(x, y, '230,217,255', 6, 150, 2, .3);
    },
    update(dt) {
      this.time += dt;
      waveMgr.update(dt);
      for (const e of this.enemies) {
        e.update(dt);
        if (e.escaped) this.onEscape(e);
      }
      this.enemies = this.enemies.filter(e => e.alive && !e.escaped);
      if (waveMgr.active && !waveMgr.queue.length && !this.enemies.length) {
        waveMgr.active = false;
        this.onWaveEnded();
      }
      for (const t of this.towers) t.update(dt, this.time);
      for (const p of this.projectiles) p.update(dt);
      this.projectiles = this.projectiles.filter(p => p.alive);
      for (const p of this.particles) {
        p.life -= dt;
        if (p.kind === 'ring') { p.r += p.vr * dt; continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += p.g * dt;
        p.vx *= .98; p.vy *= .98;
      }
      this.particles = this.particles.filter(p => p.life > 0);
      for (const b of this.beams) b.life -= dt;
      this.beams = this.beams.filter(b => b.life > 0);
      for (const t of this.texts) { t.life -= dt; t.y -= 26 * dt; }
      this.texts = this.texts.filter(t => t.life > 0);
      this.shake = Math.max(0, this.shake - dt * 22);
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.8);
      syncHUD();
    },
    saveBest() {
      if (this.wave > this.best.wave) this.best.wave = this.wave;
      if (this.score > this.best.score) this.best.score = this.score;
      try { localStorage.setItem('galaxyDefenseBest', JSON.stringify(this.best)); } catch (e) { }
    },
    gameOver() {
      this.state = 'over';
      this.saveBest();
      audio.over();
      ui.ovWave.textContent = '抵达第 ' + this.wave + ' 波';
      ui.ovScore.textContent = this.score;
      ui.ovBest.textContent = '最佳纪录：第 ' + this.best.wave + ' 波 · ' + this.best.score + ' 分';
      ui.overScreen.classList.add('show');
    },
    victory() {
      this.state = 'victory';
      this.saveBest();
      audio.win();
      ui.vWave.textContent = '第 ' + this.wave + ' 波';
      ui.vScore.textContent = this.score;
      ui.vBest.textContent = '最佳纪录：第 ' + this.best.wave + ' 波 · ' + this.best.score + ' 分';
      ui.victoryScreen.classList.add('show');
    },
    continueEndless() {
      this.endless = true;
      this.state = 'playing';
      ui.victoryScreen.classList.remove('show');
      setWaveBtn(true);
      toast('无尽模式：坚持到最后一刻！');
    }
  };

  /* ================= UI ================= */
  function syncHUD() {
    ui.gold.textContent = game.gold;
    ui.lives.textContent = '❤ ' + game.lives;
    ui.wave.textContent = game.endless ? (game.wave + ' · 无尽') : (game.wave + ' / ' + TOTAL_WAVES);
    const left = waveMgr.queue.length + game.enemies.length;
    ui.enemies.textContent = waveMgr.active ? left : '--';
  }
  function setWaveBtn(show) {
    if (show) {
      ui.waveBtn.classList.remove('hide');
      ui.waveBtn.innerHTML = '开始第 ' + (game.wave + 1) + ' 波 <b>SPACE</b>';
    } else {
      ui.waveBtn.classList.add('hide');
    }
  }
  function renderToolbar() {
    ui.toolbar.innerHTML = '';
    for (const [k, def] of Object.entries(TOWER_TYPES)) {
      const b = document.createElement('button');
      b.className = 'tower-card' + (game.placingType === k ? ' active' : '') + (game.gold < def.cost ? ' disabled' : '');
      b.title = def.role + '：' + def.tip;
      b.innerHTML = '<i class="ico">' + def.icon + '</i><b>' + def.name + '</b><small>⚡' + def.cost + '</small><span class="key">' + def.key + '</span>';
      b.addEventListener('click', () => togglePlacing(k));
      ui.toolbar.appendChild(b);
    }
  }
  function togglePlacing(k) {
    if (game.state !== 'playing') return;
    game.placingType = game.placingType === k ? null : k;
    game.selected = null;
    syncPanel(); renderToolbar();
    canvas.style.cursor = game.placingType ? 'crosshair' : 'default';
  }
  function syncPanel() {
    const t = game.selected;
    if (!t) { ui.towerPanel.classList.add('hide'); return; }
    ui.towerPanel.classList.remove('hide');
    const st = t.stats, def = t.def;
    ui.tpName.textContent = def.name;
    ui.tpLevel.textContent = 'Lv ' + (t.level + 1) + '/3';
    ui.tpDesc.textContent = def.desc;
    let extra = '';
    if (st.splash) extra += '<span>溅射 <b>' + (st.splash / 48).toFixed(1) + '格</b></span>';
    if (st.slow) extra += '<span>减速 <b>' + Math.round((1 - st.slow) * 100) + '%</b></span>';
    if (st.chain) extra += '<span>连锁 <b>' + st.chain + '</b></span>';
    ui.tpStats.innerHTML =
      '<span>伤害 <b>' + Math.round(st.damage) + '</b></span>' +
      '<span>射速 <b>' + st.rate.toFixed(1) + '/s</b></span>' +
      '<span>范围 <b>' + (st.range / 48).toFixed(1) + '格</b></span>' + extra;
    ui.tpTip.textContent = def.tip;
    if (t.level >= 2) {
      ui.tpUpgrade.disabled = true;
      ui.tpUpgrade.innerHTML = '已满级';
    } else {
      const cost = t.upgradeCost();
      ui.tpUpgrade.disabled = game.gold < cost;
      ui.tpUpgrade.innerHTML = '升级 <b>⚡' + cost + '</b>';
    }
    ui.tpSell.innerHTML = '出售 <b>+' + t.sellValue() + '</b>';
  }
  function togglePause() {
    if (game.state !== 'playing') return;
    game.paused = !game.paused;
    ui.pauseLabel.classList.toggle('show', game.paused);
  }
  function toggleSpeed() {
    if (game.state !== 'playing') return;
    game.speed = game.speed === 1 ? 2 : 1;
    ui.speedBtn.querySelector('small').textContent = game.speed + 'x';
  }
  function toggleMute() {
    audio.muted = !audio.muted;
    try { localStorage.setItem('galaxyDefenseMuted', audio.muted ? '1' : '0'); } catch (e) { }
    ui.soundBtn.textContent = audio.muted ? '🔇' : '🔊';
  }
  let toastTimer = null;
  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 1800);
  }

  function buildGuide() {
    ui.guideTowers.innerHTML = Object.entries(TOWER_TYPES).map(([k, d]) => {
      const lv = d.levels[0];
      let stats = '伤害 ' + lv.damage + ' · 射速 ' + lv.rate + '/s · 范围 ' + (lv.range / 48).toFixed(1) + '格';
      if (lv.splash) stats += ' · 溅射 ' + (lv.splash / 48).toFixed(1) + '格';
      if (lv.slow) stats += ' · 减速 ' + Math.round((1 - lv.slow) * 100) + '%';
      if (lv.chain) stats += ' · 连锁 ' + lv.chain;
      return '<div class="guide-item">' +
        '<div class="gi-icon" style="border-color:' + d.color + '66;color:' + d.color + '">' + d.icon + '</div>' +
        '<div>' +
        '<div class="gi-head"><b>' + d.name + '</b><span class="gi-role" style="color:' + d.color + ';border-color:' + d.color + '66">' + d.role + '</span><span class="gi-cost">⚡' + d.cost + '</span></div>' +
        '<div class="gi-stats">' + stats + '</div>' +
        '<div class="gi-tip">' + d.tip + '</div>' +
        '</div></div>';
    }).join('');
    ui.guideEnemies.innerHTML = Object.entries(ENEMY_TYPES).map(([k, e]) =>
      '<div class="guide-item">' +
      '<div class="gi-icon"><i class="gi-dot" style="background:' + e.color + '"></i></div>' +
      '<div>' +
      '<div class="gi-head"><b>' + e.name + '</b><span class="gi-role" style="color:' + e.color + ';border-color:' + e.color + '66">' + e.role + '</span></div>' +
      '<div class="gi-stats">HP ' + e.hp + ' · 速度 ' + e.speed + ' · 赏金 ' + e.reward + '</div>' +
      '<div class="gi-tip">' + e.tip + '</div>' +
      '</div></div>'
    ).join('');
  }
  function showGuide() {
    buildGuide();
    ui.guideScreen.classList.add('show');
  }
  function hideGuide() {
    ui.guideScreen.classList.remove('show');
  }

  /* ================= 输入 ================= */
  function screenPos(e) {
    const rect = canvas.getBoundingClientRect();
    const src = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }
  function pxToCell(x, y) {
    const c = Math.floor((x - game.ox) / game.cell), r = Math.floor((y - game.oy) / game.cell);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return { c, r };
  }
  function handleTap(p) {
    if (game.state !== 'playing' || game.paused) return;
    const cell = pxToCell(p.x, p.y);
    if (game.placingType) {
      if (cell && game.canPlace(cell.c, cell.r)) game.tryBuild(cell.c, cell.r, game.placingType);
      else toast('这里无法建造');
      return;
    }
    if (cell) {
      const t = game.towerAt(cell.c, cell.r);
      if (t) { game.selected = t; syncPanel(); renderToolbar(); return; }
    }
    game.selected = null;
    syncPanel();
  }

  let lastTap = { t: 0, type: '' };
  function onCanvasTap(e) {
    const now = performance.now();
    // pointerdown 与 click 会为同一次点击先后触发，去重，避免一次点击触发两次逻辑
    if (now - lastTap.t < 350 && lastTap.type !== e.type) return;
    lastTap = { t: now, type: e.type };
    if (typeof e.preventDefault === 'function') e.preventDefault();
    audio.ensure();
    handleTap(screenPos(e));
  }
  if ('PointerEvent' in window) {
    canvas.addEventListener('pointerdown', onCanvasTap);
    canvas.addEventListener('pointermove', e => {
      const p = screenPos(e);
      const cell = pxToCell(p.x, p.y);
      game.hover = cell;
    });
    canvas.addEventListener('pointerleave', () => { game.hover = null; });
  } else {
    // 老版微信 X5 内核等环境指针事件支持不完整，退回触摸事件
    canvas.addEventListener('touchstart', onCanvasTap, { passive: false });
  }
  canvas.addEventListener('click', onCanvasTap); // 最后的兜底

  window.addEventListener('keydown', e => {
    if (game.state !== 'playing') return;
    if (e.key >= '1' && e.key <= '5') {
      const k = Object.keys(TOWER_TYPES)[Number(e.key) - 1];
      if (k) togglePlacing(k);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      game.placingType = null; game.selected = null;
      syncPanel(); renderToolbar();
    } else if (e.key === ' ') {
      e.preventDefault();
      if (!waveMgr.active) game.startNextWave();
    } else if (e.key === 'p' || e.key === 'P') {
      togglePause();
    } else if (e.key === 'm' || e.key === 'M') {
      toggleMute();
    }
  });

  ui.waveBtn.addEventListener('click', () => {
    audio.ensure();
    if (game.state === 'playing' && !waveMgr.active) game.startNextWave();
  });
  ui.guideBtn.addEventListener('click', () => { audio.ensure(); showGuide(); });
  ui.hudGuideBtn.addEventListener('click', () => { audio.ensure(); showGuide(); });
  ui.guideClose.addEventListener('click', () => hideGuide());
  ui.tpUpgrade.addEventListener('click', () => { if (game.selected) game.upgradeTower(game.selected); });
  ui.tpSell.addEventListener('click', () => { if (game.selected) game.sellTower(game.selected); });
  ui.tpClose.addEventListener('click', () => { game.selected = null; syncPanel(); });
  ui.pauseBtn.addEventListener('click', () => { audio.ensure(); togglePause(); });
  ui.speedBtn.addEventListener('click', () => { audio.ensure(); toggleSpeed(); });
  ui.soundBtn.addEventListener('click', () => { audio.ensure(); toggleMute(); });
  ui.startBtn.addEventListener('click', () => { audio.ensure(); game.start(currentDiff); });
  ui.retryBtn.addEventListener('click', () => { audio.ensure(); game.start(game.diff); });
  ui.changeBtn.addEventListener('click', () => showMenu());
  ui.continueBtn.addEventListener('click', () => { audio.ensure(); game.continueEndless(); });
  ui.vRetryBtn.addEventListener('click', () => { audio.ensure(); game.start(game.diff); });
  ui.vChangeBtn.addEventListener('click', () => showMenu());
  ui.diffBtns.forEach(b => {
    b.addEventListener('click', () => {
      currentDiff = b.dataset.level;
      ui.diffBtns.forEach(x => x.classList.toggle('active', x === b));
    });
  });

  let currentDiff = 'normal';

  function showMenu() {
    game.state = 'menu';
    ui.overScreen.classList.remove('show');
    ui.victoryScreen.classList.remove('show');
    ui.startScreen.classList.add('show');
    ui.bestRecord.textContent = '最佳纪录：第 ' + game.best.wave + ' 波 · ' + game.best.score + ' 分';
  }

  /* ================= 渲染 ================= */
  const STARS = Array.from({ length: 110 }, () => ({
    x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + .3,
    p: Math.random() * TAU, s: Math.random() * 1.8 + .6
  }));
  function drawBackground() {
    ctx.fillStyle = '#05070f';
    ctx.fillRect(0, 0, game.canvasW, game.canvasH);
    for (const s of STARS) {
      const a = .25 + .5 * Math.abs(Math.sin(game.time * s.s + s.p));
      ctx.beginPath();
      ctx.arc(s.x * game.canvasW, s.y * game.canvasH, s.r, 0, TAU);
      ctx.fillStyle = 'rgba(190,220,255,' + a.toFixed(3) + ')';
      ctx.fill();
    }
    const x = game.ox, y = game.oy, w = COLS * game.cell, h = ROWS * game.cell;
    ctx.fillStyle = 'rgba(10,16,30,.5)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(148,163,184,.05)';
    ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) line(ctx, x + c * game.cell, y, x + c * game.cell, y + h);
    for (let r = 1; r < ROWS; r++) line(ctx, x, y + r * game.cell, x + w, y + r * game.cell);
    if (game.placingType) {
      ctx.fillStyle = 'rgba(86,231,255,.06)';
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (MAP[r][c] === '.' && !game.towerAt(c, r)) {
          ctx.fillRect(x + c * game.cell + game.cell * .42, y + r * game.cell + game.cell * .42, game.cell * .16, game.cell * .16);
        }
      }
    }
  }
  function drawPath() {
    const cell = game.cell;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    pathPx.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.strokeStyle = 'rgba(56,189,248,.10)'; ctx.lineWidth = cell * 1.04; ctx.stroke();
    ctx.strokeStyle = '#121c30'; ctx.lineWidth = cell * .62; ctx.stroke();
    ctx.strokeStyle = '#1b2a45'; ctx.lineWidth = cell * .48; ctx.stroke();
    ctx.fillStyle = 'rgba(96,165,250,.35)';
    for (const a of pathArrows) {
      ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.angle);
      ctx.beginPath();
      ctx.moveTo(cell * .16, 0); ctx.lineTo(-cell * .04, cell * .11); ctx.lineTo(-cell * .04, -cell * .11);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    portal(ctx, pathPx[0], '#34d399');
    portal(ctx, pathPx[pathPx.length - 1], '#f87171');
  }
  function portal(ctx, p, col) {
    const t = game.time;
    const r = game.cell * (.24 + .04 * Math.sin(t * 3));
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.fillStyle = col + '33'; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, r * .45, 0, TAU);
    ctx.fillStyle = col; ctx.fill();
  }
  function drawOverlays() {
    const g = game;
    if (g.placingType && g.hover) {
      const ok = g.canPlace(g.hover.c, g.hover.r);
      const x = (g.hover.c + .5) * g.cell, y = (g.hover.r + .5) * g.cell;
      const def = TOWER_TYPES[g.placingType];
      const range = def.levels[0].range * g.cellScale;
      ctx.beginPath(); ctx.arc(x, y, range, 0, TAU);
      ctx.fillStyle = ok ? 'rgba(52,211,153,.07)' : 'rgba(248,113,113,.07)'; ctx.fill();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = ok ? 'rgba(52,211,153,.5)' : 'rgba(248,113,113,.5)';
      ctx.lineWidth = 1.5; ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(x, y, g.cell * .36, 0, TAU);
      ctx.fillStyle = ok ? 'rgba(52,211,153,.22)' : 'rgba(248,113,113,.22)'; ctx.fill();
      ctx.strokeStyle = ok ? '#34d399' : '#f87171'; ctx.stroke();
    }
    if (g.selected) {
      const t = g.selected;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.range, 0, TAU);
      ctx.fillStyle = 'rgba(86,231,255,.06)'; ctx.fill();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(86,231,255,.4)'; ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  function drawBeams() {
    for (const b of game.beams) {
      const a = Math.max(0, b.life / b.total);
      if (b.kind === 'laser') {
        const w = game.cell * .045;
        ctx.strokeStyle = 'rgba(53,224,255,' + (.22 * a).toFixed(3) + ')';
        ctx.lineWidth = w * 3;
        line(ctx, b.x1, b.y1, b.x2, b.y2);
        ctx.strokeStyle = 'rgba(255,255,255,' + (.8 * a).toFixed(3) + ')';
        ctx.lineWidth = w;
        line(ctx, b.x1, b.y1, b.x2, b.y2);
      } else {
        for (const s of b.segs) {
          const pts = [];
          const n = Math.max(2, Math.floor(dist(s.x1, s.y1, s.x2, s.y2) / 14));
          pts.push({ x: s.x1, y: s.y1 });
          for (let i = 1; i < n; i++) {
            const t = i / n;
            pts.push({
              x: lerp(s.x1, s.x2, t) + (Math.random() - .5) * 10,
              y: lerp(s.y1, s.y2, t) + (Math.random() - .5) * 10
            });
          }
          pts.push({ x: s.x2, y: s.y2 });
          ctx.strokeStyle = 'rgba(199,125,255,' + (.5 * a).toFixed(3) + ')';
          ctx.lineWidth = 3;
          polyline(ctx, pts);
          ctx.strokeStyle = 'rgba(255,255,255,' + (.7 * a).toFixed(3) + ')';
          ctx.lineWidth = 1;
          polyline(ctx, pts);
        }
      }
    }
  }
  function drawParticles() {
    for (const p of game.particles) {
      const a = Math.max(0, p.life / p.max);
      if (p.kind === 'ring') {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.strokeStyle = 'rgba(' + p.col + ',' + (a * .5).toFixed(3) + ')';
        ctx.lineWidth = 2; ctx.stroke();
        continue;
      }
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(.5, p.size * a), 0, TAU);
      ctx.fillStyle = 'rgb(' + p.col + ')'; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function drawTexts() {
    for (const t of game.texts) {
      ctx.globalAlpha = Math.max(0, t.life / t.max);
      ctx.font = '700 ' + t.size + 'px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = t.col;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
  function render() {
    ctx.clearRect(0, 0, game.canvasW, game.canvasH);
    ctx.save();
    if (game.shake > 0) {
      ctx.translate((Math.random() - .5) * game.shake, (Math.random() - .5) * game.shake);
    }
    drawBackground();
    drawPath();
    for (const t of game.towers) t.render(ctx);
    for (const e of game.enemies) e.render(ctx);
    for (const p of game.projectiles) p.render(ctx);
    drawBeams();
    drawParticles();
    drawTexts();
    drawOverlays();
    ctx.restore();
    if (game.hurtFlash > 0) {
      ctx.fillStyle = 'rgba(248,60,80,' + (game.hurtFlash * .22).toFixed(3) + ')';
      ctx.fillRect(0, 0, game.canvasW, game.canvasH);
    }
  }

  /* ================= 主循环 ================= */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(200, rect.width || window.innerWidth), h = Math.max(200, rect.height || window.innerHeight);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    game.canvasW = w;
    game.canvasH = h;
    game.cell = Math.max(28, Math.floor(Math.min(w / COLS, h / ROWS)));
    game.cellScale = game.cell / 48;
    game.ox = Math.floor((w - COLS * game.cell) / 2);
    game.oy = Math.floor((h - ROWS * game.cell) / 2);
    rebuildPath(game.cell);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, .05);
    last = now;
    if (game.state === 'playing' && !game.paused) {
      try { game.update(dt * game.speed); } catch (err) {
        if (window.console) console.error('update error:', err);
      }
    }
    try { render(); } catch (err) {
      if (window.console) console.error('render error:', err);
    }
    requestAnimationFrame(frame);
  }

  function init() {
    resize();
    window.addEventListener('resize', resize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    window.addEventListener('pointerdown', () => audio.ensure(), { once: true });
    ui.soundBtn.textContent = audio.muted ? '🔇' : '🔊';
    ui.bestRecord.textContent = '最佳纪录：第 ' + game.best.wave + ' 波 · ' + game.best.score + ' 分';
    buildGuide();
    syncHUD(); renderToolbar(); setWaveBtn(true);
    requestAnimationFrame(frame);
  }
  init();

  /* ================= 测试钩子 ================= */
  if (typeof window !== 'undefined') {
    window.__TD = { game, waveMgr, TOWER_TYPES, canPlace: (c, r) => game.canPlace(c, r), render };
  }
})();
