/* ============================================================
   api/scan-repo.js — Scanner de projet GitHub (serverless Vercel)
   ti-lex-AL v10 — Alex Marceau-Prévost
   Lit l'arbre du repo, analyse les fichiers, détecte les problèmes.
   Le token GitHub reste caché côté serveur.
   ============================================================ */

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, erreur: 'Méthode non permise' });
  }

  const TOKEN = process.env.GITHUB_TOKEN;
  const OWNER = process.env.GITHUB_OWNER;
  const REPO  = process.env.GITHUB_REPO;

  if (!TOKEN || !OWNER || !REPO) {
    return res.status(500).json({
      ok: false,
      erreur: 'Variables manquantes : GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO'
    });
  }

  const GH = 'https://api.github.com';
  const headers = {
    'Authorization': `Bearer ${TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'ti-lex-scan'
  };

  try {
    // 1. Branche par défaut
    const repoRes = await fetch(`${GH}/repos/${OWNER}/${REPO}`, { headers });
    if (!repoRes.ok) throw new Error(`Repo introuvable (${repoRes.status})`);
    const repoData = await repoRes.json();
    const branche = repoData.default_branch || 'main';

    // 2. Arbre complet des fichiers (récursif)
    const treeRes = await fetch(
      `${GH}/repos/${OWNER}/${REPO}/git/trees/${branche}?recursive=1`, { headers });
    if (!treeRes.ok) throw new Error(`Arbre illisible (${treeRes.status})`);
    const treeData = await treeRes.json();

    const fichiers = (treeData.tree || [])
      .filter(n => n.type === 'blob')
      .map(n => ({ path: n.path, taille: n.size || 0, sha: n.sha }));

    // 3. Analyse
    const rapport = analyser(fichiers);

    // 4. Scan de contenu des fichiers texte (clés API, fichiers coupés)
    const aScanner = fichiers.filter(f =>
      /\.(js|html|css|json|md|env|ts)$/i.test(f.path) && f.taille < 200000
    ).slice(0, 60); // limite pour pas exploser le temps serverless

    for (const f of aScanner) {
      try {
        const c = await fetch(
          `${GH}/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(f.path)}?ref=${branche}`,
          { headers });
        if (!c.ok) continue;
        const cd = await c.json();
        if (cd.encoding === 'base64' && cd.content) {
          const texte = Buffer.from(cd.content, 'base64').toString('utf-8');
          scannerContenu(f.path, texte, rapport);
        }
      } catch (e) { /* on continue */ }
    }

    return res.status(200).json({
      ok: true,
      repo: `${OWNER}/${REPO}`,
      branche,
      total_fichiers: fichiers.length,
      taille_totale_ko: Math.round(fichiers.reduce((s, f) => s + f.taille, 0) / 1024),
      fichiers,
      rapport
    });

  } catch (e) {
    return res.status(500).json({ ok: false, erreur: e.message });
  }
}

// --- Analyse structurelle ---
function analyser(fichiers) {
  const parExt = {};
  const nomsBase = {};
  for (const f of fichiers) {
    const ext = (f.path.split('.').pop() || 'autre').toLowerCase();
    parExt[ext] = (parExt[ext] || 0) + 1;
    const base = f.path.split('/').pop();
    (nomsBase[base] = nomsBase[base] || []).push(f.path);
  }
  // Doublons de noms de fichiers
  const doublons = Object.entries(nomsBase)
    .filter(([, paths]) => paths.length > 1)
    .map(([nom, paths]) => ({ nom, emplacements: paths }));

  return {
    par_extension: parExt,
    doublons_noms: doublons,
    fichiers_vides: fichiers.filter(f => f.taille === 0).map(f => f.path),
    problemes: [] // rempli par scannerContenu
  };
}

// --- Scan du contenu (sécurité + fichiers coupés) ---
function scannerContenu(path, texte, rapport) {
  const P = rapport.problemes;

  // Clés API exposées
  const patterns = [
    { rx: /sk-[a-zA-Z0-9]{20,}/, msg: 'Clé API type OpenAI/Anthropic exposée' },
    { rx: /AIza[0-9A-Za-z\-_]{30,}/, msg: 'Clé API Google exposée' },
    { rx: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, msg: 'Token JWT / clé Supabase possiblement exposée' },
    { rx: /ghp_[A-Za-z0-9]{30,}/, msg: 'Token GitHub exposé' },
    { rx: /(api[_-]?key|secret|password)\s*[:=]\s*["'][^"']{8,}["']/i, msg: 'Secret en clair dans le code' }
  ];
  for (const p of patterns) {
    if (p.rx.test(texte)) {
      P.push({ severite: 'critique', fichier: path, probleme: p.msg });
    }
  }

  // Fichier CSS/JS coupé (finit sur une propriété sans valeur)
  const finTronquee = /[:{]\s*$/.test(texte.trim()) ||
                      /max-height:\s*$/.test(texte) ||
                      texte.trim().endsWith(',') ||
                      texte.trim().endsWith('{');
  if (finTronquee && texte.length > 50) {
    P.push({ severite: 'eleve', fichier: path, probleme: 'Fichier possiblement coupé / incomplet' });
  }

  // TODO / placeholder oubliés
  if (/(TODO|FIXME|PLACEHOLDER|\.\.\.\s*$)/m.test(texte)) {
    P.push({ severite: 'moyen', fichier: path, probleme: 'TODO / placeholder détecté' });
  }
}
