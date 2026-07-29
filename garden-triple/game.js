(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const ui={board:$('#board'),tray:$('#tray'),welcome:$('#welcome'),result:$('#result'),start:$('#startBtn'),next:$('#nextBtn'),retry:$('#retryBtn'),home:$('#homeBtn'),sound:$('#soundBtn'),progress:$('#progressBar'),left:$('#leftText'),level:$('#levelText'),toast:$('#toast'),undo:$('#undoBtn'),shuffle:$('#shuffleBtn'),remove:$('#removeBtn'),undoCount:$('#undoCount'),shuffleCount:$('#shuffleCount'),removeCount:$('#removeCount'),resultIcon:$('#resultIcon'),resultLabel:$('#resultLabel'),resultTitle:$('#resultTitle'),resultDesc:$('#resultDesc')};
  const icons=['🌷','🍓','🧁','🍋','🌼','🍄','🍒','🦋','🍀','🐝','🍑','🌻'];
  let tiles=[],tray=[],history=[],level=1,total=0,locked=false,audio=null,muted=false,tools={undo:3,shuffle:2,remove:1};
  const shuffle=a=>{for(let i=a.length-1;i;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
  function tone(freq=500,duration=.08){if(muted)return;try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.type='sine';o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(freq*1.35,audio.currentTime+duration);g.gain.setValueAtTime(.07,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.start();o.stop(audio.currentTime+duration)}catch{}}
  function slotsForLevel(){
    const slots=[];
    for(let r=0;r<6;r++)for(let c=0;c<6;c++)slots.push({x:c,y:r,z:0});
    for(let r=0;r<3;r++)for(let c=0;c<4;c++)slots.push({x:c+1,y:r+1.35,z:1});
    [{x:1.5,y:2.1},{x:2.5,y:2.1},{x:3.5,y:2.1}].forEach(p=>slots.push({...p,z:2}));
    if(level>1){for(let i=0;i<3;i++)slots.push({x:1.5+i,y:3.25,z:1})}
    if(level>2){for(let i=0;i<3;i++)slots.push({x:1.5+i,y:.35,z:1})}
    return slots;
  }
  function build(){
    locked=false;tray=[];history=[];tools={undo:3,shuffle:2,remove:1};
    const slots=slotsForLevel(),types=icons.slice(0,Math.min(8+level,icons.length)),values=[];
    for(let i=0;i<slots.length/3;i++){const icon=types[i%types.length];values.push(icon,icon,icon)}shuffle(values);
    tiles=slots.map((s,i)=>({...s,id:`${Date.now()}-${i}`,icon:values[i],removed:false}));total=tiles.length;
    ui.level.textContent=`第 ${level} 关`;render();updateTools();
  }
  function metrics(){const mobile=innerWidth<=600,tw=mobile?48:58,th=mobile?55:66;const bw=ui.board.clientWidth,bh=ui.board.clientHeight;const gx=Math.min(tw*.86,(bw-tw)/5),gy=Math.min(th*.70,(bh-th)/5.35);return{tw,th,gx,gy,ox:(bw-(gx*5+tw))/2,oy:Math.max(8,(bh-(gy*5.35+th))/2)}}
  function isFree(tile){return !tiles.some(t=>!t.removed&&t.z>tile.z&&Math.abs(t.x-tile.x)<.82&&Math.abs(t.y-tile.y)<.82)}
  function render(){
    const m=metrics();ui.board.innerHTML='';
    tiles.filter(t=>!t.removed).sort((a,b)=>a.z-b.z).forEach(t=>{const b=document.createElement('button');const free=isFree(t);b.className=`tile ${free?'free':'blocked'}`;b.textContent=t.icon;b.style.left=`${m.ox+t.x*m.gx}px`;b.style.top=`${m.oy+t.y*m.gy-t.z*3}px`;b.style.zIndex=String(2+t.z);b.dataset.id=t.id;b.disabled=!free;b.addEventListener('click',()=>pick(t));ui.board.appendChild(b)});
    renderTray();const left=tiles.filter(t=>!t.removed).length;ui.left.textContent=`剩余 ${left}`;ui.progress.style.width=`${(total-left)/total*100}%`;
  }
  function renderTray(pop=false){ui.tray.innerHTML='';for(let i=0;i<7;i++){const s=document.createElement('div');s.className='tray-slot'+(pop&&i===tray.length-1?' pop':'');s.textContent=tray[i]?.icon||'';ui.tray.appendChild(s)}}
  function pick(tile){
    if(locked||tile.removed||!isFree(tile))return;tone(520);history.push(tile.id);tile.removed=true;
    const sameEnd=tray.map(t=>t.icon).lastIndexOf(tile.icon);tray.splice(sameEnd<0?tray.length:sameEnd+1,0,tile);render();renderTray(true);
    const same=tray.filter(t=>t.icon===tile.icon);
    if(same.length===3){locked=true;setTimeout(()=>{tone(880,.16);tray=tray.filter(t=>t.icon!==tile.icon);renderTray();locked=false;checkEnd()},230)}else checkEnd();
  }
  function checkEnd(){
    if(!tiles.some(t=>!t.removed)&&tray.length===0)return finish(true);
    if(tray.length>=7)return finish(false);
    const free=tiles.filter(t=>!t.removed&&isFree(t));const possible=free.some(t=>tray.some(q=>q.icon===t.icon));if(!possible&&tray.length>4)hint();
  }
  function finish(win){locked=true;setTimeout(()=>{ui.resultIcon.textContent=win?'🎉':'🥺';ui.resultLabel.textContent=win?'GARDEN CLEARED':'TRAY IS FULL';ui.resultTitle.textContent=win?'花园清空啦！':'差一点点';ui.resultDesc.textContent=win?'眼力和运气都很棒':'收集槽满了，再试一次吧';ui.next.style.display=win?'inline-block':'none';ui.result.classList.add('show');tone(win?1040:180,.3)},300)}
  function toast(msg){ui.toast.textContent=msg;ui.toast.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>ui.toast.classList.remove('show'),1400)}
  function updateTools(){ui.undoCount.textContent=tools.undo;ui.shuffleCount.textContent=tools.shuffle;ui.removeCount.textContent=tools.remove;ui.undo.disabled=!tools.undo;ui.shuffle.disabled=!tools.shuffle;ui.remove.disabled=!tools.remove}
  function hint(){const free=tiles.filter(t=>!t.removed&&isFree(t));const target=free.find(t=>tray.some(q=>q.icon===t.icon))||free[0];if(target)setTimeout(()=>ui.board.querySelector(`[data-id="${target.id}"]`)?.classList.add('hint'),100)}
  ui.undo.addEventListener('click',()=>{if(!tools.undo||!history.length)return toast('还没有可以撤回的牌');const id=history.pop(),index=tray.findIndex(t=>t.id===id);if(index<0)return toast('已消除的牌不能撤回');tray.splice(index,1);tiles.find(t=>t.id===id).removed=false;tools.undo--;tone(350);render();updateTools()});
  ui.shuffle.addEventListener('click',()=>{if(!tools.shuffle)return;const active=tiles.filter(t=>!t.removed),vals=shuffle(active.map(t=>t.icon));active.forEach((t,i)=>t.icon=vals[i]);tools.shuffle--;tone(650,.14);render();updateTools();toast('花园重新排列啦')});
  ui.remove.addEventListener('click',()=>{if(!tools.remove||!tray.length)return toast('收集槽还是空的');const moved=tray.splice(0,Math.min(3,tray.length));moved.forEach(t=>{const freeSlots=tiles.filter(x=>!x.removed&&x.z===0);t.x=Math.random()*5;t.y=5.2;t.z=-1;t.removed=false});tools.remove--;tone(720,.15);render();updateTools();toast(`移出了 ${moved.length} 张牌`)});
  ui.start.addEventListener('click',()=>{tone(660,.15);ui.welcome.classList.remove('show');build()});
  ui.retry.addEventListener('click',()=>{ui.result.classList.remove('show');build()});ui.next.addEventListener('click',()=>{level++;ui.result.classList.remove('show');build()});
  ui.home.addEventListener('click',()=>location.href='../index.html');ui.sound.addEventListener('click',()=>{muted=!muted;ui.sound.textContent=muted?'♩':'♪';if(!muted)tone(700)});
  addEventListener('resize',()=>render());build();
})();
