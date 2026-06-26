// detecteur.qc.js — détecteur de secrets, écrit en langage ti-lex ⚜️
exporte recette detecteSecrets(texte) {
  fixe motifs = ["sk-ant-", "service_role", "ghp_", "github_pat_"];
  soit trouves = [];

  pour (soit i = 0; i < motifs.length; i = i + 1) {
    si (texte.includes(motifs[i])) {
      trouves.push(motifs[i]);
    }
  }

  si (trouves.length > 0) {
    montre("🔴 Secrets détectés:", trouves);
    renvoye vrai;
  } sinon {
    montre("✅ Aucun secret");
    renvoye faux;
  }
}

exporte asynchrone recette scanne(texte) {
  fixe danger = detecteSecrets(texte);
  renvoye danger ou faux;
}
