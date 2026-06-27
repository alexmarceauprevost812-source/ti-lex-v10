/* ============================================================
   TILEX INTRO — animation d'accueil « DevilScene »
   Les lettres de TI-LEX-AL V10 montent (rebond) avec lueur de
   feu + braises flottantes + yeux du logo, par-dessus la plaque.
   Recréation native (rAF) du handoff Claude Design.
   Usage : TilexIntro.play({ onDone, hold, once:'cle' });
   ============================================================ */
(function(){
  "use strict";
  var W=1536, H=1024;                                   // espace logique (positions)
  var ORDER=['T','I','d1','L','E','X','d2','A','L2','V','one','zero'];
  var BASE="/assets/intro/";

  function rnd(x){ var s=Math.sin(x*127.1+311.7)*43758.5453; return s-Math.floor(s); }
  function eob(p,s){ var q=p-1; return 1+(s+1)*q*q*q+s*q*q; }   // easeOutBack réglable
  function eoc(p){ return 1-Math.pow(1-p,3); }                  // easeOutCubic
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

  var TilexIntro={
    _playing:false,
    play:function(opts){
      opts=opts||{};
      if(this._playing) return;
      // jouer une seule fois par session si demandé
      if(opts.once){ try{ if(sessionStorage.getItem('tilex-intro-'+opts.once)) return; sessionStorage.setItem('tilex-intro-'+opts.once,'1'); }catch(e){} }
      this._playing=true;
      var self=this;
      var onDone=opts.onDone||function(){};

      var P={ stagger:0.11, riseDur:0.8, riseHeight:320, bounce:1.15, glow:1, embers:70 };
      P.hold = (opts.hold!=null)?opts.hold:1.2;                 // tenue (original 3.2s)
      P.revealEnd = 0.75 + 11*P.stagger + P.riseDur;
      P.duration = P.revealEnd + P.hold + 0.6;

      // ── overlay plein écran ──
      var ov=document.createElement('div');
      ov.id='tilex-intro';
      ov.style.cssText='position:fixed;inset:0;z-index:2147483600;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center;';
      var stage=document.createElement('div');
      stage.style.cssText='position:relative;width:min(100vw, calc(100vh * 1.5));aspect-ratio:1536/1024;';
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
        d.style.cssText='position:absolute;left:'+(cx/W*100)+'%;top:'+(cy/H*100)+'%;width:'+(156/W*100)+'%;height:'+(104/H*100)+'%;transform:translate(-50%,-50%);background:radial-gradient(ellipse at center, rgba(255,255,255,0.9) 0%, rgba(255,210,150,0.45) 38%, rgba(255,120,30,0) 72%);filter:blur(5px);mix-blend-mode:screen;pointer-events:none;opacity:0;';
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
      ov.appendChild(stage);

      var skip=document.createElement('div');
      skip.textContent='Toucher pour passer ›';
      skip.style.cssText='position:absolute;bottom:calc(20px + env(safe-area-inset-bottom,0px));left:0;right:0;text-align:center;color:rgba(255,255,255,.45);font:600 12px system-ui,sans-serif;letter-spacing:1px;pointer-events:none;';
      ov.appendChild(skip);

      document.body.appendChild(ov);
      var prevOverflow=document.body.style.overflow; document.body.style.overflow='hidden';

      var stageH=stage.clientHeight||(stage.getBoundingClientRect().height)||600;
      function onResize(){ stageH=stage.clientHeight||stage.getBoundingClientRect().height||600; }
      window.addEventListener('resize',onResize);

      var t0=null, raf=null, finished=false;
      function finish(){
        if(finished) return; finished=true;
        if(raf) cancelAnimationFrame(raf);
        window.removeEventListener('resize',onResize);
        document.body.style.overflow=prevOverflow;
        ov.style.transition='opacity .45s ease'; ov.style.opacity='0';
        setTimeout(function(){ if(ov.parentNode) ov.parentNode.removeChild(ov); self._playing=false; try{onDone();}catch(e){} },470);
      }
      ov.addEventListener('click',finish);

      var EMB=P.embers|0;
      function frame(ts){
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
        var scaleY=stageH/H;
        var landPulse=0;
        for(var i=0;i<ORDER.length;i++){
          var st=BASE_T+i*STAG;
          var p=clamp((t-st)/DUR,0,1);
          var e=eob(p,S);
          var ty=(1-e)*START*scaleY;                 // logique → px affichés
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
        skip.style.opacity = (t>0.5 && t<P.revealEnd) ? '1' : '0';

        if(t>=P.duration){ finish(); return; }
        raf=requestAnimationFrame(frame);
      }
      raf=requestAnimationFrame(frame);
      // filet de sécurité
      setTimeout(finish,(P.duration+1.5)*1000);
    }
  };
  window.TilexIntro=TilexIntro;
})();
