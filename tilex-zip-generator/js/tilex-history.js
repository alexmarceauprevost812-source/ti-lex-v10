/* ════════════════════════════════════════════
   TILEX-HISTORY.JS — ti-lex-AL v10
   Feature 6 : Historique des ZIPs dans Supabase
════════════════════════════════════════════ */
'use strict';

window.TILEX = window.TILEX || {};

/* ════════════════════════════════════════════
   CONFIG SUPABASE
════════════════════════════════════════════ */
const SUPA_URL  = 'https://rnuripmfozlxenryxhdc.supabase.co';
const SUPA_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudXJpcG1mb3pseGVucnl4aGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNjE0NTEsImV4cCI6MjA4ODgzNzQ1MX0.kpF2fkUUShtCpkFGWuPBIRBaNnRVZNGIRmyuwpZZnmA';

// Initialiser Supabase si la lib est chargée
let SB = null;
document.addEventListener('DOMContentLoaded', () => {
  try {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
      SB = supabase.createClient(SUPA_URL, SUPA_KEY);
      console.log('[ti-lex] Supabase connecté ✓');
    }
  } catch (e) {
    console.warn('[ti-lex] Supabase non disponible :', e.message);
  }
});

/* ════════════════════════════════════════════
   SAUVEGARDER (appelé après chaque ZIP)
════════════════════════════════════════════ */
TILEX.sauvegarderHistorique = async function(nomZip, fichiers, tailleBytes) {
  if (!SB) return;

  try {
    const { data: { session } } = await SB.auth.getSession();
    if (!session) return; // Non connecté = on skip silencieusement

    const nomProjet = TILEX.state.nomProjet || 'sans-titre';
    const structure = fichiers.map(f => ({ n: f.nom, c: f.contenu }));

    const { error } = await SB.from('zip_historique').insert({
      user_id:      session.user.id,
      nom_projet:   nomProjet,
      nom_zip:      nomZip,
      nb_fichiers:  fichiers.length,
      taille_bytes: tailleBytes || 0,
      structure,
    });

    if (error) console.error('[ti-lex] Erreur sauvegarde historique :', error);
    else       console.log('[ti-lex] Historique sauvegardé ✓');
  } catch (e) {
    console.warn('[ti-lex] Historique ignoré :', e.message);
  }
};

/* ════════════════════════════════════════════
   CHARGER L'HISTORIQUE
════════════════════════════════════════════ */
TILEX.chargerHistorique = async function() {
  if (!SB) return [];

  try {
    const { data: { session } } = await SB.auth.getSession();
    if (!session) return [];

    const { data, error } = await SB
      .from('zip_historique')
      .select('id, nom_projet, nom_zip, nb_fichiers, taille_bytes, created_at')
      .order('created_at', { ascending: false })
      .limit(25);

    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('[ti-lex] Erreur chargement historique :', e);
    return [];
  }
};

/* ════════════════════════════════════════════
   RÉIMPORTER DEPUIS HISTORIQUE
════════════════════════════════════════════ */
TILEX.reimporterEntree = async function(id) {
  if (!SB) return;

  try {
    const { data, error } = await SB
      .from('zip_historique')
      .select('structure, nom_projet, nom_zip')
      .eq('id', id)
      .single();

    if (error || !data) { TILEX.toast('⚠ Structure introuvable', 'alerte'); return; }

    const { structure, nom_projet, nom_zip } = data;
    const actuels = TILEX.getAll();

    if (actuels.length > 0) {
      if (!confirm(`Remplacer les ${actuels.length} fichier(s) actuels par "${nom_zip}" ?`)) return;
      TILEX.state.fichiers  = [];
      TILEX.state.selection = new Set();
      const listEl = document.getElementById('file-list');
      if (listEl) listEl.innerHTML = '';
    }

    let n = 0;
    (structure || []).forEach(f => {
      if (f.n && typeof f.c === 'string') {
        TILEX.ajouterFichier(f.n, f.c, true);
        n++;
      }
    });

    if (nom_projet) {
      const inp = document.getElementById('input-nom-projet');
      if (inp) { inp.value = nom_projet; inp.dispatchEvent(new Event('input')); }
    }

    TILEX.fermerHistorique();
    TILEX.toast(`📥 ${n} fichier(s) réimportés depuis "${nom_zip}"`);
  } catch (e) {
    TILEX.toast('❌ Erreur : ' + e.message, 'err');
  }
};

/* ════════════════════════════════════════════
   RE-TÉLÉCHARGER UN ZIP
════════════════════════════════════════════ */
TILEX.retelechargerEntree = async function(id) {
  if (!SB || typeof JSZip === 'undefined') {
    TILEX.toast('⚠ JSZip ou Supabase non disponible', 'alerte');
    return;
  }

  try {
    const { data, error } = await SB
      .from('zip_historique')
      .select('structure, nom_zip')
      .eq('id', id)
      .single();

    if (error || !data) { TILEX.toast('⚠ Introuvable', 'alerte'); return; }

    const zip = new JSZip();
    (data.structure || []).forEach(f => { if (f.n) zip.file(f.n, f.c || ''); });

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = data.nom_zip; a.click();
    URL.revokeObjectURL(url);

    TILEX.toast(`⬇ "${data.nom_zip}" re-téléchargé`);
  } catch (e) {
    TILEX.toast('❌ ' + e.message, 'err');
  }
};

/* ════════════════════════════════════════════
   SUPPRIMER UNE ENTRÉE
════════════════════════════════════════════ */
TILEX.supprimerEntreeHistorique = async function(id, cardEl) {
  if (!SB || !confirm('Supprimer cette entrée de l\'historique ?')) return;

  const { error } = await SB.from('zip_historique').delete().eq('id', id);
  if (error) { TILEX.toast('❌ ' + error.message, 'err'); return; }

  if (cardEl) { cardEl.style.opacity = '0'; setTimeout(() => cardEl.remove(), 200); }
  TILEX.toast('🗑 Entrée supprimée');
};

/* ════════════════════════════════════════════
   MODAL HISTORIQUE
════════════════════════════════════════════ */
TILEX.ouvrirHistorique = async function() {
  const overlay = document.getElementById('modal-historique');
  const body    = document.getElementById('historique-body');
  if (!overlay || !body) return;

  body.innerHTML = '<div class="tx-loading">⏳ Chargement...</div>';
  overlay.classList.remove('hidden');

  if (!SB) {
    body.innerHTML = `
      <div class="tx-hist-vide">
        <p>🔌 Supabase non connecté</p>
        <p style="font-size:10px;margin-top:8px;">
          Connecte-toi via l'auth Supabase<br>pour accéder à l'historique.
        </p>
      </div>`;
    return;
  }

  const { data: { session } } = await SB.auth.getSession();
  if (!session) {
    body.innerHTML = `
      <div class="tx-hist-vide" style="padding:30px 20px;">
        <p>🔐 Connexion requise</p>
        <p style="font-size:10px;margin-top:8px;color:var(--muted)">L'historique est lié à ton compte Supabase.</p>
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:8px;max-width:280px;margin:16px auto 0">
          <input id="hist-email" type="email" class="tx-input" placeholder="courriel@exemple.com" />
          <input id="hist-pwd" type="password" class="tx-input" placeholder="Mot de passe" />
          <div style="display:flex;gap:8px">
            <button class="tx-btn-primary" style="flex:1" id="hist-login">Connexion</button>
            <button class="tx-btn-ghost" style="flex:1" id="hist-signup">Créer compte</button>
          </div>
          <div id="hist-auth-msg" style="font-size:10px;color:var(--gold);text-align:center"></div>
        </div>
      </div>`;

    document.getElementById('hist-login')?.addEventListener('click', async () => {
      const email = document.getElementById('hist-email')?.value;
      const pwd   = document.getElementById('hist-pwd')?.value;
      const { error } = await SB.auth.signInWithPassword({ email, password: pwd });
      if (error) { document.getElementById('hist-auth-msg').textContent = '⚠ ' + error.message; }
      else TILEX.ouvrirHistorique();
    });

    document.getElementById('hist-signup')?.addEventListener('click', async () => {
      const email = document.getElementById('hist-email')?.value;
      const pwd   = document.getElementById('hist-pwd')?.value;
      const { error } = await SB.auth.signUp({ email, password: pwd });
      const msg = error ? '⚠ ' + error.message : '✓ Vérifie tes courriels !';
      document.getElementById('hist-auth-msg').textContent = msg;
    });

    return;
  }

  const entrees = await TILEX.chargerHistorique();

  if (!entrees.length) {
    body.innerHTML = '<div class="tx-hist-vide">📭 Aucun ZIP dans l\'historique.<br>Télécharge un ZIP pour commencer.</div>';
    return;
  }

  const liste = document.createElement('div');
  liste.className = 'tx-hist-liste';

  entrees.forEach(e => {
    const card = document.createElement('div');
    card.className = 'tx-hist-card';
    const date    = new Date(e.created_at).toLocaleDateString('fr-CA', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const taille  = TILEX.formatBytes(e.taille_bytes);

    card.innerHTML = `
      <div class="tx-hist-info">
        <div class="tx-hist-nom">${e.nom_zip}</div>
        <div class="tx-hist-meta">
          <span>📁 ${e.nb_fichiers} fichier(s)</span>
          <span>⚖ ${taille}</span>
          <span>📅 ${date}</span>
          ${e.nom_projet && e.nom_projet !== 'sans-titre'
            ? `<span class="tx-hist-badge">${e.nom_projet}</span>`
            : ''}
        </div>
      </div>
      <div class="tx-hist-btns">
        <button class="tx-btn-sm btn-reimp" data-id="${e.id}">📥 Importer</button>
        <button class="tx-btn-sm btn-redl"  data-id="${e.id}">⬇ ZIP</button>
        <button class="tx-btn-sm tx-btn-danger btn-del" data-id="${e.id}">✕</button>
      </div>
    `;

    card.querySelector('.btn-reimp').addEventListener('click', () => TILEX.reimporterEntree(e.id));
    card.querySelector('.btn-redl').addEventListener('click',  () => TILEX.retelechargerEntree(e.id));
    card.querySelector('.btn-del').addEventListener('click',   () => TILEX.supprimerEntreeHistorique(e.id, card));

    liste.appendChild(card);
  });

  body.innerHTML = `<p style="font-size:10px;color:var(--muted);padding:10px 18px 4px">${entrees.length} entrée(s) · Sauvegardes automatiques</p>`;
  body.appendChild(liste);
};

TILEX.fermerHistorique = function() {
  const overlay = document.getElementById('modal-historique');
  if (overlay) overlay.classList.add('hidden');
};

/* ════════════════════════════════════════════
   INIT
════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const fermer  = document.getElementById('historique-fermer');
  const overlay = document.getElementById('modal-historique');
  if (fermer)  fermer.addEventListener('click', TILEX.fermerHistorique);
  if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) TILEX.fermerHistorique(); });
  console.log('[ti-lex] Historique initialisé ✓');
});
