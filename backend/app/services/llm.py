# app/services/llm.py
"""Appel à Gemini avec la clé du membre qui rédige.

Il n'y a pas de clé du serveur : chaque appel reçoit celle de l'utilisateur,
qui est donc facturé (ou limité) sur son propre compte Google. La clé
voyage dans l'en-tête `x-goog-api-key`, jamais dans l'URL, et n'est jamais
journalisée.
"""
from __future__ import annotations

import asyncio
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

BASE = "https://generativelanguage.googleapis.com/v1beta"
TIMEOUT = httpx.Timeout(120.0, connect=10.0)
RETRIES = 2                       # tentatives en plus de la première
_RETRY_ON = {500, 502, 503, 504}  # pas 429 : un quota épuisé ne se règle pas en réessayant


class LLMError(Exception):
    """Gemini a refusé ou n'a pas répondu ; le message est affichable tel quel."""
    status = 502
    code = "ai_unavailable"


class KeyRejected(LLMError):
    """La clé du membre est invalide, révoquée ou sans droit sur l'API."""
    status = 422
    code = "ai_key_rejected"


class QuotaExceeded(LLMError):
    status = 429
    code = "ai_quota"


def _headers(api_key: str) -> dict:
    return {"x-goog-api-key": api_key}


def _raise_for(status: int, body: dict | None) -> None:
    message = ((body or {}).get("error") or {}).get("message", "")
    if status in (401, 403) or (status == 400 and "api key" in message.lower()):
        raise KeyRejected("Google refuse cette clé d'API : vérifiez-la dans vos paramètres.")
    if status == 429:
        raise QuotaExceeded(
            "Le quota Gemini de votre clé est atteint (limite par minute ou par jour de l'offre gratuite). "
            "Réessayez plus tard.")
    if status == 404:
        raise LLMError(f"Le modèle « {settings.gemini_model} » n'est pas disponible pour cette clé.")
    raise LLMError(f"Gemini a répondu par une erreur ({status}).")


def _json(r: httpx.Response) -> dict | None:
    try:
        return r.json()
    except ValueError:
        return None


async def check_key(api_key: str) -> bool:
    """Vérifie la clé sans consommer de quota de génération ; renvoie si le modèle configuré lui est ouvert.

    Lève KeyRejected si Google la refuse, LLMError si Google est injoignable.
    """
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as http:
            r = await http.get(f"{BASE}/models", params={"pageSize": 1000}, headers=_headers(api_key))
    except httpx.HTTPError as exc:
        logger.warning("Gemini injoignable : %s", type(exc).__name__)
        raise LLMError("Gemini est injoignable, réessayez dans un instant.") from None
    if r.status_code != 200:
        _raise_for(r.status_code, _json(r))
    noms = {m.get("name", "").removeprefix("models/") for m in (_json(r) or {}).get("models", [])}
    return settings.gemini_model in noms


async def complete(
    api_key: str,
    system: str,
    user: str,
    *,
    json_mode: bool = False,
    max_tokens: int = 16000,
    temperature: float = 0.4,
) -> str:
    # Les modèles « réflexion » dépensent une part de max_tokens à réfléchir :
    # la marge est volontairement large pour ne pas couper la réponse.
    config: dict = {"temperature": temperature, "maxOutputTokens": max_tokens}
    if json_mode:
        config["responseMimeType"] = "application/json"
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": config,
    }
    url = f"{BASE}/models/{settings.gemini_model}:generateContent"

    async with httpx.AsyncClient(timeout=TIMEOUT) as http:
        for attempt in range(RETRIES + 1):
            try:
                r = await http.post(url, json=body, headers=_headers(api_key))
            except httpx.HTTPError as exc:
                # Le message d'httpx peut citer l'URL : on ne journalise que le type.
                logger.warning("Gemini injoignable : %s", type(exc).__name__)
                if attempt == RETRIES:
                    raise LLMError("Gemini est injoignable, réessayez dans un instant.") from None
            else:
                if r.status_code == 200:
                    return _content(_json(r))
                logger.warning("Gemini statut %s", r.status_code)
                if r.status_code not in _RETRY_ON or attempt == RETRIES:
                    _raise_for(r.status_code, _json(r))
            await asyncio.sleep(2 ** attempt)

    raise LLMError("Gemini n'a pas répondu.")  # inatteignable, pour les linters


def _content(body: dict | None) -> str:
    body = body or {}
    if (body.get("promptFeedback") or {}).get("blockReason"):
        raise LLMError("Gemini a refusé de traiter ces notes. Reformulez-les ou retirez le passage sensible.")
    try:
        candidate = body["candidates"][0]
    except (KeyError, IndexError, TypeError):
        raise LLMError("Réponse inattendue de Gemini.") from None

    reason = candidate.get("finishReason")
    if reason == "MAX_TOKENS":
        raise LLMError("La réponse de l'IA a été coupée : raccourcissez les notes ou générez section par section.")
    if reason in ("SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"):
        raise LLMError("Gemini a bloqué sa réponse. Reformulez vos notes et réessayez.")

    # Les parties « thought » sont la réflexion du modèle, pas la réponse.
    parts = (candidate.get("content") or {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
    if not text.strip():
        raise LLMError("Gemini a renvoyé une réponse vide.")
    return text
