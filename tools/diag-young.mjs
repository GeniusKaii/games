/** 诊断 2：为什么年轻端被推老？
 *  抽一道 90 年代的题，看 27 岁（1999 年出生）和 33 岁（1993 年出生）的似然差。
 *  27 岁的人 1999 年才 0 岁，属于「幼小态」；33 岁的人刚好处在目标年龄。
 */
import { knowProbs } from '../age-memory/engine.js';
import { ALL as ITEMS } from '../age-memory/items.js';

const TR = { retro: false, parent: false, urban: true, gamer: true };

const tests = ['hzgz', 'siqu', 'xbw', 'xyj'];
for (const id of tests) {
  const q = ITEMS.find(x => x.id === id);
  if (!q) continue;
  console.log('=== ' + q.q + ' (y=' + q.y + ', sp=' + q.sp + ', a=[' + q.a + '])');
  const rows = [];
  for (const age of [27, 30, 33]) {
    const p = knowProbs(q, age, TR);
    rows.push(
      String(age) + '岁: 记得' + (p[0] * 100).toFixed(0) + '% 有点' +
      (p[1] * 100).toFixed(0) + '% 听过' + (p[2] * 100).toFixed(0) + '% 不懂' + (p[3] * 100).toFixed(0) + '%'
    );
  }
  console.log('  ' + rows.join('\n  '));
  console.log('');
}
