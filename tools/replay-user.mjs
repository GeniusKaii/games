// 临时：用真实题目 id 复现用户作答
import { Model, makeTypes } from '../age-memory/engine.js';
import { ALL as ITEMS } from '../age-memory/items.js';

const byId = {};
ITEMS.forEach(q => byId[q.id] = q);

// 按 OCR 记录的实际题目，用题目 q 文本反查 id
function idByText(part) {
  for (const q of ITEMS) {
    if (q.q.includes(part) || (q.d && q.d.includes(part))) return q.id;
  }
  return null;
}

const seq = [
  ['美剧', 1],
  ['地下城与勇士', 2],
  ['录音机', 3],
  ['西游记', 0],
  ['邓丽君', 1],
  ['粮票', 2],
  ['连环画', 2],
  ['四驱', 0],
  ['嘻哈', 2],
  ['灌篮高手', 0],
  ['奶茶', 1],
  ['港台流行音乐', 2],
  ['偶像剧', 2],
  ['绝地求生', 0],
  ['果冻', 0],
  ['抽卡手游', 1],
  ['CD', 0],
  ['天天酷跑', 0],
  ['寻呼机', 2],
];

const model = new Model(makeTypes());
let ok = 0;
for (const [kw, r] of seq) {
  const id = idByText(kw);
  if (!id) { console.log('未找到:', kw); continue; }
  model.answer(byId[id], r);
  ok++;
}
console.log('作答', ok, '题');
console.log('最终猜测:', model.conf().age, '岁');
