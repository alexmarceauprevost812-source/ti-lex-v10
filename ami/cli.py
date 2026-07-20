#!/usr/bin/env python3
"""
cli.py — Interface ligne de commande pour TI-LEX-V10.

Exemples :
  python3 cli.py --courriel jean.tremblay@courriel.ca
  python3 cli.py --courriel alex@example.com --nom "Alex Marceau" \\
      --regimes loi25 pipeda --texte "NAS 046-454-286, carte 4539148803436467"
  python3 cli.py --courriel alex@example.com --mode reel   # (cle HIBP requise)
"""

import argparse
import sys

from ti_lex_v10.engine import MoteurTiLex
from ti_lex_v10.legal import Personne


def main(argv=None):
    p = argparse.ArgumentParser(
        description="TI-LEX-V10 — moteur bouclier (detecter, proteger, documenter, referer)."
    )
    p.add_argument("--courriel", required=True, help="Courriel a verifier.")
    p.add_argument("--mode", choices=["demo", "reel"], default="demo",
                   help="demo = hors-ligne (defaut) ; reel = API HIBP (cle requise).")
    p.add_argument("--nom", default="", help="Nom complet de la victime (pour les lettres).")
    p.add_argument("--telephone", default="", help="Telephone de la victime.")
    p.add_argument("--adresse", default="", help="Adresse de la victime.")
    p.add_argument("--ville", default="", help="Ville / province.")
    p.add_argument("--texte", default="",
                   help="Texte brut a scanner pour donnees sensibles (NAS, carte, etc.).")
    p.add_argument("--regimes", nargs="+", default=["loi25"],
                   choices=["loi25", "pipeda", "rgpd"],
                   help="Regime(s) legal pour les lettres d'effacement.")
    p.add_argument("--sans-documents", action="store_true",
                   help="N'ecrit pas les fichiers, affiche seulement le rapport.")
    args = p.parse_args(argv)

    victime = None
    if args.nom:
        victime = Personne(
            nom_complet=args.nom, courriel=args.courriel,
            telephone=args.telephone, adresse=args.adresse,
            ville_province=args.ville,
        )

    moteur = MoteurTiLex(mode=args.mode)
    try:
        res = moteur.analyser(
            identifiant=args.courriel,
            victime=victime,
            texte_a_scanner=args.texte,
            regimes=args.regimes,
            generer_documents=not args.sans_documents,
        )
    except RuntimeError as e:
        print(f"Erreur : {e}", file=sys.stderr)
        return 1

    print(res.rapport)
    if res.fichiers_generes:
        print("\nDocuments generes :")
        for f in res.fichiers_generes:
            print(f"  - {f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
