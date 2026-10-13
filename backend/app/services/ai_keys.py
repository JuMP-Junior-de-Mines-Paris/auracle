# app/services/ai_keys.py
"""Clés Gemini des membres : chiffrées avant la base, jamais renvoyées au navigateur.

Chiffrement Fernet (AES-128-CBC + HMAC) avec le secret AI_KEYS_SECRET, qui
vit dans l'environnement du serveur et nulle part en base. Le texte chiffré
embarque l'identifiant du membre : une ligne recopiée sur le compte d'un
autre ne se déchiffre pas en sa faveur.
"""
from __future__ import annotations

import logging
from contextlib import contextmanager
from datetime import datetime, timezone

import httpx
from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from postgrest.exceptions import APIError

from app.config import settings
from app.db import get_supabase_client

TABLE = "user_ai_keys"
logger = logging.getLogger(__name__)


class StoreUnavailable(Exception):
    """Stockage inutilisable : secret absent ou invalide (on refuse plutôt que de stocker en clair),
    ou table absente / base injoignable."""


class KeyUnreadable(Exception):
    """Une clé existe mais ne se déchiffre plus (secret changé) : le membre doit la ressaisir."""


def _fernet() -> MultiFernet:
    secrets = [s.strip() for s in settings.ai_keys_secret.split(",") if s.strip()]
    if not secrets:
        raise StoreUnavailable("AI_KEYS_SECRET n'est pas renseigné sur le serveur")
    try:
        return MultiFernet([Fernet(s.encode()) for s in secrets])
    except (ValueError, TypeError):
        raise StoreUnavailable("AI_KEYS_SECRET n'est pas une clé Fernet valide") from None


def chiffrer(user_id: str, cle: str) -> str:
    return _fernet().encrypt(f"{user_id}:{cle}".encode()).decode()


def dechiffrer(user_id: str, jeton: str) -> str:
    try:
        clair = _fernet().decrypt(jeton.encode()).decode()
    except InvalidToken:
        raise KeyUnreadable() from None
    proprietaire, _, cle = clair.partition(":")
    if proprietaire != user_id or not cle:
        raise KeyUnreadable()
    return cle


@contextmanager
def _base():
    """Une base absente ou une migration non appliquée est une panne de configuration, pas un bug."""
    try:
        yield get_supabase_client()
    except APIError as exc:
        # PGRST205 : table introuvable, c'est-à-dire migration 022 non appliquée.
        logger.error("user_ai_keys inaccessible (%s) : la migration 022 est-elle appliquée ?", exc.code)
        raise StoreUnavailable("la table user_ai_keys est inaccessible") from None
    except httpx.HTTPError as exc:
        logger.error("Base injoignable : %s", type(exc).__name__)
        raise StoreUnavailable("la base est injoignable") from None


def _ligne(user_id: str, colonnes: str) -> dict | None:
    with _base() as db:
        r = db.table(TABLE).select(colonnes).eq("user_id", user_id).limit(1).execute()
    return (r.data or [None])[0]


def statut(user_id: str) -> dict:
    ligne = _ligne(user_id, "key_hint")
    return {"configured": ligne is not None, "hint": ligne["key_hint"] if ligne else None}


def enregistrer(user_id: str, cle: str) -> str:
    """Chiffre et enregistre ; renvoie l'indice (quatre derniers caractères)."""
    jeton = chiffrer(user_id, cle)          # lève StoreUnavailable avant toute écriture
    indice = cle[-4:]
    with _base() as db:
        db.table(TABLE).upsert({
            "user_id": user_id,
            "provider": "gemini",
            "key_encrypted": jeton,
            "key_hint": indice,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="user_id").execute()
    return indice


def supprimer(user_id: str) -> None:
    with _base() as db:
        db.table(TABLE).delete().eq("user_id", user_id).execute()


def lire(user_id: str) -> str | None:
    """La clé en clair, pour un appel à Gemini. None si le membre n'en a pas."""
    ligne = _ligne(user_id, "key_encrypted")
    return dechiffrer(user_id, ligne["key_encrypted"]) if ligne else None
