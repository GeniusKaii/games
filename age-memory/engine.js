/* ============================================================
 * 年代记忆 · 年龄推断引擎
 * 纯前端贝叶斯推断：维护 15–55 岁每个年龄的概率分布，
 * 每答一题用贝叶斯公式更新，动态选题直到分布足够集中。
 * ============================================================ */

export const AMIN = 15;
export const AMAX = 55;
export const AGES = [];
for (let a = AMIN; a <= AMAX; a++) AGES.push(a);
export const N = AGES.length;

/** 当前年份：题目锚定绝对年份，因此年龄会随时间自然推移 */
export const NOW = new Date().getFullYear();

const sig = x => 1 / (1 + Math.exp(-x));
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);

/** 平滑窗口：x 落在 [lo,hi] 内的程度 */
function win(x, lo, hi, soft) {
  return sig((x - lo) / soft) * sig((hi - x) / soft);
}

/** 把「至少达到某档」的三个比率转成互斥的四档分布 */
function build4(pHit, pSome, pName) {
  let hit = clamp01(pHit);
  let some = Math.max(clamp01(pSome), hit);
  let name = Math.max(clamp01(pName), some);
  return [hit, some - hit, name - some, 1 - name];
}

/* ------------------------------------------------------------
 * 人格维度：不是每人一个类型，而是「属性的组合」。
 * 2^4 = 16 种人型，每个都有独立的年龄概率分布，同时更新。
 * 这是整套设计的关键——它让「喜欢老歌的年轻人」和
 * 「爱看新番的中年人」不会被表面现象带偏。
 * ---------------------------------------------------------- */
export const TRAITS = ['retro', 'parent', 'urban', 'gamer'];

/** 各属性的人群占比先验 */
const TRAIT_PRIOR = { retro: 0.16, parent: 0.52, urban: 0.60, gamer: 0.50 };

/** 生成 16 种人型的属性表 */
export function makeTypes() {
  const out = [];
  for (let t = 0; t < 16; t++) {
    const o = {};
    let w = 1;
    TRAITS.forEach((k, i) => {
      const on = (t >> i) & 1;
      o[k] = !!on;
      w *= on ? TRAIT_PRIOR[k] : 1 - TRAIT_PRIOR[k];
    });
    out.push({ traits: o, prior: w });
  }
  return out;
}

/** 年龄本身的先验：中间年龄段略高 */
function agePrior(a) {
  const mid = 32;
  return Math.exp(-Math.pow((a - mid) / 22, 2)) * 0.6 + 0.4;
}

/* ------------------------------------------------------------
 * 单题概率模型
 * 给一道题和某个年龄，算出这个年龄的人选四个答案各自的概率。
 * ---------------------------------------------------------- */
export function knowProbs(q, age, tr) {
  const B = NOW - age - 0.5;            // 出生年（取中点）
  const y0 = q.y;
  const y1 = q.y + q.sp;
  const a0 = q.a[0];
  const a1 = q.a[1];

  const ageMid = (y0 + y1) / 2 - B;     // 流行中点时他几岁
  const ageEnd = y1 - B;                // 流行结束时他几岁

  // 「当时偏大」与「当时太小/未出生」的程度
  let O = sig((ageMid - (a1 + 0.5)) / 1.4);
  let Y = sig(((a0 - 0.5) - ageEnd) / 1.4);
  const s = O + Y;
  if (s > 1) { O /= s; Y /= s; }

  // 流行期内真正落在目标年龄的份额
  let acc = 0;
  let steps = 0;
  for (let yr = y0; yr <= y1 + 1e-9; yr += 0.5) {
    acc += win(yr - B, a0, a1, 1.1);
    steps++;
  }
  const D = steps ? acc / steps : 0;

  // ---- 命中态 ----
  let h = q.h ?? 0.6;
  if (q.dom === 'game') h *= 0.30 + 0.70 * (tr.gamer ? 1 : 0);
  if (q.dom === 'fem') h *= 0.40 + 0.60 * (tr.fem ? 1 : 0);
  if (q.dom === 'net') h *= 0.45 + 0.55 * (tr.urban ? 1 : 0);
  h = clamp01(0.5 * (clamp01(h) + 0.02));

  const pIn = build4(h, h + (1 - h) * 0.55, h + (1 - h) * 0.82);

  // ---- 偏大态：知道名字，但没经历 ----
  const gap = Math.max(0, ageMid - a1);
  const ho = 0.16 * Math.exp(-gap / 26);   // 「有过」的比例
  const ko = 0.52 * Math.exp(-gap / 48);   // 「只听过」的比例
  const pOld = build4(ho * 0.10, ho, ko);

  // ---- 幼小态：当时还没出生或太小，后来才认识 ----
  const retroBoost = 1 + 1.7 * (tr.retro ? 1 : 0) * 0.35;
  const yrs = Math.max(0, a0 - ageEnd);
  const r = Math.min(0.92, (q.r ?? 0.22) * retroBoost * Math.exp(-yrs / (q.rd ?? 10)));
  const pYoung = build4(0.005, r * 0.28, r);

  // ---- 混合 ----
  const wIn = D;
  const wOld = (1 - D) * (O / (O + Y || 1));
  const wYoung = (1 - D) * (Y / (O + Y || 1));

  const out = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    out[i] = wIn * pIn[i] + wOld * pOld[i] + wYoung * pYoung[i];
  }
  // 防止某档概率为 0 导致贝叶斯把支路全灭
  for (let i = 0; i < 4; i++) out[i] = Math.max(out[i], 1e-4);
  const tot = out.reduce((x, y) => x + y, 0);
  return out.map(v => v / tot);
}

/* ------------------------------------------------------------
 * 状态：16 种人型 × N 个年龄 的后验矩阵
 * ---------------------------------------------------------- */
export class Model {
  constructor(types) {
    this.types = types;
    this.reset();
  }

  reset() {
    const { types } = this;
    this.post = types.map(t => AGES.map(a => t.prior * agePrior(a)));
    this.norm();
    this.history = [];
  }

  /** 全局归一化 */
  norm() {
    let tot = 0;
    for (const row of this.post) for (const v of row) tot += v;
    if (!tot) return;
    for (const row of this.post) for (let i = 0; i < row.length; i++) row[i] /= tot;
  }

  /** 边缘分布：所有人群加总 */
  marg() {
    const m = new Array(N).fill(0);
    for (const row of this.post) for (let i = 0; i < N; i++) m[i] += row[i];
    return m;
  }

  /** 某道题的似然矩阵 [type][age][answer] */
  likelihood(q) {
    return this.types.map(t => AGES.map(a => knowProbs(q, a, t.traits)));
  }

  /** 用某个答案更新后验 */
  answer(q, r, temper = 0.85) {
    const L = this.likelihood(q);
    let totalAns = 0;
    for (let t = 0; t < this.types.length; t++) {
      for (let i = 0; i < N; i++) {
        const p = Math.pow(Math.max(L[t][i][r], 1e-9), temper);
        this.post[t][i] *= p;
        totalAns += this.post[t][i];
      }
    }
    if (totalAns > 0) {
      for (const row of this.post) for (let i = 0; i < N; i++) row[i] /= totalAns;
    }
    this.history.push({ q, r });
  }

  /** 熵：用于算信息增益 */
  entropy(dist) {
    let H = 0;
    for (const p of dist) {
      if (p > 1e-12) H -= p * Math.log2(p);
    }
    return H;
  }

  /** 按 binSize 岁分桶后的分布 */
  binned(m, binSize) {
    const out = [];
    for (let i = 0; i < N; i += binSize) {
      let s = 0;
      for (let j = i; j < Math.min(i + binSize, N); j++) s += m[j];
      out.push(s);
    }
    return out;
  }

  /**
   * 期望信息增益：所有可能答案加权后的熵减。
   * 分两段——粗定位用 6 岁桶，精定位用 1 岁粒度。
   */
  gain(q, binSize) {
    const m = this.marg();
    const H0 = this.entropy(this.binned(m, binSize));
    const L = this.likelihood(q);

    // 每个答案的边缘概率
    const pAns = [0, 0, 0, 0];
    for (let t = 0; t < this.types.length; t++) {
      for (let i = 0; i < N; i++) {
        for (let r = 0; r < 4; r++) pAns[r] += this.post[t][i] * L[t][i][r];
      }
    }

    let expH = 0;
    for (let r = 0; r < 4; r++) {
      if (pAns[r] < 1e-6) continue;
      // 该答案下的后验（只用来估熵，不落盘）
      const post = [];
      for (let t = 0; t < this.types.length; t++) {
        const row = new Array(N);
        for (let i = 0; i < N; i++) row[i] = this.post[t][i] * L[t][i][r];
        post.push(row);
      }
      const mm = new Array(N).fill(0);
      for (const row of post) for (let i = 0; i < N; i++) mm[i] += row[i];
      const tot = mm.reduce((x, y) => x + y, 0) || 1;
      for (let i = 0; i < N; i++) mm[i] /= tot;
      expH += pAns[r] * this.entropy(this.binned(mm, binSize));
    }
    return H0 - expH;
  }

  /** 三岁滑窗取最大：比单点 argmax 稳得多 */
  conf() {
    const m = this.marg();
    let best = -1;
    let at = AGES[0];
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let d = -1; d <= 1; d++) {
        const j = i + d;
        if (j >= 0 && j < N) s += m[j];
      }
      if (s > best) { best = s; at = AGES[i]; }
    }
    return { age: at, conf: best };
  }

  /** 当前最可能的若干年龄，用于展示分布形状 */
  top(n = 5) {
    const m = this.marg();
    return AGES.map((a, i) => ({ age: a, p: m[i] }))
      .sort((x, y) => y.p - x.p)
      .slice(0, n);
  }
}

/* ------------------------------------------------------------
 * 选题：不是固定问卷，每轮挑信息增益最大的
 * ---------------------------------------------------------- */
export function pickNext(model, pool, asked, opts = {}) {
  const { coarse = false, pickBoost = 1 } = opts;
  const binSize = coarse ? 6 : 1;

  const scored = [];
  const usedGroups = new Set(
    asked.map(q => q.g).filter(Boolean)
  );

  for (const q of pool) {
    if (asked.includes(q)) continue;
    if (q.g && usedGroups.has(q.g)) continue;
    const g = model.gain(q, binSize);
    // 连续同类型题目降权，避免单调
    let w = g * (q.t === 'pick' ? pickBoost : 1);
    // 最近 3 题同领域的降权
    const last3 = asked.slice(-3).map(x => x.dom);
    if (last3.filter(d => d === q.dom).length >= 2) w *= 0.7;
    scored.push({ q, w });
  }

  if (!scored.length) return null;
  scored.sort((a, b) => b.w - a.w);

  // 从前几名里按 w² 加权随机：每次玩题目不完全一样
  const k = asked.length < 2 ? Math.min(6, scored.length) : Math.min(3, scored.length);
  const topk = scored.slice(0, k);
  const ws = topk.map(x => Math.pow(Math.max(x.w, 1e-9), 2));
  const sum = ws.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < topk.length; i++) {
    r -= ws[i];
    if (r <= 0) return topk[i].q;
  }
  return topk[0].q;
}

/* ------------------------------------------------------------
 * 终止判断
 * ---------------------------------------------------------- */
export const STOP = {
  minQ: 11,
  maxQ: 20,
  conf: 0.80,      // 三岁窗口累计概率
  minGain: 0.02,   // 后半段问不动了就收
};

export function shouldStop(model, askedCount, bestGain) {
  const { conf } = model.conf();
  if (askedCount >= STOP.maxQ) return { stop: true, reason: 'max' };
  if (askedCount >= STOP.minQ && conf >= STOP.conf) return { stop: true, reason: 'conf' };
  if (askedCount >= STOP.minQ + 4 && bestGain < STOP.minGain) return { stop: true, reason: 'flat' };
  return { stop: false };
}
