# app/services/ce_anonymize.py
"""Retire l'identité du client avant d'écrire à un fournisseur d'IA externe.

Les notes de réunion nomment le client et ses interlocuteurs. Le fournisseur
peut conserver (voire entraîner sur) ce qu'on lui envoie : il ne voit donc
que des jetons, `[CLIENT]` ou `[CONTACT_1]`, que l'on remet en clair dans le
texte reçu. Emails, téléphones et SIRET ne servent à rien à la rédaction :
ils sont supprimés sans retour.

Limite assumée : un nom que personne n'a déclaré (un fournisseur du client
cité dans les notes, par exemple) n'est pas détecté. C'est au rédacteur de
ne pas coller ce qu'il ne veut pas voir partir.
"""
from __future__ import annotations

import re
from typing import Iterable

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
# +33 6 12 34 56 78, 06.12.34.56.78, +1 202-555-0100… Un indicatif ou un 0
# initial est exigé : « 2026 2027 2028 » ou un budget ne sont pas des numéros.
_TEL = re.compile(r"(?<![\w/])(?:(?:\+|00)\d{1,3}[\s.()-]*|0)\d(?:[\s.()-]*\d){7,10}(?!\w)")
# SIREN (9 chiffres) et SIRET (14), éventuellement espacés par groupes.
_SIRET = re.compile(r"(?<!\d)\d{3}[ .]?\d{3}[ .]?\d{3}(?:[ .]?\d{5})?(?!\d)")

_FORMES = r"(?:SAS|SASU|SARL|EURL|SA|SNC|SCA|SCOP|SELARL|SCI|Inc\.?|Ltd\.?|GmbH|AG|NV|BV|S\.?A\.?S\.?)"
_FORME_FIN = re.compile(rf"[\s,]+{_FORMES}\s*$", re.IGNORECASE)


def _court(societe: str) -> str:
    """« Acme Recyclage SAS » → « Acme Recyclage » (se lit mieux dans une phrase)."""
    court = _FORME_FIN.sub("", societe).strip()
    return court if len(court) >= 3 else societe


def _motif(texte: str) -> re.Pattern:
    return re.compile(rf"(?<!\w){re.escape(texte)}(?!\w)", re.IGNORECASE)


class Masque:
    def __init__(self, societe: str = "", contacts: Iterable[str] = ()):
        # (texte d'origine, jeton), des plus longs aux plus courts : « Claire
        # Durand » doit être remplacé avant « Durand ».
        self._paires: list[tuple[str, str]] = []
        societe = societe.strip()
        if societe:
            court = _court(societe)
            self._paires.append((societe, "[CLIENT]"))
            if court != societe:
                self._paires.append((court, "[CLIENT]"))
            self._restitution = {"[CLIENT]": court}
        else:
            self._restitution = {}

        n = 0
        for contact in contacts:
            contact = " ".join(contact.split())
            if not contact:
                continue
            n += 1
            jeton = f"[CONTACT_{n}]"
            self._paires.append((contact, jeton))
            self._restitution[jeton] = contact
            # Le nom de famille seul (« M. Durand ») : dernier mot, assez long pour ne pas être un mot courant.
            nom = contact.split()[-1]
            if " " in contact and len(nom) >= 4:
                jeton_nom = f"[NOM_{n}]"
                self._paires.append((nom, jeton_nom))
                self._restitution[jeton_nom] = nom

        self._paires.sort(key=lambda p: len(p[0]), reverse=True)
        self._motifs = [(_motif(t), jeton) for t, jeton in self._paires]

    def masquer(self, texte: str) -> str:
        # Coordonnées d'abord : sinon « claire@acme.fr » deviendrait
        # « claire@[CLIENT].fr » et la partie locale partirait en clair.
        texte = _EMAIL.sub("[EMAIL]", texte)
        texte = _TEL.sub("[TEL]", texte)
        texte = _SIRET.sub("[SIRET]", texte)
        for motif, jeton in self._motifs:
            texte = motif.sub(jeton, texte)
        return texte

    def restaurer(self, texte: str) -> str:
        for jeton, original in self._restitution.items():
            texte = texte.replace(jeton, original)
        return texte

    @staticmethod
    def jetons_restants(texte: str) -> list[str]:
        """Jetons que le modèle a inventés ou que rien n'a pu remettre en clair."""
        return sorted(set(re.findall(r"\[(?:CLIENT|CONTACT_\d+|NOM_\d+|EMAIL|TEL|SIRET)\]", texte)))
