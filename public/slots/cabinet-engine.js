/* ─────────────────────────────────────────────────────────────────────────
   cabinet-engine.js — the play-only slot cabinet runtime.

   The three branded machine pages (green-wick-slot-lab, superstake-slot-lab,
   morbius-vault-lab) are thin brand shells around this one engine. The MATHS
   is not here: cabinet-math.js is extracted verbatim from the Reel Forge
   builder, so a cabinet, the studio board and the Monte-Carlo simulator can
   never disagree about what a spin pays. This file is everything around the
   maths — reels, cascade/hold presentation, bonus rounds, meta strips, audio,
   the big-win moment.

   What a page provides:
     CabinetEngine.boot({
       host: '#gameHost',          // where the machine mounts
       defUrl: '/slots/<key>.json',// the machine definition (from the builder)
       key: 'greenwick',           // storage namespace
       accent: '#00ff41',          // brand colour for glows and text
       accent2: '#ff3333',         // secondary (losses / hot moments)
       bigWinFont: "'Share Tech Mono',monospace",
       bonusTitle: { freespins:'CONTRACT SPINS', ... }   // optional renames
     })

   Balance is play-money MORBIUS, persisted per machine in localStorage.
   Audio: small synth cues for the mechanics plus the platform's CC0 win
   samples from /sounds/wins/ layered per tier — same recipes as the app's
   lib/win-sounds.ts, so a big win here sounds like a big win everywhere else.
   ───────────────────────────────────────────────────────────────────────── */
(function(){
'use strict';

var M = null;                 // CabinetMath, checked at boot
var S = {                     // engine state
  def:null, strips:null, key:'slot', bet:100, balance:10000,
  spinning:false, featureState:{}, meta:null, muted:false,
  turbo:false, auto:false, autoTimer:null, tickIv:null, anticIv:null,
  cfg:null, seedN:0, host:null, reels:[], lastRes:null, theme:null
};

/* ── tiny DOM helpers ───────────────────────────────────────────────────── */
function el(tag, cls, html){ var e=document.createElement(tag); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; }
function $(sel){ return S.host.querySelector(sel); }
function fmt(n){ return Math.round(n).toLocaleString('en-US'); }
function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function store(k,v){ try{ localStorage.setItem('cab.'+S.key+'.'+k, JSON.stringify(v)); }catch(e){} }
function load(k,d){ try{ var v=localStorage.getItem('cab.'+S.key+'.'+k); return v==null?d:JSON.parse(v); }catch(e){ return d; } }

/* ── audio ──────────────────────────────────────────────────────────────
   Synth for the mechanics; the shared CC0 samples for wins. The win recipes
   mirror lib/win-sounds.ts so this cabinet celebrates in the house voice. */
var AC=null, master=null, buffers={}, sndFail={};
var WIN_DIR='/sounds/wins/';
var NORM={ 'body-collect.mp3':0.79,'tail-victory-chime.mp3':0.12,
  'impact-orchestral-hit.mp3':0.226,'body-tada-fanfare-a.mp3':0.61,
  'tail-achievement-sparkle.mp3':6.10,'coins-badge-coin-win.mp3':1.36,
  'impact-soft-cinematic-impact.mp3':0.19,'body-success-fanfare-trumpets.mp3':0.57,
  'tail-achievement-chimes.mp3':1.40,'coins-slot-machine-payout.mp3':1.24 };
var RECIPES={
  small:[ ['body-collect.mp3',.6,0], ['tail-victory-chime.mp3',.22,90] ],
  big:[ ['impact-orchestral-hit.mp3',.3,0], ['body-tada-fanfare-a.mp3',.62,60],
        ['tail-achievement-sparkle.mp3',.3,340], ['coins-badge-coin-win.mp3',.26,520] ],
  huge:[ ['impact-soft-cinematic-impact.mp3',.34,0], ['body-success-fanfare-trumpets.mp3',.62,40],
         ['tail-achievement-chimes.mp3',.3,700], ['coins-slot-machine-payout.mp3',.28,900] ]
};
function audio(){
  if(AC) return AC;
  try{
    AC=new (window.AudioContext||window.webkitAudioContext)();
    master=AC.createGain(); master.gain.value=S.muted?0:0.5; master.connect(AC.destination);
    Object.keys(NORM).forEach(function(f){ loadSample(f); });
  }catch(e){}
  return AC;
}
function loadSample(f){
  if(buffers[f]||sndFail[f]||!AC) return;
  fetch(WIN_DIR+f).then(function(r){ if(!r.ok)throw 0; return r.arrayBuffer(); })
    .then(function(b){ return AC.decodeAudioData(b); })
    .then(function(d){ buffers[f]=d; })
    .catch(function(){ sndFail[f]=1; });
}
function tone(freq,type,dur,vol,slide,delay){
  if(!AC||S.muted) return;
  if(AC.state==='suspended') AC.resume();
  var t0=AC.currentTime+(delay||0)/1000;
  var o=AC.createOscillator(), g=AC.createGain();
  o.type=type; o.frequency.setValueAtTime(freq,t0);
  if(slide) o.frequency.exponentialRampToValueAtTime(slide,t0+dur);
  // Floor has to sit well under the quietest cue (the spin tick is 0.022) or
  // that cue never decays — it just steps to the floor and cuts.
  g.gain.setValueAtTime(vol,t0); g.gain.exponentialRampToValueAtTime(0.0008,t0+dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0+dur);
}
function noiseHit(dur,vol,freq,delay){
  if(!AC||S.muted) return;
  var t0=AC.currentTime+(delay||0)/1000;
  var n=Math.max(1,Math.floor(AC.sampleRate*dur));
  var buf=AC.createBuffer(1,n,AC.sampleRate), d=buf.getChannelData(0);
  for(var i=0;i<n;i++) d[i]=Math.random()*2-1;
  var src=AC.createBufferSource(); src.buffer=buf;
  var f=AC.createBiquadFilter(); f.type='bandpass'; f.frequency.value=freq; f.Q.value=1.4;
  var g=AC.createGain(); g.gain.setValueAtTime(vol,t0); g.gain.exponentialRampToValueAtTime(0.0008,t0+dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t0); src.stop(t0+dur);
}
function playWinTier(tier){
  if(!AC||S.muted) return;
  var rec=RECIPES[tier]; if(!rec) return;
  var ready=rec.every(function(l){ return buffers[l[0]]; });
  if(!ready){                       // synth fallback, same shape as the app
    tone(1046.5,'sine',.12,.3); tone(1318.5,'sine',.12,.3,null,110); tone(1568,'sine',.34,.34,null,220);
    if(tier!=='small'){ tone(2093,'sine',.45,.26,null,330); }
    return;
  }
  rec.forEach(function(l){
    var src=AC.createBufferSource(), g=AC.createGain();
    src.buffer=buffers[l[0]]; g.gain.value=l[1]*(NORM[l[0]]||1);
    src.connect(g); g.connect(master);
    src.start(AC.currentTime+l[2]/1000);
  });
}
/* ── the midnight cabinet's spin voice ───────────────────────────────────
   Ported cue-for-cue from morbius-midnight-lab.html so a reel here stops with
   the same thunk, and the same tension builds when the scatters start
   arriving. Midnight's blip(f,dur,type,gain,when,slideTo) maps to tone() and
   its noise(dur,freq,gain,when) to noiseHit(). */
/* echoing synth pluck — a triangle with two decaying repeats */
function pluck(f,gain,when){
  var g=gain||0.06, w=(when||0)*1000;
  tone(f,'triangle',.16,g,null,w);
  tone(f,'triangle',.14,g*0.5,null,w+170);
  tone(f,'triangle',.12,g*0.24,null,w+340);
}
/* reel stop — a short filtered thunk that drops in pitch, brighter each reel,
   so you hear how far through the spin you are without looking */
function sfxReelLand(i){
  if(packCue('land', i)) return;
  noiseHit(.06,.07,600+i*120);
  tone(150+i*34,'square',.09,.05,110+i*30);
}
/* a scatter arriving — the pluck climbs with the running count */
function sfxScatterLand(n){ pluck(392+n*110,.06); tone(196,'sawtooth',.3,.03,120); }
/* the anticipation heartbeat under a slowed reel */
function sfxAnticBeat(){ tone(60,'sawtooth',.14,.08); tone(60,'sawtooth',.12,.05,null,220); }
function startAnticLoop(){ stopAnticLoop(); sfxAnticBeat(); S.anticIv=setInterval(sfxAnticBeat,620); }
function stopAnticLoop(){ if(S.anticIv){ clearInterval(S.anticIv); S.anticIv=null; } }
/* the tick bed that runs for as long as any reel is still moving */
function sfxTick(){ tone(600+Math.random()*200,'square',.03,.022); }
function startTicks(){ stopTicks(); S.tickIv=setInterval(sfxTick,85); }
function stopTicks(){ if(S.tickIv){ clearInterval(S.tickIv); S.tickIv=null; } }
/* the scatters are in — fanfare over the celebrate reel */
function sfxFanfare(){
  [440,554,659,880].forEach(function(f,i){
    tone(f,'square',.16,.04,null,i*100); pluck(f,.05,i*0.1);
  });
}
/* A machine's theme can replace any mechanic cue with its own voice, so the
   three cabinets do not all click and thunk identically. The pack is handed
   tone() and noiseHit() rather than reaching for them, and anything it does
   not define falls through to the house sound below. */
function packCue(name, arg){
  var th=S.theme; if(!th||!th.sound) return false;
  var fn=th.sound[name]; if(typeof fn!=='function') return false;
  if(!AC||S.muted) return true;               // themed cue exists; just silent
  try{ fn(tone, noiseHit, arg); }catch(e){}
  return true;
}
function sfx(name){
  if(packCue(name)) return;
  switch(name){
    case 'button': tone(520,'triangle',.05,.25); break;
    // low detuned saw drone — the cabinet powering up, midnight's sDrone
    case 'spin':   tone(55,'sawtooth',1.1,.06,42); tone(55.8,'sawtooth',1.1,.05,42.6); noiseHit(.6,.03,220); break;
    case 'land':   noiseHit(.06,.22,1800); tone(330,'triangle',.06,.14); break;
    case 'pop':    tone(700,'triangle',.07,.22,1500); noiseHit(.08,.16,3200); break;
    case 'lock':   tone(220,'square',.08,.18); tone(440,'sine',.1,.14,null,60); break;
    case 'scatter':tone(700,'sine',.2,.3,1400); tone(1400,'triangle',.18,.16,null,90); break;
    case 'lose':   tone(150,'sine',.3,.3,60); break;
    case 'tick':   tone(900,'square',.03,.12); break;
    // one per count-up frame while the win rolls, so a big number is audible
    case 'coin':   tone(1250+Math.random()*500,'triangle',.06,.035); break;
    case 'award':  tone(880,'triangle',.09,.24); tone(1174,'triangle',.09,.24,null,80); tone(1760,'sine',.22,.24,null,160); break;
  }
}

/* ── boot ───────────────────────────────────────────────────────────────── */
window.CabinetEngine = {
  boot: boot, state: S,
  /* test seam — lets the harness exercise a bonus without waiting for 3+
     scatters to land naturally. Not wired to any UI. */
  _debugBonus: function(kind){ return runBonus(kind||S.def.bonus.round); }
};

function boot(cfg){
  S.cfg=cfg; S.key=cfg.key;
  // Everything that should differ between the three machines — wording, voice,
  // bonus round, button shape — comes from here. Absent theme = house default.
  S.theme=(window.CabinetThemes&&window.CabinetThemes[cfg.theme||cfg.key])||null;
  S.host=document.querySelector(cfg.host);
  M=window.CabinetMath;
  if(!M){ S.host.innerHTML='<div class="cab-err">cabinet-math.js failed to load</div>'; return; }
  fetch(cfg.defUrl).then(function(r){ return r.json(); }).then(function(def){
    S.def=def; M.indexSyms(def);
    S.strips=M.buildStrips(def);
    S.balance=load('balance',10000);
    S.bet=load('bet', defaultBet());
    S.muted=load('muted',false);
    S.turbo=load('turbo',false);
    S.meta=load('meta', initMeta());
    buildUI();
    renderGrid(blankGrid());
    updateHud();
  }).catch(function(e){
    S.host.innerHTML='<div class="cab-err">Could not load machine definition — '+esc(e)+'</div>';
  });
}
function defaultBet(){ return 140; }
function betSteps(){ return [20,60,140,300,700,1500]; }

function blankGrid(){
  var g=[], ids=S.def.symbols.filter(function(s){return s.role==='normal';}).map(function(s){return s.id;});
  for(var c=0;c<S.def.cols;c++){ g.push([]); for(var r=0;r<S.def.rows;r++) g[c].push(ids[(c*S.def.rows+r)%ids.length]); }
  return g;
}
function initMeta(){
  var m=S.def?S.def.meta:'none';
  if(m==='collection') return {kind:'collection',count:0,target:15,sets:0};
  if(m==='level')      return {kind:'level',level:1,xp:0,next:60};
  if(m==='tiered')     return {kind:'tiered',mini:250,minor:1250,major:8000,grand:42000};
  return {kind:'none'};
}

/* ── UI scaffolding ─────────────────────────────────────────────────────── */
function buildUI(){
  var d=S.def;
  var L=(S.theme&&S.theme.labels)||{ spin:'SPIN', auto:'Auto', turbo:'Turbo' };
  var root=el('div','cab-root'+(S.theme&&S.theme.shape?' shape-'+S.theme.shape:''));
  root.innerHTML=
    '<div class="cab-hud">'+
      '<div class="hud-box"><span class="hud-lbl">'+(d.win.mode==='ways'?'WAYS':d.win.mode==='cluster'?'CLUSTER':d.win.mode==='scatterpays'?'SCATTER PAYS':'LINES')+'</span>'+
        '<span class="hud-val" id="cabMode">'+modeReadout()+'</span></div>'+
      '<div class="hud-box"><span class="hud-lbl">BALANCE</span><span class="hud-val" id="cabBal">0</span></div>'+
      '<div class="hud-box hud-win"><span class="hud-lbl">WIN</span><span class="hud-val" id="cabWin">&mdash;</span></div>'+
    '</div>'+
    '<div class="cab-board" id="cabBoard"><div class="cab-reels" id="cabReels"></div>'+
      '<div class="cab-flash" id="cabFlash"></div>'+
      '<canvas class="cab-fx" id="cabFx"></canvas>'+
      '<div class="cab-float" id="cabFloat"></div></div>'+
    '<div class="cab-meta" id="cabMeta"></div>'+
    '<div class="cab-deck">'+
      '<div class="bet-ctl"><button class="bet-btn" id="betDn">&minus;</button>'+
        '<div class="bet-read"><span class="hud-lbl">BET</span><span class="hud-val" id="cabBet">0</span></div>'+
        '<button class="bet-btn" id="betUp">+</button></div>'+
      '<button class="spin-btn" id="cabSpin"><span>'+esc(L.spin)+'</span></button>'+
      '<button class="btn-auto" id="cabAuto" type="button" aria-pressed="false"'+
        ' title="'+esc(L.auto)+' — keeps spinning until you stop it (plays out bonus rounds first)">'+
        '<span class="dot"></span>'+esc(L.auto)+'</button>'+
      '<button class="btn-turbo" id="cabTurbo" type="button" aria-pressed="false"'+
        ' title="'+esc(L.turbo)+' — the reels stop almost instantly">&#9889; '+esc(L.turbo)+'</button>'+
      '<div class="side-ctl">'+
        '<button class="mini-btn" id="cabMute" title="Sound">&#128266;</button>'+
        '<button class="mini-btn" id="cabPays" title="Paytable">&#8505;</button>'+
      '</div>'+
    '</div>'+
    // "base game" is doing real work in this string: cabinet-math's simulate()
    // only ever covered the reels. Bonus rounds live in the theme layer and
    // have never been in that number, so the footer must not imply they are.
    '<div class="cab-foot" id="cabFoot">Play-money demo &middot; currency MORBIUS &middot; '+
      'base game RTP &asymp;95% (simulated 150k spins, bonus rounds not included)</div>'+
    // The big win gets its OWN node. It used to share #cabOverlay with the
    // bonus rounds, and its 2.6s self-clear wiped whatever the bonus had put
    // there 900ms earlier — which killed the pick bonus outright, because its
    // chips were gone before anyone could click one and it never resolved.
    '<div class="cab-overlay" id="cabBigWin" hidden></div>'+
    '<div class="cab-overlay" id="cabOverlay" hidden></div>';
  S.host.innerHTML=''; S.host.appendChild(root);

  var reels=$('#cabReels');
  reels.style.setProperty('--cols',d.cols);
  reels.style.setProperty('--rows',d.rows);

  $('#cabSpin').addEventListener('click',function(){ audio(); sfx('button'); spin(); });
  $('#betDn').addEventListener('click',function(){ audio(); stepBet(-1); });
  $('#betUp').addEventListener('click',function(){ audio(); stepBet(1); });
  $('#cabTurbo').addEventListener('click',function(){
    audio(); sfx('tick');
    S.turbo=!S.turbo; store('turbo',S.turbo);
    this.classList.toggle('on',S.turbo);
    this.setAttribute('aria-pressed',S.turbo?'true':'false');
  });
  $('#cabAuto').addEventListener('click',function(){
    audio(); sfx('button');
    setAuto(!S.auto);
    if(S.auto&&!S.spinning) spin();
  });
  if(S.turbo){ var tb=$('#cabTurbo'); tb.classList.add('on'); tb.setAttribute('aria-pressed','true'); }
  $('#cabMute').addEventListener('click',function(){
    audio(); S.muted=!S.muted; store('muted',S.muted);
    if(master) master.gain.value=S.muted?0:0.5;
    this.innerHTML=S.muted?'&#128263;':'&#128266;';
  });
  $('#cabPays').addEventListener('click',function(){ audio(); sfx('button'); showPaytable(); });
  if(S.muted) $('#cabMute').innerHTML='&#128263;';
  // Cells are squared off the measured column width, so a resize has to
  // re-measure or the reels keep their old height.
  if(!S._resizeBound){
    S._resizeBound=true;
    window.addEventListener('resize',function(){ if(!S.spinning) sizeReels(); });
  }
  renderMeta();
}
function modeReadout(){
  var d=S.def;
  if(d.win.mode==='ways'){ var w=1; for(var i=0;i<d.cols;i++) w*=d.rows; return w.toLocaleString('en-US'); }
  if(d.win.mode==='cluster') return (d.win.clusterMin||5)+'+ group';
  if(d.win.mode==='scatterpays') return (d.win.scatterMin||8)+'+ anywhere';
  return String(d.lines.length);
}
function stepBet(dir){
  var steps=betSteps(), i=steps.indexOf(S.bet); if(i<0)i=2;
  i=Math.max(0,Math.min(steps.length-1,i+dir));
  S.bet=steps[i]; store('bet',S.bet); updateHud(); sfx('tick');
}
function updateHud(){
  var b=$('#cabBal'), t=$('#cabBet');
  if(b) b.textContent=fmt(S.balance);
  if(t) t.textContent=fmt(S.bet);
}
function setWin(v){ var w=$('#cabWin'); if(!w) return; w.innerHTML=v==null?'&mdash;':('+'+fmt(v)); }

/* ── the payoff ──────────────────────────────────────────────────────────
   The reels were ported from the reference; this is the half that was not.
   A win used to be an outline pulse and a number that snapped into the HUD.
   Now it counts up over coin ticks, each winning group is walked through in
   turn with its own value, the board flashes and kicks, and symbol art
   erupts out of the middle scaled to how much was actually won. */
var rollRaf=null;
function stopRollup(){ if(rollRaf){ cancelAnimationFrame(rollRaf); rollRaf=null; } }
function rollupWin(to, tier){
  stopRollup();
  var w=$('#cabWin'); if(!w) return;
  var dur=PACE.rollup[tier]||PACE.rollup.small;
  var t0=null, lastTick=0;
  w.classList.add('counting');
  function step(ts){
    if(t0===null) t0=ts;
    var k=Math.min(1,(ts-t0)/dur), eased=1-Math.pow(1-k,3);
    w.innerHTML='+'+fmt(to*eased);
    if(ts-lastTick>78){ sfx('coin'); lastTick=ts; }
    if(k<1) rollRaf=requestAnimationFrame(step);
    else { rollRaf=null; w.classList.remove('counting'); w.classList.add('landed');
           setTimeout(function(){ w.classList.remove('landed'); },420); }
  }
  rollRaf=requestAnimationFrame(step);
}

/* Walk the winning groups one at a time instead of lighting the whole board
   at once — you cannot tell what paid when nine cells flash together. */
var cycleIv=null;
function stopWinCycle(){
  if(cycleIv){ clearInterval(cycleIv); cycleIv=null; }
  var reels=$('#cabReels');
  if(reels) [].forEach.call(reels.querySelectorAll('.cab-sym.is-focus'),function(c){ c.classList.remove('is-focus'); });
}
function startWinCycle(wins){
  stopWinCycle();
  if(!wins||wins.length<2) return;          // one group needs no cycling
  var i=0;
  function show(){
    var reels=$('#cabReels'); if(!reels) return;
    [].forEach.call(reels.querySelectorAll('.cab-sym.is-focus'),function(c){ c.classList.remove('is-focus'); });
    var w=wins[i%wins.length];
    (w.cells||[]).forEach(function(k){
      var p=k.split(','), cell=cellAt(+p[0],+p[1]);
      if(cell) cell.classList.add('is-focus');
    });
    i++;
  }
  show();
  cycleIv=setInterval(show, PACE.cycleGap);
}

/* Confetti made of the machine's own reel symbols, so the celebration looks
   like this game rather than a generic shower of dots. */
var fx={ raf:null, parts:[], ctx:null, imgs:null };
function fxImages(){
  if(fx.imgs) return fx.imgs;
  fx.imgs=[];
  (S.def.symbols||[]).slice(0,7).forEach(function(s){
    var im=new Image(); im.src=artOf(s.id); fx.imgs.push(im);
  });
  return fx.imgs;
}
function winBurst(tier){
  if(reduced()) return;
  var cv=$('#cabFx'), board=$('#cabBoard');
  if(!cv||!board||!cv.getContext) return;
  var r=board.getBoundingClientRect();
  cv.width=Math.max(1,Math.round(r.width)); cv.height=Math.max(1,Math.round(r.height));
  fx.ctx=cv.getContext('2d');
  var n=tier==='huge'?78:tier==='big'?46:24;
  var imgs=fxImages(), W=cv.width, H=cv.height;
  for(var i=0;i<n;i++){
    fx.parts.push({ img:imgs[Math.floor(Math.random()*imgs.length)],
      x:W/2+(Math.random()-0.5)*W*0.34, y:H*0.56,
      vx:(Math.random()-0.5)*12, vy:-(5+Math.random()*9),
      rot:Math.random()*6.283, vr:(Math.random()-0.5)*0.26,
      size:18+Math.random()*22, life:1 });
  }
  if(!fx.raf) fxTick();
}
function fxTick(){
  var c=fx.ctx, cv=$('#cabFx');
  if(!c||!cv){ fx.raf=null; return; }
  c.clearRect(0,0,cv.width,cv.height);
  fx.parts=fx.parts.filter(function(p){ return p.life>0&&p.y<cv.height+50; });
  fx.parts.forEach(function(p){
    p.x+=p.vx; p.y+=p.vy; p.vy+=0.44; p.rot+=p.vr; p.life-=0.008;
    c.save(); c.globalAlpha=Math.max(0,Math.min(1,p.life*1.4));
    c.translate(p.x,p.y); c.rotate(p.rot);
    try{ c.drawImage(p.img,-p.size/2,-p.size/2,p.size,p.size); }catch(e){}
    c.restore();
  });
  if(fx.parts.length) fx.raf=requestAnimationFrame(fxTick);
  else { c.clearRect(0,0,cv.width,cv.height); fx.raf=null; }
}
/* Auto-spin, as the midnight cabinet plays it: the toggle keeps re-pressing
   spin after each round settles, and because a bonus round is part of the
   round the next spin naturally waits for it to finish. */
function setAuto(on){
  S.auto=!!on;
  if(!S.auto&&S.autoTimer){ clearTimeout(S.autoTimer); S.autoTimer=null; }
  var b=$('#cabAuto'); if(!b) return;
  b.classList.toggle('on',S.auto);
  b.innerHTML='<span class="dot"></span>'+(S.auto?'Stop':'Auto');
  b.setAttribute('aria-pressed',S.auto?'true':'false');
}

function artOf(id){
  var s=S.def._byId[id]; if(!s) return '';
  var a=s.art||'';
  if(a.indexOf('data:')===0||a.indexOf('/')===0||a.indexOf('http')===0) return a;
  return '/'+a;
}
/* One symbol cell. Cells live inside a per-reel strip, never in a flat grid —
   a reel has to be able to scroll, and you cannot scroll a grid cell. */
function symCell(id, c, r, winCells, locked){
  return applyCell(el('div'), id, c, r, winCells, locked);
}
/* Write a symbol INTO an existing cell. The src is only assigned when it
   actually differs: re-assigning the same src, or replacing the <img> node
   outright, makes the browser re-decode and repaint the image — which is what
   the player sees as every symbol blinking the instant the reels stop. */
function applyCell(cell, id, c, r, winCells, locked){
  var s=S.def._byId[id], key=c+','+r;
  var cls='cab-sym';
  if(s&&s.role==='wild') cls+=' is-wild';
  if(s&&s.role==='scatter') cls+=' is-scatter';
  if(winCells&&winCells[key]) cls+=' is-win';
  if(locked&&locked[key]) cls+=' is-locked';
  if(cell.className!==cls) cell.className=cls;
  var img=cell.firstElementChild;
  if(!img||img.tagName!=='IMG'){ img=el('img'); cell.insertBefore(img, cell.firstChild); }
  var src=artOf(id);
  if(img.getAttribute('src')!==src){ img.setAttribute('src',src); img.alt=s?s.name:id; }
  var w=((s&&s.sizePct)||88)+'%';
  if(img.style.width!==w) img.style.width=w;
  var badge=cell.querySelector('.lock-badge'), wantBadge=!!(locked&&locked[key]);
  if(wantBadge&&!badge) cell.appendChild(el('span','lock-badge','&#128274;'));
  else if(!wantBadge&&badge) badge.remove();
  return cell;
}
/* Square the cells off the measured column width. The reel needs a real pixel
   height before the spin can convert strip travel into a translate distance. */
function sizeReels(){
  var reels=$('#cabReels'); if(!reels||!reels.firstChild) return 0;
  var w=reels.firstChild.clientWidth;
  if(w>0) reels.style.setProperty('--cellh', w+'px');
  return w;
}
/* `dropIn` plays the machine's anim.land on each cell. Only the cascade refill
   passes it — those cells genuinely appear out of nothing. A reel settling
   from a spin must NOT, or the symbol animates twice.

   This UPDATES the board in place whenever the shape already matches. It used
   to blow the whole thing away with innerHTML='' and rebuild it, which meant
   every <img> was a brand new element — a re-decode and a repaint of all of
   them, ~140ms after the reels had settled. That is the blink. Since the
   symbols it is asked to draw are usually the ones already on screen, reusing
   the nodes makes the common case touch nothing at all. */
function renderGrid(grid, winCells, locked, dropIn){
  var reels=$('#cabReels'), d=S.def;
  var land=(d.anim&&d.anim.land)||'pop';
  var animate=dropIn&&land!=='none'&&!reduced();
  var c, r;
  var reusable = S.reels.length===d.cols && reels.children.length===d.cols &&
    S.reels.every(function(R){
      return R.el.parentNode===reels && R.strip.children.length===d.rows;
    });
  if(!reusable){
    reels.innerHTML=''; S.reels=[];
    for(c=0;c<d.cols;c++){
      var reel=el('div','cab-reel'), strip=el('div','cab-strip');
      for(r=0;r<d.rows;r++) strip.appendChild(symCell(grid[c][r], c, r, winCells, locked));
      reel.appendChild(strip); reels.appendChild(reel);
      S.reels.push({ c:c, el:reel, strip:strip });
    }
  }else{
    for(c=0;c<d.cols;c++){
      var R=S.reels[c];
      // leave the reel's own classes alone — settleReel's landed/rflash are
      // mid-animation here and clear themselves
      if(R.strip.style.transform) R.strip.style.transform='translate3d(0,0,0)';
      for(r=0;r<d.rows;r++) applyCell(R.strip.children[r], grid[c][r], c, r, winCells, locked);
    }
  }
  if(animate){
    var cells=[];
    for(c=0;c<d.cols;c++) for(r=0;r<d.rows;r++) cells.push(S.reels[c].strip.children[r]);
    cells.forEach(function(x){ x.classList.remove('land-'+land); });
    void reels.offsetWidth;                       // one reflow for the whole board
    cells.forEach(function(x){ x.classList.add('land-'+land); });
  }
  sizeReels();
}
function cellAt(c,r){ var R=S.reels[c]; return R?R.strip.children[r]:null; }

/* ── the spin ───────────────────────────────────────────────────────────── */
function spin(){
  if(S.spinning) return;
  if(S.balance<S.bet){ setAuto(false); floatText('NOT ENOUGH MORBIUS','bad'); return; }
  if(S.autoTimer){ clearTimeout(S.autoTimer); S.autoTimer=null; }
  S.spinning=true;
  $('#cabSpin').classList.add('busy');
  S.balance-=S.bet; updateHud(); setWin(null);
  sfx('spin');

  // Deterministic per-spin seed, shown in the footer so a spin is re-checkable.
  var seed=S.key+'-'+Date.now()+'-'+(S.seedN++);
  var rng=M.makeRng(seed);
  var stops=M.drawStops(rng,S.strips);
  var grid=M.windowAt(stops,S.strips,S.def.rows);
  var res=M.resolveSpin(S.def,S.strips,grid,rng,S.featureState);
  S.lastRes=res;
  var payout=M.payoutOf(S.def,S.bet,res);
  $('#cabFoot').innerHTML='seed <span class="mono">'+esc(seed)+'</span> &middot; play-money demo &middot; MORBIUS';

  // The cyclic strip carries its own symbols, so a spin no longer needs the
  // previous window handed to it — it scrolls out of whatever the pool holds.
  presentSpin(res,payout).then(function(){ settle(res,payout); });
}

function presentSpin(res,payout){
  return spinReelAnim(res.steps[0].grid).then(function(){
    return walkSteps(res);
  });
}

/* ── the reel engine ─────────────────────────────────────────────────────
   Ported from morbius-midnight-lab.html — the series reel feel, cue for cue.

   A reel is a clipped column holding its FULL weighted strip laid out once,
   plus `rows` cells wrapped round from the front, and the scroll runs MODULO
   the pool:

       offset(t) = (start + D · easeProfile(t/T)) mod L      (in cells)

   so the reel never runs out of symbols, the blur shows this machine's real
   symbol mix rather than random filler, and D is picked to land exactly on
   the drawn stop. Landing REUSES the strip's own cells for the window — the
   same <img> nodes, nothing re-decodes, so there is no settle flash.

   Reels stop left to right, `gap` apart. Once the second scatter is on screen
   the remaining reels stretch to `anticGap` and light up: that anticipation
   beat is the thing the midnight cabinet is built around, and it is why the
   gap is fixed rather than squeezed into a constant-length window.

   Do not replace this with a timer that shuffles img.src — that reads as
   flicker, not as a spinning reel. */
var SPIN_TIMING={
  normal:{ first:1300, gap:1000, anticGap:2000, cruise:17 },
  turbo: { first:420,  gap:170,  anticGap:650,  cruise:26 }
};
/* Scatters needed for the bonus — settle() triggers on 3, so 2 on screen with
   reels still turning is the moment worth stretching. */
var ANTIC_NEED=3;

/* ── pacing ──────────────────────────────────────────────────────────────
   TURBO IS A REEL CONTROL. It makes the reels stop sooner and it does not
   touch anything else. It used to be threaded through all twenty timings in
   the engine, which meant a turbo round did not just spin faster — it clipped
   the cascade, halved the win count-up, cut the big-win moment from 2.6s to
   1.2s and rushed the bonus. Turbo should shorten the wait for the result,
   never the celebration of it.

   These are also just slower than they were. A cascade step held for 520ms is
   not long enough to read a multiplier, let alone enjoy one. */
var PACE={
  winHold:   1000,   // a winning board is held before anything else happens
  cycleGap:   850,   // between one highlighted win and the next
  popOut:     460,   // winners popping out of a cascade
  refill:     420,   // the refill dropping in
  lockStep:   560,   // hold-and-win locking before the respin
  respin:     700,
  noWin:      260,
  toBonus:   1500,   // beat between the board settling and the cutscene
  autoGap:    950,   // between an auto round ending and the next starting
  bigWinHold:3400,   // how long BIG WIN / HUGE WIN stays up
  rollup:  { small:700, big:1600, huge:2400 }
};
function scatterId(){
  var syms=S.def.symbols;
  for(var i=0;i<syms.length;i++) if(syms[i].role==='scatter') return syms[i].id;
  return null;
}
/* Quick accel to a, linear cruise to b, smooth decel out — normalised so the
   area under it is exactly 1 and the reel lands precisely on its stop. */
function easeProfile(u){
  var a=0.1, b=0.72, s=1/(a/2+(b-a)+(1-b)/2);
  if(u<=0) return 0;
  if(u>=1) return 1;
  if(u<=a) return s*u*u/(2*a);
  if(u<=b) return s*a/2+s*(u-a);
  return 1-s*(1-u)*(1-u)/(2*(1-b));
}
function reduced(){
  return typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
/* The visible reel is a LOOP of VIS_LOOP cells plus `rows` wrapped from the
   front, so a modular scroll always has somewhere to go.

   VIS_LOOP is midnight's own strip length, and that is the whole point.
   Midnight's D formula picks a whole number of loop revolutions, so the loop
   length — not `cruise` — is what actually sets the speed: measured, midnight
   travels 67–97 cells per reel at 52→15 cells/sec. A cabinet's WEIGHTED pool
   is 122–176 long (it is sized by the weights, not by how a reel should look),
   and running the same formula over that doubled the travel to ~200 cells.
   Same L and same cruise as the reference gives the same motion; the cells are
   drawn from this reel's weighted pool, so the blur still shows the machine's
   real symbol mix.

   Midnight's stop comes straight out of its strip, so its landing window
   already IS the result. A cabinet's features can rewrite the grid after the
   stops are drawn — walking, stacked, expanding and sticky wilds all do — so
   the landing window is written in here from what the maths actually produced.
   Keeping the stop inside [0, VIS_LOOP-rows] means that window never straddles
   the wrap, so it can never be half-written. */
var VIS_LOOP=62;
function buildCyclicStrip(strip, c, grid){
  var rows=S.def.rows, pool=S.strips[c]||[];
  if(!pool.length) pool=S.def.symbols.map(function(s){return s.id;});
  var L=Math.max(VIS_LOOP, rows*3);
  var stop=Math.floor(Math.random()*(L-rows+1));
  var ids=[], frag=document.createDocumentFragment();
  for(var i=0;i<L+rows;i++){
    var inWin=i>=stop&&i<stop+rows;
    // i>=L is the wrapped head — it has to repeat cell i-L exactly, or the
    // loop visibly jumps every time the scroll passes the seam
    ids[i]=inWin?grid[c][i-stop]
               :(i>=L?ids[i-L]:pool[Math.floor(Math.random()*pool.length)]);
    frag.appendChild(symCell(ids[i], c, inWin?i-stop:0));
  }
  strip.appendChild(frag);
  return { L:L, stop:stop };
}
/* Land by REUSING the strip's own landing-window cells — the same nodes that
   were already on screen, so nothing re-decodes and the reel does not flash. */
function settleReel(R){
  R.el.classList.remove('spinning','antic');
  var rows=S.def.rows, cells=[], r;
  for(r=0;r<rows;r++) cells.push(R.strip.children[R.stop+r]);
  R.strip.replaceChildren.apply(R.strip, cells);
  R.strip.style.transform='translate3d(0,0,0)';
  /* No per-cell land animation here. These cells arrived by SCROLLING into
     place, so spinning/dropping/popping them on top makes every symbol twist
     after it has already landed. Midnight bounces the reel and flashes it,
     nothing more. anim.land belongs where a cell really does appear out of
     nothing — the cascade refill in walkSteps. */
  if(!reduced()){
    R.el.classList.add('landed','rflash');
    setTimeout(function(){ R.el.classList.remove('landed','rflash'); }, 260);
  }
  sfxReelLand(R.c);
}
function boardFlash(){
  if(reduced()) return;
  var f=$('#cabFlash'); if(!f) return;
  f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
}
function boardShake(){
  if(reduced()) return;
  var b=$('#cabBoard'); if(!b) return;
  b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
  setTimeout(function(){ b.classList.remove('shake'); },550);
}
function spinReelAnim(finalGrid){
  var d=S.def, rows=d.rows, anim=d.anim||{}, c, r;
  var tm=SPIN_TIMING[S.turbo?'turbo':'normal'];
  var rm=reduced();
  var cruise=tm.cruise*((anim.cruise||10)/10);
  var reelsEl=$('#cabReels');

  /* Scatters this spin will land, per reel — the schedule needs them up front
     to know where the anticipation starts. */
  var sid=scatterId(), scPerCol=[];
  for(c=0;c<d.cols;c++){
    var n=0;
    if(sid) for(r=0;r<rows;r++) if(finalGrid[c][r]===sid) n++;
    scPerCol.push(n);
  }
  /* Stop schedule. The gap widens from the reel that puts the second scatter
     on screen onward, exactly as midnight does it. */
  var stopAt=[], anticFrom=-1, celebrateReel=-1, scSoFar=0;
  var t=rm?260:tm.first;
  for(c=0;c<d.cols;c++){
    stopAt[c]=t;
    scSoFar+=scPerCol[c];
    if(anticFrom<0&&c<d.cols-1&&scSoFar===ANTIC_NEED-1) anticFrom=c;
    if(celebrateReel<0&&scSoFar>=ANTIC_NEED) celebrateReel=c;
    t+=rm?120:((anticFrom>=0&&c>=anticFrom)?tm.anticGap:tm.gap);
  }

  reelsEl.innerHTML=''; S.reels=[];
  var states=[];
  for(c=0;c<d.cols;c++){
    var T=stopAt[c];
    var reel=el('div','cab-reel'), strip=el('div','cab-strip');
    if(!rm){
      reel.classList.add('spinning');
      reel.style.setProperty('--spin-blur',(anim.spinBlur==null?2:anim.spinBlur)+'px');
    }
    var built=buildCyclicStrip(strip, c, finalGrid);
    var L=built.L, stop=built.stop;
    var start=Math.floor(Math.random()*L);
    // D is the whole-pool travel that both reaches `stop` and cruises at about
    // `cruise` cells a second for this reel's T.
    var base=((stop-start)%L+L)%L;
    var ideal=cruise*T/1000;
    var D=base+Math.max(1,Math.round((ideal-base)/L))*L;
    reel.appendChild(strip); reelsEl.appendChild(reel);
    S.reels.push({ c:c, el:reel, strip:strip });
    states.push({ c:c, el:reel, strip:strip, T:T, L:L, start:start, D:D, stop:stop, done:false });
  }
  // --cellh must be set before the height is read, or cellH comes out zero and
  // every reel travels nowhere.
  sizeReels();

  if(anticFrom>=0&&!rm){
    setTimeout(function(){
      if(!S.spinning) return;
      startAnticLoop();
      for(var i=anticFrom+1;i<states.length;i++) if(!states[i].done) states[i].el.classList.add('antic');
    }, stopAt[anticFrom]);
  }

  startTicks();
  return new Promise(function(resolve){
    function finish(){ stopTicks(); stopAnticLoop(); resolve(); }
    var cellH=states[0].el.clientHeight/rows;
    if(!(cellH>0)){                       // never animate against a zero — just show the result
      states.forEach(function(R){ settleReel(R); });
      return finish();
    }
    var t0=null;
    function frame(ts){
      if(t0===null) t0=ts;
      var elapsed=ts-t0, allDone=true;
      for(var i=0;i<states.length;i++){
        var R=states[i];
        if(R.done) continue;
        var u=elapsed/R.T;
        if(u>=1){
          R.done=true; settleReel(R);
          var upTo=0; for(var q=0;q<=R.c;q++) upTo+=scPerCol[q];
          if(scPerCol[R.c]>0) sfxScatterLand(upTo);
          if(R.c===celebrateReel){ stopAnticLoop(); boardFlash(); boardShake(); sfxFanfare(); }
        }else{
          allDone=false;
          var off=(R.start+R.D*easeProfile(u))%R.L;
          R.strip.style.transform='translate3d(0,'+(-off*cellH).toFixed(2)+'px,0)';
          // drop the blur just before the stop so the result reads clean
          if(R.T-elapsed<240) R.el.classList.remove('spinning');
        }
      }
      if(allDone) finish(); else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

/* Walk the resolved steps: cascades pop and refill, holds lock and respin. */
function walkSteps(res){
  var flow=S.def.flow||{}, chainP=Promise.resolve();
  var lockedAcc={};
  res.steps.forEach(function(step,i){
    chainP=chainP.then(function(){
      var wc=step.winCells||{};
      var hasWin=Object.keys(wc).length>0;
      if(hasWin){
        renderGrid(step.grid,wc,flow.lockedRespin||flow.holdWin?lockedAcc:null);
        Object.keys(wc).forEach(function(k){ lockedAcc[k]=1; });
        sfx('pop');
        // walk the winning groups one at a time so it is readable
        var groups=(step.ev&&step.ev.wins)||[];
        startWinCycle(groups);
        if(step.mult>1) floatText('&times;'+step.mult,'mult');
        // a board that is paying is held long enough to actually look at
        var hold=PACE.winHold+(groups.length>1?PACE.cycleGap*Math.min(3,groups.length-1):0);
        return wait(hold).then(function(){
          stopWinCycle();
          var next=res.steps[i+1];
          if(!next) return;
          if(flow.cascades){
            // pop winners, then drop the refilled grid in
            Object.keys(wc).forEach(function(k){
              var p=k.split(','); var cell=cellAt(+p[0],+p[1]);
              if(cell) cell.classList.add('popping');
            });
            noiseHit(.14,.2,900);
            return wait(PACE.popOut).then(function(){
              renderGrid(next.grid,null,null,true);   // refilled cells really do drop in
              $('#cabReels').classList.add('impact');
              setTimeout(function(){ $('#cabReels').classList.remove('impact'); },260);
              return wait(PACE.refill);
            });
          }
          if(flow.lockedRespin||flow.holdWin){
            sfx('lock');
            return wait(PACE.lockStep).then(function(){
              renderGrid(next.grid,null,lockedAcc);
            });
          }
          return wait(160);
        });
      }
      // no-win step: a respin marker means one reel goes again
      if(step.respin!=null&&res.steps[i+1]){
        floatText('RESPIN','info'); sfx('spin');
        return wait(PACE.respin).then(function(){ renderGrid(res.steps[i+1].grid); });
      }
      renderGrid(step.grid,null,(flow.lockedRespin||flow.holdWin)&&Object.keys(lockedAcc).length?lockedAcc:null);
      return wait(PACE.noWin);
    });
  });
  return chainP;
}

/* ── settlement, win moment, meta, bonus ────────────────────────────────── */
function settle(res,payout){
  var profitX=payout>0?(payout-S.bet)/S.bet:-1;
  var tier='small';
  if(payout>0){
    S.balance+=payout; store('balance',S.balance); updateHud();
    tier=profitX>=4?'huge':profitX>=1.5?'big':'small';
    rollupWin(payout, tier);          // counts up over coin ticks, not a snap
    winBurst(tier);                   // this machine's own symbols, thrown
    playWinTier(tier);
    if(tier!=='small'){ boardFlash(); boardShake(); bigWinOverlay(tier,payout); }
    if(res.slam>1) floatText('SLAM &times;'+res.slam,'mult');
  }else{
    sfx('lose'); store('balance',S.balance);
  }
  metaTick(res,payout);

  /* The round is not over until the celebration is. This used to fire the
     rollup and release immediately, so a 2.4s count-up on a huge win was
     racing a 950ms auto-spin — the next round started over the top of it and
     the win you just had was gone before you could read it. Hold the round
     open for as long as the payoff takes. */
  var celebrate = payout>0
    ? wait((PACE.rollup[tier]||PACE.rollup.small) + (tier==='small'?260:PACE.bigWinHold-PACE.rollup[tier]))
    : wait(220);

  var doBonus=res.scatter>=3&&S.def.bonus&&S.def.bonus.round!=='none'&&S.def.bonus.autoTrigger!==false;
  var after=celebrate.then(function(){
    if(!doBonus) return;
    // a beat of quiet between the win settling and the cutscene taking over
    return wait(PACE.toBonus).then(function(){ sfx('scatter'); return runBonus(S.def.bonus.round); });
  });
  after.then(function(){
    S.spinning=false; $('#cabSpin').classList.remove('busy');
    if(!S.auto) return;
    // The bonus round is part of `after`, so auto has already waited it out.
    if(S.balance<S.bet){ setAuto(false); floatText('AUTO OFF &middot; LOW BALANCE','info'); return; }
    S.autoTimer=setTimeout(function(){
      S.autoTimer=null;
      if(S.auto&&!S.spinning) spin();
    }, PACE.autoGap);
  });
}

function floatText(html,kind){
  var f=$('#cabFloat'); var n=el('div','float-msg '+(kind||''),html);
  f.appendChild(n);
  setTimeout(function(){ n.classList.add('go'); },20);
  setTimeout(function(){ n.remove(); },1900);
}

function bigWinOverlay(tier,payout){
  var ov=$('#cabBigWin');
  ov.hidden=false; ov.className='cab-overlay bigwin';
  ov.innerHTML='<div class="bw-wrap"><div class="bw-word '+tier+'">'+
    (tier==='huge'?'HUGE WIN':'BIG WIN')+'</div><div class="bw-amt" id="bwAmt">0</div></div>';
  var t0=performance.now(), dur=PACE.rollup.big;
  function tick(t){
    var k=Math.min(1,(t-t0)/dur);
    var eased=1-Math.pow(1-k,3);
    var n=ov.querySelector('#bwAmt'); if(n) n.textContent='+'+fmt(payout*eased)+' MORBIUS';
    if(k<1&&!ov.hidden) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  setTimeout(function(){ ov.hidden=true; ov.className='cab-overlay'; ov.innerHTML=''; }, PACE.bigWinHold);
}

/* meta strips — the persistent layer above the base game */
function renderMeta(){
  var m=S.meta, host=$('#cabMeta'); if(!host) return;
  if(m.kind==='collection'){
    host.innerHTML='<div class="meta-strip"><span class="meta-lbl">MARKERS</span>'+
      '<div class="meta-bar"><div class="meta-fill" style="width:'+(100*m.count/m.target)+'%"></div></div>'+
      '<span class="meta-val">'+m.count+' / '+m.target+' &middot; '+m.sets+' sets</span></div>';
  }else if(m.kind==='level'){
    host.innerHTML='<div class="meta-strip"><span class="meta-lbl">LV '+m.level+'</span>'+
      '<div class="meta-bar"><div class="meta-fill" style="width:'+(100*m.xp/m.next)+'%"></div></div>'+
      '<span class="meta-val">XP '+fmt(m.xp)+' / '+fmt(m.next)+'</span></div>';
  }else if(m.kind==='tiered'){
    host.innerHTML='<div class="jack-row">'+
      ['mini','minor','major','grand'].map(function(t){
        return '<div class="jack '+t+'"><span class="jack-lbl">'+t.toUpperCase()+'</span><span class="jack-val">'+fmt(m[t])+'</span></div>';
      }).join('')+'</div>';
  }else host.innerHTML='';
}
function metaTick(res,payout){
  var m=S.meta;
  if(m.kind==='collection'){
    if(res.scatter>0){ m.count+=res.scatter; floatText('+'+res.scatter+' MARKER'+(res.scatter>1?'S':''),'info'); }
    if(m.count>=m.target){
      m.count-=m.target; m.sets++;
      var award=S.bet*20;
      S.balance+=award; floatText('SET COMPLETE +'+fmt(award),'mult'); sfx('award'); playWinTier('big');
    }
  }else if(m.kind==='level'&&payout>0){
    m.xp+=Math.max(1,Math.round(payout/S.bet*10));
    if(m.xp>=m.next){ m.level++; m.xp-=m.next; m.next=Math.round(m.next*1.6); floatText('LEVEL UP &middot; LV '+m.level,'mult'); sfx('award'); }
  }else if(m.kind==='tiered'){
    m.mini+=1; m.minor+=2; m.major+=3; m.grand+=4;
    if(payout>0&&Math.random()<0.008){
      var tier=Math.random()<0.75?'mini':'minor';
      var v=m[tier];
      S.balance+=v; m[tier]=tier==='mini'?250:1250;
      floatText(tier.toUpperCase()+' JACKPOT +'+fmt(v),'mult'); sfx('award'); playWinTier('big');
    }
  }
  store('meta',m); store('balance',S.balance); renderMeta(); updateHud();
}

/* ── bonus rounds ───────────────────────────────────────────────────────── */
function bonusName(kind){
  var names=S.cfg.bonusTitle||{};
  return names[kind]||{freespins:'FREE SPINS',wheel:'PRIZE WHEEL',pick:'PICK BONUS',gamble:'GAMBLE'}[kind]||'BONUS';
}
function overlayShell(title,body){
  var ov=$('#cabOverlay');
  ov.hidden=false; ov.className='cab-overlay bonus';
  ov.innerHTML='<div class="bn-panel"><div class="bn-title">'+title+'</div><div class="bn-body">'+body+'</div></div>';
  return ov;
}
function closeOverlay(){ var ov=$('#cabOverlay'); ov.hidden=true; ov.className='cab-overlay'; ov.innerHTML=''; }

/* The cutscene. Winning a bonus is the biggest thing that happens on a slot,
   so it stops being a panel that fades in and becomes an event that takes over
   the reel container first. Each machine supplies its own words, font, palette
   and particle character; CabinetFX does the staging. */
function bonusIntro(){
  var spec=S.theme&&S.theme.intro;
  if(!spec||!window.CabinetFX) return Promise.resolve();
  var board=$('#cabBoard'); if(!board) return Promise.resolve();
  return window.CabinetFX.playIntro(board, spec, {
    turbo:false, reduced:reduced(),   // the cutscene never runs at turbo speed
    onBeat:function(name, i){
      if(name==='open')   packCue('ciOpen');
      if(name==='kicker') packCue('ciKicker');
      if(name==='slam')   packCue('ciSlam', i||0);
      if(name==='flare')  packCue('ciFlare');
    }
  });
}

/* The api handed to a themed bonus round. Everything a round needs to draw
   itself, pay out and make noise, without reaching into engine internals. */
function bonusApi(){
  return {
    // no `turbo` here on purpose: turbo is a reel control, and a bonus
    // round always plays at full length.
    bet:S.bet, def:S.def, meta:S.meta,
    rng:Math.random, fmt:fmt, esc:esc, wait:wait,
    overlay:function(title, html){ return overlayShell(title, html); },
    body:function(){ var o=$('#cabOverlay'); return o?o.querySelector('.bn-body'):null; },
    q:function(sel){ var o=$('#cabOverlay'); return o?o.querySelector(sel):null; },
    qa:function(sel){ var o=$('#cabOverlay'); return o?[].slice.call(o.querySelectorAll(sel)):[]; },
    close:closeOverlay,
    credit:function(n){ if(!n) return; S.balance+=n; store('balance',S.balance); updateHud(); renderMeta(); },
    sfx:sfx, win:playWinTier
  };
}

/* Last-resort guard. Each round is meant to resolve on its own; this only
   exists so that a bug in one of them can never leave the cabinet stuck with
   S.spinning true and the spin button dead. It races, it does not cancel — a
   round that finishes late still pays out, it just no longer holds the game. */
function runBonus(kind){
  return bonusIntro().then(function(){
    // A machine's own round replaces the house one entirely.
    var custom=S.theme&&S.theme.bonus&&S.theme.bonus[kind];
    var round = typeof custom==='function' ? custom(bonusApi())
              : kind==='freespins' ? bonusFreeSpins()
              : kind==='wheel'     ? bonusWheel()
              : kind==='pick'      ? bonusPick()
              : null;
    if(!round) return;
    return Promise.race([round, new Promise(function(r){
      setTimeout(function(){ r(); }, 120000);
    })]);
  });
}

function bonusFreeSpins(){
  var N=S.def.bonus.freeSpins||10, total=0, i=0;
  var ov=overlayShell(bonusName('freespins'),
    '<div class="fs-read"><span id="fsN">0</span> / '+N+'</div><div class="fs-grid" id="fsGrid"></div>'+
    '<div class="fs-total">TOTAL <span id="fsTotal">0</span></div>');
  var grid=ov.querySelector('#fsGrid');
  grid.style.setProperty('--cols',S.def.cols);
  function mini(gridData,wc){
    var h='';
    for(var r=0;r<S.def.rows;r++) for(var c=0;c<S.def.cols;c++){
      var id=gridData[c][r];
      h+='<div class="fs-cell'+((wc&&wc[c+','+r])?' hit':'')+'"><img src="'+artOf(id)+'"/></div>';
    }
    grid.innerHTML=h;
  }
  return new Promise(function(done){
    function one(){
      if(i>=N){
        S.balance+=total; store('balance',S.balance); updateHud();
        var body=ov.querySelector('.bn-body');
        if(!body) return done();
        body.innerHTML='<div class="fs-done">'+bonusName('freespins')+' PAID<br/><b>+'+fmt(total)+' MORBIUS</b></div>';
        playWinTier(total>S.bet*4?'huge':total>0?'big':'small');
        setTimeout(function(){ closeOverlay(); done(); }, 2000);
        return;
      }
      i++;
      var rng=M.makeRng(S.key+'-fs-'+Date.now()+'-'+i);
      var stops=M.drawStops(rng,S.strips);
      var g=M.windowAt(stops,S.strips,S.def.rows);
      var res=M.resolveSpin(S.def,S.strips,g,rng,{});
      var pay=M.payoutOf(S.def,S.bet,res);
      total+=pay;
      var lastWin=null;
      for(var k=res.steps.length-1;k>=0;k--){ if(Object.keys(res.steps[k].winCells||{}).length){ lastWin=res.steps[k]; break; } }
      mini((lastWin||res.steps[res.steps.length-1]).grid, lastWin&&lastWin.winCells);
      var fsN=ov.querySelector('#fsN'), fsT=ov.querySelector('#fsTotal');
      if(!fsN||!fsT) return done();   // overlay torn down (navigation, second bonus) — stop cleanly
      fsN.textContent=i;
      fsT.textContent=fmt(total);
      if(pay>0) sfx('award'); else sfx('tick');
      setTimeout(one, 700);
    }
    one();
  });
}

function bonusWheel(){
  var mults=[2,3,4,5,8,10,15,25];
  // weighted pick, small odds on the big wedges
  var weights=[22,20,16,14,10,9,6,3];
  var totalW=weights.reduce(function(a,b){return a+b;},0);
  var roll=Math.random()*totalW, idx=0;
  for(var i=0;i<weights.length;i++){ roll-=weights[i]; if(roll<=0){ idx=i; break; } }
  var award=mults[idx]*S.bet;

  var ov=overlayShell(bonusName('wheel'),
    '<canvas id="whC" width="340" height="340"></canvas><div class="wh-read" id="whRead">&nbsp;</div>');
  var cv=ov.querySelector('#whC'), ctx=cv.getContext('2d');
  var n=mults.length, seg=Math.PI*2/n;
  function draw(rot){
    ctx.clearRect(0,0,340,340); ctx.save(); ctx.translate(170,170); ctx.rotate(rot);
    for(var i=0;i<n;i++){
      ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,158,i*seg,(i+1)*seg); ctx.closePath();
      ctx.fillStyle=i%2?'rgba(255,255,255,0.10)':'rgba(255,255,255,0.04)';
      ctx.fill(); ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.stroke();
      ctx.save(); ctx.rotate(i*seg+seg/2); ctx.textAlign='right'; ctx.fillStyle='#fff';
      ctx.font='700 22px ui-monospace,monospace'; ctx.fillText(mults[i]+'×',140,8); ctx.restore();
    }
    ctx.restore();
    // pointer
    ctx.beginPath(); ctx.moveTo(170,4); ctx.lineTo(154,34); ctx.lineTo(186,34); ctx.closePath();
    ctx.fillStyle=S.cfg.accent||'#fff'; ctx.fill();
  }
  // land the chosen wedge under the pointer (pointer at -90deg)
  var target=-Math.PI/2-(idx*seg+seg/2)+Math.PI*2*6;
  var t0=performance.now(), dur=3400;
  return new Promise(function(done){
    function anim(t){
      var k=Math.min(1,(t-t0)/dur), eased=1-Math.pow(1-k,3);
      draw(target*eased);
      if(k<1){ if(Math.floor(k*24)!==Math.floor((k-0.01)*24)) sfx('tick'); requestAnimationFrame(anim); }
      else{
        var whR=ov.querySelector('#whRead');
        if(whR) whR.innerHTML='<b>'+mults[idx]+'&times;</b> BET &middot; +'+fmt(award)+' MORBIUS';
        S.balance+=award; store('balance',S.balance); updateHud();
        playWinTier(mults[idx]>=10?'huge':'big');
        setTimeout(function(){ closeOverlay(); done(); },2200);
      }
    }
    requestAnimationFrame(anim);
  });
}

function bonusPick(){
  var values=[1,1,2,2,3,3,4,5,6,8,10,15].sort(function(){return Math.random()-0.5;});
  var picksLeft=3, total=0;
  var ov=overlayShell(bonusName('pick'),
    '<div class="pk-read">PICK <b id="pkN">3</b></div><div class="pk-grid" id="pkGrid"></div>'+
    '<div class="fs-total">TOTAL <span id="pkTotal">0</span></div>');
  var grid=ov.querySelector('#pkGrid');
  return new Promise(function(done){
    var idle=null, finished=false;
    /* This round is the only one that waits on a human. Without a fallback a
       player who walks away — or an overlay that gets torn out from under the
       chips — leaves the promise unresolved and the cabinet stuck spinning
       forever. Every pick re-arms an idle timer that picks for them. */
    function armIdle(){
      clearTimeout(idle);
      idle=setTimeout(function(){
        var left=grid?grid.querySelectorAll('.pk-chip:not(.open)'):[];
        if(left.length) left[Math.floor(Math.random()*left.length)].click();
        else finish();                    // chips are gone — pay out and release
      }, 12000);
    }
    function finish(){
      if(finished) return; finished=true;
      clearTimeout(idle);
      if(grid) grid.querySelectorAll('.pk-chip').forEach(function(x,j){
        if(!x.classList.contains('open')){ x.classList.add('open','dim'); x.innerHTML=values[j]+'&times;'; }
      });
      S.balance+=total; store('balance',S.balance); updateHud();
      playWinTier(total>=S.bet*8?'huge':'big');
      setTimeout(function(){ closeOverlay(); done(); },2200);
    }
    values.forEach(function(v,i){
      var b=el('button','pk-chip','?');
      b.addEventListener('click',function(){
        if(picksLeft<=0||b.classList.contains('open')) return;
        picksLeft--; b.classList.add('open');
        b.innerHTML=v+'&times;';
        total+=v*S.bet; sfx('award');
        var pkN=ov.querySelector('#pkN'), pkT=ov.querySelector('#pkTotal');
        if(pkN) pkN.textContent=picksLeft;
        if(pkT) pkT.textContent=fmt(total);
        if(picksLeft===0) setTimeout(finish,500); else armIdle();
      });
      grid.appendChild(b);
    });
    armIdle();
  });
}

/* ── paytable ───────────────────────────────────────────────────────────── */
function showPaytable(){
  var d=S.def;
  var rows=d.symbols.map(function(s){
    var pays=(s.pays||[]).map(function(v,i){ return v>0?('<span class="pt-pay">'+i+'&rarr;'+v+'</span>'):''; }).join('');
    var role=s.role!=='normal'?'<span class="pt-role">'+s.role.toUpperCase()+'</span>':'';
    return '<div class="pt-row"><img src="'+artOf(s.id)+'"/><div class="pt-meta"><div class="pt-name">'+esc(s.name)+' '+role+'</div>'+
      '<div class="pt-pays">'+(pays||'&mdash;')+'</div></div></div>';
  }).join('');
  var sp=d.scatterPay?Object.keys(d.scatterPay).map(function(k){ return k+'&rarr;'+d.scatterPay[k]+'&times;'; }).join(' &middot; '):'';
  var ov=overlayShell('PAYTABLE',
    '<div class="pt-scroll">'+rows+
    (sp?'<div class="pt-note">Scatter anywhere: '+sp+' bet</div>':'')+
    '<div class="pt-note">'+esc(S.cfg.mechanics||'')+'</div></div>'+
    '<button class="pk-chip pt-close" id="ptClose">CLOSE</button>');
  ov.querySelector('#ptClose').addEventListener('click',closeOverlay);
}

})();
