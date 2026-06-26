// al-memory.js — Mémoire persistante pour Agent AL
// Dépend de window.supabase (client Supabase déjà initialisé dans pro.html)

(function(){
  "use strict";

  var SESSION_KEY="al_session_id";

  function getSessionId(){
    var sid=sessionStorage.getItem(SESSION_KEY);
    if(!sid){
      sid=crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY,sid);
    }
    return sid;
  }

  async function getUserId(){
    var sb=window.supabase;if(!sb)return null;
    try{
      var res=await sb.auth.getUser();
      return(res.data&&res.data.user)?res.data.user.id:null;
    }catch(e){return null;}
  }

  // Sauvegarder un message (user ou assistant)
  async function saveMessage(role,content){
    var userId=await getUserId();
    if(!userId)return;
    var sb=window.supabase;if(!sb)return;
    var res=await sb.from("al_messages").insert({
      user_id:userId,
      session_id:getSessionId(),
      role:role,
      content:content
    });
    if(res.error)console.error("[AL memory] saveMessage:",res.error);
  }

  // Charger les N derniers messages (toutes sessions confondues)
  async function loadRecentHistory(limit){
    limit=limit||40;
    var userId=await getUserId();
    if(!userId)return[];
    var sb=window.supabase;if(!sb)return[];
    var res=await sb.from("al_messages")
      .select("role,content,created_at")
      .eq("user_id",userId)
      .order("created_at",{ascending:false})
      .limit(limit);
    if(res.error){console.error("[AL memory] loadRecentHistory:",res.error);return[];}
    return(res.data||[]).reverse();
  }

  // Dernier résumé hebdomadaire
  async function loadLatestSummary(){
    var userId=await getUserId();
    if(!userId)return null;
    var sb=window.supabase;if(!sb)return null;
    var res=await sb.from("al_memory_summary")
      .select("summary,period_start,period_end")
      .eq("user_id",userId)
      .order("created_at",{ascending:false})
      .limit(1)
      .maybeSingle();
    if(res.error){console.error("[AL memory] loadLatestSummary:",res.error);return null;}
    return res.data;
  }

  // Initialiser la mémoire AL au chargement du chat
  async function initAlMemory(){
    var summary=await loadLatestSummary();
    var history=await loadRecentHistory(40);
    return{summary:summary,history:history};
  }

  // Demander un résumé hebdomadaire via Edge Function
  async function requestWeeklySummary(){
    var sb=window.supabase;if(!sb)return null;
    try{
      var sess=await sb.auth.getSession();
      if(!sess.data||!sess.data.session)return null;
      var tk=sess.data.session.access_token;
      var res=await fetch(
        (window.SB_URL||"https://rnuripmfozlxenryxhdc.supabase.co")+"/functions/v1/al-summarize",
        {method:"POST",headers:{"Authorization":"Bearer "+tk,"Content-Type":"application/json"}}
      );
      if(!res.ok)return null;
      var data=await res.json();
      return data.summary||null;
    }catch(e){console.error("[AL memory] requestWeeklySummary:",e);return null;}
  }

  window.AlMemory={
    getSessionId:getSessionId,
    getUserId:getUserId,
    saveMessage:saveMessage,
    loadRecentHistory:loadRecentHistory,
    loadLatestSummary:loadLatestSummary,
    initAlMemory:initAlMemory,
    requestWeeklySummary:requestWeeklySummary
  };
})();
