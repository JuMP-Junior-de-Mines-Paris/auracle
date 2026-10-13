from unittest.mock import MagicMock, patch

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.services import ai_keys, llm

client = TestClient(app)
AUTH = {"Authorization": "Bearer jeton-de-test"}
URL = "/api/ai-key"
CLE = "AIzaSyD-exemple-de-cle-gemini-0123456789"


class FauxSupabase:
    """Juste ce qu'ai_keys utilise : une table en mémoire."""

    def __init__(self):
        self.lignes: dict[str, dict] = {}
        self._filtre = None
        self._op = None
        self._payload = None

    def table(self, _nom):
        self._filtre = self._op = self._payload = None
        return self

    def select(self, *_):
        self._op = "select"
        return self

    def upsert(self, ligne, **_):
        self._op, self._payload = "upsert", ligne
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, _col, valeur):
        self._filtre = valeur
        return self

    def limit(self, _n):
        return self

    def execute(self):
        r = MagicMock()
        if self._op == "upsert":
            self.lignes[self._payload["user_id"]] = dict(self._payload)
        elif self._op == "delete":
            self.lignes.pop(self._filtre, None)
        else:
            ligne = self.lignes.get(self._filtre)
            r.data = [ligne] if ligne else []
        return r


@pytest.fixture
def base(monkeypatch):
    monkeypatch.setattr(settings, "ai_keys_secret", Fernet.generate_key().decode())
    faux = FauxSupabase()
    monkeypatch.setattr(ai_keys, "get_supabase_client", lambda: faux)
    return faux


# ── service ──────────────────────────────────────────────────────────────────

def test_the_key_is_stored_encrypted_and_read_back(base):
    assert ai_keys.enregistrer("u1", CLE) == CLE[-4:]
    stocke = base.lignes["u1"]
    assert CLE not in stocke["key_encrypted"] and "AIza" not in stocke["key_encrypted"]
    assert stocke["key_hint"] == CLE[-4:]
    assert ai_keys.lire("u1") == CLE
    assert ai_keys.statut("u1") == {"configured": True, "hint": CLE[-4:]}


def test_no_key_means_none_not_an_error(base):
    assert ai_keys.lire("u1") is None
    assert ai_keys.statut("u1") == {"configured": False, "hint": None}


def test_a_row_copied_onto_another_member_is_unreadable(base):
    ai_keys.enregistrer("u1", CLE)
    base.lignes["u2"] = {**base.lignes["u1"], "user_id": "u2"}
    with pytest.raises(ai_keys.KeyUnreadable):
        ai_keys.lire("u2")


def test_a_changed_secret_makes_the_key_unreadable_not_a_crash(base, monkeypatch):
    ai_keys.enregistrer("u1", CLE)
    monkeypatch.setattr(settings, "ai_keys_secret", Fernet.generate_key().decode())
    with pytest.raises(ai_keys.KeyUnreadable):
        ai_keys.lire("u1")


def test_secret_rotation_keeps_old_keys_readable(base, monkeypatch):
    ancien = settings.ai_keys_secret
    ai_keys.enregistrer("u1", CLE)
    nouveau = Fernet.generate_key().decode()
    monkeypatch.setattr(settings, "ai_keys_secret", f"{nouveau},{ancien}")
    assert ai_keys.lire("u1") == CLE


@pytest.mark.parametrize("secret", ["", "   ", "pas-une-cle-fernet"])
def test_without_a_valid_secret_nothing_is_written(base, monkeypatch, secret):
    monkeypatch.setattr(settings, "ai_keys_secret", secret)
    with pytest.raises(ai_keys.StoreUnavailable):
        ai_keys.enregistrer("u1", CLE)
    assert base.lignes == {}


# ── routes ───────────────────────────────────────────────────────────────────

def _appel(methode, *, json=None, ouvert=True, erreur=None):
    async def faux_check(_cle):
        if erreur:
            raise erreur
        return ouvert

    with patch("app.routers.ai_keys.get_current_user", return_value=MagicMock(id="u1")), \
            patch.object(llm, "check_key", faux_check):
        return client.request(methode, URL, headers=AUTH, json=json)


def test_routes_require_a_token():
    for methode in ("GET", "PUT", "DELETE"):
        assert client.request(methode, URL, json={"key": CLE}).status_code in (401, 403)


def test_status_never_contains_the_key(base):
    ai_keys.enregistrer("u1", CLE)
    r = _appel("GET")
    assert r.status_code == 200
    assert r.json() == {"configured": True, "hint": CLE[-4:], "model": settings.gemini_model}
    assert CLE not in r.text


def test_saving_a_valid_key(base):
    r = _appel("PUT", json={"key": f"  {CLE}  "})
    assert r.status_code == 200
    assert r.json()["configured"] is True and r.json()["model_ok"] is True
    assert CLE not in r.text
    assert ai_keys.lire("u1") == CLE


def test_saving_reports_when_the_model_is_not_open_to_the_key(base):
    r = _appel("PUT", json={"key": CLE}, ouvert=False)
    assert r.status_code == 200 and r.json()["model_ok"] is False


def test_a_key_google_refuses_is_not_saved_and_does_not_replace_the_good_one(base):
    ai_keys.enregistrer("u1", CLE)
    r = _appel("PUT", json={"key": "AIza-autre-cle-refusee-par-google-123"}, erreur=llm.KeyRejected("Google refuse cette clé"))
    assert r.status_code == 422 and r.json()["detail"]["code"] == "ai_key_rejected"
    assert ai_keys.lire("u1") == CLE


@pytest.mark.parametrize("cle", ["", "court", "avec des espaces dans la cle de test", "x" * 200])
def test_obviously_malformed_keys_never_reach_google(base, cle):
    r = _appel("PUT", json={"key": cle})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "ai_key_malformed"


def test_saving_without_server_secret_is_a_503(base, monkeypatch):
    monkeypatch.setattr(settings, "ai_keys_secret", "")
    r = _appel("PUT", json={"key": CLE})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "ai_store_unavailable"


def test_deleting_the_key(base):
    ai_keys.enregistrer("u1", CLE)
    assert _appel("DELETE").status_code == 204
    assert ai_keys.statut("u1")["configured"] is False


# ── base inutilisable (migration 022 non appliquée) ──────────────────────────

@pytest.fixture
def sans_table(monkeypatch):
    from postgrest.exceptions import APIError

    class Cassee:
        def table(self, _):
            raise APIError({"message": "Could not find the table 'public.user_ai_keys'", "code": "PGRST205"})
    monkeypatch.setattr(settings, "ai_keys_secret", Fernet.generate_key().decode())
    monkeypatch.setattr(ai_keys, "get_supabase_client", lambda: Cassee())


@pytest.mark.parametrize("methode,json", [("GET", None), ("PUT", {"key": CLE}), ("DELETE", None)])
def test_a_missing_table_is_a_readable_503_not_a_500(sans_table, methode, json):
    r = _appel(methode, json=json)
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "ai_store_unavailable"
    assert "migration" in r.json()["detail"]["message"]


def test_generate_reports_a_missing_table_the_same_way(sans_table):
    with patch("app.routers.ce.get_current_user", return_value=MagicMock(id="u1")):
        r = client.post("/api/ce/generate", headers=AUTH, json={
            "notes": "Acme veut comparer trois procédés.", "societe": "Acme", "sections": ["cdc"]})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "ai_store_unavailable"
