// ============================================
// js/tilex-platform-theme.js — Pont thème panneau → plateforme
// Ti-lex-AL v10 — applique sur pro.html les couleurs choisies dans
// le panneau de contrôle web.html (accent/boutons, fond, texte).
// Canal inter-pages : localStorage 'tilex-platform-config' + event 'storage'
// + lecture Supabase (tilex_platform_config) pour le cross-appareil.
// ============================================
(function () {
  "use strict";
  var LS = 'tilex-platform-config';

  function hx(h){h=String(h||'').replace('#','');if(h.length===3)h=h.split('').map(function(c){return c+c;}).join('');return{r:parseInt(h.slice(0,2),16)||0,g:parseInt(h.slice(2,4),16)||0,b:parseInt(h.slice(4,6),16)||0};}
  function toHex(r,g,b){var c=function(v){return ('0'+Math.max(0,Math.min(255,Math.round(v))).toString(16)).slice(-2);};return '#'+c(r)+c(g)+c(b);}
  function shade(hex,p){var o=hx(hex),f=p<0?0:255,t=Math.abs(p);return toHex(o.r+(f-o.r)*t,o.g+(f-o.g)*t,o.b+(f-o.b)*t);}

  function apply(cfg){
    if(!cfg||typeof cfg!=='object')return;
    var root=document.documentElement.style;
    if(cfg.accent){
      var a=cfg.accent,a2=shade(a,0.18),g=hx(a);
      root.setProperty('--orange',a); root.setProperty('--orange2',a2);
      root.setProperty('--or',a); root.setProperty('--or2',a2); root.setProperty('--or3',shade(a,-0.25));
      root.setProperty('--accent',a); root.setProperty('--orange-rgb',g.r+','+g.g+','+g.b);
    }
    if(cfg.bg){
      root.setProperty('--bg',cfg.bg); root.setProperty('--bg2',shade(cfg.bg,0.06));
      root.setProperty('--bg3',shade(cfg.bg,0.12)); root.setProperty('--bg4',shade(cfg.bg,0.18));
    }
    if(cfg.txt){ root.setProperty('--txt',cfg.txt); }
  }

  function loadLocal(){ try{var c=JSON.parse(localStorage.getItem(LS)||'null'); if(c)apply(c);}catch(e){} }

  function boot(){ loadLocal(); }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot); else boot();

  // live : panneau modifié dans un AUTRE onglet (web.html) → storage event
  window.addEventListener('storage',function(e){ if(e.key===LS){ try{apply(JSON.parse(e.newValue||'{}'));}catch(_){ } } });
  // live : même page
  window.addEventListener('tilex:theme',function(e){ apply(e.detail||{}); });

  // cross-appareil : relit la config depuis Supabase si dispo
  function fromSupabase(){
    try{
      if(!window.supabase||!window.supabase.from)return;
      window.supabase.auth.getUser().then(function(r){
        var uid=r&&r.data&&r.data.user&&r.data.user.id; if(!uid)return;
        window.supabase.from('tilex_platform_config').select('config').eq('user_id',uid).maybeSingle().then(function(res){
          if(res&&res.data&&res.data.config){ apply(res.data.config); try{localStorage.setItem(LS,JSON.stringify(res.data.config));}catch(e){} }
        });
      });
    }catch(e){}
  }
  setTimeout(fromSupabase,1500);

  window.TilexPlatformTheme={ apply:apply, reload:loadLocal };
})();
