/** 诊断：不同年龄的人对「旧东西」答「记得」时，模型偏向哪个年龄。
 *  检查「幼小态」和「偏大态」的似然对比是否失衡。 */
import { knowProbs } from '../age-memory/engine.js';
import { ALL as ITEMS } from '../age-memory/items.js';

const TR = { retro: false, parent: false, urban: true, gamer: true };

// 取一道 2000 年流行的题，看不同年龄的人答「当然记得」(r=0) 的似然
const q = ITEMS.find(x => x.id === 'qq');   // 网吧/QQ, y=2000
console.log('题目:', q.q, ' 流行年:', q.y, '~', q.y + q.sp);
console.log('');
console.log('年龄 | 当时几岁 | 答「当然记得」的似然');
for (let age = 20; age <= 45; age++) {
  const birth = 2026 - age;
  const ageIn2000 = 2000 - birth;
  const p = knowProbs(q, age, TR);
  console.log(
    String(age).padStart(4) + ' | ' +
    String(ageIn2000).padStart(8) + ' | ' +
    (p[0] * 100).toFixed(1).padStart(6) + '%'
  );
}
