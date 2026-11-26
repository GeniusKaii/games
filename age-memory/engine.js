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

/** 归一化：和不为正时退回均匀分布 */
function norm(arr) {
  let s = 0;
  for (const v of arr) s += v;
  if (!(s > 0)) return arr.map(() => 1 / arr.length);
  return arr.map(v => v / s);
}

/** 混入均匀噪声：答错/心情不好时不让某档概率归零，避免贝叶斯支路被全灭 */
function mixNoise(p, amount) {
  const u = 1 / p.length;
  return norm(p.map(v => v * (1 - amount) + amount * u));
}

/**
 * 似然缓存：每道题 × 每种人型的 4 档答案分布只跟「题 + 人型 + 年龄」有关，
 * 与当前后验无关。题只有 127 道、人型 16 种，完全可以预计算一次。
 * key = q.id + ':' + typeIndex
 */
const likelihoodCache = new Map();

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

/** 年龄先验：朋友集中在 20–40 岁，这个区间内尽量平坦，让题目信息主导推断；
 *  区间外平滑下降，作为兜底（长辈/小孩误入时不至于猜得离谱）。 */
function agePrior(a) {
  if (a >= 20 && a <= 40) return 1.0;
  if (a < 20) {
    // 15–19 从 0.45 平滑升到 1.0
    return 0.45 + 0.55 * (a - 15) / 5;
  }
  // 41–55 从 1.0 平滑降到 0.3
  return 1.0 - 0.7 * (a - 40) / 15;
}

/* ------------------------------------------------------------
 * 单题概率模型
 * 给一道题和某个年龄，算出这个年龄的人选四个答案各自的概率。
 * ---------------------------------------------------------- */
export function knowProbs(q, age, tr) {
  // quiz 题走独立的「对错」模型（3 档：对/错/不知道）
  if (q.t === 'quiz') return quizProbs(q, age);

  const B = NOW - age - 0.5;            // 出生年（取中点）
  const y0 = q.y;
  const y1 = q.y + (q.sp || 1);
  const a0 = q.a[0];
  const a1 = q.a[1];

  const ageMid = (y0 + y1) / 2 - B;     // 流行中点时他几岁
  const ageEnd = y1 - B;                // 流行结束时他几岁

  // 「当时偏大」与「当时太小/未出生」的程度
  const O = sig((ageMid - (a1 + 0.5)) / 1.0);
  const Y = sig(((a0 - 0.5) - ageEnd) / 1.0);
  const oy = O + Y;

  // 流行期内真正落在目标年龄的份额：指数饱和（原版 D = 1 - exp(-acc/0.9)）
  const steps = Math.max(2, Math.ceil((y1 - y0) / 0.25));
  const dt = (y1 - y0) / steps;
  let acc = 0;
  for (let k = 0; k <= steps; k++) {
    const t = y0 + k * dt;
    acc += win(t - B, a0, a1, 0.7) * (k === 0 || k === steps ? dt / 2 : dt);
  }
  const D = 1 - Math.exp(-acc / 0.9);

  const wIn = D;
  const wOld = (1 - D) * (oy > 1e-9 ? O / oy : 0.5);
  const wYoung = (1 - D) * (oy > 1e-9 ? Y / oy : 0.5);

  // 人格修正：retro/gamer/urban
  const fh = tr.retro ? 1.15 : 1;          // 考古型更可能「沉迷」
  const fa = tr.retro ? 1.2 : 1;           // 更可能「知道」
  let h = Math.min(0.95, (q.h ?? 0.6) * fh);
  if (q.dom === 'game' && !tr.gamer) h *= 0.3;
  if (q.dom === 'net' && !tr.urban) h *= 0.6;

  // aw：当时该年龄的人里，知道名字以上的比例（默认 94%）
  const aw = Math.max(h + 0.02, Math.min(0.99, 0.94 * fa));
  const pin = [h, (aw - h) * 0.72, (aw - h) * 0.28, 1 - aw];

  // ---- 偏大态：三档独立衰减（ho/ko/no，45/70 年）----
  const gap = Math.max(0, ageMid - a1);
  const ho = Math.min(0.9, 0.10 * fh);      // 偏大的人「沉迷过」略提，弱化「知道旧=年纪大」
  const ko = Math.max(ho, Math.min(0.95, 0.35 * fa * Math.exp(-gap / 45)));
  const no = Math.max(ko, Math.min(0.98, 0.85 * Math.exp(-gap / 70)));
  let pold = [ho, ko - ho, no - ko, 1 - no];

  // parent 修正：儿童向内容，当时 27–47 岁的人陪孩子知道
  if (a1 <= 13 && tr.parent) {
    const wp = win(ageMid, 27, 47, 2.5) * 0.45;
    if (wp > 1e-3) {
      const hp = Math.max(ho, Math.min(0.9, 0.12 * fh));
      const kp = Math.max(ko, hp, Math.min(0.85, 0.35 * 2.2 * fa));
      const np = Math.max(no, kp, Math.min(0.97, 0.95));
      const ppar = [hp, kp - hp, np - kp, 1 - np];
      pold = pold.map((v, r) => v * (1 - wp) + ppar[r] * wp);
    }
  }

  // ---- 幼小态：当时还没出生或太小，后来才认识 ----
  const yrs = Math.max(0, (a0 - 0.5) - ageEnd);
  // 大陆特有：重播文化。暑假重播的剧、一直玩到大的玩具、长辈家能见到的老物件，
  // 没赶上首播的人后来照样会答「当然记得」。模型若按「没出生就不可能记得」重罚，
  // 年轻端会被系统性推老（实测 27 岁被判成 33 岁）。
  // 所以给幼小态一个保底：无论什么题，「后来才认识且真的熟悉」都留一个不低的概率，
  // 只是随「差多少年」衰减。
  const longevity = Math.min(1, (q.sp || 1) / 12);
  let R = Math.min(0.97, (q.r ?? 0.30) * 1.3 * fa * Math.exp(-yrs / (q.rd || 12)));
  let hy = Math.min(0.30, (q.hy || 0.01) * fh * Math.exp(-yrs / 15));
  // 重播文化的问题靠题库覆盖解决（见 items-ext4），不在这里加保底：
  // 任何全局抬高都会把各年龄段拉平，反而降低区分度。
  let rk = 0.35 + 0.35 * longevity;  // 长青内容，后来认识者更偏向「熟悉」而非「只听名字」
  if (tr.retro) {
    R = Math.max(R, Math.min(0.85, (0.3 + 1.6 * (q.r ?? 0.3)) * Math.exp(-yrs / ((q.rd || 12) * 2.5))));
    hy = Math.max(hy, 0.05 * Math.exp(-yrs / 30));
    rk = 0.5;
  }
  const pyoung = [hy, R * rk, R * (1 - rk), Math.max(0, 1 - hy - R)];

  const out = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) out[i] = wIn * pin[i] + wOld * pold[i] + wYoung * pyoung[i];
  return mixNoise(out, 0.08);
}

/**
 * quiz 题：四选一知识题，正确答案 q.c。
 * 原版是 3 档（对/错/不知道），但我们的界面是四选一，所以返回 4 档：
 * 每个错误选项概率相同，正确答案概率高。
 */
function quizProbs(q, age) {
  const B = NOW - age - 0.5;
  const ageMid = (q.y + q.y + (q.sp || 1)) / 2 - B;
  const a0 = q.a[0];
  const a1 = q.a[1];

  // 命中该年龄段中心的程度
  const inRange = win(ageMid, a0, a1, 1.5);
  // 答对概率：命中年龄段时高，偏离时低
  const pCorrect = 0.25 + 0.60 * inRange;
  const wrong = (1 - pCorrect) / 3;
  const out = new Array(4).fill(wrong);
  out[q.c] = pCorrect;
  return mixNoise(out, 0.04);
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

  /** 某道题的似然矩阵 [type][age][answer]（带缓存） */
  likelihood(q) {
    return this.types.map((t, ti) => {
      const key = q.id + ':' + ti;
      let cached = likelihoodCache.get(key);
      if (!cached) {
        cached = AGES.map(a => knowProbs(q, a, t.traits));
        likelihoodCache.set(key, cached);
      }
      return cached;
    });
  }

  /** 用某个答案更新后验。temper：1 时严格按似然，小于 1 时弱化单题影响（防误点） */
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
  const { coarse = false, pickBoost = 1, rng = Math.random } = opts;
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

  // 前两题：优先打散领域，不要每次都从同一批里选
  if (asked.length < 2) {
    const usedDoms = new Set(asked.map(q => q.dom));
    const fresh = scored.filter(x => !usedDoms.has(x.q.dom));
    if (fresh.length) {
      return fresh[Math.floor(rng() * fresh.length)].q;
    }
  }

  // 从前几名里按 w^1.2 加权随机：不要总选第一名
  const k = asked.length < 2 ? Math.min(6, scored.length) : Math.min(4, scored.length);
  const topk = scored.slice(0, k);
  const ws = topk.map(x => Math.pow(Math.max(x.w, 1e-9), 1.2));
  const sum = ws.reduce((a, b) => a + b, 0);
  let r = rng() * sum;
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
