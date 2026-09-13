# app/routers/admin.py
"""Gestion des comptes membres.

Créer un compte, réinitialiser un mot de passe ou désactiver un membre passe
par l'API Admin de Supabase Auth, qui exige la clé service-role. Cette clé
ne peut pas vivre dans le navigateur : ces opérations vivent donc ici, dans
le backend, et pas dans le SPA.

Chaque route vérifie la permission de l'appelant contre la matrice
role_permissions (migration 008). Le jeton seul ne suffit jamais : le
service-role contourne la RLS, c'est précisément pourquoi le contrôle doit
être explicite.
"""
import logging
import secrets
import string
import sys

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field

from app.auth import get_current_user, get_user_permissions
from app.db import get_supabase_client

logger = logging.getLogger(__name__)
router = APIRouter()
_security = HTTPBearer()

# Sans ambiguïté à la lecture : ni O/0, ni l/I/1. Ces mots de passe sont
# recopiés à la main par quelqu'un qui les lit sur un écran.
_ALPHABET = ''.join(c for c in (string.ascii_letters + string.digits) if c not in 'Oo0lI1')


def generate_password(length: int = 20) -> str:
    return ''.join(secrets.choice(_ALPHABET) for _ in range(length))


def require(*perms: str):
    """Dépendance : exige au moins une des permissions, admin.full faisant joker."""

    async def dep(credentials: HTTPAuthorizationCredentials = Depends(_security)):
        mod = sys.modules[__name__]
        user = await mod.get_current_user(credentials)
        held = mod.get_user_permissions(str(user.id))
        if 'admin.full' in held or held.intersection(perms):
            return user
        raise HTTPException(
            status_code=403,
            detail=f"Permission requise : {' ou '.join(perms)}",
        )

    return dep


class CreateMember(BaseModel):
    email: EmailStr
    prenom: str = Field(min_length=1, max_length=80)
    nom: str = Field(min_length=1, max_length=80)
    role: str = Field(min_length=1, max_length=60)


class MemberCreated(BaseModel):
    id: str
    email: str
    password: str


class PasswordReset(BaseModel):
    id: str
    password: str


@router.post('/members', response_model=MemberCreated, status_code=201)
async def create_member(body: CreateMember, _user=Depends(require('members.create'))):
    """Crée un compte et renvoie son mot de passe UNE SEULE FOIS.

    Rien ne le stocke en clair : ni ici, ni en base, ni dans les journaux.
    S'il est perdu, on en régénère un.
    """
    supabase = get_supabase_client()

    roles = supabase.table('roles').select('code').eq('code', body.role).execute()
    if not roles.data:
        raise HTTPException(status_code=422, detail=f'Rôle inconnu : {body.role}')

    password = generate_password()
    try:
        created = supabase.auth.admin.create_user({
            'email': body.email,
            'password': password,
            # Pas de courriel de confirmation : l'administrateur remet le mot
            # de passe en main propre, le compte doit marcher tout de suite.
            'email_confirm': True,
        })
    except Exception as exc:
        logger.warning('create_user failed: %s', type(exc).__name__)
        raise HTTPException(status_code=409, detail="Impossible de créer ce compte — l'adresse est peut-être déjà prise")

    user = created.user
    if user is None:
        raise HTTPException(status_code=502, detail='Supabase Auth n’a pas renvoyé de compte')

    # upsert et non update : le trigger on_auth_user_created a normalement
    # déjà créé la ligne, mais il manquait en base (corrigé par la migration
    # 017) et un update silencieux ne touchait alors AUCUNE ligne — le
    # compte existait sans profil, donc sans la moindre permission, sans que
    # rien ne le signale. L'upsert rend la route correcte dans les deux cas.
    supabase.table('profiles').upsert({
        'id': str(user.id),
        'prenom': body.prenom,
        'nom': body.nom,
        'email': body.email,
        'role': body.role,
    }).execute()

    # Un compte sans profil est inutilisable : on le dit plutôt que de
    # renvoyer un mot de passe pour un accès qui ne marchera pas.
    check = supabase.table('profiles').select('id').eq('id', str(user.id)).execute()
    if not check.data:
        raise HTTPException(status_code=502, detail='Compte créé mais profil absent — prévenez le responsable informatique')

    return MemberCreated(id=str(user.id), email=body.email, password=password)


@router.post('/members/{member_id}/reset-password', response_model=PasswordReset)
async def reset_password(member_id: str, _user=Depends(require('members.reset_password'))):
    supabase = get_supabase_client()
    password = generate_password()
    try:
        supabase.auth.admin.update_user_by_id(member_id, {'password': password})
    except Exception as exc:
        logger.warning('reset_password failed: %s', type(exc).__name__)
        raise HTTPException(status_code=404, detail='Membre introuvable')
    return PasswordReset(id=member_id, password=password)


@router.post('/members/{member_id}/deactivate', status_code=204)
async def deactivate(member_id: str, user=Depends(require('members.deactivate'))):
    """Suspend l'accès sans supprimer quoi que ce soit.

    On bannit plutôt qu'on ne supprime : effacer le compte emporterait en
    cascade ses notes, ses missions et son historique. Un membre qui part
    doit cesser d'entrer, pas disparaître des archives.
    """
    if str(user.id) == member_id:
        raise HTTPException(status_code=422, detail='Vous ne pouvez pas vous désactiver vous-même')

    supabase = get_supabase_client()
    try:
        supabase.auth.admin.update_user_by_id(member_id, {'ban_duration': '876000h'})  # ~100 ans
    except Exception as exc:
        logger.warning('deactivate failed: %s', type(exc).__name__)
        raise HTTPException(status_code=404, detail='Membre introuvable')


@router.post('/members/{member_id}/reactivate', status_code=204)
async def reactivate(member_id: str, _user=Depends(require('members.deactivate'))):
    supabase = get_supabase_client()
    try:
        supabase.auth.admin.update_user_by_id(member_id, {'ban_duration': 'none'})
    except Exception as exc:
        logger.warning('reactivate failed: %s', type(exc).__name__)
        raise HTTPException(status_code=404, detail='Membre introuvable')
