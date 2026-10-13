import copy
import itertools
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import ce_archive
from app.services.ce_schema import CEData
from tests.ce_sample import sample

client = TestClient(app)
AUTH = {"Authorization": "Bearer jeton-de-test"}
URL = "/api/ce/save"


class FauxSupabase:
    """Les deux tables que l'archivage touche, en mémoire (select/insert/update/delete + eq)."""

    def __init__(self):
        self.tables: dict[str, list[dict]] = {"missions": [], "ce_documents": []}
        self.ids = itertools.count(1)
        self.echec_insertion: set[str] = set()
        self._reset()

    def _reset(self):
        self._nom = self._op = self._payload = None
        self._filtres: list[tuple[str, object]] = []

    def table(self, nom):
        self._reset()
        self._nom = nom
        return self

    def select(self, *_):
        self._op = "select"
        return self

    def insert(self, ligne):
        self._op, self._payload = "insert", ligne
        return self

    def update(self, champs):
        self._op, self._payload = "update", champs
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, col, valeur):
        self._filtres.append((col, valeur))
        return self

    def limit(self, _n):
        return self

    def _match(self):
        return [r for r in self.tables[self._nom] if all(r.get(c) == v for c, v in self._filtres)]

    def execute(self):
        r = MagicMock()
        lignes = self.tables[self._nom]
        if self._op == "insert":
            if self._nom in self.echec_insertion:
                raise RuntimeError("insertion refusée")
            ligne = {"id": f"{self._nom[:2]}-{next(self.ids)}", "mission_id": None, **self._payload}
            lignes.append(ligne)
            r.data = [ligne]
        elif self._op == "update":
            cibles = self._match()
            for c in cibles:
                c.update(self._payload)
            r.data = cibles
        elif self._op == "delete":
            for c in self._match():
                lignes.remove(c)
            r.data = []
        else:
            r.data = self._match()
        return r


@pytest.fixture
def db():
    faux = FauxSupabase()
    with patch.object(ce_archive, "get_supabase_client", return_value=faux):
        yield faux


def _ce(**changes) -> CEData:
    d = copy.deepcopy(sample())
    d.update(changes)
    return CEData.model_validate(d)


def test_a_saved_convention_becomes_an_archived_mission_in_its_category(db):
    r = ce_archive.archive(_ce(), "u1")

    assert r.created
    [mission] = db.tables["missions"]
    assert mission["id"] == r.mission_id
    assert mission["status"] == "archived" and mission["category"] == "convention_etude"
    assert mission["created_by"] == "u1"
    assert mission["client_name"] == "Acme Recyclage SAS"
    assert mission["title"].startswith("CE-2026-014 — Étude de faisabilité")
    [ce] = db.tables["ce_documents"]
    assert ce["mission_id"] == r.mission_id and ce["ref_ce"] == "CE-2026-014"
    assert ce["ce_data"]["client"]["societe"] == "Acme Recyclage SAS"


def test_mission_gets_the_budget_and_the_client_contact(db):
    ce_archive.archive(_ce(), "u1")
    mission = db.tables["missions"][0]
    assert float(mission["budget"]) > 0
    assert mission["client_contact_name"] == "Paul Martin"          # l'interlocuteur prime sur le représentant
    assert mission["client_contact_email"] == "paul.martin@acme.example"
    assert "Léa Toledano" in mission["description"]


def test_saving_the_same_reference_again_updates_instead_of_duplicating(db):
    premiere = ce_archive.archive(_ce(), "u1")
    seconde = ce_archive.archive(_ce(reference_etude="Nouveau titre"), "u2")

    assert not seconde.created
    assert (seconde.ce_id, seconde.mission_id) == (premiere.ce_id, premiere.mission_id)
    assert len(db.tables["missions"]) == 1 and len(db.tables["ce_documents"]) == 1
    assert db.tables["missions"][0]["title"].endswith("Nouveau titre")
    assert db.tables["ce_documents"][0]["ce_data"]["reference_etude"] == "Nouveau titre"
    assert db.tables["missions"][0]["created_by"] == "u1"           # l'auteur d'origine reste


def test_a_new_save_does_not_reopen_a_mission_that_was_reactivated(db):
    ce_archive.archive(_ce(), "u1")
    db.tables["missions"][0]["status"] = "active"
    ce_archive.archive(_ce(), "u1")
    assert db.tables["missions"][0]["status"] == "active"


def test_a_new_reference_is_a_new_mission(db):
    ce_archive.archive(_ce(), "u1")
    ce_archive.archive(_ce(ref_ce="CE-2026-015"), "u1")
    assert len(db.tables["missions"]) == 2 and len(db.tables["ce_documents"]) == 2


def test_a_deleted_mission_is_recreated_and_relinked(db):
    ce_archive.archive(_ce(), "u1")
    db.tables["missions"].clear()
    r = ce_archive.archive(_ce(), "u1")
    assert r.created
    assert db.tables["ce_documents"][0]["mission_id"] == r.mission_id == db.tables["missions"][0]["id"]


def test_no_orphan_mission_when_the_convention_cannot_be_stored(db):
    db.echec_insertion.add("ce_documents")
    with pytest.raises(RuntimeError):
        ce_archive.archive(_ce(), "u1")
    assert db.tables["missions"] == []


# ─── Route ───────────────────────────────────────────────────────────────

def _post(body, perms=("ce.write",), **patches):
    with patch("app.routers.ce.get_current_user", return_value=MagicMock(id="u1")), \
         patch("app.routers.ce.get_user_permissions", return_value=set(perms)):
        return client.post(URL, headers=AUTH, json=body)


def test_route_requires_a_token():
    assert client.post(URL, json=sample()).status_code in (401, 403)


def test_route_refuses_a_member_without_ce_write(db):
    r = _post(sample(), perms=("contacts.read",))
    assert r.status_code == 403
    assert db.tables["missions"] == []


def test_route_lets_the_admin_joker_through(db):
    assert _post(sample(), perms=("admin.full",)).status_code == 200


def test_route_saves_and_reports_the_ids(db):
    r = _post(sample())
    assert r.status_code == 200
    body = r.json()
    assert body["created"] is True
    assert body["mission_id"] == db.tables["missions"][0]["id"]
    assert _post(sample()).json()["created"] is False


def test_route_accepts_unreviewed_ai_text_and_keeps_the_review_flags(db):
    d = sample()
    d["reviews"] = {"cdc": {"origin": "ai", "reviewed": False}}
    assert _post(d).status_code == 200
    assert db.tables["ce_documents"][0]["ce_data"]["reviews"]["cdc"] == {"origin": "ai", "reviewed": False}


def test_route_rejects_an_invalid_convention(db):
    d = sample()
    d["phases"] = []
    assert _post(d).status_code == 422
    assert db.tables["missions"] == []


def test_route_answers_503_when_the_database_fails(db):
    db.echec_insertion.add("missions")
    r = _post(sample())
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "archive_unavailable"
