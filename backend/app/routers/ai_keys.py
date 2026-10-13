# app/routers/ai_keys.py
"""Clé Gemini du membre connecté (Réglages > Intelligence artificielle).

Chacun ne voit et ne modifie que la sienne, et la clé n'est jamais renvoyée :
la lecture donne seulement « configurée » et ses quatre derniers caractères.
"""
import re
import sys

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.auth import get_current_user
from app.config import settings
from app.services import ai_keys, llm

router = APIRouter()
_security = HTTPBearer()

# Les clés Google ont ~39 caractères (AIza…) ; on reste large pour ne pas refuser un futur format.
_FORME = re.compile(r"^[A-Za-z0-9_\-]{20,120}$")

_STOCKAGE_HS = ("Le stockage des clés n'est pas prêt sur ce serveur (configuration ou migration manquante). "
                "Prévenez le bureau.")


async def _auth_dep(credentials: HTTPAuthorizationCredentials = Depends(_security)):
    return await sys.modules[__name__].get_current_user(credentials)


class KeyIn(BaseModel):
    key: str


def _erreur(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


@router.get("")
async def read_status(user=Depends(_auth_dep)):
    try:
        return {**ai_keys.statut(str(user.id)), "model": settings.gemini_model}
    except ai_keys.StoreUnavailable:
        raise _erreur(503, "ai_store_unavailable", _STOCKAGE_HS)


@router.put("")
async def save_key(body: KeyIn, user=Depends(_auth_dep)):
    cle = body.key.strip()
    if not _FORME.match(cle):
        raise _erreur(422, "ai_key_malformed",
                      "Cette clé n'a pas la forme d'une clé Gemini (une suite de lettres et de chiffres, sans espace).")
    try:
        # Avant d'écrire quoi que ce soit : une clé fausse ne doit pas remplacer une bonne.
        modele_ouvert = await llm.check_key(cle)
        indice = ai_keys.enregistrer(str(user.id), cle)
    except llm.LLMError as exc:
        raise _erreur(exc.status, exc.code, str(exc))
    except ai_keys.StoreUnavailable:
        raise _erreur(503, "ai_store_unavailable", _STOCKAGE_HS)
    return {"configured": True, "hint": indice, "model": settings.gemini_model, "model_ok": modele_ouvert}


@router.delete("", status_code=204)
async def delete_key(user=Depends(_auth_dep)):
    try:
        ai_keys.supprimer(str(user.id))
    except ai_keys.StoreUnavailable:
        raise _erreur(503, "ai_store_unavailable", _STOCKAGE_HS)
    return Response(status_code=204)
