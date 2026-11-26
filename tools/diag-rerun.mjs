/** 诊断 3：重播文化。
 *  中国有大量"每年暑假重播"的剧（西游记、还珠格格、四驱兄弟、灌篮高手），
 *  1999 年出生的人 2008-2012 年照样看，答"当然记得"是真实的。
 *  但模型里 pyoung[0]（后来才迷上的比例 hy）默认只有 0.01，上限 0.3，
 *  所以「年轻但记得」被严重惩罚 → 年龄被推老。
 */
import { knowProbs } from '../age-memory/engine.js';

const TR = { retro: false, parent: false, urban: true, gamer: true };

// 构造一道"重播型"题目，测试不同 hy 下 27 岁答"记得"的似然
const base = { id: 'x', t: 'know', dom: 'tv', y: 1998, sp: 6, a: [6, 15], h: 0.9, r: 0.35 };
console.log('hy 值对「27 岁答记得」的影响：');
console.log('hy   | 27岁 记得 | 33岁 记得');
for (const hy of [0.01, 0.1, 0.2, 0.3, 0.45, 0.6]) {
  const q = { ...base, hy };
  const p27 = knowProbs(q, 27, TR);
  const p33 = knowProbs(q, 33, TR);
  console.log(
    String(hy).padStart(4) + ' | ' +
    (p27[0] * 100).toFixed(0).padStart(8) + '% | ' +
    (p33[0] * 100).toFixed(0).padStart(8) + '%'
  );
}

console.log('\nr 值对「27 岁答记得」的影响（hy=0.3）：');
console.log('r    | 27岁 记得 | 33岁 记得');
for (const r of [0.35, 0.5, 0.65, 0.8]) {
  const q = { ...base, hy: 0.3, r };
  const p27 = knowProbs(q, 27, TR);
  const p33 = knowProbs(q, 33, TR);
  console.log(
    String(r).padStart(4) + ' | ' +
    (p27[0] * 100).toFixed(0).padStart(8) + '% | ' +
    (p33[0] * 100).toFixed(0).padStart(8) + '%'
  );
}
