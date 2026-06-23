/* ============================================================================
   tilexcode-agents.js
   Système d'agents IA pour TIEX Air — Mode Codex (ti-lex)
   Produit du Québec

   6 agents qui forment le pipeline complet de création de code :
     1. SCRIBE   — Le Codeur          : écrit le code à partir du langage naturel
     2. ARCHI    — L'Architecte       : structure les fichiers du projet
     3. SOCLE    — L'Infrastructeur   : plan de création des fichiers + SQL Supabase
     4. LOUPE    — L'Analyste         : analyse le code de tous les fichiers créés
     5. FORGE    — Le Studio d'Erreur : corrige tout avant le déploiement
     6. COFFRE   — Le Gardien         : sauvegarde le projet VALIDÉ + bonus sécurité

   Ordre « foundation-first » : on corrige AVANT de sauvegarder, donc COFFRE
   archive la version déjà analysée et corrigée — pas le premier jet.

   Conventions ti-lex :
     - Vanilla JS pur, AUCUN import/export
     - Tout est exposé sur window.TilexCodeAgents
     - try/catch partout
     - Commentaires en français
     - window.showToast gardé et partagé
   ============================================================================ */

(function () {
  'use strict';

  /* --------------------------------------------------------------------------
     0. showToast gardé et partagé (ne pas écraser si déjà défini ailleurs)
     -------------------------------------------------------------------------- */
  if (typeof window.showToast !== 'function') {
    window.showToast = function (message, type) {
      try {
        type = type || 'info';
        var conteneur = document.getElementById('tilex-toast-zone');
        if (!conteneur) {
          conteneur = document.createElement('div');
          conteneur.id = 'tilex-toast-zone';
          document.body.appendChild(conteneur);
        }
        var toast = document.createElement('div');
        toast.className = 'tilex-toast tilex-toast-' + type;
        toast.textContent = message;
        conteneur.appendChild(toast);
        // Disparition automatique
        setTimeout(function () {
          toast.classList.add('tilex-toast-sortie');
          setTimeout(function () {
            if (toast && toast.parentNode) { toast.parentNode.removeChild(toast); }
          }, 350);
        }, 3600);
      } catch (e) {
        // Dernier recours : ne jamais planter à cause d'un toast
        console.log('[toast:' + type + '] ' + message);
      }
    };
  }

  /* --------------------------------------------------------------------------
     1. Configuration (à adapter à ton projet ti-lex)
     -------------------------------------------------------------------------- */
  var CONFIG = {
    SUPABASE_URL: window.SB_URL || 'https://rnuripmfozlxenryxhdc.supabase.co',
    SUPABASE_KEY: window.SB_ANON || '',
    EDGE_FUNCTION: 'tilexcode-agent',
    TIMEOUT_MS: 60000
  };

  /* --------------------------------------------------------------------------
     2. Définition des 6 agents
        Chaque agent : id, nom, role, sousTitre, aura (token couleur),
        glyph (SVG inline), et systemPrompt en français québécois.
     -------------------------------------------------------------------------- */
  var AGENTS = {
    SCRIBE: {
      id: 'SCRIBE',
      nom: 'SCRIBE',
      role: 'Le Codeur',
      sousTitre: 'Langage naturel → code qui marche',
      aura: '#22d3ee',
      ordre: 1,
      glyph:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/>' +
        '<polyline points="8 6 2 12 8 18"/></svg>',
      systemPrompt:
        "T'es SCRIBE, le codeur de TIEX Air (Mode Codex), un produit du Québec. " +
        "Ta job : prendre une description en langage naturel (français, joual, ou n'importe quelle langue) " +
        "pis la transformer en code qui FONCTIONNE, complet, sans placeholder ni « à compléter ». " +
        "Tu respectes les conventions ti-lex : vanilla JS pur quand c'est du JS (aucun import/export), " +
        "globals sur window, try/catch partout, commentaires en français. " +
        "Tu écris des implémentations complètes, jamais de fonctions tronquées. " +
        "Réponds avec le code dans des blocs ```langage, pis une courte explication en français avant chaque bloc."
    },

    ARCHI: {
      id: 'ARCHI',
      nom: 'ARCHI',
      role: "L'Architecte",
      sousTitre: 'Structure les fichiers du projet',
      aura: '#a855f7',
      ordre: 2,
      glyph:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h7v7H3z"/>' +
        '<path d="M14 3h7v7h-7z"/><path d="M14 14h7v7h-7z"/><path d="M3 14h7v7H3z"/></svg>',
      systemPrompt:
        "T'es ARCHI, l'architecte de TIEX Air (Mode Codex). " +
        "Tu prends le code généré pis tu le découpes en une structure de fichiers propre pis logique. " +
        "Tu donnes l'arborescence complète (dossiers + fichiers) en bloc texte, " +
        "pis pour chaque fichier tu dis son rôle en une ligne. " +
        "Tu respectes les conventions ti-lex (globals sur window.XManager, pas d'import/export pour le vanilla). " +
        "Sépare clairement front-end, Edge Functions Supabase (Deno), pis SQL. " +
        "Réponds en français, format : arborescence d'abord, ensuite la liste rôle-par-fichier."
    },

    COFFRE: {
      id: 'COFFRE',
      nom: 'COFFRE',
      role: 'Le Gardien',
      sousTitre: 'Sauvegarde + sécurité max du projet',
      aura: '#10b981',
      ordre: 6,
      glyph:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7' +
        'c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
      systemPrompt:
        "T'es COFFRE, le gardien de TIEX Air (Mode Codex). Tu passes EN DERNIER, " +
        "donc tu archives la version déjà analysée (LOUPE) et corrigée (FORGE) — pas le premier jet. " +
        "Ta mission : t'assurer que le projet de l'utilisateur est sauvegardé pis protégé au maximum. " +
        "Tu produis : (1) un résumé clair de ce qui va être sauvegardé (fichiers, tables, métadonnées), " +
        "(2) BONUS — une liste de propositions concrètes pour protéger le projet : " +
        "RLS Supabase (auth.uid() = user_id), validation des entrées, gestion des secrets via supabase secrets set, " +
        "pas de clé en dur, versionnage/historique des fichiers, sauvegarde redondante, " +
        "rate limiting, sanitisation avant exécution de code généré, et plan de récupération. " +
        "Pour chaque proposition, dis POURQUOI pis COMMENT l'appliquer dans le contexte ti-lex/Supabase. " +
        "Réponds en français, sans jamais inventer de faille fausse — reste pratique."
    },

    SOCLE: {
      id: 'SOCLE',
      nom: 'SOCLE',
      role: "L'Infrastructeur",
      sousTitre: 'Plan de création + SQL Supabase',
      aura: '#f59e0b',
      ordre: 3,
      glyph:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/>' +
        '<path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/></svg>',
      systemPrompt:
        "T'es SOCLE, l'infrastructeur de TIEX Air (Mode Codex). " +
        "Tu expliques EXACTEMENT comment les fichiers vont être créés (chemins, ordre, dépendances), " +
        "pis si l'utilisateur n'a pas encore de tables Supabase pour stocker son projet, " +
        "tu génères le SQL complet : CREATE TABLE, index, RLS activé, policies (auth.uid() = user_id), " +
        "colonnes typées, valeurs par défaut, contraintes. " +
        "Rappelle les pièges ti-lex : Deno vs Node, verify_jwt = false dans config.toml pour les clés sb_publishable_*, " +
        "secrets via supabase secrets set. " +
        "Réponds en français : d'abord le plan de création des fichiers, ensuite le bloc ```sql prêt à coller."
    },

    LOUPE: {
      id: 'LOUPE',
      nom: 'LOUPE',
      role: "L'Analyste",
      sousTitre: 'Analyse tout le code créé',
      aura: '#eab308',
      ordre: 4,
      glyph:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/>' +
        '<line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
      systemPrompt:
        "T'es LOUPE, l'analyste de TIEX Air (Mode Codex). " +
        "Tu lis tout le code de tous les fichiers créés pis tu produis une analyse structurée : " +
        "(1) qualité générale, (2) bogues potentiels, (3) trous de sécurité, (4) performance, " +
        "(5) respect des conventions ti-lex (try/catch, globals window, pas d'import/export, commentaires FR). " +
        "Pour chaque point, donne le fichier + la ligne approximative + la sévérité (info / attention / critique). " +
        "Tu ne réécris PAS le code ici — c'est la job de FORGE. Toi tu diagnostiques. " +
        "Réponds en français, format liste claire par sévérité."
    },

    FORGE: {
      id: 'FORGE',
      nom: 'FORGE',
      role: "Le Studio d'Erreur",
      sousTitre: 'Corrige tout avant le déploiement',
      aura: '#ef4444',
      ordre: 5,
      glyph:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4' +
        'L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2-2 2.5-2.5z"/></svg>',
      systemPrompt:
        "T'es FORGE, le studio d'erreur de TIEX Air (Mode Codex). " +
        "Tu prends le diagnostic de LOUPE pis le code, pis tu CORRIGES tout ce qui doit l'être AVANT le déploiement : " +
        "bogues, failles, erreurs de runtime Deno, problèmes de CORS, JWT, RLS, secrets. " +
        "Tu retournes les fichiers corrigés au complet (pas juste des diffs), prêts à déployer, " +
        "en respectant les conventions ti-lex. " +
        "À la fin, tu donnes une checklist de déploiement (supabase functions deploy, secrets set, verify_jwt, migrations SQL). " +
        "Réponds en français : pour chaque fichier corrigé, dis ce que t'as changé, ensuite le bloc de code complet."
    }
  };

  /* --------------------------------------------------------------------------
     3. Récupération du jeton d'authentification (Supabase Auth)
        Essaie window.supabaseClient en premier (ton pattern), sinon clé publiable.
     -------------------------------------------------------------------------- */
  function obtenirJetonAuth() {
    return new Promise(function (resolve) {
      try {
        if (window.supabaseClient &&
            window.supabaseClient.auth &&
            typeof window.supabaseClient.auth.getSession === 'function') {
          window.supabaseClient.auth.getSession().then(function (res) {
            try {
              var token = res && res.data && res.data.session && res.data.session.access_token;
              resolve(token || CONFIG.SUPABASE_KEY);
            } catch (e) {
              resolve(CONFIG.SUPABASE_KEY);
            }
          }).catch(function () {
            resolve(CONFIG.SUPABASE_KEY);
          });
        } else {
          resolve(CONFIG.SUPABASE_KEY);
        }
      } catch (e) {
        resolve(CONFIG.SUPABASE_KEY);
      }
    });
  }

  /* --------------------------------------------------------------------------
     4. Appel d'un agent unique via l'Edge Function
     -------------------------------------------------------------------------- */
  function runAgent(agentId, input, context) {
    return new Promise(function (resolve, reject) {
      try {
        var agent = AGENTS[agentId];
        if (!agent) {
          window.showToast('Agent inconnu : ' + agentId, 'error');
          reject(new Error('Agent inconnu : ' + agentId));
          return;
        }

        window.showToast(agent.nom + ' travaille…', 'info');

        obtenirJetonAuth().then(function (jeton) {
          var url = CONFIG.SUPABASE_URL + '/functions/v1/' + CONFIG.EDGE_FUNCTION;

          // Garde-fou de timeout
          var controleur = (typeof AbortController !== 'undefined') ? new AbortController() : null;
          var minuterie = setTimeout(function () {
            if (controleur) { controleur.abort(); }
          }, CONFIG.TIMEOUT_MS);

          fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + jeton,
              'apikey': CONFIG.SUPABASE_KEY
            },
            body: JSON.stringify({
              agent_id: agentId,
              system_prompt: agent.systemPrompt,
              input: input || '',
              context: context || ''
            }),
            signal: controleur ? controleur.signal : undefined
          }).then(function (rep) {
            clearTimeout(minuterie);
            if (!rep.ok) {
              return rep.text().then(function (t) {
                throw new Error('Erreur ' + rep.status + ' : ' + t);
              });
            }
            return rep.json();
          }).then(function (data) {
            var sortie = (data && (data.output || data.analyse || data.result)) || '';
            window.showToast(agent.nom + ' a terminé.', 'success');
            resolve({ agentId: agentId, agent: agent, output: sortie, brut: data });
          }).catch(function (err) {
            clearTimeout(minuterie);
            var msg = (err && err.name === 'AbortError')
              ? agent.nom + ' a dépassé le délai.'
              : agent.nom + ' a échoué : ' + (err && err.message ? err.message : err);
            window.showToast(msg, 'error');
            reject(err);
          });
        });
      } catch (e) {
        window.showToast('Erreur runAgent : ' + (e && e.message ? e.message : e), 'error');
        reject(e);
      }
    });
  }

  /* --------------------------------------------------------------------------
     5. Pipeline complet : enchaîne les 6 agents dans l'ordre numéroté
        onStep(resultat) est appelé après chaque agent (optionnel)
     -------------------------------------------------------------------------- */
  function runPipeline(prompt, onStep) {
    return new Promise(function (resolve, reject) {
      try {
        if (!prompt || !String(prompt).trim()) {
          window.showToast('Décris ce que tu veux coder avant de lancer le pipeline.', 'attention');
          reject(new Error('Prompt vide'));
          return;
        }

        // Ordre « foundation-first » : corriger avant de sauvegarder
        var ordre = ['SCRIBE', 'ARCHI', 'SOCLE', 'LOUPE', 'FORGE', 'COFFRE'];
        var resultats = [];
        var contexteAccumule = 'DEMANDE INITIALE DE L\'UTILISATEUR :\n' + prompt;
        var index = 0;

        function suivant() {
          if (index >= ordre.length) {
            window.showToast('Pipeline complet ! 6 agents passés.', 'success');
            resolve(resultats);
            return;
          }
          var agentId = ordre[index];
          runAgent(agentId, prompt, contexteAccumule).then(function (res) {
            resultats.push(res);
            // On passe la sortie de chaque agent comme contexte au suivant
            contexteAccumule +=
              '\n\n--- SORTIE DE ' + agentId + ' (' + AGENTS[agentId].role + ') ---\n' + res.output;
            if (typeof onStep === 'function') {
              try { onStep(res, index, ordre.length); } catch (e) { /* on ignore */ }
            }
            index++;
            suivant();
          }).catch(function (err) {
            window.showToast('Pipeline arrêté à ' + agentId + '.', 'error');
            reject(err);
          });
        }

        suivant();
      } catch (e) {
        window.showToast('Erreur pipeline : ' + (e && e.message ? e.message : e), 'error');
        reject(e);
      }
    });
  }

  /* --------------------------------------------------------------------------
     6. Sauvegarde d'un projet + ses fichiers dans Supabase
        Tables attendues : tilex_projects, tilex_files (voir le SQL fourni)
     -------------------------------------------------------------------------- */
  function saveProject(projet) {
    return new Promise(function (resolve, reject) {
      try {
        if (!projet || !projet.nom) {
          window.showToast('Le projet a besoin d\'un nom pour être sauvegardé.', 'attention');
          reject(new Error('Projet sans nom'));
          return;
        }

        obtenirJetonAuth().then(function (jeton) {
          var base = CONFIG.SUPABASE_URL + '/rest/v1';

          // 1) Insertion du projet
          fetch(base + '/tilex_projects', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + jeton,
              'apikey': CONFIG.SUPABASE_KEY,
              'Prefer': 'return=representation'
            },
            body: JSON.stringify({
              nom: projet.nom,
              description: projet.description || '',
              langage: projet.langage || 'inconnu'
            })
          }).then(function (rep) {
            if (!rep.ok) {
              return rep.text().then(function (t) { throw new Error(t); });
            }
            return rep.json();
          }).then(function (lignes) {
            var projetId = lignes && lignes[0] && lignes[0].id;
            var fichiers = projet.fichiers || [];
            if (!projetId || fichiers.length === 0) {
              window.showToast('Projet « ' + projet.nom + ' » sauvegardé.', 'success');
              resolve({ projetId: projetId, fichiers: 0 });
              return;
            }

            // 2) Insertion des fichiers liés
            var charge = fichiers.map(function (f) {
              return {
                project_id: projetId,
                chemin: f.chemin || 'sans-nom.txt',
                contenu: f.contenu || '',
                langage: f.langage || ''
              };
            });

            fetch(base + '/tilex_files', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + jeton,
                'apikey': CONFIG.SUPABASE_KEY,
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify(charge)
            }).then(function (rep2) {
              if (!rep2.ok) {
                return rep2.text().then(function (t) { throw new Error(t); });
              }
              window.showToast('Projet + ' + fichiers.length + ' fichier(s) sauvegardés.', 'success');
              resolve({ projetId: projetId, fichiers: fichiers.length });
            }).catch(function (err2) {
              window.showToast('Fichiers non sauvegardés : ' + err2.message, 'error');
              reject(err2);
            });
          }).catch(function (err) {
            window.showToast('Sauvegarde du projet échouée : ' + err.message, 'error');
            reject(err);
          });
        });
      } catch (e) {
        window.showToast('Erreur saveProject : ' + (e && e.message ? e.message : e), 'error');
        reject(e);
      }
    });
  }

  /* --------------------------------------------------------------------------
     7. Chargement des projets de l'utilisateur
     -------------------------------------------------------------------------- */
  function loadProjects() {
    return new Promise(function (resolve, reject) {
      try {
        obtenirJetonAuth().then(function (jeton) {
          var url = CONFIG.SUPABASE_URL +
            '/rest/v1/tilex_projects?select=*&order=created_at.desc';
          fetch(url, {
            headers: {
              'Authorization': 'Bearer ' + jeton,
              'apikey': CONFIG.SUPABASE_KEY
            }
          }).then(function (rep) {
            if (!rep.ok) {
              return rep.text().then(function (t) { throw new Error(t); });
            }
            return rep.json();
          }).then(function (data) {
            resolve(data || []);
          }).catch(function (err) {
            window.showToast('Chargement des projets échoué : ' + err.message, 'error');
            reject(err);
          });
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  /* --------------------------------------------------------------------------
     8. Interface : le dispatcher des 6 agents (avatars hexagonaux + auras)
     -------------------------------------------------------------------------- */
  function renderDispatcher(idConteneur) {
    try {
      injecterStyles();
      var conteneur = document.getElementById(idConteneur);
      if (!conteneur) {
        window.showToast('Conteneur introuvable : #' + idConteneur, 'error');
        return;
      }

      var ordre = ['SCRIBE', 'ARCHI', 'SOCLE', 'LOUPE', 'FORGE', 'COFFRE'];
      var html = '<div class="tilex-agents-grille">';

      ordre.forEach(function (id) {
        var a = AGENTS[id];
        html +=
          '<button type="button" class="tilex-agent-carte" data-agent="' + a.id + '" ' +
          'style="--aura:' + a.aura + '">' +
          '  <span class="tilex-agent-no">' + a.ordre + '</span>' +
          '  <span class="tilex-agent-hex">' +
          '    <span class="tilex-agent-glyph">' + a.glyph + '</span>' +
          '  </span>' +
          '  <span class="tilex-agent-nom">' + a.nom + '</span>' +
          '  <span class="tilex-agent-role">' + a.role + '</span>' +
          '  <span class="tilex-agent-sous">' + a.sousTitre + '</span>' +
          '</button>';
      });

      html += '</div>';
      conteneur.innerHTML = html;

      // Branche les clics : chaque carte lance son agent sur le prompt courant
      var cartes = conteneur.querySelectorAll('.tilex-agent-carte');
      Array.prototype.forEach.call(cartes, function (carte) {
        carte.addEventListener('click', function () {
          try {
            var id = carte.getAttribute('data-agent');
            var champ = document.getElementById('tilex-prompt');
            var prompt = champ ? champ.value : '';
            if (!prompt || !prompt.trim()) {
              window.showToast('Écris ta demande dans le champ avant de cliquer un agent.', 'attention');
              return;
            }
            runAgent(id, prompt, '').then(function (res) {
              afficherSortie(res);
            }).catch(function () { /* déjà géré par toast */ });
          } catch (e) {
            window.showToast('Erreur clic agent : ' + e.message, 'error');
          }
        });
      });
    } catch (e) {
      window.showToast('Erreur renderDispatcher : ' + (e && e.message ? e.message : e), 'error');
    }
  }

  /* --------------------------------------------------------------------------
     9. Affichage d'une sortie d'agent dans la zone de résultats
     -------------------------------------------------------------------------- */
  function afficherSortie(res) {
    try {
      var zone = document.getElementById('tilex-resultats');
      if (!zone) { return; }
      var bloc = document.createElement('div');
      bloc.className = 'tilex-resultat-bloc';
      bloc.style.setProperty('--aura', res.agent.aura);
      var entete = document.createElement('div');
      entete.className = 'tilex-resultat-entete';
      entete.textContent = res.agent.nom + ' — ' + res.agent.role;
      var corps = document.createElement('pre');
      corps.className = 'tilex-resultat-corps';
      corps.textContent = res.output || '(aucune sortie)';
      bloc.appendChild(entete);
      bloc.appendChild(corps);
      zone.insertBefore(bloc, zone.firstChild);
    } catch (e) {
      console.log('afficherSortie:', e);
    }
  }

  /* --------------------------------------------------------------------------
     10. Styles (avatars hexagonaux, auras, animations, toasts)
         Les couleurs de base sont des tokens — remappe-les à tes vrais
         tokens ti-lex au besoin.
     -------------------------------------------------------------------------- */
  function injecterStyles() {
    try {
      if (document.getElementById('tilex-agents-styles')) { return; }
      var style = document.createElement('style');
      style.id = 'tilex-agents-styles';
      style.textContent = [
        ':root{',
        '  --tilex-bg:#0b0f17; --tilex-surface:#131a26; --tilex-texte:#e8edf5;',
        '  --tilex-muet:#8a96a8; --tilex-bord:rgba(255,255,255,.08);',
        '}',
        '.tilex-agents-grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));',
        '  gap:16px;padding:8px;}',
        '.tilex-agent-carte{position:relative;display:flex;flex-direction:column;align-items:center;',
        '  gap:6px;padding:18px 12px 16px;background:var(--tilex-surface);color:var(--tilex-texte);',
        '  border:1px solid var(--tilex-bord);border-radius:16px;cursor:pointer;text-align:center;',
        '  transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;}',
        '.tilex-agent-carte:hover{transform:translateY(-3px);border-color:var(--aura);',
        '  box-shadow:0 0 0 1px var(--aura),0 12px 30px -12px var(--aura);}',
        '.tilex-agent-carte:focus-visible{outline:2px solid var(--aura);outline-offset:2px;}',
        '.tilex-agent-no{position:absolute;top:8px;left:10px;font-size:12px;font-weight:700;',
        '  color:var(--aura);opacity:.85;}',
        '.tilex-agent-hex{width:64px;height:64px;display:grid;place-items:center;color:var(--aura);',
        '  background:radial-gradient(circle at 50% 35%,color-mix(in srgb,var(--aura) 30%,transparent),transparent 70%);',
        '  -webkit-clip-path:polygon(50% 0,93% 25%,93% 75%,50% 100%,7% 75%,7% 25%);',
        '  clip-path:polygon(50% 0,93% 25%,93% 75%,50% 100%,7% 75%,7% 25%);',
        '  border:1px solid var(--aura);position:relative;animation:tilexPulse 3.2s ease-in-out infinite;}',
        '.tilex-agent-hex::after{content:"";position:absolute;inset:-2px;',
        '  -webkit-clip-path:inherit;clip-path:inherit;',
        '  background:linear-gradient(120deg,transparent 40%,color-mix(in srgb,var(--aura) 55%,transparent) 50%,transparent 60%);',
        '  background-size:200% 200%;animation:tilexSweep 2.8s linear infinite;opacity:.6;}',
        '.tilex-agent-glyph svg{width:26px;height:26px;position:relative;z-index:1;}',
        '.tilex-agent-nom{font-weight:800;letter-spacing:.5px;font-size:15px;}',
        '.tilex-agent-role{font-size:12px;color:var(--aura);font-weight:600;}',
        '.tilex-agent-sous{font-size:11px;color:var(--tilex-muet);line-height:1.3;}',
        '@keyframes tilexPulse{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--aura) 40%,transparent);}',
        '  50%{box-shadow:0 0 18px 2px color-mix(in srgb,var(--aura) 35%,transparent);}}',
        '@keyframes tilexSweep{0%{background-position:200% 0;}100%{background-position:-200% 0;}}',
        '.tilex-resultat-bloc{border-left:3px solid var(--aura);background:var(--tilex-surface);',
        '  border-radius:10px;margin:10px 0;overflow:hidden;}',
        '.tilex-resultat-entete{padding:10px 14px;font-weight:700;color:var(--aura);',
        '  border-bottom:1px solid var(--tilex-bord);}',
        '.tilex-resultat-corps{margin:0;padding:14px;white-space:pre-wrap;word-break:break-word;',
        '  font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;color:var(--tilex-texte);}',
        '#tilex-toast-zone{position:fixed;right:18px;bottom:18px;display:flex;flex-direction:column;',
        '  gap:8px;z-index:99999;}',
        '.tilex-toast{padding:11px 16px;border-radius:10px;color:#fff;font-size:14px;',
        '  box-shadow:0 10px 30px -10px rgba(0,0,0,.6);animation:tilexToastIn .28s ease;max-width:340px;}',
        '.tilex-toast-sortie{opacity:0;transform:translateY(8px);transition:all .35s ease;}',
        '.tilex-toast-info{background:#2563eb;} .tilex-toast-success{background:#10b981;}',
        '.tilex-toast-error{background:#ef4444;} .tilex-toast-attention{background:#f59e0b;color:#1a1205;}',
        '@keyframes tilexToastIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}',
        '@media (prefers-reduced-motion:reduce){',
        '  .tilex-agent-hex,.tilex-agent-hex::after{animation:none;}',
        '  .tilex-agent-carte{transition:none;}}'
      ].join('\n');
      document.head.appendChild(style);
    } catch (e) {
      console.log('injecterStyles:', e);
    }
  }

  /* --------------------------------------------------------------------------
     11. Initialisation
     -------------------------------------------------------------------------- */
  function init(idConteneur) {
    try {
      injecterStyles();
      if (idConteneur) { renderDispatcher(idConteneur); }
      window.showToast('Centre d\'agents tilexcode prêt — 6 agents en ligne.', 'success');
    } catch (e) {
      window.showToast('Erreur init : ' + (e && e.message ? e.message : e), 'error');
    }
  }

  /* --------------------------------------------------------------------------
     12. Exposition sur window.TilexCodeAgents
     -------------------------------------------------------------------------- */
  window.TilexCodeAgents = {
    config: CONFIG,
    agents: AGENTS,
    init: init,
    renderDispatcher: renderDispatcher,
    runAgent: runAgent,
    runPipeline: runPipeline,
    saveProject: saveProject,
    loadProjects: loadProjects,
    afficherSortie: afficherSortie
  };

})();
