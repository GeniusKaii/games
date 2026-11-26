/** 用真实引擎数据生成文章中要用的示意图（SVG） */
import fs from 'fs';
import path from 'path';
import { Model, makeTypes, pickNext, shouldStop, knowProbs, AGES } from '../age-memory/engine.js';
import { ALL as ITEMS } from '../age-memory/items.js';

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });

const C = {
  bg: '#221a30', card: '#2a2039', line: '#3a3048',
  purple: '#a678e8', purpleDeep: '#c9a7ff', green: '#3ddc97',
  ink: '#ded7e9', soft: '#a89cba', faint: '#7a6f8d',
  orange: '#e8a04c',
};

const FONT = `-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function svg(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="max-width:100%;height:auto">
<rect width="${w}" height="${h}" rx="14" fill="${C.bg}"/>
${body}
</svg>`;
}

const TR = { retro: false, parent: false, urban: true, gamer: true };

/* ============================================================
 * 图一：同一道题，对不同出生年的人期望得到什么回答
 * ============================================================ */
function fig1() {
  const q = ITEMS.find(x => x.id === 'xbw');        // 小霸王学习机
  const q2 = ITEMS.find(x => x.id === 'xyj');       // 86 版西游记（重播型）

  const W = 760, H = 420;
  const L = 64, R = W - 28, T = 118, B = 320;
  const yearToX = y => L + (y - 1971) / (2011 - 1971) * (R - L);
  const pToY = p => B - p * (B - T);

  // 采样曲线
  function curve(qq) {
    const pts = [];
    for (let age = AGES[0]; age <= AGES[AGES.length - 1]; age++) {
      const birth = 2026 - age;
      if (birth < 1971 || birth > 2011) continue;
      const p = knowProbs(qq, age, TR)[0];
      pts.push([yearToX(birth), pToY(p)]);
    }
    return pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  }

  let grid = '';
  for (const p of [0, 0.25, 0.5, 0.75, 1]) {
    const y = pToY(p);
    grid += `<line x1="${L}" y1="${y}" x2="${R}" y2="${y}" stroke="${C.line}" stroke-width="1"/>
<text x="${L - 12}" y="${y + 4}" font-size="12" fill="${C.faint}" text-anchor="end">${(p * 100).toFixed(0)}%</text>`;
  }
  let xlab = '';
  for (const yr of [1971, 1981, 1991, 2001, 2011]) {
    xlab += `<text x="${yearToX(yr)}" y="${B + 24}" font-size="12" fill="${C.faint}" text-anchor="middle">${yr}</text>`;
  }

  // 小霸王的"命中出生年"区间：1991 年 6-14 岁 → 1977-1985；2003 年 6-14 岁 → 1989-1997
  const bandL = yearToX(1977), bandR = yearToX(1997);
  const band = `<rect x="${bandL}" y="${T - 10}" width="${bandR - bandL}" height="${B - T + 10}" fill="${C.green}" opacity="0.07"/>`;

  const body = `
<text x="${L}" y="34" font-size="17" font-weight="700" fill="${C.purpleDeep}">同一道题，对不同出生年的人期望得到什么回答</text>
<text x="${L}" y="58" font-size="13" fill="${C.soft}">纵轴：这个出生年的人，答「当然记得」的概率</text>
<text x="${L}" y="80" font-size="12" fill="${C.green}">绿色底色：这段出生的人，在当时正好是 6–14 岁</text>
${band}${grid}${xlab}
<line x1="${L}" y1="${B}" x2="${R}" y2="${B}" stroke="${C.soft}" stroke-width="1.5"/>
<text x="${(L + R) / 2}" y="${B + 48}" font-size="12" fill="${C.faint}" text-anchor="middle">出生年份</text>

<path d="${curve(q)}" fill="none" stroke="${C.purple}" stroke-width="2.6"/>
<path d="${curve(q2)}" fill="none" stroke="${C.orange}" stroke-width="2.6" stroke-dasharray="7 5"/>

<g font-size="13">
  <rect x="${R - 250}" y="${T + 4}" width="244" height="66" rx="8" fill="${C.card}" stroke="${C.line}"/>
  <line x1="${R - 234}" y1="${T + 24}" x2="${R - 206}" y2="${T + 24}" stroke="${C.purple}" stroke-width="2.6"/>
  <text x="${R - 198}" y="${T + 28}" fill="${C.ink}">小霸王学习机（1991–2003）</text>
  <line x1="${R - 234}" y1="${T + 50}" x2="${R - 206}" y2="${T + 50}" stroke="${C.orange}" stroke-width="2.6" stroke-dasharray="7 5"/>
  <text x="${R - 198}" y="${T + 54}" fill="${C.ink}">86 版西游记（年年重播）</text>
</g>`;

  fs.writeFileSync(path.join(OUT, 'fig1-likelihood.svg'), svg(W, H, body));
  console.log('fig1 ok');
}

/* ============================================================
 * 图二：贝叶斯更新，每答一题范围就窄一点
 * ============================================================ */
function fig2() {
  const TRUTH = 32;
  const pool = ITEMS.filter(q => !q.off);

  // 固定种子的 PRNG，保证每次生成同一张图（可复现）
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function sample(p, rng) {
    const r = rng();
    let a = 0;
    for (let i = 0; i < p.length; i++) { a += p[i]; if (r <= a) return i; }
    return p.length - 1;
  }

  // 找一条能收敛到正确答案的路径（换种子重试）
  let best = null;
  for (let seed = 1; seed < 400 && !best; seed++) {
    const rng = mulberry32(seed);
    const model = new Model(makeTypes());
    const asked = [];
    const snaps = [{ n: 0, marg: model.marg().slice() }];
    for (let step = 0; step < 20; step++) {
      const c = model.conf();
      const coarse = c.conf < 0.62;
      const q = pickNext(model, pool, asked, { coarse, pickBoost: coarse ? 1 : 2, rng });
      if (!q) break;
      const g = model.gain(q, coarse ? 6 : 1);
      const st = shouldStop(model, asked.length, g);
      if (st.stop && asked.length > 0) break;
      asked.push(q);
      model.answer(q, sample(knowProbs(q, TRUTH, TR), rng));
      snaps.push({ n: asked.length, marg: model.marg().slice() });
    }
    const fin = model.conf();
    if (fin.age === TRUTH && asked.length >= 8) best = { snaps, asked };
  }

  // 兜底：找不到就用最后一轮
  const snapsAll = best ? best.snaps : [{ n: 0, marg: new Model(makeTypes()).marg() }];

  // 取 4 个关键节点：开始 / 约 1/3 / 约 2/3 / 结束
  const idxs = [0,
    Math.round((snapsAll.length - 1) / 3),
    Math.round((snapsAll.length - 1) * 2 / 3),
    snapsAll.length - 1];
  const snaps = idxs.map(i => snapsAll[i]);

  const W = 760, H = 450;
  const padX = 30, gap = 14;
  const cw = (W - padX * 2 - gap * 3) / 4;
  const ch = 168;
  const top = 128;

  let panels = '';
  snaps.forEach((snap, idx) => {
    const x0 = padX + idx * (cw + gap);
    const y0 = top;
    const max = Math.max(...snap.marg);
    let bars = '';
    const innerX = x0 + 10;
    const innerW = cw - 20;
    const bw = innerW / snap.marg.length;
    snap.marg.forEach((p, i) => {
      const hgt = max > 0 ? (p / max) * (ch - 26) : 0;
      const age = AGES[i];
      const isPeak = Math.abs(age - TRUTH) <= 1;
      bars += `<rect x="${(innerX + i * bw).toFixed(1)}" y="${(y0 + ch - hgt).toFixed(1)}" width="${Math.max(bw - 0.8, 0.6).toFixed(2)}" height="${hgt.toFixed(1)}" fill="${isPeak ? C.green : C.purple}" opacity="${isPeak ? 1 : 0.5}" rx="0.5"/>`;
    });
    const guess = (() => {
      let bestS = -1, at = AGES[0];
      for (let i = 0; i < snap.marg.length; i++) {
        let s = 0;
        for (let d = -1; d <= 1; d++) { const j = i + d; if (j >= 0 && j < snap.marg.length) s += snap.marg[j]; }
        if (s > bestS) { bestS = s; at = AGES[i]; }
      }
      return at;
    })();
    const label = snap.n === 0 ? '还没答题' : '答了 ' + snap.n + ' 题';
    panels += `<g>
<rect x="${x0}" y="${y0 - 46}" width="${cw}" height="${ch + 84}" rx="10" fill="${C.card}" stroke="${C.line}"/>
<text x="${x0 + cw / 2}" y="${y0 - 22}" font-size="12.5" font-weight="600" fill="${C.ink}" text-anchor="middle">${label}</text>
${bars}
<line x1="${innerX}" y1="${y0 + ch}" x2="${innerX + innerW}" y2="${y0 + ch}" stroke="${C.line}" stroke-width="1"/>
<text x="${innerX}" y="${y0 + ch + 16}" font-size="10" fill="${C.faint}" text-anchor="start">15</text>
<text x="${innerX + innerW}" y="${y0 + ch + 16}" font-size="10" fill="${C.faint}" text-anchor="end">55</text>
<text x="${x0 + cw / 2}" y="${y0 + ch + 40}" font-size="13" fill="${C.green}" text-anchor="middle" font-weight="600">猜 ${guess} 岁</text>
</g>`;
  });

  const body = `
<text x="${padX}" y="34" font-size="17" font-weight="700" fill="${C.purpleDeep}">贝叶斯推断：每答一题，范围就窄一点</text>
<text x="${padX}" y="58" font-size="13" fill="${C.soft}">横轴是 15–55 岁的每一个年龄，柱子的高度是它成为答案的可能性</text>
<text x="${padX}" y="80" font-size="12.5" fill="${C.green}">这个例子的真实年龄是 32 岁，绿色柱就是最后猜中的位置</text>
<text x="${padX}" y="102" font-size="11.5" fill="${C.faint}">一开始所有年龄都可能，每题削掉一批，最后收敛到一小段。</text>
${panels}`;

  fs.writeFileSync(path.join(OUT, 'fig2-bayes.svg'), svg(W, H, body));
  console.log('fig2 ok, 题数', best ? best.asked.length : 'n/a');
}

/* ============================================================
 * 图三：简单平均 vs 指数饱和
 * ============================================================ */
function fig3() {
  const W = 760, H = 380;
  const L = 62, R = W - 30, T = 92, B = 262;
  const xMax = 5, yMax = 1;

  const xToPx = v => L + (v / xMax) * (R - L);
  const yToPx = v => B - (v / yMax) * (B - T);

  let grid = '';
  for (const p of [0, 0.25, 0.5, 0.75, 1]) {
    const y = yToPx(p);
    grid += `<line x1="${L}" y1="${y}" x2="${R}" y2="${y}" stroke="${C.line}" stroke-width="1"/>
<text x="${L - 10}" y="${y + 4}" font-size="11" fill="${C.faint}" text-anchor="end">${p}</text>`;
  }

  // 两条曲线
  const pts1 = [], pts2 = [];
  for (let i = 0; i <= 100; i++) {
    const acc = (i / 100) * xMax;
    // 简单平均：假设 acc 就是"覆盖年数"，归一化到 0-1（除以 5 年）
    const simple = Math.min(1, (acc / 5) * 1);
    const sat = 1 - Math.exp(-acc / 0.9);
    pts1.push(`${xToPx(acc).toFixed(1)},${yToPx(simple).toFixed(1)}`);
    pts2.push(`${xToPx(acc).toFixed(1)},${yToPx(sat).toFixed(1)}`);
  }

  const body = `
<text x="${L}" y="34" font-size="17" font-weight="700" fill="${C.purpleDeep}">踩过的那个坑：简单平均 vs 指数饱和</text>
<text x="${L}" y="58" font-size="13" fill="${C.soft}">两条线都在算「这个人在目标年龄区间里待了多久」，但结果差很多</text>
${grid}
<line x1="${L}" y1="${B}" x2="${R}" y2="${B}" stroke="${C.soft}" stroke-width="1.5"/>
<text x="${(L + R) / 2}" y="${B + 34}" font-size="12" fill="${C.faint}" text-anchor="middle">在目标年龄区间里的累计年数</text>
<text x="${L - 10}" y="${T - 12}" font-size="11" fill="${C.faint}" text-anchor="start">命中程度</text>

<polyline points="${pts1.join(' ')}" fill="none" stroke="${C.orange}" stroke-width="2.6"/>
<polyline points="${pts2.join(' ')}" fill="none" stroke="${C.green}" stroke-width="2.6"/>

<g font-size="13">
  <rect x="${R - 268}" y="${T + 6}" width="262" height="70" rx="8" fill="${C.card}" stroke="${C.line}"/>
  <line x1="${R - 250}" y1="${T + 28}" x2="${R - 220}" y2="${T + 28}" stroke="${C.orange}" stroke-width="2.6"/>
  <text x="${R - 212}" y="${T + 32}" fill="${C.ink}">简单平均（我第一版）</text>
  <line x1="${R - 250}" y1="${T + 56}" x2="${R - 220}" y2="${T + 56}" stroke="${C.green}" stroke-width="2.6"/>
  <text x="${R - 212}" y="${T + 60}" fill="${C.ink}">指数饱和（原版）</text>
</g>

<text x="${L}" y="${B + 62}" font-size="12.5" fill="${C.soft}">区别在于：人一旦「赶上过」，再待更久也不会更「命中」；</text>
<text x="${L}" y="${B + 82}" font-size="12.5" fill="${C.soft}">简单平均却会一直往上加，等于把「赶上过」和「赶上很久」当成两回事。</text>`;

  fs.writeFileSync(path.join(OUT, 'fig3-formula.svg'), svg(W, H, body));
  console.log('fig3 ok');
}

/* ============================================================
 * 图四：首播年 ≠ 流行期
 * ============================================================ */
function fig4() {
  const W = 760, H = 340;
  const L = 118, R = W - 34, T = 96;
  const yOf = i => T + i * 58;
  const yearToX = y => L + (y - 1984) / (2016 - 1984) * (R - L);

  const rows = [
    { name: '86 版西游记', jp: [1986, 1986], cn: [1986, 2010], note: '年年暑假重播' },
    { name: '四驱兄弟', jp: [1996, 1997], cn: [1998, 2005], note: '大陆引进晚 2 年' },
    { name: '灌篮高手', jp: [1993, 1996], cn: [1998, 2006], note: '大陆引进晚 5 年' },
  ];

  let grid = '';
  for (const yr of [1985, 1990, 1995, 2000, 2005, 2010, 2015]) {
    grid += `<line x1="${yearToX(yr)}" y1="${T - 24}" x2="${yearToX(yr)}" y2="${yOf(rows.length - 1) + 26}" stroke="${C.line}" stroke-width="1" opacity="0.6"/>
<text x="${yearToX(yr)}" y="${T - 34}" font-size="11" fill="${C.faint}" text-anchor="middle">${yr}</text>`;
  }

  let bars = '';
  rows.forEach((r, i) => {
    const y = yOf(i);
    bars += `<text x="${L - 14}" y="${y + 5}" font-size="13" fill="${C.ink}" text-anchor="end">${esc(r.name)}</text>
<rect x="${yearToX(r.jp[0])}" y="${y - 16}" width="${Math.max(yearToX(r.jp[1] + 1) - yearToX(r.jp[0]), 3)}" height="12" rx="3" fill="${C.orange}" opacity="0.85"/>
<rect x="${yearToX(r.cn[0])}" y="${y - 1}" width="${Math.max(yearToX(r.cn[1] + 1) - yearToX(r.cn[0]), 3)}" height="12" rx="3" fill="${C.green}" opacity="0.9"/>
<text x="${yearToX(r.cn[1]) + 10}" y="${y + 11}" font-size="11.5" fill="${C.soft}">${esc(r.note)}</text>`;
  });

  const body = `
<text x="34" y="34" font-size="17" font-weight="700" fill="${C.purpleDeep}">我犯的错：把「首播年」当成了「流行期」</text>
<text x="34" y="58" font-size="13" fill="${C.soft}">1999 年出生的人，童年是 2003–2013，动画可能是 2008 年才看到</text>
${grid}${bars}

<g font-size="12.5">
  <rect x="34" y="${yOf(rows.length - 1) + 54}" width="14" height="12" rx="3" fill="${C.orange}" opacity="0.85"/>
  <text x="56" y="${yOf(rows.length - 1) + 65}" fill="${C.ink}">日本首播期</text>
  <rect x="176" y="${yOf(rows.length - 1) + 54}" width="14" height="12" rx="3" fill="${C.green}"/>
  <text x="198" y="${yOf(rows.length - 1) + 65}" fill="${C.ink}">大陆真正流行期</text>
  <text x="360" y="${yOf(rows.length - 1) + 65}" fill="${C.faint}">差的这几年，就是年龄被猜老的原因</text>
</g>`;

  fs.writeFileSync(path.join(OUT, 'fig4-timeline.svg'), svg(W, H, body));
  console.log('fig4 ok');
}

fig1();
fig2();
fig3();
fig4();
console.log('全部生成完毕 ->', OUT);
