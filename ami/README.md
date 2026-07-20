# TI-LEX-V10 — Moteur bouclier

Moteur Python **légal et défensif** pour aider une victime de fuite de données.
Sa job : **détecter, protéger, documenter, référer.** Rien d'autre.

## Ce que le moteur fait

1. **Scan de fuites** — vérifie si un courriel apparaît dans des fuites de
   données déjà recensées (mode démo hors-ligne inclus; branchement possible
   sur l'API légitime *Have I Been Pwned*).
2. **Détection de données sensibles** — repère NAS (validé par Luhn), cartes de
   crédit, courriels, téléphones, IP, codes postaux dans un texte, et affiche
   des valeurs **masquées** (jamais en clair dans les logs).
3. **Démarches légales** — génère des documents prêts à envoyer :
   - lettres d'effacement (Loi 25 Québec, PIPEDA Canada, RGPD Europe);
   - trousse de gel de crédit (Equifax + TransUnion);
   - dossier de plainte pour le Centre antifraude du Canada + police.

## Ce que le moteur NE fait PAS (et ne fera jamais)

Par design, TI-LEX **n'accède à aucun système tiers**, ne trace personne, ne
supprime rien sur le serveur de quelqu'un d'autre et ne contacte aucun suspect.
Ces actions sont illégales (accès non autorisé) et relèvent de la police et des
tribunaux. Le moteur monte le dossier; **les autorités font les arrestations.**

## Utilisation

```bash
# Mode démo (aucune dépendance, aucun réseau)
python3 cli.py --courriel jean.tremblay@courriel.ca --nom "Alex Marceau" \
    --regimes loi25 pipeda \
    --texte "Mon NAS 046-454-286 pis ma carte 4539 1488 0343 6467 ont fuité"

# Mode réel (API HIBP — nécessite une clé)
export HIBP_API_KEY="ta_cle"
python3 cli.py --courriel alex@example.com --mode reel
```

Les documents sont écrits dans `rapports/<courriel>_<date>/`.

## Structure

```
ami/
  cli.py                  interface ligne de commande
  requirements.txt
  data/demo_breaches.json jeu de démo FICTIF (à remplacer en prod)
  rapports/               sorties générées
  ti_lex_v10/
    detectors.py          détection + validation Luhn
    scanner.py            scan de fuites (démo + HIBP)
    legal.py              gabarits légaux
    report.py             mise en forme du rapport
    engine.py             orchestrateur
```

## Note importante

Les gabarits légaux ne sont **pas un avis juridique**. Pour un cas réel, fais-les
valider par un juriste ou une clinique d'aide. Le jeu de données de démo est
**fictif** : branche une source légitime avant tout usage réel.
