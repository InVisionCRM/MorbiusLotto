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
  turbo:false, cfg:null, seedN:0, host:null, reels:[], lastRes:null, lastGrid:null
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
  g.gain.setValueAtTime(vol,t0); g.gain.exponentialRampToValueAtTime(0.01,t0+dur);
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
  var g=AC.createGain(); g.gain.setValueAtTime(vol,t0); g.gain.exponentialRampToValueAtTime(0.01,t0+dur);
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
/* Reels land left to right and the pitch climbs with them — the cue that
   tells you how far through the spin you are without looking. */
function sfxReelLand(i){
  noiseHit(.055,.2,1500+i*260);
  tone(300+i*58,'triangle',.07,.16);
}
function sfx(name){
  switch(name){
    case 'button': tone(520,'triangle',.05,.25); break;
    case 'spin':   noiseHit(.3,.2,2400); tone(150,'sine',.34,.3,360); break;
    case 'land':   noiseHit(.06,.22,1800); tone(330,'triangle',.06,.14); break;
    case 'pop':    tone(700,'triangle',.07,.22,1500); noiseHit(.08,.16,3200); break;
    case 'lock':   tone(220,'square',.08,.18); tone(440,'sine',.1,.14,null,60); break;
    case 'scatter':tone(700,'sine',.2,.3,1400); tone(1400,'triangle',.18,.16,null,90); break;
    case 'lose':   tone(150,'sine',.3,.3,60); break;
    case 'tick':   tone(900,'square',.03,.12); break;
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
  S.host=document.querySelector(cfg.host);
  M=window.CabinetMath;
  if(!M){ S.host.innerHTML='<div class="cab-err">cabinet-math.js failed to load</div>'; return; }
  fetch(cfg.defUrl).then(function(r){ return r.json(); }).then(function(def){
    S.def=def; M.indexSyms(def);
    S.strips=M.buildStrips(def);
    S.balance=load('balance',10000);
    S.bet=load('bet', defaultBet());
    S.muted=load('muted',false);
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
  var root=el('div','cab-root');
  root.innerHTML=
    '<div class="cab-hud">'+
      '<div class="hud-box"><span class="hud-lbl">'+(d.win.mode==='ways'?'WAYS':d.win.mode==='cluster'?'CLUSTER':d.win.mode==='scatterpays'?'SCATTER PAYS':'LINES')+'</span>'+
        '<span class="hud-val" id="cabMode">'+modeReadout()+'</span></div>'+
      '<div class="hud-box"><span class="hud-lbl">BALANCE</span><span class="hud-val" id="cabBal">0</span></div>'+
      '<div class="hud-box hud-win"><span class="hud-lbl">WIN</span><span class="hud-val" id="cabWin">&mdash;</span></div>'+
    '</div>'+
    '<div class="cab-board"><div class="cab-reels" id="cabReels"></div>'+
      '<div class="cab-float" id="cabFloat"></div></div>'+
    '<div class="cab-meta" id="cabMeta"></div>'+
    '<div class="cab-deck">'+
      '<div class="bet-ctl"><button class="bet-btn" id="betDn">&minus;</button>'+
        '<div class="bet-read"><span class="hud-lbl">BET</span><span class="hud-val" id="cabBet">0</span></div>'+
        '<button class="bet-btn" id="betUp">+</button></div>'+
      '<button class="spin-btn" id="cabSpin"><span>SPIN</span></button>'+
      '<div class="side-ctl">'+
        '<button class="mini-btn" id="cabTurbo" title="Turbo">&#9889;</button>'+
        '<button class="mini-btn" id="cabMute" title="Sound">&#128266;</button>'+
        '<button class="mini-btn" id="cabPays" title="Paytable">&#8505;</button>'+
      '</div>'+
    '</div>'+
    '<div class="cab-foot" id="cabFoot">Play-money demo &middot; currency MORBIUS &middot; RTP &asymp;95% (simulated 150k spins)</div>'+
    '<div class="cab-overlay" id="cabOverlay" hidden></div>';
  S.host.innerHTML=''; S.host.appendChild(root);

  var reels=$('#cabReels');
  reels.style.setProperty('--cols',d.cols);
  reels.style.setProperty('--rows',d.rows);

  $('#cabSpin').addEventListener('click',function(){ audio(); sfx('button'); spin(); });
  $('#betDn').addEventListener('click',function(){ audio(); stepBet(-1); });
  $('#betUp').addEventListener('click',function(){ audio(); stepBet(1); });
  $('#cabTurbo').addEventListener('click',function(){ S.turbo=!S.turbo; this.classList.toggle('on',S.turbo); });
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

function artOf(id){
  var s=S.def._byId[id]; if(!s) return '';
  var a=s.art||'';
  if(a.indexOf('data:')===0||a.indexOf('/')===0||a.indexOf('http')===0) return a;
  return '/'+a;
}
/* One symbol cell. Cells live inside a per-reel strip, never in a flat grid —
   a reel has to be able to scroll, and you cannot scroll a grid cell. */
function symCell(id, c, r, winCells, locked){
  var s=S.def._byId[id];
  var cell=el('div','cab-sym'+(s&&s.role==='wild'?' is-wild':'')+(s&&s.role==='scatter'?' is-scatter':''));
  var key=c+','+r;
  if(winCells&&winCells[key]) cell.className+=' is-win';
  if(locked&&locked[key]) cell.className+=' is-locked';
  var img=el('img'); img.src=artOf(id); img.alt=s?s.name:id;
  img.style.width=((s&&s.sizePct||88))+'%';
  cell.appendChild(img);
  if(locked&&locked[key]) cell.appendChild(el('span','lock-badge','&#128274;'));
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
function renderGrid(grid, winCells, locked){
  var reels=$('#cabReels'); reels.innerHTML=''; S.reels=[];
  for(var c=0;c<S.def.cols;c++){
    var reel=el('div','cab-reel'), strip=el('div','cab-strip');
    for(var r=0;r<S.def.rows;r++) strip.appendChild(symCell(grid[c][r], c, r, winCells, locked));
    reel.appendChild(strip); reels.appendChild(reel);
    S.reels.push({ c:c, el:reel, strip:strip });
  }
  sizeReels();
}
function cellAt(c,r){ var R=S.reels[c]; return R?R.strip.children[r]:null; }

/* ── the spin ───────────────────────────────────────────────────────────── */
function spin(){
  if(S.spinning) return;
  if(S.balance<S.bet){ floatText('NOT ENOUGH MORBIUS','bad'); return; }
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

  presentSpin(res,payout).then(function(){
    // Remember what is on screen: the next spin scrolls out of it.
    var last=res.steps[res.steps.length-1];
    S.lastGrid=last?last.grid:grid;
    settle(res,payout);
  });
}

function presentSpin(res,payout){
  return spinReelAnim(res.steps[0].grid).then(function(){
    return walkSteps(res);
  });
}

/* ── the reel engine ─────────────────────────────────────────────────────
   Ported from slot-builder-lab.html, which took it from slots-lab.html,
   which modelled it on the app's transaction slot machine. Every reel is a
   long vertical STRIP that scrolls: the current window on top, weighted
   filler through the middle, and the final window at the bottom — so the
   result scrolls INTO place and landing needs no symbol swap.

   offset(t) = travel * easeProfile(t/T) * cellHeight, driven by rAF. Each
   reel has its own T (first stop, then one per gap), so they stop left to
   right. This is the house reel feel; do not replace it with a timer that
   shuffles img.src — that reads as flicker, not as a spinning reel. */
/* The builder uses a FIXED 1000 ms gap between reel stops, which was tuned on
   a 5-reel board and drags badly as boards get wider — measured, it takes 5.5 s
   at 5 reels and 7.5 s at 7. These machines are 6 and 7 wide, so the schedule
   is spread across a fixed WINDOW instead: the first reel stops at `first`, the
   last at `last`, and the gap falls out of the column count. Same motion
   profile, same feel, constant length whatever the board. */
var SPIN_TIMING={
  normal:{ first:900, last:2600, cruise:17 },
  turbo: { first:320, last:820,  cruise:26 }
};
function stopSchedule(cols, tm){
  if(cols<=1) return [tm.first];
  var gap=(tm.last-tm.first)/(cols-1), out=[];
  for(var c=0;c<cols;c++) out.push(Math.round(tm.first+c*gap));
  return out;
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
/* prev window → weighted filler → final window. Filler is drawn from the
   reel's own weighted strip so the blur shows this machine's symbol mix. */
function buildSpinStrip(strip, c, travel, grid, prevGrid){
  var rows=S.def.rows, pool=S.strips[c]||[], syms=S.def.symbols, r;
  for(r=0;r<rows;r++){
    var pid=prevGrid&&prevGrid[c]?prevGrid[c][r]:null;
    strip.appendChild(symCell(pid||syms[Math.floor(Math.random()*syms.length)].id, c, r));
  }
  for(var i=0;i<travel-rows;i++){
    var id=pool.length?pool[Math.floor(Math.random()*pool.length)]
                      :syms[Math.floor(Math.random()*syms.length)].id;
    strip.appendChild(symCell(id, c, 0));
  }
  for(r=0;r<rows;r++) strip.appendChild(symCell(grid[c][r], c, r));
}
function settleReel(R, grid){
  R.el.classList.remove('spinning');
  R.strip.style.transform='';
  R.strip.innerHTML='';
  var land=(S.def.anim&&S.def.anim.land)||'pop';
  for(var r=0;r<S.def.rows;r++){
    var cell=symCell(grid[R.c][r], R.c, r);
    if(land!=='none'&&!reduced()) cell.classList.add('land-'+land);
    R.strip.appendChild(cell);
  }
  if(!reduced()){
    R.el.classList.add('landed','rflash');
    setTimeout(function(){ R.el.classList.remove('landed','rflash'); }, 260);
  }
  sfxReelLand(R.c);
}
function spinReelAnim(finalGrid){
  var d=S.def, rows=d.rows, anim=d.anim||{};
  var tm=SPIN_TIMING[S.turbo?'turbo':'normal'];
  var rm=reduced();
  var sched=rm ? stopSchedule(d.cols,{first:180,last:420})
               : stopSchedule(d.cols,tm);
  var cruise=tm.cruise*((anim.cruise||10)/10);
  var prevGrid=S.lastGrid;
  var reelsEl=$('#cabReels');

  reelsEl.innerHTML=''; S.reels=[];
  var states=[];
  for(var c=0;c<d.cols;c++){
    var T=sched[c];
    var travel=Math.max(rows+2, Math.round(cruise*T/1000));
    var reel=el('div','cab-reel'), strip=el('div','cab-strip');
    if(!rm){
      reel.classList.add('spinning');
      reel.style.setProperty('--spin-blur',(anim.spinBlur==null?2:anim.spinBlur)+'px');
    }
    buildSpinStrip(strip, c, travel, finalGrid, prevGrid);
    reel.appendChild(strip); reelsEl.appendChild(reel);
    S.reels.push({ c:c, el:reel, strip:strip });
    states.push({ c:c, el:reel, strip:strip, T:T, travel:travel, done:false });
  }
  // --cellh must be set before the height is read, or cellH comes out zero and
  // every reel travels nowhere.
  sizeReels();

  return new Promise(function(resolve){
    var cellH=states[0].el.clientHeight/rows;
    if(!(cellH>0)){                       // never animate against a zero — just show the result
      states.forEach(function(R){ settleReel(R, finalGrid); });
      return resolve();
    }
    var t0=null;
    function frame(ts){
      if(t0===null) t0=ts;
      var elapsed=ts-t0, allDone=true;
      for(var i=0;i<states.length;i++){
        var R=states[i];
        if(R.done) continue;
        var u=elapsed/R.T;
        if(u>=1){ R.done=true; settleReel(R, finalGrid); }
        else{
          allDone=false;
          R.strip.style.transform='translate3d(0,'+(-(R.travel*easeProfile(u))*cellH).toFixed(2)+'px,0)';
        }
      }
      if(allDone) resolve(); else requestAnimationFrame(frame);
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
        if(step.mult>1) floatText('&times;'+step.mult,'mult');
        return wait(S.turbo?160:520).then(function(){
          var next=res.steps[i+1];
          if(!next) return;
          if(flow.cascades){
            // pop winners, then drop the refilled grid in
            Object.keys(wc).forEach(function(k){
              var p=k.split(','); var cell=cellAt(+p[0],+p[1]);
              if(cell) cell.classList.add('popping');
            });
            noiseHit(.14,.2,900);
            return wait(S.turbo?120:280).then(function(){
              renderGrid(next.grid);
              $('#cabReels').classList.add('impact');
              setTimeout(function(){ $('#cabReels').classList.remove('impact'); },260);
            });
          }
          if(flow.lockedRespin||flow.holdWin){
            sfx('lock');
            return wait(S.turbo?100:340).then(function(){
              renderGrid(next.grid,null,lockedAcc);
            });
          }
          return wait(80);
        });
      }
      // no-win step: a respin marker means one reel goes again
      if(step.respin!=null&&res.steps[i+1]){
        floatText('RESPIN','info'); sfx('spin');
        return wait(S.turbo?120:420).then(function(){ renderGrid(res.steps[i+1].grid); });
      }
      renderGrid(step.grid,null,(flow.lockedRespin||flow.holdWin)&&Object.keys(lockedAcc).length?lockedAcc:null);
      return wait(S.turbo?60:160);
    });
  });
  return chainP;
}

/* ── settlement, win moment, meta, bonus ────────────────────────────────── */
function settle(res,payout){
  var profitX=payout>0?(payout-S.bet)/S.bet:-1;
  if(payout>0){
    S.balance+=payout; store('balance',S.balance); updateHud();
    setWin(payout);
    var tier=profitX>=4?'huge':profitX>=1.5?'big':'small';
    playWinTier(tier);
    if(tier!=='small') bigWinOverlay(tier,payout);
    if(res.slam>1) floatText('SLAM &times;'+res.slam,'mult');
  }else{
    sfx('lose'); store('balance',S.balance);
  }
  metaTick(res,payout);

  var doBonus=res.scatter>=3&&S.def.bonus&&S.def.bonus.round!=='none'&&S.def.bonus.autoTrigger!==false;
  var after=doBonus?wait(S.turbo?300:900).then(function(){ sfx('scatter'); return runBonus(S.def.bonus.round); }):Promise.resolve();
  after.then(function(){
    S.spinning=false; $('#cabSpin').classList.remove('busy');
  });
}

function floatText(html,kind){
  var f=$('#cabFloat'); var n=el('div','float-msg '+(kind||''),html);
  f.appendChild(n);
  setTimeout(function(){ n.classList.add('go'); },20);
  setTimeout(function(){ n.remove(); },1900);
}

function bigWinOverlay(tier,payout){
  var ov=$('#cabOverlay');
  ov.hidden=false; ov.className='cab-overlay bigwin';
  ov.innerHTML='<div class="bw-wrap"><div class="bw-word '+tier+'">'+
    (tier==='huge'?'HUGE WIN':'BIG WIN')+'</div><div class="bw-amt" id="bwAmt">0</div></div>';
  var t0=performance.now(), dur=S.turbo?700:1600;
  function tick(t){
    var k=Math.min(1,(t-t0)/dur);
    var eased=1-Math.pow(1-k,3);
    var n=ov.querySelector('#bwAmt'); if(n) n.textContent='+'+fmt(payout*eased)+' MORBIUS';
    if(k<1&&!ov.hidden) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  setTimeout(function(){ ov.hidden=true; ov.className='cab-overlay'; ov.innerHTML=''; }, S.turbo?1200:2600);
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

function runBonus(kind){
  if(kind==='freespins') return bonusFreeSpins();
  if(kind==='wheel')     return bonusWheel();
  if(kind==='pick')      return bonusPick();
  return Promise.resolve();
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
      setTimeout(one, S.turbo?260:700);
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
  var t0=performance.now(), dur=S.turbo?1400:3400;
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
        if(picksLeft===0){
          setTimeout(function(){
            grid.querySelectorAll('.pk-chip').forEach(function(x,j){
              if(!x.classList.contains('open')){ x.classList.add('open','dim'); x.innerHTML=values[j]+'&times;'; }
            });
            S.balance+=total; store('balance',S.balance); updateHud();
            playWinTier(total>=S.bet*8?'huge':'big');
            setTimeout(function(){ closeOverlay(); done(); },2200);
          },500);
        }
      });
      grid.appendChild(b);
    });
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
