/* ============================================================
 * 年代记忆 · 主流程
 * ============================================================ */

import {
  Model, makeTypes, pickNext, shouldStop, AGES, N, NOW,
  TRAITS, STOP,
} from './engine.js';
import { ALL as ITEMS, OPTIONS } from './items.js';
import { drawQR } from './qr.js';

const $ = id => document.getElementById(id);

const state = {
  model: null,
  asked: [],
  answers: [],      // {q, r, label}
  pool: [],
  guess: null,
};

/* ---------------- 视图切换 ---------------- */
function show(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
  $(id).classList.add('on');
  window.scrollTo(0, 0);
}

/* ---------------- 开始 ---------------- */
function start() {
  state.model = new Model(makeTypes());
  state.asked = [];
  state.answers = [];
  state.pool = ITEMS.filter(q => !q.off);
  state.guess = null;
  nextQuestion();
  show('v-quiz');
}

/* ---------------- 出下一题 ---------------- */
function nextQuestion() {
  const m = state.model;

  // 分两段：先粗定位，置信区间窄了再精定位
  const c = m.conf();
  const coarse = c.conf < 0.62;
  const q = pickNext(m, state.pool, state.asked, {
    coarse,
    pickBoost: coarse ? 1 : 2,
  });

  if (!q) return finish();

  const bestGain = m.gain(q, coarse ? 6 : 1);
  const st = shouldStop(m, state.asked.length, bestGain);
  if (st.stop && state.asked.length > 0) return finish();

  state.asked.push(q);
  renderQuestion(q);
}

function renderQuestion(q) {
  $('qNo').textContent = '第 ' + state.asked.length + ' 题';
  const pct = Math.min(92, Math.round(state.asked.length / STOP.maxQ * 100));
  $('progFill').style.width = pct + '%';
  $('qPct').textContent = pct + '%';

  const kindMap = {
    know: '年代回忆', pick: '年代定位', quiz: '冷知识',
  };
  $('qKind').textContent = kindMap[q.t] || '年代回忆';
  $('qTitle').textContent = q.q || '';
  $('qDesc').textContent = q.d || '';
  $('qAsk').textContent = '你记得它吗？';

  let labels;
  if (q.t === 'quiz' && q.opts) {
    $('qAsk').textContent = '选一个你觉得对的';
    labels = q.opts;
  } else if (q.t === 'pick') {
    labels = ['我还没出生 / 太小没印象', '小时候家里有过', '我正当年', '我那时候已经不怎么用了'];
    $('qAsk').textContent = '它流行的时候，你在什么状态？';
  } else {
    labels = OPTIONS.know;
    $('qAsk').textContent = '你记得它吗？';
  }

  const box = $('opts');
  box.innerHTML = '';
  labels.forEach((text, i) => {
    const b = document.createElement('button');
    b.className = 'opt';
    b.innerHTML = '<span class="tag">' + 'ABCD'[i] + '</span>' + text;
    b.addEventListener('click', () => answer(q, i, text));
    box.appendChild(b);
  });
}

/* ---------------- 作答 ---------------- */
function answer(q, r, label) {
  state.model.answer(q, r);
  state.answers.push({ q, r, label });
  // 连续两次「不知道」提高耐心：降低置信门槛的感觉靠题目自然收敛
  nextQuestion();
}

/* ---------------- 收尾 ---------------- */
function finish() {
  // 跳过时也要有一处可视化标记，避免用户无所适从
  const c = state.model.conf();
  state.guess = c.age;
  $('guessAge').textContent = c.age;
  $('qTotal').textContent = state.asked.length;
  $('stamp').classList.remove('on');
  setTimeout(() => $('stamp').classList.add('on'), 260);
  $('ageInput').hidden = true;
  show('v-reveal');
}

/* ---------------- 真实年龄 ---------------- */
function submitRealAge(real) {
  const guess = state.guess;
  const diff = real - guess;
  renderResult(real, guess, diff);
  show('v-result');
}

function renderResult(real, guess, diff) {
  const v = $('verdict');
  let cls, line;
  // diff = real - guess
  //   diff > 0：猜小了（把你说年轻了）
  //   diff < 0：猜大了（把你说老了）
  if (diff === 0) { cls = 'zero'; line = '正正好，一分不差。'; }
  else if (diff === 1) { cls = 'young'; line = '只差 1 岁。'; }
  else if (diff > 0) { cls = 'young'; line = '把你猜年轻了 ' + diff + ' 岁。'; }
  else { cls = 'old'; line = '把你猜老了 ' + Math.abs(diff) + ' 岁。'; }

  v.innerHTML =
    '<div class="v-age">猜 ' + guess + ' 岁 · 实际 ' + real + ' 岁</div>' +
    '<p class="v-line">' + (diff === 0 ? '完全命中' : '差了 ' + Math.abs(diff) + ' 岁') + '</p>' +
    '<p class="v-diff ' + cls + '">' + line + '</p>';

  renderStrata();
  renderKey();
  renderLog();
}

/* ---------------- 没填真实年龄时的结果 ---------------- */
function renderResultNoReal() {
  const v = $('verdict');
  v.innerHTML =
    '<div class="v-age">猜 ' + state.guess + ' 岁</div>' +
    '<p class="v-line">你没有对答案，所以不知道准不准</p>' +
    '<p class="v-diff">下次可以填一下真实年龄，看看差几岁</p>';
  renderStrata();
  renderKey();
  renderLog();
}

/* ---------------- 记忆的地层 ---------------- */
const DECADES = [
  { label: '1980 年代', from: 1980, to: 1989, color: '#c9a27e' },
  { label: '1990 年代', from: 1990, to: 1999, color: '#e58a6b' },
  { label: '2000 年代', from: 2000, to: 2009, color: '#f2c14e' },
  { label: '2010 年代', from: 2010, to: 2019, color: '#8cc49b' },
  { label: '2020 年代', from: 2020, to: 2029, color: '#6fa8dc' },
];

function familiarity(q, r) {
  if (q.t === 'quiz') return r === q.c ? 1 : 0.15;
  // 四档→熟悉度
  return [1, 0.67, 0.33, 0][r] ?? 0;
}

function renderStrata() {
  const box = $('strata');
  box.innerHTML = '';

  const buckets = DECADES.map(d => ({
    ...d, sum: 0, n: 0, fossils: [],
  }));

  state.answers.forEach(a => {
    const y = a.q.y;
    const b = buckets.find(x => y >= x.from && y <= x.to);
    if (!b) return;
    const f = familiarity(a.q, a.r);
    b.sum += f;
    b.n += 1;
    if (f >= 0.67 && b.fossils.length < 2) b.fossils.push(a.q.q);
  });

  let best = null;
  buckets.forEach(b => {
    const avg = b.n ? b.sum / b.n : 0;
    b.avg = avg;
    if (b.n && (!best || avg > best.avg)) best = b;

    const wrap = document.createElement('div');

    const row = document.createElement('div');
    row.className = 'stratum';
    row.innerHTML =
      '<span class="st-year">' + b.label.replace(' 年代', '') + '</span>' +
      '<span class="st-bar"><i style="background:' + b.color + ';width:0"></i></span>' +
      '<span class="st-val">' + (b.n ? Math.round(avg * 100) : '—') + '</span>';
    wrap.appendChild(row);

    // 动画
    requestAnimationFrame(() => {
      const i = row.querySelector('.st-bar i');
      if (i) i.style.width = Math.round(avg * 100) + '%';
    });

    const sub = document.createElement('p');
    if (!b.n) {
      sub.className = 'st-empty';
      sub.textContent = '这一层是空的';
    } else if (b.fossils.length) {
      sub.className = 'st-fossil';
      sub.textContent = '化石：' + b.fossils.join(' / ');
    } else {
      sub.className = 'st-empty';
      sub.textContent = '这一层没留下什么';
    }
    wrap.appendChild(sub);
    box.appendChild(wrap);
  });

  const tip = $('strataTip');
  if (best && best.n) {
    tip.innerHTML = '最浓的地层：<b>' + best.label + '</b> —— 那一层的东西，你记得最深。';
  } else {
    tip.textContent = '';
  }
}

/* ---------------- 决定性的那一题 ---------------- */
function renderKey() {
  // 用「答得最出乎意料」的题：熟悉度越低、但题目本身很大众，信息量越高
  let pick = null;
  state.answers.forEach(a => {
    const f = familiarity(a.q, a.r);
    const weight = (1 - f) * (a.q.h || 0.5);
    if (!pick || weight > pick.w) pick = { a, w: weight, f };
  });

  if (!pick) {
    $('keyCard').hidden = true;
    return;
  }
  $('keyCard').hidden = false;
  $('keyQ').textContent = pick.a.q.q;
  let note;
  if (pick.f <= 0.15) {
    note = '这道题年代上离你不远，你却完全没印象——它把范围掐窄了。';
  } else if (pick.f >= 0.9) {
    note = '你对它熟得不像话，这是最直接的一条证据。';
  } else {
    note = '你的回答正好落在它最能区分年龄的位置上。';
  }
  $('keyNote').textContent = note;
}

/* ---------------- 答题日志 ---------------- */
function renderLog() {
  const ol = $('logList');
  ol.innerHTML = '';
  state.answers.forEach((a, i) => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="lg-q">' + (a.q.q || a.q.d) + '</span><br>' +
      '你的回答：<span class="lg-a">' + a.label + '</span>';
    ol.appendChild(li);
  });
}

/* ============================================================
 * 成绩图：纯 canvas 绘制，不依赖任何外部服务
 * ============================================================ */
function drawShot(real, guess, diff) {
  const cv = $('shot');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;

  // 背景
  ctx.fillStyle = '#16101f';
  ctx.fillRect(0, 0, W, H);

  // 顶部品牌带
  ctx.fillStyle = '#a678e8';
  ctx.fillRect(0, 0, W * 0.7, 8);
  ctx.fillStyle = '#3ddc97';
  ctx.fillRect(W * 0.7, 0, W * 0.3, 8);

  const pad = 90;
  let y = 150;

  const font = (size, weight) => (weight || '400') + ' ' + size + 'px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

  // K 标志
  ctx.fillStyle = '#c9a7ff';
  ctx.font = font(64, '800');
  ctx.fillText('K', pad, y);
  ctx.fillStyle = '#7a6f8d';
  ctx.font = font(26, '400');
  ctx.fillText('kaii.fun', pad + 60, y - 6);
  y += 110;

  // 标题
  ctx.fillStyle = '#c9a7ff';
  ctx.font = font(72, '800');
  ctx.fillText('年代记忆', pad, y);
  y += 90;

  ctx.fillStyle = '#a89cba';
  ctx.font = font(32, '400');
  ctx.fillText('用我记得的东西，猜出我几岁', pad, y);
  y += 110;

  // 主结果
  ctx.fillStyle = '#ded7e9';
  ctx.font = font(40, '400');
  ctx.fillText('它猜我', pad, y);
  y += 130;

  ctx.fillStyle = '#3ddc97';
  ctx.font = font(150, '800');
  ctx.fillText(String(guess), pad, y);
  const gw = ctx.measureText(String(guess)).width;
  ctx.fillStyle = '#ded7e9';
  ctx.font = font(56, '600');
  ctx.fillText('岁', pad + gw + 16, y);
  y += 80;

  // 差异（成绩图里同样要方向正确：diff = real - guess）
  let diffTxt, diffColor;
  if (diff === 0) { diffTxt = '一分不差，正正好'; diffColor = '#6ff0b8'; }
  else if (diff > 0) { diffTxt = '把我猜年轻了 ' + diff + ' 岁'; diffColor = '#3ddc97'; }
  else { diffTxt = '把我猜老了 ' + Math.abs(diff) + ' 岁'; diffColor = '#e8a04c'; }
  ctx.fillStyle = diffColor;
  ctx.font = font(38, '600');
  ctx.fillText(diffTxt, pad, y);
  y += 110;

  // 分隔线
  ctx.strokeStyle = '#2f2740';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(W - pad, y);
  ctx.stroke();
  y += 70;

  // 地层
  ctx.fillStyle = '#c9a7ff';
  ctx.font = font(38, '700');
  ctx.fillText('我的记忆地层', pad, y);
  y += 60;

  const dec = computeDecades();
  dec.forEach(d => {
    const bx = pad, bw = W - pad * 2 - 120;
    ctx.fillStyle = '#a89cba';
    ctx.font = font(26, '400');
    ctx.fillText(d.label.replace(' 年代', ''), bx, y);

    ctx.fillStyle = '#262033';
    roundRect(ctx, bx + 110, y - 24, bw - 110, 18, 9);
    ctx.fill();

    ctx.fillStyle = d.color;
    const w = Math.max(4, (bw - 110) * d.avg);
    roundRect(ctx, bx + 110, y - 24, w, 18, 9);
    ctx.fill();

    y += 62;
  });

  // 底部
  y = H - 330;
  ctx.strokeStyle = '#2f2740';
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(W - pad, y);
  ctx.stroke();
  y += 46;

  // 二维码放右侧，左边放文案
  const qrSize = 200;
  const qrX = W - pad - qrSize;
  const qrY = y - 6;
  drawQR(ctx, qrX, qrY, qrSize, '#16101f', '#ffffff');

  // 圆角白框，让二维码看起来像贴纸
  ctx.strokeStyle = '#3a3048';
  ctx.lineWidth = 2;
  roundRect(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 10);
  ctx.stroke();

  ctx.fillStyle = '#ded7e9';
  ctx.font = font(30, '600');
  ctx.fillText('你也来试试', pad, y + 46);

  ctx.fillStyle = '#7a6f8d';
  ctx.font = font(24, '400');
  ctx.fillText('微信长按识别二维码', pad, y + 92);
  ctx.fillText('或者打开 kaii.fun', pad, y + 128);

  ctx.fillStyle = '#4a4058';
  ctx.font = font(22, '400');
  ctx.fillText('一共问了 ' + state.asked.length + ' 题', pad, y + 178);

  return cv;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function computeDecades() {
  return DECADES.map(d => {
    let sum = 0, n = 0;
    state.answers.forEach(a => {
      if (a.q.y >= d.from && a.q.y <= d.to) {
        sum += familiarity(a.q, a.r); n++;
      }
    });
    return { ...d, avg: n ? sum / n : 0, n };
  });
}

function saveShot() {
  const real = state.realAge || state.guess;
  const cv = drawShot(real, state.guess, real - state.guess);
  const a = document.createElement('a');
  a.download = '年代记忆-我' + real + '岁.png';
  a.href = cv.toDataURL('image/png');
  a.click();
}

/* ============================================================
 * 事件绑定
 * ============================================================ */
$('btnStart').addEventListener('click', start);

$('btnGiveUp').addEventListener('click', () => {
  const q = state.asked[state.asked.length - 1];
  if (!q) return;
  answer(q, q.t === 'quiz' ? 3 : 3, '不知道');
});

$('btnRight').addEventListener('click', () => {
  state.realAge = state.guess;
  submitRealAge(state.guess);
});

$('btnWrong').addEventListener('click', () => {
  $('ageInput').hidden = false;
  $('realAge').focus();
});

$('btnSubmitAge').addEventListener('click', () => {
  const v = parseInt($('realAge').value, 10);
  if (!v || v < 10 || v > 90) {
    $('realAge').focus();
    return;
  }
  state.realAge = v;
  submitRealAge(v);
});

$('realAge').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('btnSubmitAge').click();
});

$('btnSkip').addEventListener('click', () => {
  state.realAge = null;
  // 没有真实年龄也给出结果：展示地层，不展示差异
  renderResultNoReal();
  show('v-result');
});

$('btnAgain').addEventListener('click', () => {
  start();
});

$('btnShot').addEventListener('click', saveShot);

/* ============================================================
 * 自动演示：?demo=quiz 停在答题页，?demo=result 直接跑到结果页
 * 只用于自测与截图，正常访问不触发
 * ============================================================ */
const DEMO = new URLSearchParams(location.search).get('demo');
if (DEMO) {
  const stopAt = DEMO;
  setTimeout(() => {
    start();
    let i = 0;
    const tick = () => {
      // 答到一半就停（用于截答题页）
      if (stopAt === 'quiz' && i >= 3) return;
      const onQuiz = $('v-quiz').classList.contains('on');
      if (!onQuiz) {
        if (stopAt === 'result') {
          setTimeout(() => {
            state.realAge = 32;
            submitRealAge(32);
          }, 300);
        }
        return;
      }
      const opts = document.querySelectorAll('#opts .opt');
      if (!opts.length) return;
      opts[i % 3 === 2 ? 0 : 1].click();
      i++;
      setTimeout(tick, 60);
    };
    setTimeout(tick, 200);
  }, 100);
}

