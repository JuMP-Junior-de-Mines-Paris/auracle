# app/services/ce_archive.py
"""Enregistre une convention d'étude et la range dans les archives.

Une convention = une ligne de ce_documents (le contenu complet) + une
mission archivée de catégorie « convention_etude » (ce qu'on voit dans
Archives). La référence de la convention identifie l'une et l'autre :
enregistrer deux fois « CE-2026-014 » met à jour la même mission au lieu
d'en créer une seconde.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from app.db import get_supabase_client
from app.services.ce_budget import compute
from app.services.ce_schema import CEData

logger = logging.getLogger(__name__)

CATEGORIE = "convention_etude"


@dataclass(frozen=True)
class Archived:
    ce_id: str
    mission_id: str
    created: bool


def _nom(p) -> str:
    return " ".join(x for x in (p.prenom, p.nom) if x)


def mission_fields(data: CEData) -> dict:
    """Ce que la convention apprend à la fiche mission (titre, client, budget…)."""
    contact = data.client.interlocuteur or data.client.representant
    chef = _nom(data.chef_projet)
    description = f"Convention d'étude {data.ref_ce}."
    if chef:
        description += f" Chef de projet : {chef}."
    return {
        "title": f"{data.ref_ce} — {data.reference_etude}"[:300],
        "description": description,
        "client_name": data.client.societe,
        "client_contact_name": _nom(contact) or None,
        "client_contact_email": contact.email or None,
        "budget": str(compute(data).total_ht),
    }


def archive(data: CEData, user_id: str) -> Archived:
    """Crée ou met à jour la convention et sa mission archivée."""
    sb = get_supabase_client()
    contenu = data.model_dump(mode="json")
    champs = mission_fields(data)

    existant = (
        sb.table("ce_documents").select("id, mission_id").eq("ref_ce", data.ref_ce).limit(1).execute().data
    )
    if existant:
        ce_id, mission_id = existant[0]["id"], existant[0]["mission_id"]
        sb.table("ce_documents").update({"ce_data": contenu}).eq("id", ce_id).execute()
        if mission_id:
            # Le statut n'est pas touché : la mission a pu être réactivée à la main.
            maj = sb.table("missions").update(champs).eq("id", mission_id).execute().data
            if maj:
                return Archived(ce_id, mission_id, created=False)
        # Mission supprimée depuis : on en recrée une et on la relie.
        mission_id = _creer_mission(sb, champs, user_id)
        sb.table("ce_documents").update({"mission_id": mission_id}).eq("id", ce_id).execute()
        return Archived(ce_id, mission_id, created=True)

    mission_id = _creer_mission(sb, champs, user_id)
    try:
        ligne = (
            sb.table("ce_documents")
            .insert({"ref_ce": data.ref_ce, "ce_data": contenu, "mission_id": mission_id, "created_by": user_id})
            .execute()
            .data
        )
    except Exception:
        # Pas de mission orpheline dans les archives si l'enregistrement échoue.
        logger.warning("Enregistrement de la convention échoué, mission %s retirée", mission_id)
        sb.table("missions").delete().eq("id", mission_id).execute()
        raise
    return Archived(ligne[0]["id"], mission_id, created=True)


def _creer_mission(sb, champs: dict, user_id: str) -> str:
    return sb.table("missions").insert(
        {**champs, "status": "archived", "category": CATEGORIE, "created_by": user_id}
    ).execute().data[0]["id"]
