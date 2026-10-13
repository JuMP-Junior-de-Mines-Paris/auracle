import pytest
from pydantic import ValidationError

from app.services.ce_schema import CEData, missing_required_fields, unreviewed_ai_fields
from tests.ce_sample import sample


def test_the_sample_is_valid():
    CEData.model_validate(sample())


@pytest.mark.parametrize("prix", ["79.99", "450.01", "0"])
def test_jeh_price_outside_80_450_is_refused(prix):
    d = sample()
    d["budget"]["prix_jeh"] = prix
    with pytest.raises(ValidationError, match="80"):
        CEData.model_validate(d)


def test_a_phase_price_override_is_held_to_the_same_range():
    d = sample()
    d["phases"][0]["prix_jeh"] = "20"
    with pytest.raises(ValidationError):
        CEData.model_validate(d)


def test_jeh_is_indivisible():
    d = sample()
    d["phases"][0]["jeh"] = 2.5
    with pytest.raises(ValidationError):
        CEData.model_validate(d)


def test_payments_cannot_exceed_one_hundred_percent():
    d = sample()
    d["paiement"] = {"acompte_pct": "70", "intermediaire_pct": "40"}
    with pytest.raises(ValidationError, match="100"):
        CEData.model_validate(d)


def test_a_checkpoint_cannot_gate_a_phase_that_does_not_exist():
    d = sample()
    d["points_controle"][0]["requis_avant_phase"] = 9
    with pytest.raises(ValidationError, match="phase"):
        CEData.model_validate(d)


def test_at_least_one_phase_is_required():
    d = sample()
    d["phases"] = []
    with pytest.raises(ValidationError):
        CEData.model_validate(d)


def test_unreviewed_ai_text_is_reported_and_reviewed_or_manual_is_not():
    d = sample()
    d["reviews"] = {
        "contexte": {"origin": "ai", "reviewed": False},
        "cdc": {"origin": "ai", "reviewed": True},
        "existant": {"origin": "manual", "reviewed": False},
        "phases.1.description": {"origin": "ai", "reviewed": False},
    }
    assert unreviewed_ai_fields(CEData.model_validate(d)) == ["contexte", "phases.1.description"]


def test_empty_required_sections_are_listed():
    d = sample()
    d["contexte"] = "  "
    d["phases"][1]["description"] = ""
    missing = missing_required_fields(CEData.model_validate(d))
    assert "Contexte et problématique" in missing
    assert "Description de la phase 2" in missing


def test_a_complete_sample_has_nothing_missing():
    assert missing_required_fields(CEData.model_validate(sample())) == []


def test_blank_parties_are_reported_so_the_contract_has_no_holes():
    d = sample()
    d["client"]["adresse"] = ""
    d["client"]["representant"]["nom"] = "   "
    d["chef_projet"]["email"] = ""
    d["intervenants"] = []
    missing = missing_required_fields(CEData.model_validate(d))
    for expected in ("Adresse du client", "Nom du représentant du client",
                     "Email du chef de projet", "Au moins un intervenant"):
        assert expected in missing


def test_surrounding_whitespace_is_stripped():
    d = sample()
    d["client"]["societe"] = "  Acme Recyclage SAS \n"
    assert CEData.model_validate(d).client.societe == "Acme Recyclage SAS"


def test_company_name_of_only_spaces_is_refused():
    d = sample()
    d["client"]["societe"] = "   "
    with pytest.raises(ValidationError):
        CEData.model_validate(d)


def test_a_study_longer_than_a_year_is_refused():
    d = sample()
    d["points_controle"] = []
    d["phases"] = [{"nom": "A", "jeh": 5, "duree_semaines": 30}, {"nom": "B", "jeh": 5, "duree_semaines": 30}]
    with pytest.raises(ValidationError, match="52"):
        CEData.model_validate(d)


def test_missing_president_falls_back_to_the_global_one():
    d = sample()
    assert "president" not in d
    assert CEData.model_validate(d).president.nom == "Colombo"
    d["president"] = {"titre": "Monsieur", "prenom": "", "nom": "", "fonction": "", "email": ""}
    assert CEData.model_validate(d).president.prenom == "César"


def test_an_explicit_president_wins():
    d = sample()
    d["president"] = {"titre": "Madame", "prenom": "Zoé", "nom": "Martin"}
    assert CEData.model_validate(d).president.nom_complet == "Zoé Martin"


def test_intervenant_names_are_required_for_a_complete_convention():
    d = sample()
    d["intervenants"] = [{"annee": "deuxième"}]
    missing = missing_required_fields(CEData.model_validate(d))
    assert "Prénom de l'intervenant 1" in missing and "Nom de l'intervenant 1" in missing


def test_control_characters_are_removed_on_the_way_in():
    d = sample()
    d["contexte"] = "a\x0bb\x00c\r\nd​e"
    assert CEData.model_validate(d).contexte == "a\nbc\nde"


def test_old_drafts_with_frais_structure_are_still_accepted():
    d = sample()
    d["budget"]["frais_structure"] = "150"
    from app.services.ce_budget import compute
    assert compute(CEData.model_validate(d)).total_ht == compute(CEData.model_validate(sample())).total_ht


def test_unit_price_defaults_to_the_global_300_and_is_still_range_checked():
    d = sample()
    del d["budget"]["prix_jeh"]
    assert CEData.model_validate(d).budget.prix_jeh == 300


def test_globals_endpoint_payload_carries_the_usual_values():
    from app.services.ce_globals import globals_payload
    g = globals_payload()
    assert (g["prix_jeh"], g["jeh_min"], g["jeh_max"], g["taux_tva"]) == ("300", "80", "450", "20")
