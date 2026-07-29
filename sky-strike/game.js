(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const ui = {
    start: document.querySelector('#startScreen'), over: document.querySelector('#gameOverScreen'),
    startBtn: document.querySelector('#startBtn'), restartBtn: document.querySelector('#restartBtn'),
    score: document.querySelector('#score'), best: document.querySelector('#best'),
    finalScore: document.querySelector('#finalScore'), record: document.querySelector('#recordText'),
    life: document.querySelector('#lifeBar'), pauseBtn: document.querySelector('#pauseBtn'), soundBtn: document.querySelector('#soundBtn'),
    pauseLabel: document.querySelector('#pauseLabel'), joystick: document.querySelector('#joystick'),
    bombBtn: document.querySelector('#bombBtn'), shareBtn: document.querySelector('#shareBtn'),
    copyBtn: document.querySelector('#copyBtn'), shareStatus: document.querySelector('#shareStatus'),
    changeLevelBtn: document.querySelector('#changeLevelBtn'), finalLevel: document.querySelector('#finalLevel')
  };

  let w = 0, h = 0, dpr = 1, playing = false, paused = false, last = 0;
  let score = 0, best = Number(localStorage.getItem('starStrikeBest') || 0), spawnTimer = 0, shotTimer = 0;
  let shake = 0, flash = 0, difficulty = 1, bombCharge = 1;
  let bullets = [], enemies = [], particles = [], pickups = [], stars = [];
  let selectedLevel = 'normal';
  const levels = {
    easy: { name: '新兵', enemy: 1.15, speed: .84, damage: .7, score: .8, formation: .18 },
    normal: { name: '精英', enemy: 1.55, speed: 1, damage: 1, score: 1, formation: .34 },
    hard: { name: '王牌', enemy: 2.05, speed: 1.22, damage: 1.3, score: 1.45, formation: .52 }
  };
  let audioCtx = null, muted = localStorage.getItem('starStrikeMuted') === '1';
  const keys = new Set();
  const input = { x: 0, y: 0 };
  const player = { x: 0, y: 0, r: 17, hp: 100, invincible: 0 };

  const rand = (a, b) => Math.random() * (b - a) + a;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hit = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r;

  function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }
  function sound(type) {
    if (muted || !audioCtx) return;
    const now=audioCtx.currentTime, osc=audioCtx.createOscillator(), gain=audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    const tones={shoot:[680,210,.035,'square'],hit:[130,45,.09,'sawtooth'],boom:[90,25,.22,'sawtooth'],power:[440,920,.18,'sine'],start:[260,640,.28,'triangle'],gameover:[240,70,.5,'sawtooth'],bomb:[110,520,.45,'sawtooth']};
    const t=tones[type]||tones.hit; osc.type=t[3]; osc.frequency.setValueAtTime(t[0],now); osc.frequency.exponentialRampToValueAtTime(t[1],now+t[2]); gain.gain.setValueAtTime(type==='shoot'?.018:.07,now); gain.gain.exponentialRampToValueAtTime(.001,now+t[2]); osc.start(now); osc.stop(now+t[2]);
  }

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!playing) { player.x = w / 2; player.y = h * .76; }
    if (!stars.length) stars = Array.from({ length: Math.min(180, Math.floor(w * h / 6500)) }, () => ({ x: rand(0,w), y: rand(0,h), z: rand(.3,1.5), a: rand(.2,.9) }));
  }

  function reset() {
    score = 0; difficulty = 1; spawnTimer = 0; shotTimer = 0; shake = 0; flash = 0; bombCharge = 1;
    bullets = []; enemies = []; particles = []; pickups = [];
    player.x = w / 2; player.y = h * .78; player.hp = 100; player.invincible = 1.5;
    ui.score.textContent = '000000'; ui.best.textContent = String(best).padStart(6, '0'); ui.life.style.width = '100%';
  }

  function startGame() {
    initAudio(); sound('start');
    reset(); playing = true; paused = false; last = performance.now();
    ui.start.classList.remove('show'); ui.over.classList.remove('show'); ui.pauseBtn.style.display = 'block'; ui.soundBtn.style.display = 'block';
    requestAnimationFrame(loop);
  }

  function endGame() {
    playing = false; ui.pauseBtn.style.display = 'none'; ui.soundBtn.style.display = 'none'; sound('gameover');
    const isRecord = score > best;
    if (isRecord) { best = score; localStorage.setItem('starStrikeBest', best); }
    ui.finalScore.textContent = score.toLocaleString();
    ui.finalLevel.textContent = `${levels[selectedLevel].name}难度`;
    ui.record.textContent = isRecord ? '新纪录！你就是银河王牌！' : '继续磨炼，王牌飞行员！';
    ui.best.textContent = String(best).padStart(6, '0');
    ui.shareStatus.textContent = '';
    setTimeout(() => ui.over.classList.add('show'), 400);
  }

  function burst(x, y, color, count = 12, speed = 180) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), s = rand(speed * .25, speed);
      particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: rand(.25,.7), max: .7, size: rand(1.5,4), color });
    }
  }

  function spawnEnemy() {
    const roll = Math.random();
    const type = roll > .86 ? 'tank' : roll > .62 ? 'zig' : 'scout';
    const data = type === 'tank' ? { r: 25, hp: 5, vy: 58, value: 400 } : type === 'zig' ? { r: 18, hp: 2, vy: 95, value: 220 } : { r: 14, hp: 1, vy: 125, value: 100 };
    enemies.push({ ...data, type, x: rand(34, w-34), y: -40, phase: rand(0, 7), t: 0 });
  }

  function shoot() {
    bullets.push({ x: player.x - 10, y: player.y - 18, vy: -620, r: 3 }, { x: player.x + 10, y: player.y - 18, vy: -620, r: 3 });
    sound('shoot');
  }

  function useBomb() {
    if (!playing || paused || bombCharge < 1) return;
    bombCharge = 0; flash = .35; shake = 14; sound('bomb');
    enemies.forEach(e => { score += e.value; burst(e.x, e.y, '#56e7ff', 16, 240); });
    enemies = [];
  }

  function update(dt) {
    const level=levels[selectedLevel]; difficulty += dt * .025; score += Math.floor(dt * 10 * level.score); bombCharge = Math.min(1, bombCharge + dt * .035);
    player.invincible = Math.max(0, player.invincible - dt); flash = Math.max(0, flash - dt); shake *= .88;
    const speed = 330;
    let dx = input.x, dy = input.y;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) dx -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) dx += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) dy -= 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) dy += 1;
    const len = Math.hypot(dx, dy) || 1;
    player.x = clamp(player.x + dx/len*speed*dt, 22, w-22);
    player.y = clamp(player.y + dy/len*speed*dt, 52, h-24);

    shotTimer -= dt;
    if (shotTimer <= 0) { shoot(); shotTimer = .14; }
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnEnemy();
      if (Math.random() < level.formation + Math.min(.22, (difficulty-1)*.12)) spawnEnemy();
      if (difficulty > 1.45 && Math.random() < level.formation*.35) spawnEnemy();
      spawnTimer = Math.max(.12, .62 / (difficulty * level.enemy));
    }

    stars.forEach(s => { s.y += (28 + s.z*65)*dt; if (s.y > h) { s.y = -2; s.x = rand(0,w); } });
    bullets.forEach(b => b.y += b.vy * dt);
    bullets = bullets.filter(b => b.y > -30);
    enemies.forEach(e => {
      e.t += dt; e.y += e.vy * difficulty * level.speed * dt;
      if (e.type === 'zig') e.x += Math.sin(e.t*4 + e.phase) * 100 * dt;
    });

    for (const e of enemies) {
      for (const b of bullets) {
        if (!b.dead && !e.dead && hit(b,e)) {
          b.dead = true; e.hp--; burst(b.x,b.y,'#bff6ff',3,65);
          if (e.hp <= 0) { e.dead = true; score += Math.floor(e.value*level.score); sound(e.type==='tank'?'boom':'hit'); burst(e.x,e.y,e.type === 'tank' ? '#ff7b46' : '#56e7ff', e.type === 'tank' ? 24 : 12, 210); shake = e.type === 'tank' ? 7 : 3; if (Math.random() < .035) pickups.push({x:e.x,y:e.y,r:9,vy:80}); }
        }
      }
      if (!e.dead && player.invincible <= 0 && hit(player,e)) {
        e.dead = true; player.hp -= (e.type === 'tank' ? 40 : 25)*level.damage; player.invincible = 1; shake = 12; flash = .16; sound('boom');
        burst(e.x,e.y,'#ff583d',20,230);
        if (player.hp <= 0) { burst(player.x,player.y,'#56e7ff',40,300); endGame(); }
      }
      if (e.y > h + 50) e.dead = true;
    }
    bullets = bullets.filter(b => !b.dead); enemies = enemies.filter(e => !e.dead);
    pickups.forEach(p => { p.y += p.vy*dt; if (hit(p,player)) { p.dead=true; player.hp=Math.min(100,player.hp+20); sound('power'); burst(p.x,p.y,'#70ffb3',10,120); } });
    pickups = pickups.filter(p => !p.dead && p.y < h+20);
    particles.forEach(p => { p.x += p.vx*dt; p.y += p.vy*dt; p.vx*=.97; p.vy*=.97; p.life-=dt; });
    particles = particles.filter(p => p.life > 0);

    ui.score.textContent = String(score).padStart(6, '0'); ui.life.style.width = `${Math.max(0,player.hp)}%`;
    ui.life.style.background = player.hp < 35 ? 'linear-gradient(90deg,#ff493d,#ff9a52)' : '';
    ui.bombBtn.style.opacity = .35 + bombCharge*.65;
  }

  function drawShip() {
    const blink = player.invincible > 0 && Math.floor(player.invincible*12)%2 === 0;
    if (blink) ctx.globalAlpha = .35;
    ctx.save(); ctx.translate(player.x,player.y);
    const flame = 15 + Math.sin(performance.now()*.03)*6;
    const grad = ctx.createLinearGradient(0,10,0,35); grad.addColorStop(0,'#fff'); grad.addColorStop(.35,'#44dfff'); grad.addColorStop(1,'transparent');
    ctx.fillStyle=grad; ctx.beginPath(); ctx.moveTo(-7,12); ctx.lineTo(0,flame+22); ctx.lineTo(7,12); ctx.fill();
    ctx.shadowBlur=18; ctx.shadowColor='#34bfff'; ctx.fillStyle='#d9f8ff'; ctx.beginPath(); ctx.moveTo(0,-27); ctx.lineTo(12,7); ctx.lineTo(25,17); ctx.lineTo(8,15); ctx.lineTo(0,23); ctx.lineTo(-8,15); ctx.lineTo(-25,17); ctx.lineTo(-12,7); ctx.closePath(); ctx.fill();
    ctx.shadowBlur=0; ctx.fillStyle='#2089d8'; ctx.beginPath(); ctx.moveTo(0,-20); ctx.lineTo(6,7); ctx.lineTo(0,13); ctx.lineTo(-6,7); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#ff694f'; ctx.fillRect(-23,12,8,3); ctx.fillRect(15,12,8,3); ctx.restore(); ctx.globalAlpha=1;
  }

  function drawEnemy(e) {
    ctx.save(); ctx.translate(e.x,e.y); ctx.shadowBlur=12; ctx.shadowColor='#ff4e45';
    ctx.fillStyle=e.type==='tank'?'#803f3b':'#b74643'; ctx.strokeStyle='#ff8a68'; ctx.lineWidth=2;
    ctx.beginPath();
    if(e.type==='tank'){ctx.moveTo(-24,-15);ctx.lineTo(24,-15);ctx.lineTo(19,19);ctx.lineTo(7,13);ctx.lineTo(0,24);ctx.lineTo(-7,13);ctx.lineTo(-19,19);}
    else {ctx.moveTo(0,20);ctx.lineTo(-e.r,-12);ctx.lineTo(-5,-7);ctx.lineTo(0,-20);ctx.lineTo(5,-7);ctx.lineTo(e.r,-12);}
    ctx.closePath();ctx.fill();ctx.stroke(); ctx.fillStyle='#ffd0a5';ctx.fillRect(-3,-5,6,12);ctx.restore();
  }

  function render() {
    ctx.clearRect(0,0,w,h);
    const bg=ctx.createRadialGradient(w*.5,h*.55,0,w*.5,h*.55,Math.max(w,h)*.75); bg.addColorStop(0,'#0b2340');bg.addColorStop(.45,'#061426');bg.addColorStop(1,'#02050d');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    ctx.save(); ctx.translate(rand(-shake,shake),rand(-shake,shake));
    ctx.fillStyle='#8ecbff'; stars.forEach(s=>{ctx.globalAlpha=s.a;ctx.fillRect(s.x,s.y,s.z,s.z*3);});ctx.globalAlpha=1;
    ctx.strokeStyle='rgba(37,112,160,.08)';ctx.lineWidth=1;const gap=80;for(let y=(performance.now()*.03)%gap;y<h;y+=gap){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    pickups.forEach(p=>{ctx.save();ctx.translate(p.x,p.y);ctx.rotate(performance.now()*.002);ctx.shadowBlur=16;ctx.shadowColor='#70ffb3';ctx.strokeStyle='#70ffb3';ctx.strokeRect(-7,-7,14,14);ctx.fillStyle='#70ffb3';ctx.fillRect(-2,-5,4,10);ctx.fillRect(-5,-2,10,4);ctx.restore();});
    ctx.shadowBlur=14;ctx.shadowColor='#5fe9ff';ctx.fillStyle='#c5faff';bullets.forEach(b=>{ctx.fillRect(b.x-1.5,b.y-9,3,13);});ctx.shadowBlur=0;
    enemies.forEach(drawEnemy); particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size);});ctx.globalAlpha=1;
    if (playing || player.hp>0) drawShip(); ctx.restore();
    if(flash>0){ctx.fillStyle=`rgba(150,230,255,${flash})`;ctx.fillRect(0,0,w,h);}
  }

  function loop(now) {
    if (!playing) { render(); return; }
    const dt = Math.min((now-last)/1000,.033); last=now;
    if (!paused) update(dt); render(); requestAnimationFrame(loop);
  }

  function togglePause() { if(!playing)return; paused=!paused;ui.pauseLabel.classList.toggle('show',paused);ui.pauseBtn.textContent=paused?'▶':'Ⅱ';last=performance.now(); }
  addEventListener('resize',resize);
  addEventListener('keydown',e=>{keys.add(e.code);if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.code==='Space')useBomb();if(e.code==='Escape'||e.code==='KeyP')togglePause();});
  addEventListener('keyup',e=>keys.delete(e.code));
  canvas.addEventListener('pointermove',e=>{if(playing&&e.pointerType==='mouse'){const dx=e.clientX-player.x,dy=e.clientY-player.y;if(Math.hypot(dx,dy)>4){player.x=clamp(e.clientX,22,w-22);player.y=clamp(e.clientY,52,h-24);}}});
  let joyId=null;
  const joyMove=e=>{if(e.pointerId!==joyId)return;const r=ui.joystick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,len=Math.hypot(dx,dy),max=34,s=Math.min(1,max/(len||1));input.x=dx/max*s;input.y=dy/max*s;ui.joystick.querySelector('i').style.transform=`translate(${dx*s}px,${dy*s}px)`;};
  ui.joystick.addEventListener('pointerdown',e=>{joyId=e.pointerId;ui.joystick.setPointerCapture(e.pointerId);joyMove(e);});
  ui.joystick.addEventListener('pointermove',joyMove);
  const joyEnd=e=>{if(e.pointerId===joyId){joyId=null;input.x=input.y=0;ui.joystick.querySelector('i').style.transform='';}};
  ui.joystick.addEventListener('pointerup',joyEnd);ui.joystick.addEventListener('pointercancel',joyEnd);
  let dragId = null;
  const dragShip = e => {
    if (e.pointerId !== dragId || !playing || paused) return;
    player.x = clamp(e.clientX, 22, w - 22);
    player.y = clamp(e.clientY - 28, 52, h - 24);
  };
  canvas.addEventListener('pointerdown',e=>{
    if(playing && e.pointerType!=='mouse' && e.clientY<h*.78){
      dragId=e.pointerId; canvas.setPointerCapture(e.pointerId); dragShip(e);
    }
  });
  canvas.addEventListener('pointermove', dragShip);
  canvas.addEventListener('pointerup', e=>{ if(e.pointerId===dragId) dragId=null; });
  canvas.addEventListener('pointercancel', e=>{ if(e.pointerId===dragId) dragId=null; });
  document.querySelectorAll('.difficulty button').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.difficulty button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');selectedLevel=btn.dataset.level;initAudio();sound('power');}));
  ui.soundBtn.classList.toggle('muted',muted);
  ui.soundBtn.addEventListener('click',()=>{initAudio();muted=!muted;localStorage.setItem('starStrikeMuted',muted?'1':'0');ui.soundBtn.classList.toggle('muted',muted);ui.soundBtn.setAttribute('aria-label',muted?'开启声音':'关闭声音');if(!muted)sound('power');});
  const shareText=()=>`我在《星海突击》的${levels[selectedLevel].name}难度获得了 ${score.toLocaleString()} 分！你能打破我的纪录吗？`;
  async function copyResult(){
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(shareText());
      else {
        const box=document.createElement('textarea');box.value=shareText();box.style.position='fixed';box.style.opacity='0';document.body.appendChild(box);box.select();
        if(!document.execCommand('copy')) throw new Error('copy failed');box.remove();
      }
      ui.shareStatus.textContent='战绩已复制到剪贴板';
    } catch { ui.shareStatus.textContent='复制失败，请手动分享截图'; }
  }
  ui.shareBtn.addEventListener('click',async()=>{if(navigator.share){try{await navigator.share({title:'星海突击战绩',text:shareText()});ui.shareStatus.textContent='分享成功';}catch(e){if(e.name!=='AbortError')copyResult();}}else copyResult();});
  ui.copyBtn.addEventListener('click',copyResult);
  ui.changeLevelBtn.addEventListener('click',()=>{ui.over.classList.remove('show');ui.start.classList.add('show');});
  ui.startBtn.addEventListener('click',startGame);ui.restartBtn.addEventListener('click',startGame);ui.pauseBtn.addEventListener('click',togglePause);ui.pauseLabel.addEventListener('click',togglePause);ui.bombBtn.addEventListener('pointerdown',e=>{e.preventDefault();useBomb();});

  resize(); reset(); render();
})();
