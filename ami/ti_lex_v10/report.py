"""
report.py — Mise en forme du rapport de scan (texte lisible).
"""

from typing import List
from .scanner import Fuite
from .detectors import Trouvaille, resume_par_type


_ETOILES = {"faible": "*", "moyenne": "**", "elevee": "***", "critique": "****"}


def rapport_texte(identifiant: str, fuites: List[Fuite],
                  trouvailles: List[Trouvaille], mode: str) -> str:
    lignes = []
    lignes.append("=" * 64)
    lignes.append("  TI-LEX-V10 — RAPPORT DE SCAN (BOUCLIER)")
    lignes.append("=" * 64)
    lignes.append(f"  Identifiant scanne : {identifiant}")
    lignes.append(f"  Mode               : {mode.upper()}")
    lignes.append("")

    # Fuites
    lignes.append("-" * 64)
    lignes.append(f"  FUITES CONNUES TROUVEES : {len(fuites)}")
    lignes.append("-" * 64)
    if not fuites:
        lignes.append("  Bonne nouvelle : aucune fuite connue pour cet identifiant.")
    else:
        for f in sorted(fuites, key=lambda x: x.date, reverse=True):
            grav = _ETOILES.get(f.gravite, "")
            statut = "verifiee" if f.verifie else "non verifiee"
            lignes.append(f"  [{f.gravite.upper():8} {grav:4}] {f.nom}  ({f.date}, {statut})")
            lignes.append(f"      Domaine : {f.domaine}")
            lignes.append(f"      Comptes touches : {f.comptes_touches:,}".replace(",", " "))
            lignes.append(f"      Donnees exposees : {', '.join(f.donnees_exposees)}")
            lignes.append("")

    # Donnees sensibles detectees dans le texte fourni
    if trouvailles:
        lignes.append("-" * 64)
        lignes.append(f"  DONNEES SENSIBLES DETECTEES (dans le texte fourni)")
        lignes.append("-" * 64)
        for t, n in resume_par_type(trouvailles).items():
            lignes.append(f"  - {t} : {n}")
        lignes.append("")
        lignes.append("  Detail (valeurs masquees) :")
        for t in trouvailles:
            drapeau = "valide" if t.valide else "a verifier"
            lignes.append(f"    [{drapeau:10}] {t.type:14} {t.valeur_masquee}")
        lignes.append("")

    # Recommandations
    lignes.append("-" * 64)
    lignes.append("  PROCHAINES ETAPES RECOMMANDEES")
    lignes.append("-" * 64)
    critique = any(f.gravite in ("critique", "elevee") for f in fuites)
    if critique:
        lignes.append("  ! Gravite elevee : fais un gel de credit SANS TARDER.")
    lignes.append("  1. Change les mots de passe des comptes touches.")
    lignes.append("  2. Active la double authentification (2FA) partout.")
    lignes.append("  3. Envoie les demandes d'effacement generees (dossier /rapports).")
    lignes.append("  4. Fais un gel de credit (Equifax + TransUnion).")
    lignes.append("  5. Signale au Centre antifraude du Canada + police locale.")
    lignes.append("")
    lignes.append("  Rappel : TI-LEX ne contacte jamais un suspect ni un systeme")
    lignes.append("  tiers. On documente et on remet le dossier aux autorites.")
    lignes.append("=" * 64)
    return "\n".join(lignes)
