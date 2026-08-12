/* ─────────────────────────────────────────────────────────────────────────
   cabinet-fx.js — the bonus intro sequence.

   A bonus used to just appear: 900ms after the reels stopped, a panel faded
   in. Winning a bonus is the biggest thing that happens on a slot and it
   deserves to land like one, so this plays a short cutscene OVER THE REEL
   CONTAINER first — the board irises down, a kicker types in, the title slams
   in letter by letter with a shockwave and a particle burst on each hit, the
   board kicks, then the whole thing blooms out into the round.

   Everything is spec-driven so each machine gets its own show. A theme
   supplies its words, its display font, its palette and its particle
   character; the staging and timing are shared so all three feel like the
   same floor.

       CabinetFX.playIntro(boardEl, spec, opts) -> Promise

   spec  { kicker, title, subtitle, font, colors:[a,b], particles, glyphs,
           iris, ring }
   opts  { turbo, reduced, onBeat(name, i) }   // onBeat drives the audio

   Particle modes:
     glyph  falling code characters that get sucked toward each impact
     hex    tumbling hexagons and coins thrown outward
     shard  angular shards plus a slow rise of bubbles
   ───────────────────────────────────────────────────────────────────────── */
(function(){
'use strict';

/* Beat sheet, in ms. Turbo runs the same shape at ~45%, so the sequence still
   reads as a sequence rather than becoming a flash. */
var FULL={ iris:340, kicker:520, slamFrom:900, slamGap:150, hold:520, bloom:520 };
var TURBO={ iris:150, kicker:200, slamFrom:340, slamGap:70, hold:200, bloom:240 };

function el(tag, cls, html){
  var e=document.createElement(tag);
  if(cls) e.className=cls;
  if(html!=null) e.innerHTML=html;
  return e;
}
function rnd(a,b){ return a+Math.random()*(b-a); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

/* ── particle field ─────────────────────────────────────────────────────
   One canvas sized to the board. Ambient spawn keeps the field alive; each
   letter impact throws a burst. Kept deliberately cheap — a few hundred
   simple sprites, no physics beyond gravity and drag. */
function Field(canvas, spec){
  this.cv=canvas; this.ctx=canvas.getContext('2d');
  this.spec=spec; this.parts=[]; this.rings=[]; this.raf=null;
  this.mode=spec.particles||'shard';
  this.glyphs=(spec.glyphs||'01').split('');
  this.colors=spec.colors||['#fff','#888'];
  this.attract=null;
}
Field.prototype.size=function(){
  var r=this.cv.getBoundingClientRect();
  var dpr=Math.min(2, window.devicePixelRatio||1);
  this.w=r.width; this.h=r.height;
  this.cv.width=Math.max(1,Math.round(r.width*dpr));
  this.cv.height=Math.max(1,Math.round(r.height*dpr));
  this.ctx.setTransform(dpr,0,0,dpr,0,0);
};
Field.prototype.spawnAmbient=function(n){
  for(var i=0;i<n;i++){
    if(this.mode==='glyph'){
      this.parts.push({ kind:'glyph', x:rnd(0,this.w), y:rnd(-this.h,0),
        vx:0, vy:rnd(90,320), life:1, decay:0, size:rnd(11,20),
        char:pick(this.glyphs), color:Math.random()<0.12?'#dfffe8':this.colors[0], rot:0, vr:0 });
    }else if(this.mode==='hex'){
      this.parts.push({ kind:'hex', x:rnd(0,this.w), y:rnd(this.h,this.h*1.6),
        vx:rnd(-14,14), vy:rnd(-90,-30), life:1, decay:0, size:rnd(5,13),
        color:pick(this.colors), rot:rnd(0,6.28), vr:rnd(-1.4,1.4) });
    }else{
      this.parts.push({ kind:'bubble', x:rnd(0,this.w), y:rnd(this.h,this.h*1.5),
        vx:rnd(-10,10), vy:rnd(-70,-24), life:1, decay:0, size:rnd(2,6),
        color:this.colors[0], rot:0, vr:0 });
    }
  }
};
Field.prototype.burst=function(x,y,n){
  for(var i=0;i<n;i++){
    var a=rnd(0,Math.PI*2), sp=rnd(70,460);
    var base={ x:x, y:y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-rnd(0,120),
      life:1, decay:rnd(0.5,1.3), rot:rnd(0,6.28), vr:rnd(-9,9),
      color:pick(this.colors) };
    if(this.mode==='glyph'){ base.kind='glyph'; base.size=rnd(10,22); base.char=pick(this.glyphs); }
    else if(this.mode==='hex'){ base.kind='hex'; base.size=rnd(4,14); }
    else { base.kind='shard'; base.size=rnd(3,14); }
    this.parts.push(base);
  }
  this.rings.push({ x:x, y:y, r:6, life:1, color:this.colors[0] });
  if(this.spec.ring!==false) this.rings.push({ x:x, y:y, r:2, life:1, color:this.colors[1]||this.colors[0] });
};
Field.prototype.step=function(dt){
  var p, i, drag=Math.pow(0.12, dt);
  for(i=this.parts.length-1;i>=0;i--){
    p=this.parts[i];
    if(p.decay){                       // burst debris: drag + gravity + fade
      p.vx*=drag; p.vy=p.vy*drag+620*dt;
      p.life-=p.decay*dt;
      if(p.life<=0){ this.parts.splice(i,1); continue; }
    }else if(this.attract&&this.mode==='glyph'){
      // ambient code rain leans toward the newest impact
      var dx=this.attract.x-p.x, dy=this.attract.y-p.y;
      var d=Math.max(40,Math.sqrt(dx*dx+dy*dy));
      p.vx+=(dx/d)*420*dt; p.vy+=(dy/d)*420*dt;
    }
    p.x+=p.vx*dt; p.y+=p.vy*dt; p.rot+=p.vr*dt;
    if(!p.decay){                      // ambient wraps rather than dying
      if(this.mode==='glyph'&&p.y>this.h+20){ p.y=-20; p.x=rnd(0,this.w); }
      if(this.mode!=='glyph'&&p.y<-20){ p.y=this.h+20; p.x=rnd(0,this.w); }
    }
  }
  for(i=this.rings.length-1;i>=0;i--){
    var R=this.rings[i];
    R.r+=760*dt; R.life-=2.1*dt;
    if(R.life<=0) this.rings.splice(i,1);
  }
};
Field.prototype.draw=function(){
  var c=this.ctx;
  c.clearRect(0,0,this.w,this.h);
  var i,p;
  for(i=0;i<this.rings.length;i++){
    var R=this.rings[i];
    c.globalAlpha=Math.max(0,R.life)*0.55;
    c.strokeStyle=R.color; c.lineWidth=Math.max(1,4*R.life);
    c.beginPath(); c.arc(R.x,R.y,R.r,0,6.2832); c.stroke();
  }
  for(i=0;i<this.parts.length;i++){
    p=this.parts[i];
    c.globalAlpha=Math.max(0,Math.min(1,p.life));
    c.fillStyle=p.color;
    if(p.kind==='glyph'){
      c.font='700 '+p.size+'px ui-monospace,monospace';
      c.fillText(p.char,p.x,p.y);
    }else if(p.kind==='hex'){
      c.save(); c.translate(p.x,p.y); c.rotate(p.rot);
      c.beginPath();
      for(var k=0;k<6;k++){
        var a=k*Math.PI/3-Math.PI/2;
        c[k?'lineTo':'moveTo'](Math.cos(a)*p.size,Math.sin(a)*p.size);
      }
      c.closePath(); c.fill(); c.restore();
    }else if(p.kind==='bubble'){
      c.beginPath(); c.arc(p.x,p.y,p.size,0,6.2832);
      c.globalAlpha*=0.4; c.fill();
    }else{
      c.save(); c.translate(p.x,p.y); c.rotate(p.rot);
      c.beginPath(); c.moveTo(0,-p.size); c.lineTo(p.size*0.42,p.size);
      c.lineTo(-p.size*0.42,p.size); c.closePath(); c.fill(); c.restore();
    }
  }
  c.globalAlpha=1;
};
Field.prototype.start=function(){
  var self=this, last=null;
  function frame(t){
    if(last===null) last=t;
    var dt=Math.min(0.05,(t-last)/1000); last=t;
    self.step(dt); self.draw();
    self.raf=requestAnimationFrame(frame);
  }
  this.raf=requestAnimationFrame(frame);
};
Field.prototype.stop=function(){ if(this.raf) cancelAnimationFrame(this.raf); this.raf=null; };

/* Shrink the title until it fits the board. Transforms do not affect layout,
   so the letters' entry scale does not skew the measurement. */
function fitTitle(titleEl, board){
  var avail=board.clientWidth-30;
  if(!(avail>0)) return;
  // scrollWidth is useless here: the title is overflow:visible, so the browser
  // reports the constrained flex width and the overrun never shows up. Sum the
  // letters instead. They carry no transform yet, so the boxes are truthful.
  var w=0, kids=titleEl.children;
  for(var i=0;i<kids.length;i++) w+=kids[i].getBoundingClientRect().width;
  if(!(w>avail)) return;
  var fs=parseFloat(getComputedStyle(titleEl).fontSize)||48;
  titleEl.style.fontSize=Math.max(20, Math.floor(fs*avail/w))+'px';
}

/* ── the sequence ───────────────────────────────────────────────────────── */
function playIntro(board, spec, opts){
  opts=opts||{};
  var beat=opts.onBeat||function(){};
  var T=opts.turbo?TURBO:FULL;
  spec=spec||{};
  var title=(spec.title||'BONUS').toUpperCase();
  var colors=spec.colors||['#fff','#aaa'];

  // Reduced motion still gets the announcement, just held still and short.
  if(opts.reduced){
    var flat=el('div','cab-intro shown');
    flat.innerHTML='<div class="ci-stack"><div class="ci-kicker">'+(spec.kicker||'')+'</div>'+
      '<div class="ci-title">'+title+'</div><div class="ci-sub">'+(spec.subtitle||'')+'</div></div>';
    flat.style.setProperty('--ci-a',colors[0]);
    flat.style.setProperty('--ci-b',colors[1]||colors[0]);
    if(spec.font) flat.style.setProperty('--ci-font',spec.font);
    board.appendChild(flat);
    beat('open');
    return new Promise(function(done){
      setTimeout(function(){ flat.remove(); done(); }, 1400);
    });
  }

  var root=el('div','cab-intro');
  root.style.setProperty('--ci-a',colors[0]);
  root.style.setProperty('--ci-b',colors[1]||colors[0]);
  if(spec.font) root.style.setProperty('--ci-font',spec.font);
  if(spec.iris) root.classList.add('ci-iris-'+spec.iris);

  var canvas=el('canvas','ci-canvas');
  var stack=el('div','ci-stack');
  var kick=el('div','ci-kicker', spec.kicker||'');
  var titleEl=el('div','ci-title');
  var sub=el('div','ci-sub', spec.subtitle||'');
  // One span per letter so each can be slammed in independently.
  var letters=[];
  for(var i=0;i<title.length;i++){
    var ch=title.charAt(i);
    if(ch===' '){ titleEl.appendChild(el('span','ci-space','&nbsp;')); continue; }
    var s=el('span','ci-ch', ch);
    titleEl.appendChild(s); letters.push(s);
  }
  stack.appendChild(kick); stack.appendChild(titleEl); stack.appendChild(sub);
  root.appendChild(canvas); root.appendChild(stack);
  board.appendChild(root);

  // The title is set in vw, which knows nothing about how wide the board is —
  // "THE CONTRACT" at 104px overran a 7-reel board and lost its last letter.
  // Measure what actually rendered and scale to fit the container it plays in.
  fitTitle(titleEl, board);

  var field=new Field(canvas, spec);
  field.size(); field.start();
  field.spawnAmbient(spec.particles==='glyph'?90:60);

  var timers=[], done=false, resolveFn=null;
  function at(ms, fn){ timers.push(setTimeout(fn, ms)); }
  function cleanup(){
    if(done) return; done=true;
    timers.forEach(clearTimeout);
    field.stop();
    root.remove();
    board.classList.remove('ci-kick');
    if(resolveFn) resolveFn();
  }

  // Let a returning player cut it short — but not so early that a stray click
  // from the spin press eats the whole sequence.
  at(600, function(){
    root.classList.add('ci-skippable');
    root.addEventListener('click', function(){ finish(); });
  });

  function finish(){
    if(done) return;
    root.classList.add('ci-bloom');
    timers.forEach(clearTimeout); timers=[];
    setTimeout(cleanup, 260);
  }

  // ── staging ──
  requestAnimationFrame(function(){ root.classList.add('ci-on'); });
  beat('open');

  at(T.iris, function(){ kick.classList.add('in'); beat('kicker'); });

  letters.forEach(function(sp, i){
    at(T.slamFrom + i*T.slamGap, function(){
      sp.classList.add('in');
      var r=sp.getBoundingClientRect(), b=canvas.getBoundingClientRect();
      var x=r.left-b.left+r.width/2, y=r.top-b.top+r.height/2;
      field.attract={x:x,y:y};
      field.burst(x, y, spec.particles==='glyph'?26:20);
      board.classList.remove('ci-kick'); void board.offsetWidth; board.classList.add('ci-kick');
      beat('slam', i);
    });
  });

  var afterSlam=T.slamFrom + letters.length*T.slamGap;
  at(afterSlam + 80, function(){
    sub.classList.add('in');
    root.classList.add('ci-flare');
    field.burst(field.w/2, field.h/2, 60);
    beat('flare');
  });
  at(afterSlam + T.hold, function(){ finish(); });

  return new Promise(function(res){
    resolveFn=res;
    if(done) res();
  });
}

window.CabinetFX={ playIntro: playIntro };
})();
