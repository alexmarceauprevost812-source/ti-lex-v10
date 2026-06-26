// ============================================
// MÉMOIRE IA — ti-lex-al & MARCEAU
// Système de mémoire persistante par utilisateur
// ============================================

(function(){
  "use strict";

  var MemoireIA = {

    _getSb: function(){
      return window.supabase;
    },

    _getUserId: async function(){
      var sb=this._getSb();
      if(!sb)return null;
      try{
        var sess=await sb.auth.getSession();
        if(sess.data&&sess.data.session)return sess.data.session.user.id;
      }catch(e){}
      return null;
    },

    // Lire toute la mémoire de l'utilisateur
    tout: async function(userId){
      var sb=this._getSb();if(!sb)return[];
      var uid=userId||await this._getUserId();if(!uid)return[];
      var res=await sb.from("memoire_ia").select("*").eq("user_id",uid)
        .order("derniere_utilisation",{ascending:false});
      if(res.error){console.error("Erreur lecture mémoire:",res.error);return[];}
      return res.data||[];
    },

    // Lire une catégorie spécifique
    parCategorie: async function(userId,categorie){
      var sb=this._getSb();if(!sb)return[];
      var res=await sb.from("memoire_ia").select("cle,valeur,contexte,confiance")
        .eq("user_id",userId).eq("categorie",categorie)
        .order("confiance",{ascending:false});
      return res.data||[];
    },

    // Mémoriser un fait
    memoriser: async function(userId,categorie,cle,valeur,contexte,source){
      var sb=this._getSb();if(!sb)return;
      contexte=contexte||"";
      source=source||"conversation";
      var res=await sb.from("memoire_ia").upsert({
        user_id:userId,
        categorie:categorie,
        cle:cle,
        valeur:String(valeur),
        contexte:contexte,
        source:source,
        mis_a_jour_le:new Date().toISOString(),
        derniere_utilisation:new Date().toISOString()
      },{onConflict:"user_id,categorie,cle",ignoreDuplicates:false});
      if(res.error)console.error("Erreur mémorisation:",res.error);
    },

    // Oublier un fait
    oublier: async function(userId,categorie,cle){
      var sb=this._getSb();if(!sb)return;
      await sb.from("memoire_ia").delete()
        .eq("user_id",userId).eq("categorie",categorie).eq("cle",cle);
    },

    // Construire le contexte mémoire pour injection dans system prompts
    construireContexte: async function(userId){
      var memoire=await this.tout(userId);
      if(!memoire.length)return"";

      var groupes={};
      for(var i=0;i<memoire.length;i++){
        var m=memoire[i];
        if(!groupes[m.categorie])groupes[m.categorie]=[];
        groupes[m.categorie].push(m.cle+": "+m.valeur+(m.contexte?" ("+m.contexte+")":""));
      }

      var labels={
        identite:"Identité",preference:"Préférences",projet:"Projets en cours",
        habitude:"Habitudes de travail",contexte:"Contexte récent",
        fait:"Faits importants",erreur_recente:"Erreurs récentes à éviter",succes:"Succès"
      };

      var ctx="\n\n--- MÉMOIRE DE L'UTILISATEUR ---\n";
      for(var cat in groupes){
        if(!groupes.hasOwnProperty(cat))continue;
        ctx+="\n"+(labels[cat]||cat)+":\n";
        for(var j=0;j<groupes[cat].length;j++){
          ctx+="  • "+groupes[cat][j]+"\n";
        }
      }
      ctx+="--- FIN MÉMOIRE ---\n";
      return ctx;
    },

    // Extraire et mémoriser automatiquement depuis une conversation
    // Utilise le ai-proxy Edge Function (pas d'appel direct à l'API Anthropic)
    extraireDeConversation: async function(userId,messageUtilisateur,reponseIA){
      try{
        var tk=typeof getToken==="function"?getToken():"";
        var h={"Content-Type":"application/json"};
        if(tk)h["Authorization"]="Bearer "+tk;

        var aiProxy=window.AI_PROXY||(window.SB_URL||"https://rnuripmfozlxenryxhdc.supabase.co")+"/functions/v1/ai-proxy";

        var res=await fetch(aiProxy,{method:"POST",headers:h,body:JSON.stringify({
          kind:"chat",model:"claude-sonnet-4-6",max_tokens:500,
          system:"Tu extrais les faits importants d'une conversation pour la mémoire IA. "+
            "Réponds UNIQUEMENT en JSON valide, format: "+
            '[{"categorie":"...","cle":"...","valeur":"...","contexte":"..."}] '+
            "Catégories: identite, preference, projet, habitude, contexte, fait, erreur_recente, succes. "+
            "Si rien d'important, réponds: []",
          messages:[{role:"user",content:
            "Message utilisateur: \""+messageUtilisateur.substring(0,300)+"\"\n"+
            "Réponse IA: \""+reponseIA.substring(0,300)+"\""}]
        })});

        if(!res.ok)return;

        var texte="";
        if(res.headers.get("content-type")==="text/event-stream"){
          texte=await readSSE(res);
        }else{
          var json=await res.json();
          texte=(json.content&&json.content[0]&&json.content[0].text)||"[]";
        }

        var cleaned=texte.replace(/```json|```/g,"").trim();
        var faits=[];
        try{faits=JSON.parse(cleaned);}catch(e){return;}

        if(!Array.isArray(faits))return;
        var self=this;
        for(var i=0;i<faits.length;i++){
          var f=faits[i];
          if(f.categorie&&f.cle&&f.valeur){
            self.memoriser(userId,f.categorie,f.cle,f.valeur,f.contexte||"","infere");
          }
        }
      }catch(e){
        console.warn("Extraction mémoire échouée (non-bloquant):",e);
      }
    },

    // Initialiser la mémoire d'un nouvel utilisateur
    initialiser: async function(userId,donneesUtilisateur){
      donneesUtilisateur=donneesUtilisateur||{};
      var faits=[
        {categorie:"preference",cle:"langue",valeur:"Français québécois",contexte:"Détecté au premier message"},
        {categorie:"identite",cle:"plateforme",valeur:"ti-lex-al",contexte:"Utilisateur de ti-lex-al"}
      ];
      if(donneesUtilisateur.email){
        faits.push({categorie:"identite",cle:"email",valeur:donneesUtilisateur.email,contexte:"Email de connexion"});
      }
      if(donneesUtilisateur.github_username){
        faits.push({categorie:"identite",cle:"github",valeur:donneesUtilisateur.github_username,contexte:"Compte GitHub lié"});
      }
      for(var i=0;i<faits.length;i++){
        await this.memoriser(userId,faits[i].categorie,faits[i].cle,faits[i].valeur,faits[i].contexte,"systeme");
      }
    }
  };

  window.MemoireIA=MemoireIA;
})();
