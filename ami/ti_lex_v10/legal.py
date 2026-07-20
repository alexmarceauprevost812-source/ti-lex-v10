"""
legal.py — Generateur de demarches legales pour une victime de fuite.

Produit des documents PRETS A ENVOYER par la victime elle-meme :
  - Demande d'effacement / retrait (Loi 25 Quebec, PIPEDA federal, RGPD europeen)
  - Instructions de gel de credit (Equifax + TransUnion Canada)
  - Trousse de plainte au Centre antifraude du Canada + police

Ces documents s'appuient sur les infos de LA VICTIME. On ne cible jamais
un individu prive : les entreprises et les autorites sont les destinataires.
Ceci n'est pas un avis juridique; c'est un gabarit a faire valider au besoin.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import List, Optional


@dataclass
class Personne:
    nom_complet: str
    courriel: str
    telephone: str = ""
    adresse: str = ""
    ville_province: str = ""


# --- Lettres d'effacement -----------------------------------------------------

def lettre_effacement(victime: Personne, organisation: str, domaine: str,
                      donnees: List[str], regime: str = "loi25",
                      aujourdhui: Optional[str] = None) -> str:
    """
    Genere une demande d'effacement/retrait des donnees personnelles.
    regime : "loi25" (Quebec), "pipeda" (Canada), "rgpd" (UE).
    """
    d = aujourdhui or date.today().isoformat()
    liste = ", ".join(donnees) if donnees else "mes renseignements personnels"

    fondement = {
        "loi25": (
            "En vertu de la Loi 25 (Loi modernisant des dispositions "
            "legislatives en matiere de protection des renseignements "
            "personnels) et de la Loi sur la protection des renseignements "
            "personnels dans le secteur prive du Quebec, je vous demande le "
            "retrait et la cessation de la diffusion de mes renseignements."
        ),
        "pipeda": (
            "En vertu de la Loi sur la protection des renseignements "
            "personnels et les documents electroniques (LPRPDE / PIPEDA), je "
            "vous demande de retirer mes renseignements personnels et de "
            "cesser leur communication."
        ),
        "rgpd": (
            "Conformement a l'article 17 du Reglement general sur la "
            "protection des donnees (RGPD) — droit a l'effacement — je vous "
            "demande d'effacer sans delai l'ensemble de mes donnees "
            "personnelles."
        ),
    }.get(regime, "")

    autorite = {
        "loi25": "la Commission d'acces a l'information du Quebec (CAI)",
        "pipeda": "le Commissariat a la protection de la vie privee du Canada",
        "rgpd": "l'autorite de protection des donnees competente",
    }.get(regime, "l'autorite competente")

    return f"""Objet : Demande formelle d'effacement de renseignements personnels

Date : {d}
De : {victime.nom_complet}
Courriel : {victime.courriel}{_ligne("Telephone", victime.telephone)}{_ligne("Adresse", victime.adresse)}

A : Responsable de la protection des renseignements personnels
{organisation} ({domaine})

Madame, Monsieur,

J'ai appris que mes renseignements personnels ont ete exposes lors d'un
incident de securite touchant votre organisation. Les renseignements
concernes incluent notamment : {liste}.

{fondement}

Je vous demande donc, dans un delai de 30 jours :
  1. De confirmer quelles donnees me concernant vous detenez;
  2. D'effacer definitivement ces donnees de vos systemes actifs et de vos
     sauvegardes, sauf obligation legale de conservation;
  3. De cesser toute communication de ces donnees a des tiers;
  4. De me confirmer par ecrit que ces mesures ont ete prises.

A defaut de reponse satisfaisante, je porterai plainte aupres de
{autorite}.

Veuillez agreer mes salutations distinguees,

{victime.nom_complet}
"""


# --- Gel de credit ------------------------------------------------------------

def instructions_gel_credit(victime: Personne) -> str:
    d = date.today().isoformat()
    return f"""TROUSSE — GEL / ALERTE DE CREDIT (Canada)
Prepare le {d} pour {victime.nom_complet}

Pourquoi : si ton NAS ou tes infos financieres ont fuite, un gel empeche
qu'on ouvre du credit a ton nom. C'est gratuit et c'est ta meilleure
protection immediate.

1) EQUIFAX CANADA
   - Telephone : 1-800-465-7166
   - En ligne : demande une "alerte a la fraude" et un "gel de securite"
   - Prepare : NAS, deux pieces d'identite, preuve d'adresse.

2) TRANSUNION CANADA
   - Telephone : 1-800-663-9980
   - En ligne : demande une "alerte a la fraude" et un "verrou de credit"
   - Prepare : les memes documents qu'Equifax.

3) SUIVI
   - Demande une copie GRATUITE de ton dossier de credit aux deux bureaux.
   - Verifie chaque ligne : comptes inconnus, demandes de credit non faites.
   - Note la date et le numero de dossier de chaque appel (ci-dessous).

   Equifax  — date : __________  dossier : __________________
   TransUnion — date : __________  dossier : __________________
"""


# --- Dossier de plainte -------------------------------------------------------

def dossier_plainte(victime: Personne, fuites_resume: str,
                    donnees_sensibles: str) -> str:
    d = date.today().isoformat()
    return f"""DOSSIER DE SIGNALEMENT — a remettre aux autorites
Prepare le {d}

VICTIME
  Nom      : {victime.nom_complet}
  Courriel : {victime.courriel}
  Telephone: {victime.telephone or 'n/d'}
  Ville    : {victime.ville_province or 'n/d'}

RESUME DE L'INCIDENT
{fuites_resume}

DONNEES SENSIBLES POTENTIELLEMENT EXPOSEES
{donnees_sensibles}

OU SIGNALER (ce sont EUX qui ont le pouvoir d'enqueter et d'arreter)
  1. Centre antifraude du Canada
     - Telephone : 1-888-495-8501
     - En ligne  : www.antifraudcentre-centreantifraude.ca
  2. Ton service de police local (porte plainte, garde le numero d'evenement)
  3. Si vol d'identite : previens ta banque et les bureaux de credit
  4. Plainte vie privee :
     - Quebec : Commission d'acces a l'information (CAI)
     - Canada : Commissariat a la protection de la vie privee

CONSEILS POUR LE DOSSIER
  - Garde tous les courriels, captures d'ecran et avis de fuite.
  - Note une ligne du temps : quand, quoi, comment tu l'as su.
  - Ne contacte PAS toi-meme un suspect : ca peut nuire a l'enquete et
    t'exposer legalement. Laisse les autorites faire ce travail.

Numero d'evenement police : __________________
Numero de dossier antifraude : __________________
"""


def _ligne(etiquette: str, valeur: str) -> str:
    return f"\n{etiquette} : {valeur}" if valeur else ""
