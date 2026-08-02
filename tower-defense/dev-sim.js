// 无人值守模拟器：stub 掉 DOM/Canvas/音频，让游戏逻辑自动通关，验证数值平衡。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, 'game.js');
const code = fs.readFileSync(file, 'utf8');

const noop = () => {};
const ctxProxy = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return () => ({ width: 0 });
    return () => ctxProxy;
  },
  set() { return true; }
});
const makeEl = () => ({
  style: {},
  classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
  textContent: '', innerHTML: '', disabled: false, dataset: {}, value: '',
  addEventListener: noop, appendChild: noop, removeChild: noop, setAttribute: noop,
  getContext: () => ctxProxy,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 640 }),
  querySelector: () => makeEl()
});

const store = {};
global.window = global;
global.addEventListener = noop;
global.devicePixelRatio = 1;
global.document = {
  querySelector: () => makeEl(),
  querySelectorAll: () => [],
  createElement: () => makeEl(),
  addEventListener: noop
};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.AudioContext = class {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.sampleRate = 44100;
    this.destination = {};
  }
  resume() {}
  createOscillator() {
    return {
      frequency: { setValueAtTime: noop, exponentialRampToValueAtTime: noop },
      type: '', connect: noop, start: noop, stop: noop
    };
  }
  createGain() {
    return { gain: { setValueAtTime: noop, exponentialRampToValueAtTime: noop }, connect: noop };
  }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { return { connect: noop, start: noop, stop: noop, buffer: null }; }
  createBiquadFilter() { return { type: '', frequency: { value: 0 }, connect: noop }; }
};
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = noop;

vm.runInThisContext(code, { filename: file });
const { game, waveMgr, TOWER_TYPES, render } = window.__TD;

// 建造位：按上/中/下三层交替排列，保证前期预算能覆盖全路径
const spots = [
  { c: 4, r: 1 }, { c: 12, r: 3 }, { c: 6, r: 8 },
  { c: 7, r: 2 }, { c: 3, r: 5 }, { c: 10, r: 8 },
  { c: 13, r: 5 }, { c: 1, r: 4 }, { c: 14, r: 8 },
  { c: 11, r: 2 }, { c: 8, r: 5 }, { c: 2, r: 8 },
  { c: 14, r: 4 }, { c: 0, r: 3 }, { c: 8, r: 9 },
  { c: 15, r: 2 }, { c: 12, r: 6 }, { c: 4, r: 9 },
  { c: 0, r: 5 }, { c: 11, r: 8 }
];
let cursor = 0;

function place(type, want) {
  const g = game;
  if (g.towers.filter(t => t.type === type).length >= want) return false;
  for (let i = 0; i < spots.length; i++) {
    const s = spots[(cursor + i) % spots.length];
    if (g.canPlace(s.c, s.r)) {
      cursor = (cursor + i + 1) % spots.length;
      if (g.gold >= TOWER_TYPES[type].cost) {
        g.tryBuild(s.c, s.r, type);
        return true;
      }
      return false;
    }
  }
  return false;
}
function upgradeType(type, toLevel, want) {
  const g = game;
  const ts = g.towers.filter(t => t.type === type && t.level < toLevel);
  if (ts.length === 0 || g.towers.filter(t => t.type === type).length < want) return false;
  ts.sort((a, b) => a.upgradeCost() - b.upgradeCost());
  const t = ts[0];
  if (g.gold < t.upgradeCost()) return false;
  g.upgradeTower(t);
  return true;
}

function buy() {
  const g = game;
  const actions = [
    () => place('cannon', 6),
    () => upgradeType('cannon', 1, 4),
    () => place('frost', 3),
    () => upgradeType('cannon', 2, 5),
    () => place('laser', 3),
    () => upgradeType('frost', 1, 3),
    () => place('tesla', 2),
    () => upgradeType('laser', 1, 3),
    () => place('sniper', 2),
    () => upgradeType('tesla', 1, 2),
    () => upgradeType('sniper', 1, 2),
    () => upgradeType('frost', 2, 3),
    () => upgradeType('laser', 2, 3),
    () => upgradeType('tesla', 2, 2),
    () => upgradeType('sniper', 2, 2)
  ];
  for (let round = 0; round < 5; round++) {
    let spent = false;
    for (const a of actions) {
      const ok = a();
      spent = spent || ok;
      if (ok && g.gold < 40) break;
    }
    if (!spent) break;
  }
  if (g.towers.length > 30) throw new Error('tower count exploded');
}

function run(diff) {
  game.start(diff);
  cursor = 0;
  const dt = 1 / 60;
  let minLives = game.lives;
  let steps = 0;
  const maxSteps = 60 * 60 * 30;
  while (game.state === 'playing' && steps < maxSteps) {
    steps++;
    game.update(dt);
    if (steps % 300 === 0) render(); // 渲染路径冒烟测试
    if (!waveMgr.active && game.state === 'playing') {
      buy();
      game.startNextWave();
    }
    minLives = Math.min(minLives, game.lives);
    if (steps % 600 === 0) {
      for (const e of game.enemies.concat(game.towers, game.projectiles)) {
        for (const k of ['x', 'y']) {
          if (typeof e[k] === 'number' && !Number.isFinite(e[k])) {
            throw new Error('NaN 位置: ' + k + ' @step ' + steps);
          }
        }
      }
    }
  }
  const byType = {};
  for (const t of game.towers) byType[t.type] = (byType[t.type] || 0) + 1;
  return {
    diff, state: game.state, wave: game.wave, lives: game.lives, minLives,
    gold: game.gold, score: game.score, towers: byType, steps
  };
}

for (const diff of ['easy', 'normal', 'hard']) {
  const r = run(diff);
  console.log(JSON.stringify(r));
  if (diff === 'normal' && r.state !== 'victory') {
    console.error('FAIL: normal 难度未通关');
    process.exit(1);
  }
}
console.log('OK');

/* ================= 附加校验 ================= */

// 无尽模式
game.start('easy');
cursor = 0;
{
  while (game.state === 'playing') {
    game.update(1 / 60);
    if (!waveMgr.active) {
      buy();
      game.startNextWave();
    }
  }
  if (game.state !== 'victory') throw new Error('easy 未通关即进入无尽测试');
  game.continueEndless();
  let waves = 0;
  while (game.state === 'playing' && waves < 6) {
    game.update(1 / 60);
    if (!waveMgr.active) {
      buy();
      game.startNextWave();
      waves++;
    }
  }
  if (game.wave < 22) throw new Error('无尽模式未进入第 22 波: wave=' + game.wave);
  if (game.state !== 'playing') throw new Error('无尽模式意外结束: ' + game.state);
  console.log('无尽模式 OK, 已到第 ' + game.wave + ' 波');
}

// 升级 / 满级 / 出售
{
  game.start('normal');
  game.gold = 5000;
  if (!game.tryBuild(4, 1, 'cannon')) throw new Error('正常建造失败');
  let t = game.towerAt(4, 1);
  if (!t) throw new Error('塔未生成');
  game.upgradeTower(t);
  t = game.towerAt(4, 1);
  if (t.level !== 1) throw new Error('第一次升级失败');
  game.upgradeTower(t);
  t = game.towerAt(4, 1);
  if (t.level !== 2) throw new Error('第二次升级失败');
  game.upgradeTower(t); // 满级后再点
  if (t.level !== 2) throw new Error('满级后仍可升级');
  const sellVal = t.sellValue();
  const goldBeforeSell = game.gold;
  game.sellTower(t);
  if (game.gold !== goldBeforeSell + sellVal) throw new Error('出售退款错误');
  if (game.towerAt(4, 1)) throw new Error('出售后塔仍存在');
  console.log('升级/出售 OK');
}

// 非法建造 & 资金不足 & 漏怪扣血
{
  game.start('normal');
  if (game.canPlace(0, 0)) throw new Error('路径上可建造');
  if (game.tryBuild(0, 0, 'cannon')) throw new Error('路径上建造成功');
  game.gold = 10;
  if (game.tryBuild(4, 1, 'cannon')) throw new Error('资金不足仍建造成功');
  const livesBefore = game.lives;
  game.spawnEnemy('normal');
  const e = game.enemies[0];
  e.dist = 1e9;
  game.update(1 / 60);
  if (game.lives !== livesBefore - 1) throw new Error('漏怪未扣血');
  console.log('非法建造/漏怪 OK');
}

console.log('ALL CHECKS PASSED');
