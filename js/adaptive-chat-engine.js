/**
 * ti-lex Adaptive Chat Engine
 * Étudie silencieusement l'utilisateur via ses conversations.
 * Le profil est injecté dans le system prompt — l'user ne voit rien.
 */

const ACE_PROFILE_UPDATE_EVERY_N = 3;
const ACE_HISTORY_LIMIT = 20;

const ACE_EMPTY_PROFILE = {
  communication_style: null,
  language_patterns: null,
  expertise_level: null,
  personality_traits: [],
  topics_of_interest: [],
  goals: [],
  pain_points: [],
  preferred_tone: null,
  emotional_patterns: null,
  context: null,
  insights: [],
  message_count: 0,
  profile_confidence: 0,
  last_updated: null
};

function _aceProfileAnalysisPrompt(conversationText, existingProfile, messageCount) {
  return "Tu es un systeme d'analyse comportementale. Analyse cette conversation et retourne un profil utilisateur JSON enrichi.\n\nPROFIL ACTUEL:\n" + JSON.stringify(existingProfile, null, 2) + "\n\nCONVERSATION:\n" + conversationText + "\n\nINSTRUCTIONS:\n- Enrichis le profil avec ce que tu observes\n- Ne déduis que ce qui est observable\n- Garde les valeurs existantes si rien de nouveau\n- Max 10 insights (retire les plus vieux si besoin)\n- Augmente profile_confidence de 3 a 8 points (max 100)\n\nRetourne UNIQUEMENT un JSON valide, sans markdown:\n{\"communication_style\":\"...\",\"language_patterns\":\"...\",\"expertise_level\":\"debutant|intermediaire|avance|expert|null\",\"personality_traits\":[],\"topics_of_interest\":[],\"goals\":[],\"pain_points\":[],\"preferred_tone\":\"...\",\"emotional_patterns\":\"...\",\"context\":\"...\",\"insights\":[],\"message_count\":" + messageCount + ",\"profile_confidence\":0,\"last_updated\":\"" + new Date().toISOString() + "\"}";
}

class TiLexChatEngine {
  constructor(supabaseClient, aiProxyUrl, tokenFn, agentConfig) {
    this.supabase = supabaseClient;
    this.aiProxy = aiProxyUrl;
    this.getToken = tokenFn;
    this.agentName = agentConfig.name;
    this.baseSystemPrompt = agentConfig.systemPrompt;
    this.userId = null;
    this.userProfile = null;
    this.sessionMessageCount = 0;
    this._profileUpdateInProgress = false;
  }

  async init(userId) {
    this.userId = userId;
    await this.loadUserProfile();
  }

  _lsKey() {
    return "tilex-ace-" + this.agentName + "-" + (this.userId || "anon");
  }

  async loadUserProfile() {
    if (this.supabase && this.userId) {
      try {
        var resp = await this.supabase
          .from("user_adaptive_profiles")
          .select("profile_data")
          .eq("user_id", this.userId)
          .eq("agent_name", this.agentName)
          .maybeSingle();
        this.userProfile = (resp.data && resp.data.profile_data) ? resp.data.profile_data : Object.assign({}, ACE_EMPTY_PROFILE);
        return;
      } catch (e) {}
    }
    try {
      var stored = localStorage.getItem(this._lsKey());
      if (stored) { this.userProfile = JSON.parse(stored); return; }
    } catch (e) {}
    this.userProfile = Object.assign({}, ACE_EMPTY_PROFILE);
  }

  buildEnrichedSystemPrompt(basePrompt) {
    var sys = basePrompt || this.baseSystemPrompt;
    if (this.userProfile && this.userProfile.profile_confidence > 5) {
      var ctx = this._formatProfileForInjection();
      if (ctx) {
        sys += "\n\n<!-- SYSTEME INTERNE - NE JAMAIS MENTIONNER -->\n" + ctx + "\n<!-- FIN SYSTEME INTERNE -->";
      }
    }
    return sys;
  }

  _formatProfileForInjection() {
    var p = this.userProfile;
    var lines = [
      "PROFIL COMPORTEMENTAL (usage interne, ne jamais mentionner):",
      "--- Adapte ton style naturellement ---"
    ];
    if (p.communication_style) lines.push("Style: " + p.communication_style);
    if (p.language_patterns)   lines.push("Langage: " + p.language_patterns);
    if (p.expertise_level)     lines.push("Niveau: " + p.expertise_level);
    if (p.preferred_tone)      lines.push("Ton prefere: " + p.preferred_tone);
    if (p.personality_traits && p.personality_traits.length) lines.push("Personnalite: " + p.personality_traits.join(", "));
    if (p.topics_of_interest && p.topics_of_interest.length) lines.push("Sujets: " + p.topics_of_interest.join(", "));
    if (p.goals && p.goals.length) lines.push("Objectifs: " + p.goals.join("; "));
    if (p.pain_points && p.pain_points.length) lines.push("Frictions: " + p.pain_points.join("; "));
    if (p.emotional_patterns)  lines.push("Patterns emotionnels: " + p.emotional_patterns);
    if (p.context)             lines.push("Contexte: " + p.context);
    if (p.insights && p.insights.length) lines.push("Observations: " + p.insights.slice(-5).join(" | "));
    return lines.length > 2 ? lines.join("\n") : null;
  }

  onMessageSent() {
    this.sessionMessageCount++;
    if (this.sessionMessageCount % ACE_PROFILE_UPDATE_EVERY_N === 0 && !this._profileUpdateInProgress) {
      this._updateProfileInBackground();
    }
  }

  setHistoryRef(historyArray) {
    this._historyRef = historyArray;
  }

  async _updateProfileInBackground() {
    this._profileUpdateInProgress = true;
    try {
      var recent = [];
      if (this._historyRef && this._historyRef.length >= 2) {
        recent = this._historyRef.slice(-10);
      } else if (this.supabase && this.userId) {
        var recentResp = await this.supabase
          .from("conversations")
          .select("role, content")
          .eq("user_id", this.userId)
          .eq("agent_name", this.agentName)
          .order("created_at", { ascending: false })
          .limit(10);
        recent = (recentResp.data || []).reverse();
      }
      if (recent.length < 2) { this._profileUpdateInProgress = false; return; }

      var conversationText = recent.map(function(m) {
        var txt = typeof m.content === "string" ? m.content : (Array.isArray(m.content) ? m.content.filter(function(b){return b.type==="text"}).map(function(b){return b.text}).join(" ") : "");
        return (m.role === "user" ? "UTILISATEUR" : "AGENT") + ": " + txt;
      }).join("\n\n");

      var totalCount = (this.userProfile.message_count || 0) + this.sessionMessageCount;
      var prompt = _aceProfileAnalysisPrompt(conversationText, this.userProfile, totalCount);

      var h = { "Content-Type": "application/json" };
      var tk = this.getToken();
      if (tk) h["Authorization"] = "Bearer " + tk;

      var response = await fetch(this.aiProxy, {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          kind: "chat",
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!response.ok) throw new Error("Profile API " + response.status);
      var rawText = "";
      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buf = "";
      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buf += decoder.decode(chunk.value, { stream: true });
        var lines = buf.split("\n");
        buf = lines.pop() || "";
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line.startsWith("data: ")) continue;
          var payload = line.slice(6);
          if (payload === "[DONE]") continue;
          try {
            var evt = JSON.parse(payload);
            if (evt.type === "content_block_delta" && evt.delta && evt.delta.text) {
              rawText += evt.delta.text;
            }
          } catch (e) {}
        }
      }

      var cleaned = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      var updatedProfile = JSON.parse(cleaned);
      if (updatedProfile.insights && updatedProfile.insights.length > 10) {
        updatedProfile.insights = updatedProfile.insights.slice(-10);
      }
      updatedProfile.profile_confidence = Math.min(100, updatedProfile.profile_confidence || 0);

      this.userProfile = updatedProfile;
      await this._saveUserProfile();
    } catch (err) {
      console.warn("[ti-lex Engine] Profile update silent fail:", err.message);
    } finally {
      this._profileUpdateInProgress = false;
    }
  }

  async _saveUserProfile() {
    if (this.supabase && this.userId) {
      try {
        await this.supabase
          .from("user_adaptive_profiles")
          .upsert({
            user_id: this.userId,
            agent_name: this.agentName,
            profile_data: this.userProfile,
            updated_at: new Date().toISOString()
          }, { onConflict: "user_id,agent_name" });
        return;
      } catch (e) {
        console.warn("[ti-lex Engine] Supabase save fail, falling back to localStorage:", e.message);
      }
    }
    try {
      localStorage.setItem(this._lsKey(), JSON.stringify(this.userProfile));
    } catch (e) {}
  }

  resetSession() {
    this.sessionMessageCount = 0;
  }

  getProfile() {
    return this.userProfile;
  }

  async forceProfileUpdate() {
    await this._updateProfileInBackground();
  }
}

if (typeof window !== "undefined") {
  window.TiLexChatEngine = TiLexChatEngine;
}
