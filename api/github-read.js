// api/github-read.js
// Ti-lex-AL v10 — Endpoint de lecture GitHub (l'IA peut "voir" le repo)
// Utilise l'API REST de GitHub : Git Trees API (liste récursive) + Contents API (contenu fichier)

export default async function handler(req, res) {
  // CORS de base
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilise GET.' });
  }

  // Token : d'abord celui envoyé par le Codex (en-tête x-github-token), sinon
  // celui configuré en variable d'environnement Vercel. Ça permet à Alex de
  // connecter son token direct dans le Codex, sans toucher à Vercel.
  const headerToken = (req.headers['x-github-token'] || '').toString().trim();
  const GITHUB_TOKEN = headerToken || process.env.GITHUB_TOKEN;
  const GITHUB_OWNER = process.env.GITHUB_OWNER;
  const GITHUB_REPO = process.env.GITHUB_REPO;
  const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

  // Validation légère du format d'un token GitHub fourni par le Codex
  // (évite d'envoyer n'importe quoi à GitHub). Formats: ghp_, github_pat_,
  // gho_, ghu_, ghs_, ghr_ — ou un ancien token hex de 40 caractères.
  if (headerToken && !/^(gh[posur]_[A-Za-z0-9_]{20,255}|github_pat_[A-Za-z0-9_]{20,255}|[a-f0-9]{40})$/.test(headerToken)) {
    return res.status(400).json({ error: 'Format de token GitHub invalide' });
  }

  // SEUL le token est OBLIGATOIRE. Le repo/branche peuvent venir du sélecteur du
  // Codex (?repo=&branch=) — donc pas besoin de GITHUB_OWNER/GITHUB_REPO en env
  // pour juste LISTER les repos accessibles avec le token.
  if (!GITHUB_TOKEN) {
    return res.status(500).json({
      error: 'GITHUB_TOKEN manquant',
      details: 'Connecte ton token GitHub dans le Codex (menu ⋮ → « Connecter GitHub »), ou ajoute GITHUB_TOKEN dans les variables d\'environnement Vercel.'
    });
  }

  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  const { mode, path, file, repo, branch } = req.query;

  // Repo/branche demandés par le front (sélecteur du Codex) — sinon ceux de l'env.
  // Format repo accepté : "owner/nom" (validé serré pour éviter toute injection d'URL).
  let OWNER = GITHUB_OWNER, REPO = GITHUB_REPO, BRANCH = GITHUB_BRANCH;
  if (repo) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
      return res.status(400).json({ error: 'Format de repo invalide (attendu : owner/nom)' });
    }
    const parts = repo.split('/');
    OWNER = parts[0];
    REPO = parts[1];
  }
  if (branch) {
    if (!/^[A-Za-z0-9_./-]{1,120}$/.test(branch)) {
      return res.status(400).json({ error: 'Nom de branche invalide' });
    }
    BRANCH = branch;
  }

  // Les modes qui ciblent un repo précis ont besoin d'un repo : soit choisi dans
  // le sélecteur (?repo=), soit configuré en env. Sinon, message clair.
  const besoinRepo = (mode === 'branches' || mode === 'tree' || file || path);
  if (besoinRepo && (!OWNER || !REPO)) {
    return res.status(400).json({
      error: 'Aucun repo choisi',
      details: 'Choisis un repo dans le sélecteur 🐙 du Codex (ou configure GITHUB_OWNER + GITHUB_REPO en env).'
    });
  }

  try {
    // MODE 0a : lister TOUS les repos accessibles avec le token
    if (mode === 'repos') {
      const reposResp = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member', { headers });
      if (!reposResp.ok) {
        const errText = await reposResp.text();
        return res.status(reposResp.status).json({ error: 'Impossible de lister les repos', details: errText });
      }
      const reposData = await reposResp.json();
      return res.status(200).json({
        total: reposData.length,
        repos: reposData.map(r => ({
          nom: r.full_name,
          prive: r.private,
          branche_defaut: r.default_branch,
          description: r.description || '',
          maj: r.pushed_at
        }))
      });
    }

    // MODE 0b : lister les branches d'un repo
    if (mode === 'branches') {
      const brResp = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/branches?per_page=100`, { headers });
      if (!brResp.ok) {
        const errText = await brResp.text();
        return res.status(brResp.status).json({ error: 'Impossible de lister les branches', details: errText });
      }
      const brData = await brResp.json();
      return res.status(200).json({
        repo: `${OWNER}/${REPO}`,
        total: brData.length,
        branches: brData.map(b => b.name)
      });
    }

    // MODE 1 : lister toute la structure du repo (arbre complet récursif)
    if (mode === 'tree' || (!file && !path)) {
      const branchUrl = `https://api.github.com/repos/${OWNER}/${REPO}/branches/${BRANCH}`;
      const branchResp = await fetch(branchUrl, { headers });

      if (!branchResp.ok) {
        const errText = await branchResp.text();
        return res.status(branchResp.status).json({
          error: 'Impossible de récupérer la branche',
          details: errText
        });
      }

      const branchData = await branchResp.json();
      const treeSha = branchData.commit.sha;

      const treeUrl = `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${treeSha}?recursive=1`;
      const treeResp = await fetch(treeUrl, { headers });

      if (!treeResp.ok) {
        const errText = await treeResp.text();
        return res.status(treeResp.status).json({
          error: 'Impossible de récupérer l\'arbre du repo',
          details: errText
        });
      }

      const treeData = await treeResp.json();

      const fichiers = (treeData.tree || [])
        .filter(item => item.type === 'blob')
        .map(item => ({
          chemin: item.path,
          taille_octets: item.size || 0,
          sha: item.sha
        }));

      const dossiers = (treeData.tree || [])
        .filter(item => item.type === 'tree')
        .map(item => item.path);

      return res.status(200).json({
        repo: `${OWNER}/${REPO}`,
        branche: BRANCH,
        total_fichiers: fichiers.length,
        total_dossiers: dossiers.length,
        tronque: treeData.truncated || false,
        dossiers,
        fichiers
      });
    }

    // MODE 2 : lire le contenu d'un fichier précis
    if (file) {
      const contentUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(file).replace(/%2F/g, '/')}?ref=${BRANCH}`;
      const contentResp = await fetch(contentUrl, { headers });

      if (!contentResp.ok) {
        const errText = await contentResp.text();
        return res.status(contentResp.status).json({
          error: `Fichier introuvable : ${file}`,
          details: errText
        });
      }

      const contentData = await contentResp.json();

      if (Array.isArray(contentData)) {
        // C'est un dossier, pas un fichier
        return res.status(200).json({
          type: 'dossier',
          chemin: file,
          contenu: contentData.map(item => ({
            nom: item.name,
            type: item.type,
            chemin: item.path
          }))
        });
      }

      const decoded = Buffer.from(contentData.content, 'base64').toString('utf-8');

      return res.status(200).json({
        type: 'fichier',
        chemin: file,
        taille_octets: contentData.size,
        sha: contentData.sha,
        contenu: decoded
      });
    }

    return res.status(400).json({
      error: 'Paramètre manquant',
      usage: [
        'GET /api/github-read?mode=tree -> liste tous les fichiers du repo',
        'GET /api/github-read?file=chemin/vers/fichier.js -> contenu d\'un fichier précis'
      ]
    });

  } catch (err) {
    return res.status(500).json({
      error: 'Erreur serveur',
      details: err.message
    });
  }
}
