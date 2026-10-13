from datetime import date
from decimal import Decimal

from app.services.ce_budget import compute, date_fr, eur_en_lettres, fmt_eur
from app.services.ce_schema import CEData
from tests.ce_sample import sample


def test_totals_match_a_hand_computed_budget():
    c = compute(CEData.model_validate(sample()))
    assert [l.total_ht for l in c.lines] == [Decimal("361.50"), Decimal("964.00"), Decimal("241.00")]
    assert c.nb_jeh == 13
    assert c.prix_ht == Decimal("1566.50")
    assert c.total_ht == c.prix_ht == sum(l.total_ht for l in c.lines)   # somme des phases, rien d'autre
    assert c.tva == Decimal("313.30")
    assert c.total_ttc == Decimal("1879.80")


def test_payment_schedule_always_sums_to_the_total():
    d = sample()
    d["budget"]["prix_jeh"] = "133.33"            # des centimes qui ne tombent pas juste
    d["paiement"] = {"acompte_pct": "33.33", "intermediaire_pct": "33.33"}
    c = compute(CEData.model_validate(d))
    assert c.acompte_ht + c.intermediaire_ht + c.reste_ht == c.total_ht
    assert c.acompte_ttc + c.intermediaire_ttc + c.reste_ttc == c.total_ttc


def test_phases_chain_unless_a_start_week_is_given():
    c = compute(CEData.model_validate(sample()))
    assert [(l.debut, l.fin) for l in c.lines] == [(1, 2), (3, 6), (7, 7)]
    assert c.semaines == 7


def test_a_phase_can_override_the_unit_price():
    d = sample()
    d["phases"][0]["prix_jeh"] = "200"
    c = compute(CEData.model_validate(d))
    assert c.lines[0].total_ht == Decimal("600.00")


def test_french_money_and_words():
    assert fmt_eur(Decimal("1234.5")) == "1 234,50"
    assert fmt_eur(Decimal("0")) == "0,00"
    assert eur_en_lettres(Decimal("1716.50")) == "Mille sept cent seize euros et cinquante centimes"
    assert eur_en_lettres(Decimal("1")) == "Un euro"
    assert eur_en_lettres(Decimal("150")) == "Cent cinquante euros"
    assert eur_en_lettres(Decimal("80.01")) == "Quatre-vingts euros et un centime"


def test_french_dates():
    assert date_fr(date(2026, 10, 12)) == "12 octobre 2026"
    assert date_fr(date(2026, 3, 1)) == "1er mars 2026"
