/** 只看 20–40 岁的评测（这是目标人群） */
import { Model, makeTypes, pickNext, shouldStop, knowProbs } from '../age-memory/engine.js';
import { ALL as ITEMS } from '../age-memory/items.js';

const NORMAL = { retro: false, parent: false, urban: true, gamer: true };
const PER_AGE = parseInt(process.argv[2] || '50', 10);

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

const hits = [];
const byAge = {};
for (let age = 20; age <= 40; age++) {
  byAge[age] = { n: 0, within1: 0, within3: 0, within5: 0 };
  for (let i = 0; i < PER_AGE; i++) {
    const guess = runOne(age);
    const diff = Math.abs(guess - age);
    hits.push({ real: age, guess, diff });
    byAge[age].n++;
    if (diff <= 1) byAge[age].within1++;
    if (diff <= 3) byAge[age].within3++;
    if (diff <= 5) byAge[age].within5++;
  }
}

console.log('=== 20–40 岁评测：每岁 ' + PER_AGE + ' 次，共 ' + hits.length + ' 次 ===\n');
for (const maxDiff of [1, 3, 5]) {
  const tp = hits.filter(h => h.diff <= maxDiff).length;
  const acc = tp / hits.length;
  console.log('±' + maxDiff + '岁  准确率=' + (acc * 100).toFixed(1) + '%  误报率=' + ((1 - acc) * 100).toFixed(1) + '%');
}

const mae = hits.reduce((s, h) => s + h.diff, 0) / hits.length;
console.log('\nMAE: ' + mae.toFixed(2) + ' 岁');

console.log('\n各年龄 ±1岁 命中率：');
for (let age = 20; age <= 40; age++) {
  const b = byAge[age];
  const p = b.within1 / b.n * 100;
  const bar = '#'.repeat(Math.round(p / 2));
  console.log(String(age).padStart(3) + ' ' + bar + ' ' + p.toFixed(0) + '%');
}

console.log('\n各年龄 ±3岁 命中率：');
for (let age = 20; age <= 40; age++) {
  const b = byAge[age];
  const p = b.within3 / b.n * 100;
  const bar = '#'.repeat(Math.round(p / 2));
  console.log(String(age).padStart(3) + ' ' + bar + ' ' + p.toFixed(0) + '%');
}
