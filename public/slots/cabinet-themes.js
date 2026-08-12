/* ─────────────────────────────────────────────────────────────────────────
   cabinet-themes.js — what makes each machine its own game.

   The engine handles reels, maths and settlement identically for all three.
   Everything that should NOT be identical lives here, keyed by machine:

     intro    the bonus cutscene spec handed to CabinetFX
     sound    a voice pack — the mechanic cues, per machine
     labels   deck button wording
     bonus    a bespoke bonus round, replacing the generic freespins/wheel/pick

   The bonus rounds are the point. A generic "pick 3 of 12" says nothing about
   the token it is attached to, so each machine gets a round built out of what
   its project actually is:

     greenwick   THE CONTRACT   a hit list — marks are permanent, and each one
                                raises the multiplier for the rest of the round
     superstake  COMPOUND       a timing game: lock the orbiting spark inside
                                a SAFE arc that shrinks and speeds up every
                                rung. Your timing compounds the stake.
     morbius     VAULT BREACH   three doors, deeper is richer, and the last one
                                can hit a live tier off the jackpot rail

   A round is: fn(api) -> Promise, where api is supplied by the engine:
     api.bet, api.def, api.overlay(title, html), api.close(),
     api.credit(n), api.sfx(name), api.win(tier), api.rng(), api.meta,
     api.fmt(n), api.wait(ms), api.esc(s)
   ───────────────────────────────────────────────────────────────────────── */
(function(){
'use strict';

/* ── helpers ─────────────────────────────────────────────────────────────── */
function weighted(rng, table){            // table: [[weight, value], ...]
  var total=0,i;
  for(i=0;i<table.length;i++) total+=table[i][0];
  var roll=rng()*total;
  for(i=0;i<table.length;i++){ roll-=table[i][0]; if(roll<=0) return table[i][1]; }
  return table[table.length-1][1];
}

/* ── GREEN WICK · THE CONTRACT ───────────────────────────────────────────
   A shooting gallery, not a slideshow. Each round a target crosses the range
   carrying the next name on the list — CLICK THE TARGET to take the shot. A
   hit strikes the name, pays a fee and steps the multiplier; marks are
   permanent. If the player does not fire, an auto-shot goes off late in the
   crossing at house odds, so watching costs you edge but never hangs the
   round. Clearing the whole list pays the contract bonus. */
function contractRound(api){
  var NAMES=['THE BOWERY KING','THE ADJUDICATOR','SANTINO D\'ANTONIO','MS. PERKINS',
             'CASSIAN','ZERO','THE ELDER','WINSTON'];
  var LADDER=[2,3,5,8,13,20];
  var N=(api.def.bonus&&api.def.bonus.freeSpins)||12;
  var CROSS=1650, GAP=420;
  var list=NAMES.slice(0,6);
  var marked=0, total=0, pass=0, mult=1;

  api.overlay('THE CONTRACT',
    '<div class="ct-head"><span class="ct-k">TARGETS</span><span class="ct-v" id="ctN">0 / '+N+'</span>'+
      '<span class="ct-k">MULT</span><span class="ct-v hot" id="ctM">&times;1</span></div>'+
    '<div class="gw-range" id="gwRange"><div class="gw-scan"></div>'+
      '<div class="gw-target" id="gwT" hidden><span class="gw-sil"></span><span class="gw-tag" id="gwTag"></span></div>'+
      '<div class="gw-hint">FIRE ON THE TARGET</div></div>'+
    '<div class="ct-list" id="ctList">'+list.map(function(n,i){
      return '<div class="ct-row" data-i="'+i+'"><span class="ct-dot"></span>'+
             '<span class="ct-name">'+api.esc(n)+'</span><span class="ct-fee" id="ctFee'+i+'">&mdash;</span></div>';
    }).join('')+'</div>'+
    '<div class="ct-total">MARKERS PAID <span id="ctTotal">0</span></div>');

  return new Promise(function(done){
    var finished=false;
    function finish(){
      if(finished) return; finished=true;
      var clean=marked>=list.length;
      if(clean) total+=api.bet*25;
      api.credit(total);
      var body=api.body(); if(!body) return done();
      body.innerHTML='<div class="ct-done">'+(clean?'CONTRACT FULFILLED':'CONTRACT CLOSED')+
        '<br/><b>+'+api.fmt(total)+' MORBIUS</b>'+
        (clean?'<div class="ct-clean">FULL LIST &middot; &times;25 BET BONUS</div>':'')+'</div>';
      api.win(total>api.bet*8?'huge':total>0?'big':'small');
      setTimeout(function(){ api.close(); done(); }, 2000);
    }
    function mark(){
      var idx=marked; marked++;
      mult=LADDER[Math.min(LADDER.length-1, marked-1)];
      var pay=Math.round(api.bet*(0.15+api.rng()*0.45)*mult);
      total+=pay;
      var row=api.q('.ct-row[data-i="'+idx+'"]'); if(row) row.classList.add('marked');
      var fee=api.q('#ctFee'+idx); if(fee) fee.textContent='+'+api.fmt(pay);
      var m=api.q('#ctM'); if(m) m.textContent='×'+mult;
      var t=api.q('#ctTotal'); if(t) t.textContent=api.fmt(total);
      api.sfx('mark');
    }
    function crossing(){
      if(finished) return;
      if(pass>=N||marked>=list.length) return finish();
      pass++;
      var nEl=api.q('#ctN'); if(!nEl) return finish();
      nEl.textContent=pass+' / '+N;
      var range=api.q('#gwRange'), tgt=api.q('#gwT'), tag=api.q('#gwTag');
      if(!range||!tgt) return finish();
      tag.textContent=list[Math.min(marked, list.length-1)];
      var fired=false, ltr=pass%2===1;
      tgt.hidden=false;
      tgt.classList.remove('hit');
      tgt.style.transition='none';
      tgt.style.left=ltr?'-24%':'104%';
      void tgt.offsetWidth;
      tgt.style.transition='left '+CROSS+'ms linear';
      tgt.style.left=ltr?'104%':'-24%';
      function shot(hit){
        if(fired||finished) return; fired=true;
        api.sfx('fire');
        range.classList.remove('muzzle'); void range.offsetWidth; range.classList.add('muzzle');
        if(hit){ tgt.classList.add('hit'); mark(); }
        else api.sfx('miss');
        setTimeout(function(){ tgt.hidden=true; crossing(); }, hit?620:GAP);
      }
      // the player's shot: clicking the TARGET is a hit, the empty range a miss
      tgt.onclick=function(ev){ ev.stopPropagation(); shot(true); };
      range.onclick=function(){ shot(false); };
      // the house shot, late in the crossing, at house odds — the round never
      // waits on a player, it just shoots worse than one
      setTimeout(function(){ if(!fired) shot(api.rng()<0.44); }, CROSS*0.8);
    }
    crossing();
  });
}

/* ── SUPERSTAKE · STAKE LOCK ─────────────────────────────────────────────
   A timing game, not a menu. A spark orbits the stake ring and a SAFE arc
   sits somewhere on it; press LOCK while the spark is inside the arc and the
   stake compounds — the arc then shrinks, jumps to a new position and the
   spark runs faster. Miss and the stake burns. BANK is always available
   between attempts, and an idle player is banked automatically.

   The old round was press-COMPOUND-and-watch-a-needle: the same decision
   every rung, resolved by a hidden roll with an animation on top. This one
   is resolved by WHERE THE SPARK IS WHEN YOU PRESS — the player's timing is
   the game. That is honest for a play-money lab; a real-money port must draw
   the outcome server-side and demote the ring to presentation, so this round
   is exactly the thing the RTP simulation still needs to absorb.

   Reduced motion: no orbit to time, so LOCK resolves at the printed odds
   (arc/360) — the same expected game without the moving part. */
function compoundRound(api){
  var RUNGS=[
    { mult:1.6,  arc:120, speed:200 },
    { mult:2.6,  arc:100, speed:260 },
    { mult:4.2,  arc:82,  speed:320 },
    { mult:7.0,  arc:66,  speed:390 },
    { mult:12.0, arc:52,  speed:470 },
    { mult:22.0, arc:40,  speed:560 },
    { mult:40.0, arc:30,  speed:660 }
  ];
  var rung=0, alive=true;

  api.overlay('COMPOUND',
    '<div class="cp-read">STAKE <b id="cpVal">'+api.fmt(api.bet)+'</b> MORBIUS</div>'+
    '<div class="cpw-wrap"><canvas class="cpw-ring" id="cpwRing" width="240" height="240"></canvas>'+
      '<div class="cpw-mult" id="cpwMult">&times;1.6</div></div>'+
    '<div class="cpw-chips" id="cpwChips">'+RUNGS.map(function(r,i){
      return '<span class="cpw-chip" data-i="'+i+'">&times;'+r.mult.toFixed(1)+'</span>';
    }).join('')+'</div>'+
    '<div class="cp-actions"><button class="cp-btn bank" id="cpBank">BANK</button>'+
      '<button class="cp-btn go" id="cpGo">LOCK</button></div>'+
    '<div class="cp-note" id="cpNote">Lock inside the bright arc to compound. It shrinks every rung.</div>');

  return new Promise(function(done){
    var idle=null, finished=false, raf=null, resolving=false;
    var reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    var angle=0, arcStart=api.rng()*360, last=null, flash=0, burstAt=null;
    var cv=api.q('#cpwRing'), ctx=cv?cv.getContext('2d'):null;

    function value(){ return rung===0?api.bet:Math.round(api.bet*RUNGS[rung-1].mult); }
    function arcDeg(){ return RUNGS[Math.min(rung,RUNGS.length-1)].arc; }
    function inArc(a){
      var rel=((a-arcStart)%360+360)%360;
      return rel<=arcDeg();
    }
    function paint(){
      var v=api.q('#cpVal'); if(v) v.textContent=api.fmt(value());
      var m=api.q('#cpwMult');
      if(m) m.innerHTML=alive&&rung<RUNGS.length?('&times;'+RUNGS[rung].mult.toFixed(1)):'';
      api.qa('.cpw-chip').forEach(function(el,i){
        el.classList.toggle('done', i<rung);
        el.classList.toggle('next', i===rung&&alive);
      });
    }
    function armIdle(){
      clearTimeout(idle);
      idle=setTimeout(function(){ bank(true); }, 15000);
    }
    function finish(html, tier, amount){
      if(finished) return; finished=true;
      clearTimeout(idle); if(raf) cancelAnimationFrame(raf);
      api.credit(amount);
      var body=api.body(); if(!body) return done();
      body.innerHTML=html;
      api.win(tier);
      setTimeout(function(){ api.close(); done(); }, 2200);
    }
    function bank(auto){
      if(finished||!alive||resolving) return;
      var v=value();
      finish('<div class="cp-done">BANKED'+(auto?' <span class="cp-auto">(auto)</span>':'')+
        '<br/><b>+'+api.fmt(v)+' MORBIUS</b></div>',
        v>=api.bet*8?'huge':'big', v);
    }

    /* the ring: track, hex accents, SAFE arc, orbiting spark with a tail */
    function draw(){
      if(!ctx) return;
      var W=cv.width, H=cv.height, cx=W/2, cy=H/2, R=W/2-18;
      ctx.clearRect(0,0,W,H);
      // hexagon accent under the track — the brand shape
      ctx.beginPath();
      for(var k=0;k<6;k++){
        var ha=k*Math.PI/3-Math.PI/2;
        ctx[k?'lineTo':'moveTo'](cx+Math.cos(ha)*(R-14), cy+Math.sin(ha)*(R-14));
      }
      ctx.closePath();
      ctx.strokeStyle='rgba(255,122,0,.18)'; ctx.lineWidth=1.5; ctx.stroke();
      // track
      ctx.beginPath(); ctx.arc(cx,cy,R,0,6.2832);
      ctx.strokeStyle='rgba(255,255,255,.12)'; ctx.lineWidth=10; ctx.stroke();
      // SAFE arc, drawn at its true angular size
      var a0=(arcStart-90)*Math.PI/180, a1=(arcStart+arcDeg()-90)*Math.PI/180;
      var grad=ctx.createLinearGradient(cx-R,cy,cx+R,cy);
      grad.addColorStop(0,'#ff00c7'); grad.addColorStop(.55,'#ff7a00'); grad.addColorStop(1,'#ffd200');
      ctx.beginPath(); ctx.arc(cx,cy,R,a0,a1);
      ctx.strokeStyle=grad; ctx.lineWidth=flash>0?15:10; ctx.lineCap='round'; ctx.stroke();
      if(flash>0){ ctx.globalAlpha=Math.min(1,flash); ctx.stroke(); ctx.globalAlpha=1; flash-=0.06; }
      // spark trail then head
      var rad=(angle-90)*Math.PI/180;
      for(var t=6;t>=1;t--){
        var ta=(angle-t*4-90)*Math.PI/180;
        ctx.beginPath(); ctx.arc(cx+Math.cos(ta)*R, cy+Math.sin(ta)*R, 2.4+ (6-t)*0.5, 0, 6.2832);
        ctx.fillStyle='rgba(255,210,0,'+(0.10*(7-t))+')'; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(cx+Math.cos(rad)*R, cy+Math.sin(rad)*R, 6.5, 0, 6.2832);
      ctx.fillStyle=inArc(angle)?'#ffd200':'#fff';
      ctx.shadowColor=inArc(angle)?'#ff7a00':'#fff'; ctx.shadowBlur=14;
      ctx.fill(); ctx.shadowBlur=0;
      // burn burst frames
      if(burstAt!==null){
        for(var b=0;b<10;b++){
          var ba=burstAt.a+(b/10)*6.2832, br=burstAt.r;
          ctx.beginPath();
          ctx.arc(cx+Math.cos(ba)*(R+br), cy+Math.sin(ba)*(R+br), 2.5, 0, 6.2832);
          ctx.fillStyle='rgba(251,113,133,'+Math.max(0,1-br/34)+')'; ctx.fill();
        }
        burstAt.r+=2.2;
        if(burstAt.r>36) burstAt=null;
      }
    }
    function loop(ts){
      if(finished) return;
      if(last===null) last=ts;
      var dt=Math.min(0.05,(ts-last)/1000); last=ts;
      if(alive&&!resolving) angle=(angle+RUNGS[Math.min(rung,RUNGS.length-1)].speed*dt)%360;
      draw();
      // live state for the test harness — the game is the spark position, so
      // the harness needs to read it to time a deliberate hit or miss
      if(cv){ cv.dataset.angle=angle.toFixed(1); cv.dataset.a0=arcStart.toFixed(1);
              cv.dataset.arc=arcDeg(); cv.dataset.hot=inArc(angle)?'1':'0'; }
      raf=requestAnimationFrame(loop);
    }

    function lock(){
      if(finished||!alive||resolving) return;
      clearTimeout(idle);
      var hit=reduced ? (api.rng()<arcDeg()/360) : inArc(angle);
      resolving=true;
      api.sfx('compound');
      if(!hit){
        alive=false;
        burstAt={a:(angle-90)*Math.PI/180, r:2};
        api.sfx('burn');
        var missBy=RUNGS[rung].mult;
        setTimeout(function(){
          finish('<div class="cp-done burnt">BURNT<br/><b>+0 MORBIUS</b>'+
            '<div class="cp-lost">the lock missed at &times;'+missBy.toFixed(1)+'</div></div>','small',0);
        }, 900);
        return;
      }
      flash=1; rung++; api.sfx('safe'); paint();
      var chip=api.q('.cpw-chip[data-i="'+(rung-1)+'"]');
      if(chip){ chip.classList.remove('pop'); void chip.offsetWidth; chip.classList.add('pop'); }
      if(rung>=RUNGS.length){
        var v=value();
        finish('<div class="cp-done">LADDER TOPPED<br/><b>+'+api.fmt(v)+' MORBIUS</b></div>','huge',v);
        return;
      }
      // new rung: the arc jumps somewhere new so the press cannot be camped
      arcStart=api.rng()*360;
      var note=api.q('#cpNote');
      if(note) note.textContent='Rung '+(rung+1)+': the arc is '+arcDeg()+'\u00B0 wide and faster.';
      setTimeout(function(){ resolving=false; armIdle(); }, 380);
    }

    var b=api.q('#cpBank'), g=api.q('#cpGo');
    if(b) b.addEventListener('click',function(){ bank(false); });
    if(g) g.addEventListener('click', lock);
    if(cv) cv.addEventListener('click', lock);      // the ring itself is a target
    paint(); armIdle();
    raf=requestAnimationFrame(loop);
  });
}

/* ── MORBIUS · VAULT BREACH ──────────────────────────────────────────────
   Three doors, each deeper and richer than the last. The final door is the
   only place a live jackpot tier can come off the rail, which is what makes
   getting there worth it. */
function breachRound(api){
  var DOORS=[
    { name:'OUTER DOOR',  n:4, table:[[34,1],[26,2],[20,3],[12,5],[8,8]] },
    { name:'INNER DOOR',  n:4, table:[[30,3],[25,5],[20,8],[15,12],[10,20]] },
    { name:'THE VAULT',   n:4, table:[[28,8],[24,14],[20,22],[16,35],[12,60]] }
  ];
  var depth=0, total=0;

  function render(){
    var d=DOORS[depth];
    api.overlay('VAULT BREACH',
      '<div class="vb-depth">'+DOORS.map(function(x,i){
        return '<span class="vb-pip'+(i<depth?' done':i===depth?' now':'')+'"></span>';
      }).join('')+'<span class="vb-dname">'+d.name+'</span></div>'+
      '<div class="vb-grid" id="vbGrid">'+
        Array.apply(null,Array(d.n)).map(function(_,i){
          return '<button class="vb-door" data-i="'+i+'"><span class="vb-lock">&#9679;</span></button>';
        }).join('')+
      '</div>'+
      '<div class="vb-total">HAUL <span id="vbTotal">'+api.fmt(total)+'</span></div>'+
      (depth===DOORS.length-1?'<div class="vb-jp">the vault can pay a live jackpot tier</div>':''));
  }

  return new Promise(function(done){
    var finished=false, idle=null;
    function armIdle(){
      clearTimeout(idle);
      idle=setTimeout(function(){
        var left=api.qa('.vb-door:not(.open)');
        if(left.length) left[Math.floor(api.rng()*left.length)].click();
      }, 12000);
    }
    function finish(){
      if(finished) return; finished=true;
      clearTimeout(idle);
      api.credit(total);
      var body=api.body(); if(!body) return done();
      body.innerHTML='<div class="vb-done">VAULT EMPTIED<br/><b>+'+api.fmt(total)+' MORBIUS</b></div>';
      api.win(total>=api.bet*20?'huge':'big');
      setTimeout(function(){ api.close(); done(); }, 2200);
    }
    function wire(){
      armIdle();
      var busy=false;
      api.qa('.vb-door').forEach(function(btn){
        btn.addEventListener('click',function(){
          if(finished||busy||btn.classList.contains('open')) return;
          busy=true;
          clearTimeout(idle);
          var d=DOORS[depth];
          // the deepest door is the only one that can break the rail
          var jackpot=null;
          if(depth===DOORS.length-1&&api.meta&&api.meta.kind==='tiered'&&api.rng()<0.14){
            jackpot=api.rng()<0.78?'mini':'minor';
          }
          /* crack it like a vault: the dial spins over three clunks, the door
             swings, light spills, THEN the value stamps in */
          btn.classList.add('cracking');
          btn.innerHTML='<span class="vb-dial"></span>';
          [140,480,880].forEach(function(ms){ setTimeout(function(){ api.sfx('dial'); },ms); });
          setTimeout(function(){
            if(finished) return;
            btn.classList.remove('cracking');
            btn.classList.add('open');
            if(jackpot){
              var amt=api.meta[jackpot];
              total+=amt;
              api.meta[jackpot]=jackpot==='mini'?250:1250;
              btn.innerHTML='<span class="vb-jphit">'+jackpot.toUpperCase()+'</span>';
              btn.classList.add('jackpot');
              api.sfx('jackpot');
            }else{
              var x=weighted(api.rng, d.table);
              total+=x*api.bet;
              btn.innerHTML='<span class="vb-x">&times;'+x+'</span>';
              api.sfx('breach');
            }
            var t=api.q('#vbTotal'); if(t) t.textContent=api.fmt(total);
            setTimeout(function(){
              depth++;
              if(depth>=DOORS.length){ finish(); return; }
              /* descend: this depth zooms past the camera, the next one
                 rises to meet it */
              var body=api.body();
              if(body) body.classList.add('vb-zoom');
              setTimeout(function(){
                render();
                var b2=api.body();
                if(b2){ b2.classList.add('vb-enter');
                        setTimeout(function(){ b2.classList.remove('vb-enter'); },520); }
                wire();
              }, 460);
            }, 1150);
          }, 1150);
        });
      });
    }
    render(); wire();
  });
}

/* ── the three machines ──────────────────────────────────────────────────── */
window.CabinetThemes={

  greenwick:{
    labels:{ spin:'EXECUTE', auto:'CONTRACT', turbo:'RUSH' },
    shape:'square',
    intro:{
      kicker:'// CONTRACT ISSUED',
      title:'THE CONTRACT',
      subtitle:'THE LIST IS OPEN · MARKS ARE PERMANENT',
      font:"'Rajdhani',sans-serif",
      colors:['#00ff41','#ff3333'],
      particles:'glyph',
      glyphs:'アイウエオカキクケコ0123456789$WICK',
      iris:'bars'
    },
    /* dry, mechanical, close-miked — a pistol slide and a terminal, no music */
    sound:{
      spin:function(t,n){ n(.5,.05,180); t(48,'square',.5,.05,32); },
      land:function(t,n,i){ n(.045,.09,900+i*140); t(90+i*18,'square',.06,.06,60); },
      pop:  function(t,n){ n(.07,.14,2600); t(140,'square',.05,.07,70); },
      lock: function(t,n){ n(.05,.12,700); t(70,'square',.09,.08,44); },
      scatter:function(t,n){ t(880,'square',.07,.05); t(1320,'square',.07,.04,null,70); n(.1,.07,3000,60); },
      award:function(t,n){ [660,880,1320].forEach(function(f,i){ t(f,'square',.09,.05,null,i*80); }); },
      tick: function(t,n){ t(1400,'square',.02,.03); },
      mark: function(t,n){ n(.05,.16,1800); t(180,'square',.1,.07,60); t(1320,'square',.05,.04,null,60); },
      fire: function(t,n){ n(.05,.24,2200); t(120,'square',.08,.09,50); },
      miss: function(t,n){ t(150,'square',.08,.04,90); },
      // intro beats
      ciOpen:function(t,n){ n(.9,.09,140); t(41,'sawtooth',1.1,.09,28); },
      ciKicker:function(t,n){ t(1600,'square',.03,.04); },
      ciSlam:function(t,n,i){ n(.09,.22,300+i*90); t(60+i*10,'square',.14,.11,34); },
      ciFlare:function(t,n){ n(.5,.14,1600); [220,330,440,660].forEach(function(f,i){ t(f,'square',.24,.06,null,i*70); }); }
    },
    bonus:{ freespins: contractRound }
  },

  superstake:{
    labels:{ spin:'STAKE', auto:'AUTO-STAKE', turbo:'RUSH' },
    shape:'hex',
    intro:{
      kicker:'PROTOCOL ENGAGED',
      title:'COMPOUND',
      subtitle:'LOCK THE SPARK IN THE ARC · IT SHRINKS EVERY RUNG',
      font:"'Space Grotesk',sans-serif",
      colors:['#ff00c7','#ffd200'],
      particles:'hex',
      iris:'hex'
    },
    /* bright and synthetic — arps, rising intervals, coin chime */
    sound:{
      spin:function(t,n){ [330,440,550].forEach(function(f,i){ t(f,'triangle',.12,.05,null,i*45); }); n(.3,.05,1800); },
      land:function(t,n,i){ t(440+i*90,'triangle',.09,.07); t(880+i*120,'sine',.06,.04,null,30); },
      pop:  function(t,n){ t(1200,'triangle',.08,.08,2400); n(.06,.1,4200); },
      lock: function(t,n){ t(520,'sine',.12,.08); t(780,'sine',.1,.06,null,70); },
      scatter:function(t,n){ [523,659,784,1047].forEach(function(f,i){ t(f,'triangle',.14,.06,null,i*60); }); },
      award:function(t,n){ [784,988,1175,1568].forEach(function(f,i){ t(f,'sine',.12,.07,null,i*70); }); },
      tick: function(t,n){ t(1760,'sine',.025,.03); },
      compound:function(t,n){ [440,554,659,880].forEach(function(f,i){ t(f,'triangle',.1,.06,null,i*45); }); },
      safe: function(t,n){ t(659,'sine',.12,.07); t(988,'sine',.16,.07,null,90); },
      burn: function(t,n){ n(.5,.18,320); t(220,'sawtooth',.6,.1,42); },
      // intro beats
      ciOpen:function(t,n){ t(110,'sine',1.0,.08,55); n(.5,.05,900); },
      ciKicker:function(t,n){ t(1318,'sine',.06,.04); },
      ciSlam:function(t,n,i){ t(220+i*70,'triangle',.13,.09,null,0); n(.06,.12,1400+i*220); },
      ciFlare:function(t,n){ [523,659,784,1047,1319].forEach(function(f,i){ t(f,'triangle',.3,.07,null,i*60); }); n(.7,.06,3200); }
    },
    bonus:{ wheel: compoundRound }
  },

  morbius:{
    labels:{ spin:'SPIN', auto:'AUTO', turbo:'TURBO' },
    shape:'notch',
    intro:{
      kicker:'PRESSURE SEAL RELEASED',
      title:'VAULT BREACH',
      subtitle:'THREE DOORS · THE LAST ONE BREAKS THE RAIL',
      font:"'Chakra Petch',sans-serif",
      colors:['#22D3EE','#F59E0B'],
      particles:'shard',
      iris:'ring'
    },
    /* deep and wet — sonar, pressure booms, metal on metal */
    sound:{
      spin:function(t,n){ t(70,'sine',.9,.09,38); n(.55,.05,420); },
      land:function(t,n,i){ n(.06,.09,500+i*130); t(120+i*24,'sine',.1,.07,72); },
      pop:  function(t,n){ t(900,'sine',.1,.07,1900); n(.07,.1,2600); },
      lock: function(t,n){ n(.06,.14,380); t(90,'square',.12,.09,52); },
      scatter:function(t,n){ t(1200,'sine',.22,.06,600); t(600,'sine',.3,.05,null,110); },
      award:function(t,n){ t(880,'sine',.14,.07); t(1174,'sine',.14,.07,null,90); t(1760,'sine',.26,.06,null,180); },
      tick: function(t,n){ t(1100,'sine',.03,.028); },
      breach:function(t,n){ n(.1,.18,260); t(80,'sine',.24,.1,44); t(1400,'sine',.1,.04,null,60); },
      dial: function(t,n){ n(.04,.14,900); t(240,'square',.05,.06,140); },
      jackpot:function(t,n){ n(1.2,.12,140); [523,784,1047,1568,2093].forEach(function(f,i){ t(f,'sine',.3,.08,null,180+i*110); }); },
      // intro beats
      ciOpen:function(t,n){ n(1.1,.12,120); t(38,'sine',1.3,.11,24); },
      ciKicker:function(t,n){ t(1500,'sine',.09,.04,900); },
      ciSlam:function(t,n,i){ n(.11,.2,220+i*70); t(55+i*9,'sine',.2,.11,30); },
      ciFlare:function(t,n){ n(1.0,.1,900); [261,392,523,784,1047].forEach(function(f,i){ t(f,'sine',.36,.07,null,i*80); }); }
    },
    bonus:{ pick: breachRound }
  }
};
})();
