import re
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers.admin import generate_password

client = TestClient(app)
AUTH = {"Authorization": "Bearer jeton-de-test"}


def _mock_supabase(role_exists=True):
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"code": "chef_de_projet"}] if role_exists else []
    )
    sb.auth.admin.create_user.return_value = MagicMock(user=MagicMock(id="nouvel-id"))
    return sb


def test_generated_password_is_strong_and_unambiguous():
    mots = [generate_password() for _ in range(200)]
    assert all(len(m) == 20 for m in mots)
    # Jamais deux fois le même : c'est du secrets, pas du random.
    assert len(set(mots)) == 200
    # Les caractères confondables sont exclus : ces mots de passe se recopient
    # à la main depuis un écran.
    assert not re.search(r"[Oo0lI1]", "".join(mots))


def test_create_member_requires_the_permission():
    with (
        patch("app.routers.admin.get_current_user", return_value=MagicMock(id="u1")),
        patch("app.routers.admin.get_user_permissions", return_value={"contacts.write"}),
    ):
        r = client.post("/admin/members", headers=AUTH, json={
            "email": "a@jump-mines.fr", "prenom": "A", "nom": "B", "role": "chef_de_projet",
        })
    assert r.status_code == 403
    assert "members.create" in r.json()["detail"]


def test_admin_full_is_a_wildcard():
    with (
        patch("app.routers.admin.get_current_user", return_value=MagicMock(id="u1")),
        patch("app.routers.admin.get_user_permissions", return_value={"admin.full"}),
        patch("app.routers.admin.get_supabase_client", return_value=_mock_supabase()),
    ):
        r = client.post("/admin/members", headers=AUTH, json={
            "email": "a@jump-mines.fr", "prenom": "A", "nom": "B", "role": "chef_de_projet",
        })
    assert r.status_code == 201
    corps = r.json()
    assert len(corps["password"]) == 20
    assert corps["id"] == "nouvel-id"


def test_unknown_role_is_refused_before_creating_the_account():
    sb = _mock_supabase(role_exists=False)
    with (
        patch("app.routers.admin.get_current_user", return_value=MagicMock(id="u1")),
        patch("app.routers.admin.get_user_permissions", return_value={"members.create"}),
        patch("app.routers.admin.get_supabase_client", return_value=sb),
    ):
        r = client.post("/admin/members", headers=AUTH, json={
            "email": "a@jump-mines.fr", "prenom": "A", "nom": "B", "role": "respo_licornes",
        })
    assert r.status_code == 422
    # Le compte ne doit pas exister si le rôle est invalide.
    sb.auth.admin.create_user.assert_not_called()


def test_cannot_deactivate_yourself():
    with (
        patch("app.routers.admin.get_current_user", return_value=MagicMock(id="u1")),
        patch("app.routers.admin.get_user_permissions", return_value={"admin.full"}),
        patch("app.routers.admin.get_supabase_client", return_value=_mock_supabase()),
    ):
        r = client.post("/admin/members/u1/deactivate", headers=AUTH)
    assert r.status_code == 422


def test_deactivate_bans_rather_than_deletes():
    sb = _mock_supabase()
    with (
        patch("app.routers.admin.get_current_user", return_value=MagicMock(id="u1")),
        patch("app.routers.admin.get_user_permissions", return_value={"members.deactivate"}),
        patch("app.routers.admin.get_supabase_client", return_value=sb),
    ):
        r = client.post("/admin/members/u2/deactivate", headers=AUTH)
    assert r.status_code == 204
    sb.auth.admin.delete_user.assert_not_called()
    args = sb.auth.admin.update_user_by_id.call_args[0]
    assert "ban_duration" in args[1]
