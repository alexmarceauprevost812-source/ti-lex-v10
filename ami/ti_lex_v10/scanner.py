"""
scanner.py — Scan de fuites de donnees connues.

Deux modes :
  1) MODE DEMO (par defaut) : cherche dans un jeu de donnees local et fictif.
     Sert a tester le moteur sans cle API ni acces reseau.
  2) MODE REEL : se branche sur une source legitime de fuites connues,
     comme l'API "Have I Been Pwned" (HIBP). Il faut une cle API valide.

IMPORTANT — cadre legal :
Ce module consulte UNIQUEMENT des bases publiques de fuites deja recensees.
Il n'acquiert, ne scanne et n'accede JAMAIS a un systeme tiers. C'est
l'equivalent de demander a un bureau de credit "mes infos ont-elles fuite ?".
"""

import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional


@dataclass
class Fuite:
    """Une fuite de donnees dans laquelle un identifiant apparait."""
    source: str
    nom: str
    domaine: str
    date: str
    comptes_touches: int
    donnees_exposees: List[str]
    verifie: bool
    gravite: str = "moyenne"  # calculee: faible / moyenne / elevee / critique

    def calculer_gravite(self) -> str:
        sensibles = {"numeros_assurance", "cartes_credit", "adresses",
                     "mots_de_passe", "sante", "numeros_assurance_sociale"}
        touche = set(self.donnees_exposees) & sensibles
        if "numeros_assurance" in touche or "cartes_credit" in touche or "sante" in touche:
            self.gravite = "critique"
        elif "mots_de_passe" in touche or "adresses" in touche:
            self.gravite = "elevee"
        elif self.comptes_touches > 1_000_000:
            self.gravite = "moyenne"
        else:
            self.gravite = "faible"
        return self.gravite


class Scanner:
    def __init__(self, mode: str = "demo", chemin_demo: Optional[str] = None,
                 cle_api: Optional[str] = None):
        """
        mode      : "demo" (hors-ligne) ou "reel" (API HIBP).
        chemin_demo : chemin vers le JSON de demo.
        cle_api   : cle API pour le mode reel (ou variable env HIBP_API_KEY).
        """
        self.mode = mode
        self.cle_api = cle_api or os.environ.get("HIBP_API_KEY")
        if chemin_demo is None:
            base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            chemin_demo = os.path.join(base, "data", "demo_breaches.json")
        self.chemin_demo = chemin_demo

    def scanner_identifiant(self, identifiant: str) -> List[Fuite]:
        """Retourne la liste des fuites ou `identifiant` (courriel) apparait."""
        if self.mode == "reel":
            return self._scan_reel(identifiant)
        return self._scan_demo(identifiant)

    # --- Mode demo ------------------------------------------------------------
    def _scan_demo(self, identifiant: str) -> List[Fuite]:
        with open(self.chemin_demo, "r", encoding="utf-8") as f:
            data = json.load(f)
        resultats: List[Fuite] = []
        ident = identifiant.strip().lower()
        for b in data.get("breaches", []):
            comptes = [c.lower() for c in b.get("comptes", [])]
            if ident in comptes:
                fuite = Fuite(
                    source="DEMO",
                    nom=b["nom"],
                    domaine=b["domaine"],
                    date=b["date"],
                    comptes_touches=b["comptes_touches"],
                    donnees_exposees=b["donnees_exposees"],
                    verifie=b["verifie"],
                )
                fuite.calculer_gravite()
                resultats.append(fuite)
        return resultats

    # --- Mode reel (HIBP) -----------------------------------------------------
    def _scan_reel(self, identifiant: str) -> List[Fuite]:
        """
        Branchement sur l'API Have I Been Pwned.
        Necessite `requests` et une cle API (self.cle_api).
        Doc: https://haveibeenpwned.com/API/v3
        """
        if not self.cle_api:
            raise RuntimeError(
                "Mode reel demande mais aucune cle API HIBP fournie. "
                "Definis HIBP_API_KEY ou passe cle_api=..."
            )
        try:
            import requests
        except ImportError as e:
            raise RuntimeError("Le module 'requests' est requis pour le mode reel.") from e

        url = f"https://haveibeenpwned.com/api/v3/breachedaccount/{identifiant}"
        headers = {
            "hibp-api-key": self.cle_api,
            "user-agent": "ti-lex-v10-bouclier",
        }
        params = {"truncateResponse": "false"}
        r = requests.get(url, headers=headers, params=params, timeout=20)
        if r.status_code == 404:
            return []  # aucune fuite trouvee
        r.raise_for_status()

        resultats: List[Fuite] = []
        for b in r.json():
            classes = [c.lower() for c in b.get("DataClasses", [])]
            fuite = Fuite(
                source="HIBP",
                nom=b.get("Name", "?"),
                domaine=b.get("Domain", ""),
                date=b.get("BreachDate", ""),
                comptes_touches=b.get("PwnCount", 0),
                donnees_exposees=classes,
                verifie=b.get("IsVerified", False),
            )
            fuite.calculer_gravite()
            resultats.append(fuite)
        return resultats


if __name__ == "__main__":
    s = Scanner(mode="demo")
    for f in s.scanner_identifiant("jean.tremblay@courriel.ca"):
        print(f"[{f.gravite.upper():8}] {f.nom} ({f.date}) — {', '.join(f.donnees_exposees)}")
