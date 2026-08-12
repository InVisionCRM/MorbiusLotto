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
     superstake  COMPOUND       a real decision every rung: bank what you have
                                or compound it and risk the lot. The whole
                                staking pitch, as a bonus game.
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
   Free spins with a ledger. Every spin that pays puts a mark against a name
   on the list; marks are permanent and each one steps the multiplier, so the
   round builds instead of being twelve independent spins. Clearing the whole
   list pays the contract bonus on top. */
function contractRound(api){
  var NAMES=['THE BOWERY KING','THE ADJUDICATOR','SANTINO D\'ANTONIO','MS. PERKINS',
             'CASSIAN','ZERO','THE ELDER','WINSTON'];
  // The first mark has to visibly move the multiplier or the mechanic reads as
  // doing nothing, so the ladder starts at x2 rather than x1.
  var LADDER=[2,3,5,8,13,20];
  var N=(api.def.bonus&&api.def.bonus.freeSpins)||12;
  var list=NAMES.slice(0,6);
  var marked=[], total=0, spin=0, mult=1;

  api.overlay('THE CONTRACT',
    '<div class="ct-head"><span class="ct-k">SPINS</span><span class="ct-v" id="ctN">0 / '+N+'</span>'+
      '<span class="ct-k">MULT</span><span class="ct-v hot" id="ctM">&times;1</span></div>'+
    '<div class="ct-list" id="ctList">'+list.map(function(n,i){
      return '<div class="ct-row" data-i="'+i+'"><span class="ct-dot"></span>'+
             '<span class="ct-name">'+api.esc(n)+'</span><span class="ct-fee" id="ctFee'+i+'">&mdash;</span></div>';
    }).join('')+'</div>'+
    '<div class="ct-total">MARKERS PAID <span id="ctTotal">0</span></div>');

  return new Promise(function(done){
    function step(){
      if(spin>=N||marked.length>=list.length){
        // clearing the board is the contract bonus
        var clean=marked.length>=list.length;
        if(clean) total+=api.bet*25;
        api.credit(total);
        var body=api.body();
        if(!body) return done();
        body.innerHTML='<div class="ct-done">'+(clean?'CONTRACT FULFILLED':'CONTRACT CLOSED')+
          '<br/><b>+'+api.fmt(total)+' MORBIUS</b>'+
          (clean?'<div class="ct-clean">FULL LIST &middot; &times;25 BET BONUS</div>':'')+'</div>';
        api.win(total>api.bet*8?'huge':total>0?'big':'small');
        setTimeout(function(){ api.close(); done(); }, 2000);
        return;
      }
      spin++;
      var hit=api.rng()<0.44;            // a paying spin marks the next name
      var nEl=api.q('#ctN'); if(!nEl) return done();
      nEl.textContent=spin+' / '+N;
      if(hit){
        var idx=marked.length;
        marked.push(idx);
        mult=LADDER[Math.min(LADDER.length-1, marked.length-1)];
        // base is deliberately small — the ladder is what makes the round grow
        var pay=Math.round(api.bet*(0.15+api.rng()*0.45)*mult);
        total+=pay;
        var row=api.q('.ct-row[data-i="'+idx+'"]');
        if(row){ row.classList.add('marked'); }
        var fee=api.q('#ctFee'+idx); if(fee) fee.textContent='+'+api.fmt(pay);
        var m=api.q('#ctM'); if(m) m.textContent='×'+mult;
        var t=api.q('#ctTotal'); if(t) t.textContent=api.fmt(total);
        api.sfx('mark');
      }else{
        api.sfx('miss');
      }
      setTimeout(step, hit?680:380);
    }
    step();
  });
}

/* ── SUPERSTAKE · COMPOUND ───────────────────────────────────────────────
   The only round here with a real decision in it. Your stake compounds every
   rung; every rung you either bank it or push. The bust chance climbs with
   the rung, so the interesting choice arrives exactly when the number starts
   to matter. Idle players are banked automatically rather than left hanging. */
function compoundRound(api){
  var RUNGS=[
    { mult:1.6,  risk:0.10 }, { mult:2.6,  risk:0.16 }, { mult:4.2,  risk:0.22 },
    { mult:7.0,  risk:0.28 }, { mult:12.0, risk:0.34 }, { mult:22.0, risk:0.42 },
    { mult:40.0, risk:0.50 }
  ];
  var rung=0, alive=true;

  api.overlay('COMPOUND',
    '<div class="cp-read">STAKE <b id="cpVal">'+api.fmt(api.bet)+'</b> MORBIUS</div>'+
    '<div class="cp-ladder" id="cpLadder">'+RUNGS.map(function(r,i){
      return '<div class="cp-rung" data-i="'+i+'"><span class="cp-x">&times;'+r.mult.toFixed(1)+'</span>'+
             '<span class="cp-bar"><i style="width:'+Math.round(r.risk*100)+'%"></i></span>'+
             '<span class="cp-risk">'+Math.round(r.risk*100)+'% BURN</span></div>';
    }).join('')+'</div>'+
    '<div class="cp-actions"><button class="cp-btn bank" id="cpBank">BANK</button>'+
      '<button class="cp-btn go" id="cpGo">COMPOUND</button></div>'+
    '<div class="cp-note" id="cpNote">Compound to climb. Burn and you lose the lot.</div>');

  return new Promise(function(done){
    var idle=null, finished=false;
    function value(){ return rung===0?api.bet:Math.round(api.bet*RUNGS[rung-1].mult); }
    function paint(){
      var v=api.q('#cpVal'); if(v) v.textContent=api.fmt(value());
      api.qa('.cp-rung').forEach(function(el,i){
        el.classList.toggle('done', i<rung);
        el.classList.toggle('next', i===rung&&alive);
      });
    }
    function armIdle(){
      clearTimeout(idle);
      // never leave the round waiting on a player who has walked away
      idle=setTimeout(function(){ bank(true); }, 15000);
    }
    function finish(html, tier, amount){
      if(finished) return; finished=true;
      clearTimeout(idle);
      api.credit(amount);
      var body=api.body(); if(!body) return done();
      body.innerHTML=html;
      api.win(tier);
      setTimeout(function(){ api.close(); done(); }, 2200);
    }
    function bank(auto){
      if(finished||!alive) return;
      var v=value();
      finish('<div class="cp-done">BANKED'+(auto?' <span class="cp-auto">(auto)</span>':'')+
        '<br/><b>+'+api.fmt(v)+' MORBIUS</b></div>',
        v>=api.bet*8?'huge':'big', v);
    }
    function go(){
      if(finished||!alive) return;
      clearTimeout(idle);
      var r=RUNGS[rung];
      api.sfx('compound');
      if(api.rng()<r.risk){
        alive=false;
        var el=api.q('.cp-rung[data-i="'+rung+'"]'); if(el) el.classList.add('burnt');
        api.sfx('burn');
        finish('<div class="cp-done burnt">BURNT<br/><b>+0 MORBIUS</b>'+
          '<div class="cp-lost">the stake went up at &times;'+r.mult.toFixed(1)+'</div></div>','small',0);
        return;
      }
      rung++; paint();
      if(rung>=RUNGS.length){
        var v=value();
        finish('<div class="cp-done">LADDER TOPPED<br/><b>+'+api.fmt(v)+' MORBIUS</b></div>','huge',v);
        return;
      }
      var note=api.q('#cpNote');
      if(note) note.textContent='Next rung burns '+Math.round(RUNGS[rung].risk*100)+'% of the time.';
      armIdle();
    }
    var b=api.q('#cpBank'), g=api.q('#cpGo');
    if(b) b.addEventListener('click',function(){ bank(false); });
    if(g) g.addEventListener('click', go);
    paint(); armIdle();
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
      api.qa('.vb-door').forEach(function(btn){
        btn.addEventListener('click',function(){
          if(finished||btn.classList.contains('open')) return;
          clearTimeout(idle);
          var d=DOORS[depth];
          // the deepest door is the only one that can break the rail
          var jackpot=null;
          if(depth===DOORS.length-1&&api.meta&&api.meta.kind==='tiered'&&api.rng()<0.14){
            jackpot=api.rng()<0.78?'mini':'minor';
          }
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
            var amt2=x*api.bet;
            total+=amt2;
            btn.innerHTML='<span class="vb-x">&times;'+x+'</span>';
            api.sfx('breach');
          }
          var t=api.q('#vbTotal'); if(t) t.textContent=api.fmt(total);
          setTimeout(function(){
            depth++;
            if(depth>=DOORS.length){ finish(); return; }
            render(); wire();
          }, 1000);
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
      subtitle:'BANK IT OR PUSH IT · YOUR CALL EVERY RUNG',
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
