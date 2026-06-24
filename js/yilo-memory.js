// YILO MEMORY — Pouvoir Mémoire Persistante
// Projet: Ti-lex-AL v10
// Auteur: Alex Marceau-Prévost

var YILO_MEMORY = {

  _getUrl: function(){ return window.SB_URL || ''; },
  _getKey: function(){ return window.SB_ANON || ''; },
  _getToken: function(){
    try{
      var raw = localStorage.getItem('sb-rnuripmfozlxenryxhdc-auth-token');
      if(raw){ var s = JSON.parse(raw); if(s && s.access_token) return s.access_token; }
    }catch(e){}
    return this._getKey();
  },
  _getUserId: function(){
    try{
      var raw = localStorage.getItem('sb-rnuripmfozlxenryxhdc-auth-token');
      if(raw){ var s = JSON.parse(raw); if(s && s.user && s.user.id) return s.user.id; }
    }catch(e){}
    return null;
  },

  async sauvegarder(type, contenu) {
    try {
      var uid = this._getUserId();
      if(!uid){ console.warn('[YILO] pas connecte'); return null; }
      var res = await fetch(this._getUrl() + '/rest/v1/yilo_memory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this._getKey(),
          'Authorization': 'Bearer ' + this._getToken(),
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ user_id: uid, type: type, contenu: contenu, score: 0 })
      });
      var data = await res.json();
      console.log('[YILO] memorise:', contenu);
      return data;
    } catch (err) {
      console.error('[YILO] erreur sauvegarde:', err);
      return null;
    }
  },

  async lireTout() {
    try {
      var res = await fetch(
        this._getUrl() + '/rest/v1/yilo_memory?order=created_at.desc',
        {
          headers: {
            'apikey': this._getKey(),
            'Authorization': 'Bearer ' + this._getToken()
          }
        }
      );
      var data = await res.json();
      console.log('[YILO] memoire chargee:', data.length, 'souvenirs');
      return data;
    } catch (err) {
      console.error('[YILO] erreur lecture:', err);
      return [];
    }
  },

  async valider(id) {
    try {
      await fetch(
        this._getUrl() + '/rest/v1/yilo_memory?id=eq.' + id,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': this._getKey(),
            'Authorization': 'Bearer ' + this._getToken()
          },
          body: JSON.stringify({ score: 1, validated_by: 'ti-lex' })
        }
      );
      console.log('[YILO] souvenir valide, score +1');
      return true;
    } catch (err) {
      console.error('[YILO] erreur validation:', err);
      return false;
    }
  },

  async effacer(id) {
    try {
      await fetch(
        this._getUrl() + '/rest/v1/yilo_memory?id=eq.' + id,
        {
          method: 'DELETE',
          headers: {
            'apikey': this._getKey(),
            'Authorization': 'Bearer ' + this._getToken()
          }
        }
      );
      console.log('[YILO] souvenir efface');
      return true;
    } catch (err) {
      console.error('[YILO] erreur suppression:', err);
      return false;
    }
  },

  async scoreTotal() {
    var souvenirs = await this.lireTout();
    var total = souvenirs.reduce(function(acc, s){ return acc + (s.score || 0); }, 0);
    console.log('[YILO] score total:', total);
    return total;
  }

};

window.YILO_MEMORY = YILO_MEMORY;
console.log('[YILO] Memory charge');
