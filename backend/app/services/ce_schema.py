# app/services/ce_schema.py
"""Données d'une convention d'étude : ce que le chef de projet remplit.

Le même objet sert à l'export DOCX et, plus tard, à la sauvegarde dans
ce_documents.ce_data (donc à l'indexation RAG). Les champs de prose peuvent
être rédigés à la main ou générés par l'IA ; `reviews` garde la trace de
l'origine de chacun, et l'export refuse tout texte IA qui n'a pas été relu.
"""
from __future__ import annotations

import re
from datetime import date
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel as _PydanticBase
from pydantic import ConfigDict, Field, field_validator, model_validator

from app.services.ce_globals import DEFAUTS, JEH_MAX as _MAX, JEH_MIN as _MIN, PRESIDENT

# Ce que Word et les PDF laissent dans un copier-coller : caractères de
# contrôle, espaces de largeur nulle, « non-caractères ». Le XML d'un .docx
# les interdit, et un seul suffit à faire échouer toute la génération.
_ILLEGAUX = re.compile("[\x00-\x08\x0e-\x1f\x7f\ud800-\udfff\ufdd0-\ufdef\ufffe\uffff]")
_INVISIBLES = re.compile("[\u200b-\u200d\u2060\ufeff]")


def nettoyer(texte: str) -> str:
    texte = texte.replace("\r\n", "\n").replace("\r", "\n")
    texte = texte.replace("\x0b", "\n").replace("\x0c", "\n")   # retour de ligne Word, saut de page
    return _ILLEGAUX.sub("", _INVISIBLES.sub("", texte))


class BaseModel(_PydanticBase):
    # Un espace de trop dans un nom de société finit tel quel dans un contrat.
    model_config = ConfigDict(str_strip_whitespace=True)

    @field_validator("*", mode="before")
    @classmethod
    def _texte_propre(cls, v):
        return nettoyer(v) if isinstance(v, str) else v


class Personne(BaseModel):
    titre: Literal["Monsieur", "Madame"] = "Monsieur"
    prenom: str = Field(default="", max_length=80)
    nom: str = Field(default="", max_length=80)
    fonction: str = Field(default="", max_length=120)
    email: str = Field(default="", max_length=200)

    @property
    def nom_complet(self) -> str:
        return f"{self.prenom} {self.nom}".strip()


class Client(BaseModel):
    societe: str = Field(min_length=1, max_length=200)
    adresse: str = Field(default="", max_length=300)
    code_postal: str = Field(default="", max_length=20)
    ville: str = Field(default="", max_length=100)
    pays: str = Field(default=DEFAUTS["pays"], max_length=100)
    siret: str = Field(default="", max_length=30)
    representant: Personne
    # Change la clause de litiges (article 13) : tribunal compétent différent.
    type_client: Literal["entreprise", "administration_publique", "junior_sous_traitance"] = "entreprise"
    # L'interlocuteur du quotidien n'est pas toujours le signataire. Vide :
    # on retombe sur le représentant.
    interlocuteur: Optional[Personne] = None


class ChefDeProjet(Personne):
    formation: str = Field(
        default="", max_length=200,
        description="Ex. : Étudiant en deuxième année à l'École des Mines de Paris",
    )
    # Le chef de projet change à la fin de son mandat ; la convention le dit.
    fin_mandat: str = Field(default="", max_length=60, description="Ex. : janvier 2027")


class Intervenant(BaseModel):
    titre: Literal["Monsieur", "Madame"] = "Monsieur"     # accorde « étudiant(e) »
    prenom: str = Field(default="", max_length=80)
    nom: str = Field(default="", max_length=80)
    annee: str = Field(min_length=1, max_length=40, description="Ex. : deuxième")
    qualification: str = Field(default="", max_length=200)

    @property
    def nom_complet(self) -> str:
        return f"{self.prenom} {self.nom}".strip()


class Phase(BaseModel):
    nom: str = Field(min_length=1, max_length=200)
    # Le JEH est indivisible (règle des Junior-Entreprises) : jamais de demi.
    jeh: int = Field(ge=1, le=1000)
    description: str = ""
    duree_semaines: int = Field(ge=1, le=52)
    # None : la phase démarre quand la précédente se termine.
    debut_semaine: Optional[int] = Field(default=None, ge=1, le=104)
    # None : prix unitaire du budget.
    prix_jeh: Optional[Decimal] = None

    @field_validator("prix_jeh")
    @classmethod
    def _prix_jeh(cls, v):
        return None if v is None else _jeh_dans_la_fourchette(v)


class PointDeControle(BaseModel):
    nom: str = Field(default="", max_length=200)
    format: str = Field(min_length=1, max_length=200, description="Word, PPT, image…")
    requis_avant_phase: Optional[int] = Field(default=None, ge=1)


# Règle de la Junior : un JEH facturé au client vaut entre 80 et 450 € HT
# (rappel inscrit dans le modèle de convention).
JEH_MIN, JEH_MAX = Decimal(_MIN), Decimal(_MAX)


def _jeh_dans_la_fourchette(prix: Decimal) -> Decimal:
    if not JEH_MIN <= prix <= JEH_MAX:
        raise ValueError(f"le prix d'un JEH doit être compris entre {JEH_MIN} et {JEH_MAX} € HT")
    return prix


class Budget(BaseModel):
    prix_jeh: Decimal = Decimal(DEFAUTS["prix_jeh"])
    # Le total HT est la somme des budgets de phase : aucun frais ne s'y ajoute.
    # (« frais_structure » reçu d'un ancien brouillon est ignoré.)
    frais_mode: Literal["reel", "forfait"] = "reel"
    taux_tva: Decimal = Field(default=Decimal(DEFAUTS["taux_tva"]), ge=0, le=100)

    @field_validator("prix_jeh")
    @classmethod
    def _prix_jeh(cls, v):
        return _jeh_dans_la_fourchette(v)


class Paiement(BaseModel):
    acompte_pct: Decimal = Field(default=Decimal(DEFAUTS["acompte_pct"]), ge=0, le=100)
    # 0 : pas de versement intermédiaire, la colonne disparaît du tableau.
    intermediaire_pct: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    livrable_intermediaire: str = Field(default="", max_length=200)

    @model_validator(mode="after")
    def _total_inferieur_a_cent(self):
        if self.acompte_pct + self.intermediaire_pct > 100:
            raise ValueError("acompte + intermédiaire ne peuvent dépasser 100 %")
        return self


class FieldReview(BaseModel):
    origin: Literal["manual", "ai"] = "manual"
    reviewed: bool = False


class CEData(BaseModel):
    ref_ce: str = Field(min_length=1, max_length=60)
    reference_etude: str = Field(min_length=1, max_length=300, description="Titre de l'étude")
    date_redaction: date
    validite_mois: int = Field(default=DEFAUTS["validite_mois"], ge=1, le=36)

    client: Client
    # Variable globale (ce_globals.PRESIDENT) : le formulaire ne le saisit pas.
    president: Personne = Field(default_factory=lambda: Personne(**PRESIDENT))
    chef_projet: ChefDeProjet
    intervenants: list[Intervenant] = Field(default_factory=list)

    # Prose : rédigée à la main aujourd'hui, par l'IA (Mistral) demain.
    exemples: str = ""
    contexte: str = ""
    existant: str = ""
    resume_cdc: str = ""
    cdc: str = ""

    phases: list[Phase] = Field(min_length=1, max_length=20)
    points_controle: list[PointDeControle] = Field(default_factory=list, max_length=20)

    budget: Budget
    paiement: Paiement = Field(default_factory=Paiement)

    # Clé : chemin du champ ("contexte", "phases.0.description"…).
    reviews: dict[str, FieldReview] = Field(default_factory=dict)

    @field_validator("president", mode="before")
    @classmethod
    def _president_par_defaut(cls, v):
        vide = v is None or (isinstance(v, dict) and not any(
            str(v.get(k) or "").strip() for k in ("prenom", "nom")))
        return dict(PRESIDENT) if vide else v

    @model_validator(mode="after")
    def _coherence(self):
        n = len(self.phases)
        for pc in self.points_controle:
            if pc.requis_avant_phase is not None and pc.requis_avant_phase > n:
                raise ValueError(
                    f"point de contrôle requis avant la phase {pc.requis_avant_phase}, "
                    f"mais il n'y a que {n} phase(s)"
                )
        return self

    @model_validator(mode="after")
    def _duree_raisonnable(self):
        debut, fins = 1, []
        for ph in self.phases:
            d = ph.debut_semaine or debut
            fins.append(d + ph.duree_semaines - 1)
            debut = d + ph.duree_semaines
        if max(fins) > 52:
            raise ValueError(f"l'étude dure {max(fins)} semaines : le planning est limité à 52")
        return self


# Sections sans lesquelles la convention n'a pas de sens pour le client.
REQUIRED_PROSE = {
    "contexte": "Contexte et problématique",
    "existant": "Étude de l'existant",
    "resume_cdc": "Résumé du cahier des charges",
    "cdc": "Cahier des charges détaillé",
}


def unreviewed_ai_fields(data: CEData) -> list[str]:
    """Champs produits par l'IA que personne n'a relus.

    Règle métier : un texte généré ne part jamais chez le client sans
    qu'un membre l'ait validé. Le contrôle est ici, côté serveur — la case
    cochée dans l'interface ne suffit pas.
    """
    return sorted(
        key for key, review in data.reviews.items()
        if review.origin == "ai" and not review.reviewed
    )


def missing_required_fields(data: CEData) -> list[str]:
    missing = [label for key, label in REQUIRED_PROSE.items() if not getattr(data, key).strip()]
    missing += [
        f"Description de la phase {i + 1}"
        for i, p in enumerate(data.phases) if not p.description.strip()
    ]
    # Identités et adresse : sans elles, le contrat porte des blancs là où
    # figurent les parties.
    cl = data.client
    for label, value in (
        ("Adresse du client", cl.adresse), ("Code postal du client", cl.code_postal),
        ("Ville du client", cl.ville),
        ("Prénom du représentant du client", cl.representant.prenom),
        ("Nom du représentant du client", cl.representant.nom),
        ("Fonction du représentant du client", cl.representant.fonction),
        ("Prénom du président JuMP", data.president.prenom),
        ("Nom du président JuMP", data.president.nom),
        ("Prénom du chef de projet", data.chef_projet.prenom),
        ("Nom du chef de projet", data.chef_projet.nom),
        ("Email du chef de projet", data.chef_projet.email),
        ("Formation du chef de projet", data.chef_projet.formation),
    ):
        if not value.strip():
            missing.append(label)
    if not data.intervenants:
        missing.append("Au moins un intervenant")
    for i, iv in enumerate(data.intervenants, start=1):
        if not iv.prenom.strip():
            missing.append(f"Prénom de l'intervenant {i}")
        if not iv.nom.strip():
            missing.append(f"Nom de l'intervenant {i}")
    return missing
