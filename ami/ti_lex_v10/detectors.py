"""
detectors.py — Detection de donnees sensibles dans un texte.

Reconnait : NAS (numero d'assurance sociale canadien, valide par Luhn),
cartes de credit (Luhn), courriels, numeros de telephone nord-americains,
adresses IP, et codes postaux canadiens.

Aucune donnee n'est envoyee nulle part : tout se fait localement.
"""

import re
from dataclasses import dataclass, field
from typing import List


@dataclass
class Trouvaille:
    """Une donnee sensible reperee dans un texte."""
    type: str            # ex: "NAS", "carte_credit", "courriel"
    valeur: str          # la valeur brute reperee
    valeur_masquee: str  # version masquee, safe a afficher/loguer
    valide: bool         # a passe la validation (Luhn) quand applicable
    contexte: str = ""   # petit bout de texte autour, pour le rapport


def _luhn_valide(chiffres: str) -> bool:
    """Algorithme de Luhn : utilise pour le NAS et les cartes de credit."""
    chiffres = re.sub(r"\D", "", chiffres)
    if not chiffres:
        return False
    total = 0
    inverse = chiffres[::-1]
    for i, c in enumerate(inverse):
        n = int(c)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


def _masque(valeur: str, garder_fin: int = 4) -> str:
    """Masque une valeur sensible en ne gardant que les derniers chiffres."""
    nettoye = re.sub(r"\s|-", "", valeur)
    if len(nettoye) <= garder_fin:
        return "*" * len(nettoye)
    return "*" * (len(nettoye) - garder_fin) + nettoye[-garder_fin:]


# --- Expressions regulieres ---------------------------------------------------

_RE = {
    "NAS": re.compile(r"\b(\d{3}[-\s]?\d{3}[-\s]?\d{3})\b"),
    "carte_credit": re.compile(r"\b(?:\d[ -]?){13,19}\b"),
    "courriel": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    "telephone": re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
    "adresse_ip": re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
    "code_postal": re.compile(r"\b[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d\b"),
}


def _contexte(texte: str, debut: int, fin: int, marge: int = 25) -> str:
    a = max(0, debut - marge)
    b = min(len(texte), fin + marge)
    extrait = texte[a:b].replace("\n", " ").strip()
    return f"...{extrait}..."


def detecter(texte: str) -> List[Trouvaille]:
    """Retourne la liste des donnees sensibles trouvees dans `texte`."""
    trouvailles: List[Trouvaille] = []
    deja_vu = set()

    for type_, regex in _RE.items():
        for m in regex.finditer(texte):
            brut = m.group(0)
            cle = (type_, re.sub(r"\D", "", brut) or brut)
            if cle in deja_vu:
                continue

            valide = True
            if type_ == "NAS":
                num = re.sub(r"\D", "", brut)
                if len(num) != 9:
                    continue
                valide = _luhn_valide(num)
            elif type_ == "carte_credit":
                num = re.sub(r"\D", "", brut)
                if not (13 <= len(num) <= 19):
                    continue
                valide = _luhn_valide(num)
                # evite de confondre un NAS (9 chiffres) avec une carte
                if len(num) == 9:
                    continue
            elif type_ == "adresse_ip":
                if any(int(o) > 255 for o in brut.split(".")):
                    continue

            deja_vu.add(cle)
            masque = _masque(brut) if type_ in ("NAS", "carte_credit", "telephone") else brut
            trouvailles.append(
                Trouvaille(
                    type=type_,
                    valeur=brut,
                    valeur_masquee=masque,
                    valide=valide,
                    contexte=_contexte(texte, m.start(), m.end()),
                )
            )

    return trouvailles


def resume_par_type(trouvailles: List[Trouvaille]) -> dict:
    """Compte les trouvailles par type."""
    resume = {}
    for t in trouvailles:
        resume.setdefault(t.type, 0)
        resume[t.type] += 1
    return resume


if __name__ == "__main__":
    demo = (
        "Contact: jean.tremblay@courriel.ca, tel 514-555-0142. "
        "NAS 046-454-286 (valide Luhn). Carte 4539 1488 0343 6467. "
        "IP 192.168.10.34, code postal H2X 1Y4."
    )
    for t in detecter(demo):
        drapeau = "OK" if t.valide else "??"
        print(f"[{drapeau}] {t.type:14} {t.valeur_masquee}")
