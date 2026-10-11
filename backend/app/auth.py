import logging
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.db import get_supabase_client

logger = logging.getLogger(__name__)
security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> object:
    token = credentials.credentials
    supabase = get_supabase_client()
    try:
        response = supabase.auth.get_user(token)
        if response.user is None:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return response.user
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Auth failed: %s", type(exc).__name__)
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_user_permissions(user_id: str) -> set[str]:
    """Permissions du membre, via la matrice role_permissions (migration 008).

    Lu avec la clé service-role, qui contourne la RLS : c'est justement
    pourquoi le contrôle doit être fait ici et pas laissé à la base.
    """
    supabase = get_supabase_client()
    profile = (
        supabase.table("profiles").select("role").eq("id", user_id).single().execute()
    )
    role = (profile.data or {}).get("role")
    if not role:
        return set()

    rows = (
        supabase.table("role_permissions")
        .select("permission_code")
        .eq("role_code", role)
        .execute()
    )
    return {r["permission_code"] for r in (rows.data or [])}


def require_perm(*required: str):
    """Dépendance FastAPI : exige au moins une des permissions listées.

    `admin.full` vaut joker, comme la fonction has_perm() en base.
    """

    async def dependency(user=Security(get_current_user)):
        try:
            held = get_user_permissions(str(user.id))
        except Exception as exc:
            logger.warning("Permission lookup failed: %s", type(exc).__name__)
            raise HTTPException(status_code=503, detail="Permission check unavailable")

        if "admin.full" in held or held.intersection(required):
            return user

        raise HTTPException(
            status_code=403,
            detail=f"Permission requise : {' ou '.join(required)}",
        )

    return dependency
