// 浏览器自动化测试：启动无头 Chrome，用真实输入事件复现"波间无法操作"的问题。
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = process.cwd();
const PORT = 8765;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// ---------- 本地静态服务器 ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  try {
    let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    res.writeHead(200, { 'Content-Type': (MIME[path.extname(p)] || 'text/plain') + '; charset=utf-8' });
    res.end(fs.readFileSync(p));
  } catch (e) {
    res.writeHead(404); res.end('not found');
  }
});

// ---------- 启动无头 Chrome ----------
function launchChrome() {
  const dir = path.join(os.tmpdir(), 'td-chrome-' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1100,760',
    '--remote-debugging-port=9222',
    '--user-data-dir=' + dir,
    'about:blank'
  ], { stdio: 'ignore' });
  return chrome;
}

async function waitFetch(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
    } catch (e) { }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('等待 ' + url + ' 超时');
}

// ---------- CDP 客户端 ----------
function makeClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const errors = [];
  const opened = new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('WebSocket 连接失败'));
  });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push('EXCEPTION: ' + (d.exception ? d.exception.description : d.text));
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      errors.push('LOG: ' + m.params.entry.text);
    }
  };
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, m => m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result));
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  }
  return {
    ready: opened,
    send,
    errors,
    close: () => ws.close()
  };
}

async function main() {
  await new Promise(r => server.listen(PORT, r));
  const chrome = launchChrome();
  try {
    const ver = await (await waitFetch('http://127.0.0.1:9222/json/version')).json();
    const target = await (await fetch('http://127.0.0.1:9222/json/new?http://127.0.0.1:' + PORT + '/tower-defense/index.html', { method: 'PUT' })).json();
    const cdp = makeClient(target.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    const MOBILE = process.argv.includes('--mobile');
    if (MOBILE) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 390, height: 844, deviceScaleFactor: 3, mobile: true
      });
    }

    async function ev(expression) {
      const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('页面脚本异常: ' + r.exceptionDetails.text);
      return r.result.value;
    }
    async function clickAt(x, y) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }
    async function tapAt(x, y) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    const tap = MOBILE ? tapAt : clickAt;
    async function centerOf(selector) {
      const j = await ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      if (!j) throw new Error('找不到元素: ' + selector);
      return j;
    }

    // 等游戏就绪
    for (let i = 0; i < 60; i++) {
      if (await ev('!!window.__TD')) break;
      await new Promise(r => setTimeout(r, 200));
    }
    if (!(await ev('!!window.__TD'))) throw new Error('游戏未加载');

    const step = [];
    const ok = (name, cond, extra) => {
      step.push((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' (' + extra + ')' : ''));
    };

    // 开始游戏
    await tap(...Object.values(await centerOf('#startBtn')));
    await new Promise(r => setTimeout(r, 400));
    ok('开始游戏', (await ev('window.__TD.game.state')) === 'playing', await ev('window.__TD.game.state'));

    // 开局：选塔 → 真实点击画布建造
    const towerCard1 = await centerOf('.tower-card');
    await tap(towerCard1.x, towerCard1.y);
    await new Promise(r => setTimeout(r, 100));
    ok('开局选择塔类型', await ev('window.__TD.game.placingType !== null'), await ev('window.__TD.game.placingType'));
    const cell1 = await ev(`(()=>{const g=window.__TD.game;for(let r=0;r<10;r++)for(let c=0;c<16;c++){if(g.canPlace(c,r))return {x:g.ox+(c+.5)*g.cell,y:g.oy+(r+.5)*g.cell};}})()`);
    await tap(cell1.x, cell1.y);
    await new Promise(r => setTimeout(r, 100));
    ok('开局建造成功', (await ev('window.__TD.game.towers.length')) === 1, 'towers=' + (await ev('window.__TD.game.towers.length')));

    // 开第 1 波
    const waveBtn = await centerOf('#waveBtn');
    await tap(waveBtn.x, waveBtn.y);
    await new Promise(r => setTimeout(r, 200));
    ok('第 1 波开始', await ev('window.__TD.waveMgr.active'), 'active=' + (await ev('window.__TD.waveMgr.active')));

    // 快进到波次结束（同步驱动 update，rAF 在 evaluate 期间不会插队）
    const wf = await ev(`(()=>{let n=0;while(window.__TD.waveMgr.active&&n<60000){window.__TD.game.update(1/30);n++;}return {active:window.__TD.waveMgr.active,wave:window.__TD.game.wave,n};})()`);
    ok('第 1 波结束', wf.active === false && wf.wave === 1, JSON.stringify(wf));

    // ===== 关键场景：波间操作 =====
    // 1. 选塔类型（真实点击工具栏）
    const card2 = await centerOf('.tower-card');
    await tap(card2.x, card2.y);
    await new Promise(r => setTimeout(r, 100));
    ok('波间点击工具栏选塔', (await ev('window.__TD.game.placingType')) !== null, 'placing=' + (await ev('window.__TD.game.placingType')));

    // 2. 在空地建造（真实点击画布）
    const cell2 = await ev(`(()=>{const g=window.__TD.game;for(let r=0;r<10;r++)for(let c=0;c<16;c++){if(g.canPlace(c,r))return {x:g.ox+(c+.5)*g.cell,y:g.oy+(r+.5)*g.cell};}})()`);
    const before = await ev('window.__TD.game.towers.length');
    await tap(cell2.x, cell2.y);
    await new Promise(r => setTimeout(r, 100));
    const after = await ev('window.__TD.game.towers.length');
    ok('波间建造新塔', after === before + 1, before + ' -> ' + after);

    // 3. 点击已有塔（真实点击画布上的塔）
    const t = await ev(`(()=>{const g=window.__TD.game;const x=g.towers[0];return {x:g.ox+(x.c+.5)*g.cell,y:g.oy+(x.r+.5)*g.cell};})()`);
    await tap(t.x, t.y);
    await new Promise(r => setTimeout(r, 100));
    ok('波间选中已有塔', (await ev('window.__TD.game.selected !== null')), 'selected=' + (await ev('!!window.__TD.game.selected')));

    // 4. 点升级按钮（真实点击）
    const up = await centerOf('#tpUpgrade');
    await tap(up.x, up.y);
    await new Promise(r => setTimeout(r, 100));
    ok('波间升级成功', (await ev('window.__TD.game.towers[0].level')) === 1, 'level=' + (await ev('window.__TD.game.towers[0].level')));

    // 输出
    console.log((MOBILE ? '[移动端] ' : '[桌面端] ') + step.join('\n'));
    console.log('---');
    console.log(cdp.errors.length ? ('页面错误:\n' + cdp.errors.join('\n')) : '无页面错误');
    cdp.close();
  } finally {
    chrome.kill();
    server.close();
  }
}

main().then(() => process.exit(0)).catch(e => { console.error('TEST ERROR: ' + e.message); process.exit(1); });
