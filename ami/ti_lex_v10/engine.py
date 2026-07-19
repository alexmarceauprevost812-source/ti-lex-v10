"""
engine.py — Orchestrateur du moteur TI-LEX-V10.

Relie : detection de donnees sensibles + scan de fuites + generation des
demarches legales + rapport. Produit un dossier complet sur disque.
"""

import os
from dataclasses import dataclass, field
from datetime import date
from typing import List, Optional

from . import detectors, legal, report
from .scanner import Scanner, Fuite


@dataclass
class ResultatScan:
    identifiant: str
    fuites: List[Fuite]
    trouvailles: List[detectors.Trouvaille]
    rapport: str
    fichiers_generes: List[str] = field(default_factory=list)


class MoteurTiLex:
    def __init__(self, mode: str = "demo", dossier_sortie: Optional[str] = None,
                 cle_api: Optional[str] = None):
        self.mode = mode
        self.scanner = Scanner(mode=mode, cle_api=cle_api)
        if dossier_sortie is None:
            base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            dossier_sortie = os.path.join(base, "rapports")
        self.dossier_sortie = dossier_sortie
        os.makedirs(self.dossier_sortie, exist_ok=True)

    def analyser(self, identifiant: str, victime: Optional[legal.Personne] = None,
                 texte_a_scanner: str = "", regimes: Optional[List[str]] = None,
                 generer_documents: bool = True) -> ResultatScan:
        """
        identifiant     : courriel de la personne a verifier.
        victime         : infos pour personnaliser les lettres (optionnel).
        texte_a_scanner : texte brut ou chercher des donnees sensibles.
        regimes         : liste parmi "loi25", "pipeda", "rgpd".
        """
        regimes = regimes or ["loi25"]
        fuites = self.scanner.scanner_identifiant(identifiant)
        trouvailles = detectors.detecter(texte_a_scanner) if texte_a_scanner else []
        txt = report.rapport_texte(identifiant, fuites, trouvailles, self.mode)

        resultat = ResultatScan(
            identifiant=identifiant,
            fuites=fuites,
            trouvailles=trouvailles,
            rapport=txt,
        )

        if generer_documents:
            resultat.fichiers_generes = self._generer_documents(
                identifiant, fuites, trouvailles, victime, regimes
            )
        return resultat

    def _generer_documents(self, identifiant, fuites, trouvailles, victime, regimes):
        fichiers = []
        stamp = date.today().isoformat()
        prefixe = identifiant.split("@")[0].replace(".", "_")
        base = os.path.join(self.dossier_sortie, f"{prefixe}_{stamp}")
        os.makedirs(base, exist_ok=True)

        # Rapport
        chemin = os.path.join(base, "00_rapport.txt")
        with open(chemin, "w", encoding="utf-8") as f:
            f.write(report.rapport_texte(identifiant, fuites, trouvailles, self.mode))
        fichiers.append(chemin)

        if victime is None:
            victime = legal.Personne(nom_complet="[VOTRE NOM]", courriel=identifiant)

        # Lettres d'effacement (une par fuite x par regime demande)
        n = 1
        for fuite in fuites:
            for regime in regimes:
                lettre = legal.lettre_effacement(
                    victime, fuite.nom, fuite.domaine, fuite.donnees_exposees, regime
                )
                nomf = f"{n:02d}_effacement_{fuite.nom}_{regime}.txt"
                chemin = os.path.join(base, nomf)
                with open(chemin, "w", encoding="utf-8") as f:
                    f.write(lettre)
                fichiers.append(chemin)
                n += 1

        # Gel de credit
        chemin = os.path.join(base, "90_gel_credit.txt")
        with open(chemin, "w", encoding="utf-8") as f:
            f.write(legal.instructions_gel_credit(victime))
        fichiers.append(chemin)

        # Dossier de plainte
        resume = "\n".join(
            f"  - {x.nom} ({x.date}) : {', '.join(x.donnees_exposees)} "
            f"[gravite {x.gravite}]" for x in fuites
        ) or "  (aucune fuite connue trouvee au scan)"
        sensibles = "\n".join(
            f"  - {t.type} : {t.valeur_masquee}" for t in trouvailles
        ) or "  (aucune donnee sensible detectee dans le texte fourni)"
        chemin = os.path.join(base, "91_dossier_plainte.txt")
        with open(chemin, "w", encoding="utf-8") as f:
            f.write(legal.dossier_plainte(victime, resume, sensibles))
        fichiers.append(chemin)

        return fichiers
