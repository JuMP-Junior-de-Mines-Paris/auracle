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
