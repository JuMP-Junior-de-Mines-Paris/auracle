import json

import httpx
import pytest

from app.config import settings
from app.services import llm


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(settings, "gemini_model", "modele-test")

    async def pas_d_attente(_):
        return None
    monkeypatch.setattr(llm.asyncio, "sleep", pas_d_attente)


def _serveur(monkeypatch, reponses):
    """Remplace le réseau : `reponses` est consommée une par appel ; renvoie les requêtes vues."""
    vues = []
    suite = iter(reponses)

    def handler(request: httpx.Request):
        vues.append(request)
        r = next(suite)
        if isinstance(r, Exception):
            raise r
        return r

    transport = httpx.MockTransport(handler)
    vrai = httpx.AsyncClient
    monkeypatch.setattr(llm.httpx, "AsyncClient", lambda **kw: vrai(transport=transport, **kw))
    return vues


def _ok(texte="bonjour", finish="STOP", parts=None):
    parts = parts or [{"text": texte}]
    return httpx.Response(200, json={"candidates": [{"content": {"parts": parts}, "finishReason": finish}]})


def _erreur(status, message=""):
    return httpx.Response(status, json={"error": {"code": status, "message": message}})


async def test_sends_the_users_key_in_a_header_never_in_the_url(monkeypatch):
    vues = _serveur(monkeypatch, [_ok("salut")])
    assert await llm.complete("AIzaSecret", "sys", "usr", json_mode=True) == "salut"
    req = vues[0]
    assert req.url.path.endswith("/models/modele-test:generateContent")
    assert req.headers["x-goog-api-key"] == "AIzaSecret"
    assert "AIzaSecret" not in str(req.url)
    body = json.loads(req.content)
    assert body["systemInstruction"]["parts"][0]["text"] == "sys"
    assert body["contents"][0]["parts"][0]["text"] == "usr"
    assert body["generationConfig"]["responseMimeType"] == "application/json"


async def test_reasoning_parts_are_not_part_of_the_answer(monkeypatch):
    _serveur(monkeypatch, [_ok(parts=[{"text": "je réfléchis…", "thought": True}, {"text": "réponse"}])])
    assert await llm.complete("k", "s", "u") == "réponse"


async def test_server_errors_are_retried_then_succeed(monkeypatch):
    vues = _serveur(monkeypatch, [_erreur(503), _erreur(500), _ok()])
    assert await llm.complete("k", "s", "u") == "bonjour"
    assert len(vues) == 3


async def test_gives_up_after_the_retries(monkeypatch):
    vues = _serveur(monkeypatch, [_erreur(503)] * 3)
    with pytest.raises(llm.LLMError) as e:
        await llm.complete("k", "s", "u")
    assert len(vues) == 3 and e.value.status == 502


async def test_an_exhausted_quota_is_reported_at_once_not_retried(monkeypatch):
    vues = _serveur(monkeypatch, [_erreur(429, "quota")])
    with pytest.raises(llm.QuotaExceeded, match="quota") as e:
        await llm.complete("k", "s", "u")
    assert len(vues) == 1 and e.value.status == 429 and e.value.code == "ai_quota"


@pytest.mark.parametrize("reponse", [
    _erreur(400, "API key not valid. Please pass a valid API key."),
    _erreur(403, "permission denied"),
    _erreur(401),
])
async def test_a_refused_key_is_a_422_that_names_the_cause(monkeypatch, reponse):
    _serveur(monkeypatch, [reponse])
    with pytest.raises(llm.KeyRejected) as e:
        await llm.complete("k", "s", "u")
    assert e.value.status == 422 and "clé" in str(e.value)


async def test_other_bad_requests_are_not_blamed_on_the_key(monkeypatch):
    _serveur(monkeypatch, [_erreur(400, "contents must not be empty")])
    with pytest.raises(llm.LLMError) as e:
        await llm.complete("k", "s", "u")
    assert not isinstance(e.value, llm.KeyRejected)


async def test_unknown_model_names_the_model(monkeypatch):
    _serveur(monkeypatch, [_erreur(404)])
    with pytest.raises(llm.LLMError, match="modele-test"):
        await llm.complete("k", "s", "u")


async def test_network_failure_hides_the_url(monkeypatch):
    _serveur(monkeypatch, [httpx.ConnectError("boom https://x?key=AIzaSecret")] * 3)
    with pytest.raises(llm.LLMError) as e:
        await llm.complete("AIzaSecret", "s", "u")
    assert "AIzaSecret" not in str(e.value) and "https" not in str(e.value)


async def test_truncated_reply_is_refused(monkeypatch):
    _serveur(monkeypatch, [_ok("début de phra", finish="MAX_TOKENS")])
    with pytest.raises(llm.LLMError, match="coupée"):
        await llm.complete("k", "s", "u")


async def test_blocked_prompt_and_blocked_answer_are_explained(monkeypatch):
    _serveur(monkeypatch, [httpx.Response(200, json={"promptFeedback": {"blockReason": "SAFETY"}}),
                           _ok(finish="SAFETY", parts=[])])
    with pytest.raises(llm.LLMError, match="refusé"):
        await llm.complete("k", "s", "u")
    with pytest.raises(llm.LLMError, match="bloqué"):
        await llm.complete("k", "s", "u")


async def test_empty_and_garbage_replies_are_refused(monkeypatch):
    _serveur(monkeypatch, [_ok("   "), httpx.Response(200, json={"oops": 1})])
    with pytest.raises(llm.LLMError, match="vide"):
        await llm.complete("k", "s", "u")
    with pytest.raises(llm.LLMError, match="inattendue"):
        await llm.complete("k", "s", "u")


# ── check_key ─────────────────────────────────────────────────────────────────

def _modeles(*noms):
    return httpx.Response(200, json={"models": [{"name": f"models/{n}"} for n in noms]})


async def test_check_key_reports_whether_the_configured_model_is_open(monkeypatch):
    vues = _serveur(monkeypatch, [_modeles("modele-test", "autre"), _modeles("autre")])
    assert await llm.check_key("AIzaSecret") is True
    assert vues[0].headers["x-goog-api-key"] == "AIzaSecret" and "AIzaSecret" not in str(vues[0].url)
    assert await llm.check_key("AIzaSecret") is False


async def test_check_key_rejects_a_bad_key(monkeypatch):
    _serveur(monkeypatch, [_erreur(400, "API key not valid")])
    with pytest.raises(llm.KeyRejected):
        await llm.check_key("mauvaise")


async def test_check_key_when_google_is_unreachable(monkeypatch):
    _serveur(monkeypatch, [httpx.ConnectError("x")])
    with pytest.raises(llm.LLMError) as e:
        await llm.check_key("k")
    assert not isinstance(e.value, llm.KeyRejected)
