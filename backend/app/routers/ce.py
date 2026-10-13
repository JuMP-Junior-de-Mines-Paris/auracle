# app/routers/ce.py
"""Génération de la convention d'étude.

Le chef de projet remplit un formulaire ; ce routeur le transforme en
document Word. Aucune donnée n'est conservée ici : l'export est pur, ce qui
le rend sûr à rappeler autant de fois que nécessaire.

Deux garde-fous vivent côté serveur, pas dans l'interface :
  - un texte produit par l'IA et non relu bloque l'export ;
  - une section obligatoire vide aussi (sauf export « brouillon » explicite).
"""
import re
import sys

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth import get_current_user
from app.services import ai_keys, llm
from app.services.ce_docx import render_ce
from app.services.ce_generate import GenerateRequest, GenerateResult, generate
from app.services.ce_globals import globals_payload
from app.services.ce_schema import CEData, missing_required_fields, unreviewed_ai_fields

router = APIRouter()
_security = HTTPBearer()

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


async def _auth_dep(credentials: HTTPAuthorizationCredentials = Depends(_security)):
    """Tout membre connecté peut rédiger une convention : seul le jeton compte.

    Le document est calculé sans rien lire ni écrire en base, il n'y a donc
    aucune donnée à protéger derrière une permission. Le jeton reste exigé
    pour qu'on ne fasse pas tourner la génération pour des inconnus.
    """
    return await sys.modules[__name__].get_current_user(credentials)


def _filename(ref_ce: str, brouillon: bool) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", ref_ce).strip("-") or "CE"
    return f"Convention-d-Etude_{safe}{'_BROUILLON' if brouillon else ''}.docx"


@router.get("/globals")
async def globals_(_user=Depends(_auth_dep)):
    """Variables globales de JuMP (président, TVA, validité…) pour préremplir le formulaire."""
    return globals_payload()


@router.post("/export-docx")
async def export_docx(
    data: CEData,
    brouillon: bool = Query(False, description="Autorise les sections obligatoires vides"),
    _user=Depends(_auth_dep),
):
    unreviewed = unreviewed_ai_fields(data)
    if unreviewed:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "ai_not_reviewed",
                "message": "Des textes générés par l'IA n'ont pas été relus.",
                "fields": unreviewed,
            },
        )

    missing = missing_required_fields(data)
    if missing and not brouillon:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "incomplete",
                "message": "Des sections obligatoires sont vides.",
                "missing": missing,
            },
        )

    content = render_ce(data)
    return Response(
        content=content,
        media_type=DOCX,
        headers={"Content-Disposition": f'attachment; filename="{_filename(data.ref_ce, brouillon)}"'},
    )


def _ai_error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


@router.post("/generate", response_model=GenerateResult)
async def generate_texts(req: GenerateRequest, user=Depends(_auth_dep)):
    """Rédige les textes longs du CE à partir des notes du chef de projet.

    L'appel part avec la clé Gemini du membre connecté (Réglages), donc sur
    son quota. Rien n'est enregistré. Les textes reviennent marqués
    `origin: "ai"` et non relus : l'export les refuse tant qu'un membre ne
    les a pas validés.
    """
    try:
        cle = ai_keys.lire(str(user.id))
    except ai_keys.StoreUnavailable:
        raise _ai_error(503, "ai_store_unavailable", "Le stockage des clés n'est pas prêt sur ce serveur (configuration ou migration manquante). Prévenez le bureau.")
    except ai_keys.KeyUnreadable:
        raise _ai_error(409, "no_ai_key", "Votre clé Gemini n'est plus lisible : saisissez-la à nouveau dans vos paramètres.")
    if not cle:
        raise _ai_error(409, "no_ai_key", "Ajoutez votre clé Gemini dans vos paramètres pour utiliser la rédaction par IA.")

    try:
        return await generate(req, cle)
    except llm.LLMError as exc:
        raise _ai_error(exc.status, exc.code, str(exc))
