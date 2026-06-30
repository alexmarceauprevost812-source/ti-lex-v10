/* ============================================================
   TILEX INTRO — animation « DevilScene »
   Lettres de TI-LEX-AL V10 qui montent (rebond) + lueur de feu
   + braises flottantes + yeux ROUGES, par-dessus la plaque.
   Recréation native (rAF) du handoff Claude Design.

   • TilexIntro.play({onDone,hold,once})  → plein écran, joue 1 fois (connexion)
   • TilexIntro.mountLoop(container,{hold}) → intégré dans un élément, boucle ∞
   ============================================================ */
(function(){
  "use strict";
  var W=1536, H=1024;
  var ORDER=['T','I','d1','L','E','X','d2','A','L2','V','one','zero'];
  var BASE="/assets/intro/";

  function rnd(x){ var s=Math.sin(x*127.1+311.7)*43758.5453; return s-Math.floor(s); }
  function eob(p,s){ var q=p-1; return 1+(s+1)*q*q*q+s*q*q; }
  function eoc(p){ return 1-Math.pow(1-p,3); }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

  // Construit la scène + la boucle d'animation dans `mount`.
  // opts: {loop, hold, fullscreen, onDone}
  function run(mount, opts){
    opts=opts||{};
    var loop=!!opts.loop;
    var P={ stagger:0.11, riseDur:0.8, riseHeight:320, bounce:1.15, glow:1, embers:70 };
    P.hold=(opts.hold!=null)?opts.hold:(loop?3.2:1.2);
    P.revealEnd=0.75+11*P.stagger+P.riseDur;
    P.duration=P.revealEnd+P.hold+0.6;

    var stage=document.createElement('div');
    if(opts.fullscreen){
      stage.style.cssText='position:relative;width:min(100vw, calc(100vh * 1.5));aspect-ratio:1536/1024;';
    }else{
      stage.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
    }

    var inner=document.createElement('div');
    inner.style.cssText='position:absolute;inset:0;transform-origin:50% 48%;';

    var plate=document.createElement('img');
    plate.src=BASE+'plate.jpg'; plate.alt=''; plate.decoding='async';
    plate.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;';

    var heatEl=document.createElement('div');
    heatEl.style.cssText='position:absolute;left:8%;top:52%;width:84%;height:34%;filter:blur(8px);mix-blend-mode:screen;pointer-events:none;';

    var lwrap=document.createElement('div');
    lwrap.style.cssText='position:absolute;inset:0;';
    var imgs=ORDER.map(function(name){
      var im=document.createElement('img');
      im.src=BASE+'letters/'+name+'.png'; im.alt=''; im.decoding='async';
      im.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;transform-origin:50% 78%;will-change:transform,opacity;opacity:0;';
      lwrap.appendChild(im); return im;
    });

    function eye(cx,cy){
      var d=document.createElement('div');
      d.style.cssText='position:absolute;left:'+(cx/W*100)+'%;top:'+(cy/H*100)+'%;width:'+(156/W*100)+'%;height:'+(104/H*100)+'%;transform:translate(-50%,-50%);background:radial-gradient(ellipse at center, rgba(255,90,70,0.95) 0%, rgba(255,20,10,0.6) 40%, rgba(200,0,0,0) 72%);filter:blur(5px);mix-blend-mode:screen;pointer-events:none;opacity:0;';
      return d;
    }
    var eye1=eye(645,376), eye2=eye(800,362);

    var cv=document.createElement('canvas'); cv.width=W; cv.height=H;
    cv.style.cssText='position:absolute;inset:0;width:100%;height:100%;mix-blend-mode:screen;pointer-events:none;';
    var ctx=cv.getContext('2d');

    var vig=document.createElement('div');
    vig.style.cssText='position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 78% 74% at 50% 50%, rgba(0,0,0,0) 56%, rgba(0,0,0,0.66) 100%);';
    var fade=document.createElement('div');
    fade.style.cssText='position:absolute;inset:0;pointer-events:none;background:#000;opacity:0;';

    inner.appendChild(plate); inner.appendChild(heatEl); inner.appendChild(lwrap);
    inner.appendChild(eye1); inner.appendChild(eye2); inner.appendChild(cv);
    stage.appendChild(inner); stage.appendChild(vig); stage.appendChild(fade);
    mount.appendChild(stage);

    var stageH=stage.clientHeight||stage.getBoundingClientRect().height||600;
    function onResize(){ stageH=stage.clientHeight||stage.getBoundingClientRect().height||600; }
    window.addEventListener('resize',onResize);

    var t0=null, raf=null, stopped=false, EMB=P.embers|0;
    function stop(){ stopped=true; if(raf)cancelAnimationFrame(raf); window.removeEventListener('resize',onResize); }

    function frame(ts){
      if(stopped) return;
      if(t0===null) t0=ts;
      var t=(ts-t0)/1000;

      var plateOp=clamp(t/0.55,0,1);
      plate.style.opacity=plateOp;
      plate.style.filter='brightness('+(1+0.04*Math.sin(t*2.2)).toFixed(3)+')';

      var cam=1+0.045*(1-Math.pow(1-clamp(t/(P.duration-0.6),0,1),2));
      var settled=clamp((t-(P.revealEnd-0.4))/0.6,0,1);
      var breathe=1+0.006*Math.sin((t-P.revealEnd)*1.25)*settled;
      inner.style.transform='scale('+(cam*breathe).toFixed(4)+')';

      var STAG=P.stagger, DUR=P.riseDur, START=P.riseHeight, S=P.bounce, BASE_T=0.75;
      var scaleY=stageH/H, landPulse=0;
      for(var i=0;i<ORDER.length;i++){
        var st=BASE_T+i*STAG;
        var p=clamp((t-st)/DUR,0,1);
        var e=eob(p,S);
        var ty=(1-e)*START*scaleY;
        var op=clamp((t-st)/(DUR*0.32),0,1);
        var land=clamp((p-0.62)/0.38,0,1);
        landPulse+=Math.sin(land*Math.PI)*(p<1?1:0);
        var pop=1+0.05*Math.sin(land*Math.PI);
        var sy=1+0.10*(1-eoc(p))*(p>0?1:0);
        var im=imgs[i];
        im.style.transform='translateY('+ty.toFixed(2)+'px) scale('+pop.toFixed(3)+','+(pop*sy).toFixed(3)+')';
        im.style.opacity=op;
      }

      var G=P.glow;
      var glowPx=(8+6*Math.sin(t*2.4)+landPulse*10)*G;
      lwrap.style.filter='drop-shadow(0 0 '+glowPx.toFixed(1)+'px rgba(255,90,0,'+(0.55*G).toFixed(2)+')) drop-shadow(0 0 '+(glowPx*1.8).toFixed(1)+'px rgba(255,40,0,'+(0.30*G).toFixed(2)+'))';

      var heat=(0.18+0.05*Math.sin(t*2)+clamp(landPulse,0,2)*0.12)*G;
      heatEl.style.background='radial-gradient(ellipse at center, rgba(255,90,10,'+Math.min(0.6,heat).toFixed(3)+') 0%, rgba(255,40,0,0) 70%)';

      eye1.style.opacity=plateOp*Math.min(1,0.5+0.35*Math.abs(Math.sin(t*6+645))+0.15*rnd(Math.floor(t*11)+645));
      eye2.style.opacity=plateOp*Math.min(1,0.5+0.35*Math.abs(Math.sin(t*6+800))+0.15*rnd(Math.floor(t*11)+800));

      ctx.clearRect(0,0,W,H);
      for(var k=0;k<EMB;k++){
        var speed=30+rnd(k+0.2)*85, phase=rnd(k+0.7), span=H+60;
        var yRaw=(t*speed+phase*span)%span, y=H+20-yRaw;
        var x=rnd(k+0.33)*W+Math.sin(t*1.5+k*1.3)*24+(rnd(k+9)-0.5)*46*(1-yRaw/span);
        var r=0.7+rnd(k+0.44)*2.4;
        var fl=0.5+0.5*Math.sin(t*8+k*2.1);
        var a=(0.3+0.6*fl)*clamp(1-yRaw/span*0.55,0,1);
        var g=ctx.createRadialGradient(x,y,0,x,y,r*5);
        g.addColorStop(0,'rgba(255,228,150,'+a+')');
        g.addColorStop(0.4,'rgba(255,120,20,'+(a*0.8)+')');
        g.addColorStop(1,'rgba(255,40,0,0)');
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r*5,0,6.2832); ctx.fill();
      }

      fade.style.opacity = t>(P.revealEnd+P.hold) ? clamp((t-(P.revealEnd+P.hold))/0.55,0,1) : 0;

      if(t>=P.duration){
        if(loop){ t0=ts; raf=requestAnimationFrame(frame); return; }   // recommence ∞
        if(opts.onFinish) opts.onFinish();
        return;
      }
      raf=requestAnimationFrame(frame);
    }
    raf=requestAnimationFrame(frame);

    return { stage:stage, stop:stop, params:P, skipHost: opts.fullscreen?stage.parentNode:null };
  }

  var TilexIntro={
    _playing:false,

    // Plein écran, joue une fois (après la connexion) :
    // ti-démon BLEU qui s'embrase en ROUGE/FEU, par-dessus une pluie matrix bleu↔rouge,
    // avant d'arriver sur la plateforme.
    play:function(opts){
      opts=opts||{};
      if(this._playing) return;
      if(opts.once){ try{ if(sessionStorage.getItem('tilex-intro-'+opts.once)) return; sessionStorage.setItem('tilex-intro-'+opts.once,'1'); }catch(e){} }
      this._playing=true;
      var self=this, onDone=opts.onDone||function(){};
      var reduce=false; try{ reduce=matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
      var hold=(opts.hold!=null?opts.hold:3.8);

      if(!document.getElementById('tlx-intro-kf')){
        var st=document.createElement('style'); st.id='tlx-intro-kf';
        st.textContent=
          '@keyframes tlxIgnite{0%{clip-path:inset(0 100% 0 0)}12%{clip-path:inset(0 100% 0 0)}58%{clip-path:inset(0 0 0 0)}100%{clip-path:inset(0 0 0 0)}}'+
          '@keyframes tlxGlowB{0%{opacity:1}58%{opacity:.18}100%{opacity:.18}}'+
          '@keyframes tlxGlowO{0%{opacity:0}58%{opacity:.9}100%{opacity:.9}}'+
          '@keyframes tlxBreathe{0%{transform:scale(.95)}60%{transform:scale(1.025)}100%{transform:scale(1)}}'+
          '@keyframes tlxFront{0%{left:0;opacity:0}12%{opacity:0}20%{left:14%;opacity:1}58%{left:100%;opacity:1}66%{opacity:0}100%{left:100%;opacity:0}}'+
          '@keyframes tlxRise{0%{transform:translateY(46px);opacity:0}100%{transform:translateY(0);opacity:1}}';
        document.head.appendChild(st);
      }

      var ov=document.createElement('div'); ov.id='tilex-intro';
      ov.style.cssText='position:fixed;inset:0;z-index:2147483600;overflow:hidden;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 42%,#0b1024 0%,#05070f 60%,#120403 100%);';

      var cv=document.createElement('canvas'); cv.style.cssText='position:absolute;inset:0;width:100%;height:100%;opacity:.55;';
      ov.appendChild(cv);

      var box=document.createElement('div');
      box.style.cssText='position:relative;width:min(78vmin,560px);height:min(78vmin,560px);animation:tlxRise .7s cubic-bezier(.22,1,.36,1) both;';
      box.innerHTML=
        '<div style="position:absolute;inset:-8%;border-radius:50%;background:radial-gradient(circle,rgba(40,120,255,.5),transparent 60%);filter:blur(40px);animation:tlxGlowB '+hold+'s ease-in-out both;"></div>'+
        '<div style="position:absolute;inset:-8%;border-radius:50%;background:radial-gradient(circle,rgba(255,95,20,.5),transparent 60%);filter:blur(40px);animation:tlxGlowO '+hold+'s ease-in-out both;"></div>'+
        '<div style="position:absolute;inset:0;animation:tlxBreathe '+hold+'s ease-in-out both;">'+
          '<img src="/assets/tilex-demon-bleu.png" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 10px 34px rgba(0,0,0,.55));"/>'+
          '<img src="/assets/tilex-demon-feu.png" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;animation:tlxIgnite '+hold+'s ease-in-out both;filter:drop-shadow(0 10px 34px rgba(0,0,0,.55));"/>'+
          '<div style="position:absolute;top:0;bottom:0;width:16%;transform:translateX(-50%);pointer-events:none;mix-blend-mode:screen;filter:blur(7px);background:linear-gradient(90deg,transparent,rgba(255,150,40,.85) 44%,rgba(255,235,150,1) 50%,rgba(255,150,40,.85) 56%,transparent);animation:tlxFront '+hold+'s ease-in-out both;"></div>'+
        '</div>';
      ov.appendChild(box);

      var sub=document.createElement('div'); sub.textContent='Connexion à la plateforme…';
      sub.style.cssText='position:absolute;bottom:calc(64px + env(safe-area-inset-bottom,0px));left:0;right:0;text-align:center;color:#9fb4d8;font:600 13px/1 system-ui,sans-serif;letter-spacing:.22em;text-transform:uppercase;';
      ov.appendChild(sub);
      var skip=document.createElement('div'); skip.textContent='Toucher pour passer ›';
      skip.style.cssText='position:absolute;bottom:calc(24px + env(safe-area-inset-bottom,0px));left:0;right:0;text-align:center;color:rgba(255,255,255,.4);font:600 12px system-ui,sans-serif;letter-spacing:1px;pointer-events:none;';
      ov.appendChild(skip);

      document.body.appendChild(ov);
      var prevOverflow=document.body.style.overflow; document.body.style.overflow='hidden';

      // Pluie matrix : bleu à gauche, rouge à droite (comme le démon)
      var ctx=cv.getContext('2d'), raf=0, cols=[], cw=0, ch=0, dpr=Math.min(2,window.devicePixelRatio||1);
      var glyphs='01ｱｲｳｴｵｶｷｸｹABCDEFTILEXAL$₿'.split('');
      function resize(){ cw=cv.clientWidth; ch=cv.clientHeight; cv.width=cw*dpr; cv.height=ch*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); var n=Math.max(1,Math.floor(cw/16)); cols=[]; for(var i=0;i<n;i++) cols[i]=Math.random()*ch; }
      resize();
      function draw(){
        ctx.fillStyle='rgba(5,7,15,.18)'; ctx.fillRect(0,0,cw,ch);
        ctx.font='14px monospace';
        for(var i=0;i<cols.length;i++){ var x=i*16, y=cols[i];
          ctx.fillStyle = x < cw/2 ? 'rgba(60,140,255,.85)' : 'rgba(255,70,40,.85)';
          ctx.fillText(glyphs[(Math.random()*glyphs.length)|0], x, y);
          cols[i] = (y>ch+Math.random()*200) ? 0 : y+16;
        }
        raf=requestAnimationFrame(draw);
      }
      if(!reduce) draw();
      window.addEventListener('resize',resize);

      var done=false;
      function finish(){
        if(done) return; done=true;
        cancelAnimationFrame(raf); window.removeEventListener('resize',resize);
        document.body.style.overflow=prevOverflow;
        ov.style.transition='opacity .5s ease'; ov.style.opacity='0';
        setTimeout(function(){ if(ov.parentNode)ov.parentNode.removeChild(ov); self._playing=false; try{onDone();}catch(e){} },520);
      }
      ov.addEventListener('click',finish);
      setTimeout(finish,(reduce?1.2:hold+0.7)*1000);
    },

    // Intégré dans un conteneur, boucle à l'infini (utilisé en page d'accueil)
    mountLoop:function(container, opts){
      if(!container) return null;
      if(container._tilexLoop) return container._tilexLoop;     // déjà monté
      var cs=getComputedStyle(container);
      if(cs.position==='static') container.style.position='relative';
      var ctrl=run(container, {fullscreen:false, loop:true, hold:(opts&&opts.hold)});
      container._tilexLoop=ctrl;
      return ctrl;
    }
  };
  window.TilexIntro=TilexIntro;
})();
