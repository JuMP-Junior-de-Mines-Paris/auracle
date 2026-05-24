from unittest.mock import patch, MagicMock
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials


@pytest.mark.asyncio
async def test_valid_token_returns_user():
    mock_user = MagicMock()
    mock_user.id = "user-abc"

    with patch("app.auth.get_supabase_client") as mock_get:
        mock_client = MagicMock()
        mock_client.auth.get_user.return_value.user = mock_user
        mock_get.return_value = mock_client

        from app.auth import get_current_user

        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-token")
        user = await get_current_user(creds)

        assert user.id == "user-abc"
        mock_client.auth.get_user.assert_called_once_with("valid-token")


@pytest.mark.asyncio
async def test_invalid_token_raises_401():
    with patch("app.auth.get_supabase_client") as mock_get:
        mock_client = MagicMock()
        mock_client.auth.get_user.side_effect = Exception("JWT expired")
        mock_get.return_value = mock_client

        from app.auth import get_current_user

        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bad-token")

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(creds)

        assert exc_info.value.status_code == 401
