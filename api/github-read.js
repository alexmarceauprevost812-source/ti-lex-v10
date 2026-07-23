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

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_OWNER = process.env.GITHUB_OWNER;
  const GITHUB_REPO = process.env.GITHUB_REPO;
  const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return res.status(500).json({
      error: 'Configuration manquante',
      details: 'Il faut GITHUB_TOKEN, GITHUB_OWNER et GITHUB_REPO dans les variables d\'environnement Vercel.'
    });
  }

  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  const { mode, path, file } = req.query;

  try {
    // MODE 1 : lister toute la structure du repo (arbre complet récursif)
    if (mode === 'tree' || (!file && !path)) {
      const branchUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/branches/${GITHUB_BRANCH}`;
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

      const treeUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees/${treeSha}?recursive=1`;
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
        repo: `${GITHUB_OWNER}/${GITHUB_REPO}`,
        branche: GITHUB_BRANCH,
        total_fichiers: fichiers.length,
        total_dossiers: dossiers.length,
        tronque: treeData.truncated || false,
        dossiers,
        fichiers
      });
    }

    // MODE 2 : lire le contenu d'un fichier précis
    if (file) {
      const contentUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(file).replace(/%2F/g, '/')}?ref=${GITHUB_BRANCH}`;
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
