/** 诊断：题库覆盖度。看「各出生世代」的童年锚点有多少道题能区分。 */
import { ALL as ITEMS } from '../age-memory/items.js';

// 对每个出生年，统计有多少题的"命中年龄区间"覆盖到他的童年（4-14 岁）
function coverageFor(ageIn2026) {
  const birth = 2026 - ageIn2026;
  let n = 0;
  for (const q of ITEMS) {
    // 题目流行期内，这个人是否有 4-14 岁的时光
    const yStart = q.y;
    const yEnd = q.y + (q.sp || 1);
    // 这个人的 4-14 岁对应年份
    const kidStart = birth + 4;
    const kidEnd = birth + 14;
    if (yEnd >= kidStart && yStart <= kidEnd) n++;
  }
  return n;
}

console.log('出生年 | 2026年龄 | 覆盖其童年的题数');
for (let age = 20; age <= 40; age++) {
  console.log(
    String(2026 - age).padStart(6) + ' | ' +
    String(age).padStart(8) + ' | ' +
    String(coverageFor(age)).padStart(6)
  );
}

// 重点：2008-2015 年的儿童内容（27 岁人的童年）有多少
console.log('\n=== 2008 年后流行的儿童向题目（a1<=14） ===');
const kids2010 = ITEMS.filter(q => q.y >= 2008 && q.a[1] <= 14);
console.log('数量:', kids2010.length);
kids2010.forEach(q => console.log('  ', q.q));
