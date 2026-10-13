from app.services.ce_anonymize import Masque


def test_company_and_contacts_become_tokens_and_come_back():
    m = Masque("Acme Recyclage SAS", ["Claire Durand"])
    notes = "Réunion avec Claire Durand (DG d'Acme Recyclage SAS). Mme Durand veut aller vite."
    masque = m.masquer(notes)
    assert "Acme" not in masque and "Durand" not in masque
    assert "[CLIENT]" in masque and "[CONTACT_1]" in masque and "[NOM_1]" in masque
    # Le nom de société revient sans sa forme juridique, qui alourdirait la prose.
    assert m.restaurer(masque) == (
        "Réunion avec Claire Durand (DG d'Acme Recyclage). Mme Durand veut aller vite.")


def test_longest_name_is_replaced_first():
    m = Masque("Acme", ["Claire Durand"])
    assert m.masquer("Claire Durand puis Durand") == "[CONTACT_1] puis [NOM_1]"


def test_matching_is_case_insensitive_and_whole_word_only():
    m = Masque("Acme")
    assert m.masquer("ACME et acme mais pas Acmeville") == "[CLIENT] et [CLIENT] mais pas Acmeville"


def test_contact_details_are_removed_for_good():
    m = Masque("Acme")
    out = m.masquer("claire@acme.fr, 06 12 34 56 78, +33 6 12 34 56 78, SIRET 123 456 789 00012")
    assert "@" not in out and "12 34" not in out and "00012" not in out
    assert "[EMAIL]" in out and "[TEL]" in out and "[SIRET]" in out
    assert "claire" not in m.restaurer(out)


def test_years_and_budgets_are_not_taken_for_phone_numbers():
    out = Masque("Acme").masquer("De 2026 2027 2028, budget 12 500 € et 3 JEH")
    assert out == "De 2026 2027 2028, budget 12 500 € et 3 JEH"


def test_no_company_masks_nothing_but_contact_details():
    assert Masque().masquer("Acme appelle") == "Acme appelle"


def test_leftover_tokens_are_reported():
    assert Masque.jetons_restants("voir [CONTACT_2] et [CLIENT]") == ["[CLIENT]", "[CONTACT_2]"]
