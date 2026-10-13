import io
from unittest.mock import MagicMock, patch

from docx import Document
from fastapi.testclient import TestClient

from app.main import app
from tests.ce_sample import sample

client = TestClient(app)
AUTH = {"Authorization": "Bearer jeton-de-test"}
URL = "/api/ce/export-docx"


def _post(body, **params):
    with patch("app.routers.ce.get_current_user", return_value=MagicMock(id="u1")):
        return client.post(URL, headers=AUTH, json=body, params=params)


def test_requires_a_token():
    assert client.post(URL, json=sample()).status_code in (401, 403)


def test_any_signed_in_member_can_generate():
    # Aucune permission particulière : le jeton suffit (tout le monde rédige des CE).
    assert _post(sample()).status_code == 200


def test_globals_expose_the_president_and_defaults():
    with patch("app.routers.ce.get_current_user", return_value=MagicMock(id="u1")):
        r = client.get("/api/ce/globals", headers=AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body["president"]["nom"] == "Colombo" and body["president"]["prenom"] == "César"
    assert body["taux_tva"] == "20"


def test_globals_require_a_token():
    assert client.get("/api/ce/globals").status_code in (401, 403)


def test_returns_a_word_document():
    r = _post(sample())
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    assert 'filename="Convention-d-Etude_CE-2026-014.docx"' in r.headers["content-disposition"]
    assert Document(io.BytesIO(r.content)).paragraphs


def test_filename_cannot_carry_path_or_header_injection():
    d = sample()
    d["ref_ce"] = '../../x"\r\nSet-Cookie: a=b'
    r = _post(d)
    assert r.status_code == 200
    disposition = r.headers["content-disposition"]
    assert "/" not in disposition.split("filename=")[1] and "\n" not in disposition


def test_unreviewed_ai_text_blocks_the_export():
    d = sample()
    d["reviews"] = {"cdc": {"origin": "ai", "reviewed": False}}
    r = _post(d)
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "ai_not_reviewed"
    assert r.json()["detail"]["fields"] == ["cdc"]


def test_unreviewed_ai_text_blocks_even_a_draft():
    d = sample()
    d["reviews"] = {"cdc": {"origin": "ai", "reviewed": False}}
    assert _post(d, brouillon="true").status_code == 422


def test_reviewed_ai_text_goes_through():
    d = sample()
    d["reviews"] = {"cdc": {"origin": "ai", "reviewed": True}}
    assert _post(d).status_code == 200


def test_empty_required_section_blocks_unless_draft():
    d = sample()
    d["cdc"] = ""
    r = _post(d)
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "incomplete"
    assert "Cahier des charges détaillé" in r.json()["detail"]["missing"]

    draft = _post(d, brouillon="true")
    assert draft.status_code == 200
    assert "BROUILLON" in draft.headers["content-disposition"]


def test_invalid_payload_is_a_422():
    d = sample()
    d["budget"]["prix_jeh"] = "10"
    assert _post(d).status_code == 422


# ── POST /api/ce/generate ────────────────────────────────────────────────────

GEN = "/api/ce/generate"
GEN_BODY = {
    "notes": "Acme veut comparer trois procédés de recyclage de batteries.",
    "societe": "Acme Recyclage SAS",
    "phases": [{"nom": "Cadrage", "jeh": 3, "duree_semaines": 2}],
    "sections": ["cdc"],
}


def _generate(body=GEN_BODY, cle="AIzaCleDuMembre", result=None, error=None, lecture=None):
    """Appelle /generate avec un faux Gemini ; `cle` est ce que la base contient pour ce membre."""
    from app.services import ai_keys, llm

    vus = {}

    async def faux(api_key, *_a, **_k):
        vus["api_key"] = api_key
        if error:
            raise error
        return result or '{"cdc": "Rapport Word."}'

    with patch("app.routers.ce.get_current_user", return_value=MagicMock(id="u1")), \
            patch.object(ai_keys, "lire", lecture or (lambda _uid: cle)), \
            patch.object(llm, "complete", faux):
        r = client.post(GEN, headers=AUTH, json=body)
    return r, vus


def test_generate_requires_a_token():
    assert client.post(GEN, json=GEN_BODY).status_code in (401, 403)


def test_generate_uses_the_callers_own_key_and_returns_flagged_texts():
    r, vus = _generate()
    assert r.status_code == 200
    assert vus["api_key"] == "AIzaCleDuMembre"
    body = r.json()
    assert body["textes"] == {"cdc": "Rapport Word."}
    assert body["reviews"]["cdc"] == {"origin": "ai", "reviewed": False}


def test_generate_asks_for_a_key_when_the_member_has_none():
    r, _ = _generate(cle=None)
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "no_ai_key"


def test_generate_asks_to_retype_a_key_that_can_no_longer_be_read():
    from app.services import ai_keys

    def illisible(_uid):
        raise ai_keys.KeyUnreadable()
    r, _ = _generate(lecture=illisible)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "no_ai_key"
    assert "à nouveau" in r.json()["detail"]["message"]


def test_generate_rejects_a_request_without_notes():
    r, _ = _generate({**GEN_BODY, "notes": ""})
    assert r.status_code == 422


def test_generate_relays_google_refusing_the_key():
    from app.services import llm
    r, _ = _generate(error=llm.KeyRejected("Google refuse cette clé d'API"))
    assert r.status_code == 422 and r.json()["detail"]["code"] == "ai_key_rejected"


def test_generate_relays_an_exhausted_quota_as_429():
    from app.services import llm
    r, _ = _generate(error=llm.QuotaExceeded("Le quota Gemini de votre clé est atteint"))
    assert r.status_code == 429 and r.json()["detail"]["code"] == "ai_quota"


def test_generate_is_502_with_a_readable_message_when_google_fails():
    from app.services import llm
    r, _ = _generate(error=llm.LLMError("Gemini est injoignable"))
    assert r.status_code == 502
    assert "injoignable" in r.json()["detail"]["message"]
