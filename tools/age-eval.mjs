/** 全量评测：差 1/3/5 岁的准确率、召回率、误报率。 */
import { Model, makeTypes, pickNext, shouldStop, knowProbs, AGES } from '../age-memory/engine.js';
import { ALL as ITEMS } from '../age-memory/items.js';

const NORMAL = { retro: false, parent: false, urban: true, gamer: true };
const PER_AGE = parseInt(process.argv[2] || '40', 10);

function sample(probs, rng = Math.random) {
  const r = rng();
  let acc = 0;
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i];
    if (r <= acc) return i;
  }
  return probs.length - 1;
}

function runOne(realAge) {
  const model = new Model(makeTypes());
  const asked = [];
  const pool = ITEMS.filter(q => !q.off);
  for (let step = 0; step < 40; step++) {
    const c = model.conf();
    const coarse = c.conf < 0.62;
    const q = pickNext(model, pool, asked, { coarse, pickBoost: coarse ? 1 : 2 });
    if (!q) break;
    const g = model.gain(q, coarse ? 6 : 1);
    const st = shouldStop(model, asked.length, g);
    if (st.stop && asked.length > 0) break;
    asked.push(q);
    model.answer(q, sample(knowProbs(q, realAge, NORMAL)));
  }
  return model.conf().age;
}

// 对每个真实年龄，统计预测
const hits = [];   // {real, guess, diff}
const byAge = {};
for (const age of AGES) byAge[age] = { guessSum: 0, n: 0, within1: 0, within3: 0, within5: 0 };

for (const age of AGES) {
  for (let i = 0; i < PER_AGE; i++) {
    const guess = runOne(age);
    const diff = Math.abs(guess - age);
    hits.push({ real: age, guess, diff });
    byAge[age].n++;
    byAge[age].guessSum += guess;
    if (diff <= 1) byAge[age].within1++;
    if (diff <= 3) byAge[age].within3++;
    if (diff <= 5) byAge[age].within5++;
  }
}

function report(maxDiff) {
  const label = maxDiff + '岁';
  // 准确率 = 预测落在 ±maxDiff 内的比例
  const acc = hits.filter(h => h.diff <= maxDiff).length / hits.length;
  // 召回率/误报率 在这里：把「正类」定义为「预测年龄 == 真实年龄 ± maxDiff」
  // 由于是连续年龄，用 ±maxDiff 命中即 TP，未命中即 FN+FP 混在一起。
  // 单独拆 TP / FP / FN 需要二分类阈值，这里给出：
  //   TP = 命中（|guess-real|<=maxDiff）
  //   FP = 预测到了某个年龄但真实不在窗口 —— 对连续回归，等价于未命中里「猜偏」的那部分
  //   我们用更标准的口径：把每个「预测结果」当做一个事件
  //   召回 = TP / (TP + FN)，其中 FN = 未命中
  //   精确率 = TP / (TP + FP)
  // 对连续回归，FP 与 FN 同源，故召回=精确=准确率。这里按用户要求单独列。
  const tp = hits.filter(h => h.diff <= maxDiff).length;
  const miss = hits.length - tp;
  const recall = tp / hits.length;
  // 误报率：把「猜错」定义为误报，口径 = miss / total
  const fpr = miss / hits.length;
  console.log(label + ' 准确率: ' + (acc * 100).toFixed(1) + '%');
  console.log('  命中 TP=' + tp + ' 未命中=' + miss);
  console.log('  召回率(TP/(TP+FN)): ' + (recall * 100).toFixed(1) + '%');
  console.log('  误报率(未命中/总数): ' + (fpr * 100).toFixed(1) + '%');
  console.log('');
}

console.log('=== 评测：每岁 ' + PER_AGE + ' 次模拟，共 ' + hits.length + ' 次 ===\n');
report(1);
report(3);
report(5);

// 平均绝对误差
const mae = hits.reduce((s, h) => s + h.diff, 0) / hits.length;
console.log('平均绝对误差(MAE): ' + mae.toFixed(2) + ' 岁');

// 中位数误差
const diffs = hits.map(h => h.diff).sort((a,b)=>a-b);
console.log('中位数误差: ' + diffs[Math.floor(diffs.length/2)] + ' 岁');

// 各年龄 ±3 命中
console.log('\n=== 各年龄 ±3岁 命中率 ===');
for (const age of AGES) {
  const b = byAge[age];
  const p = (b.within3 / b.n * 100).toFixed(0);
  const bar = '#'.repeat(Math.round(b.within3 / b.n * 40));
  console.log(String(age).padStart(3) + ' ' + bar + ' ' + p + '%');
}
