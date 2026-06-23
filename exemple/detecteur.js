// ⚙️ Généré par tilexc depuis exemple/detecteur.qc.js — ne pas éditer à la main
// detecteur.qc.js — détecteur de secrets, écrit en langage ti-lex ⚜️
export function detecteSecrets(texte) {
  const motifs = ["sk-ant-", "service_role", "ghp_", "github_pat_"];
  let trouves = [];

  for (let i = 0; i < motifs.length; i = i + 1) {
    if (texte.includes(motifs[i])) {
      trouves.push(motifs[i]);
    }
  }

  if (trouves.length > 0) {
    console.log("🔴 Secrets détectés:", trouves);
    return true;
  } else {
    console.log("✅ Aucun secret");
    return false;
  }
}

export async function scanne(texte) {
  const danger = detecteSecrets(texte);
  return danger || false;
}
