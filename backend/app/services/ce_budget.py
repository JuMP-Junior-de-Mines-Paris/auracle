# app/services/ce_budget.py
"""Budget, échéancier et mise en forme française d'une convention d'étude.

Tout est en Decimal, jamais en float : un centime d'écart entre le tableau
du budget et le tableau de paiement serait un défaut dans un contrat.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from num2words import num2words

from app.services.ce_schema import CEData

CENT = Decimal("0.01")

MOIS = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]


def _round(x: Decimal) -> Decimal:
    return x.quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class PhaseLine:
    index: int          # 1-based
    nom: str
    jeh: int
    prix_jeh: Decimal
    total_ht: Decimal
    debut: int          # semaine de début, 1-based
    duree: int

    @property
    def fin(self) -> int:
        return self.debut + self.duree - 1


@dataclass(frozen=True)
class Computed:
    lines: list[PhaseLine]
    nb_jeh: int
    prix_ht: Decimal        # somme des budgets de phase
    total_ht: Decimal
    taux_tva: Decimal
    tva: Decimal
    total_ttc: Decimal
    acompte_ht: Decimal
    acompte_ttc: Decimal
    intermediaire_ht: Decimal
    intermediaire_ttc: Decimal
    reste_ht: Decimal
    reste_ttc: Decimal
    semaines: int           # durée totale de l'étude


def compute(data: CEData) -> Computed:
    lines: list[PhaseLine] = []
    cursor = 1
    for i, ph in enumerate(data.phases, start=1):
        debut = ph.debut_semaine or cursor
        prix = ph.prix_jeh if ph.prix_jeh is not None else data.budget.prix_jeh
        lines.append(PhaseLine(
            index=i, nom=ph.nom, jeh=ph.jeh, prix_jeh=_round(prix),
            total_ht=_round(prix * ph.jeh), debut=debut, duree=ph.duree_semaines,
        ))
        cursor = debut + ph.duree_semaines

    # Le total HT est exactement la somme des budgets de phase.
    prix_ht = sum((l.total_ht for l in lines), Decimal("0"))
    total_ht = prix_ht
    tva = _round(total_ht * data.budget.taux_tva / 100)
    total_ttc = total_ht + tva

    pay = data.paiement
    acompte_ht = _round(total_ht * pay.acompte_pct / 100)
    acompte_ttc = _round(total_ttc * pay.acompte_pct / 100)
    inter_ht = _round(total_ht * pay.intermediaire_pct / 100)
    inter_ttc = _round(total_ttc * pay.intermediaire_pct / 100)

    return Computed(
        lines=lines,
        nb_jeh=sum(l.jeh for l in lines),
        prix_ht=prix_ht, total_ht=total_ht,
        taux_tva=data.budget.taux_tva, tva=tva, total_ttc=total_ttc,
        acompte_ht=acompte_ht, acompte_ttc=acompte_ttc,
        intermediaire_ht=inter_ht, intermediaire_ttc=inter_ttc,
        # Le solde absorbe les arrondis : la somme des versements fait
        # toujours exactement le total.
        reste_ht=total_ht - acompte_ht - inter_ht,
        reste_ttc=total_ttc - acompte_ttc - inter_ttc,
        semaines=max(l.fin for l in lines),
    )


def fmt_eur(x: Decimal) -> str:
    """1234.5 -> « 1 234,50 » (espace insécable, virgule décimale)."""
    entier, _, cents = f"{_round(x):.2f}".partition(".")
    groupes = f"{int(entier):,}".replace(",", " ")
    return f"{groupes},{cents}"


def fmt_pct(x: Decimal) -> str:
    return f"{x.normalize():f}".replace(".", ",")


def eur_en_lettres(x: Decimal) -> str:
    """1234.5 -> « Mille deux cent trente-quatre euros et cinquante centimes »."""
    x = _round(x)
    euros = int(x)
    centimes = int((x - euros) * 100)
    texte = num2words(euros, lang="fr") + (" euro" if euros == 1 else " euros")
    if centimes:
        texte += " et " + num2words(centimes, lang="fr") + (" centime" if centimes == 1 else " centimes")
    return texte[0].upper() + texte[1:]


def date_fr(d: date) -> str:
    return f"{d.day}{'er' if d.day == 1 else ''} {MOIS[d.month - 1]} {d.year}"
