"""Lecture des anciennes conventions : documents synthétiques, jamais les vrais (ils sont confidentiels)."""
from datetime import date

import pytest

from scripts import archive_old_ces as a
from tests.test_ce_archive import FauxSupabase

MD = """# Convention d'Étude

**Valable jusqu'au :** 16 janvier 2026
**À l'attention de :** Monsieur Jean Dupont
**Référence :** 24 017_CE
**Client :** Acme Recyclage
**Projet :** 24acme

## CONTEXTE ET OBJECTIFS DE L'ÉTUDE

Acme recycle des batteries.

## DÉFINITION DE L'ÉTUDE

### Étude de l'existant
Le client fournit un tableur.

### Résumé du Cahier des Charges proposé
Un site web.

## CAHIER DES CHARGES

### Détail du Cahier des Charges proposé
Un site sobre.

Tout au long de l'étude, JuMP, par l'intermédiaire du chef de projet, veillera à la bonne coordination. JuMP contrôlera le respect des délais de réalisation par les étudiants.

## MÉTHODOLOGIE

**Phase 1 : Structuration - 2 JEH**
Architecture du site.

**Phase 2 : Mise en ligne - 1 JEH**
* Intégration des contenus.
* Mise en ligne.

Les différentes étapes proposées sont évaluées en JEH.

## BUDGET

| Phase | JEH | Prix H.T. / JEH | Total H.T. |
| :--- | :---: | :---: | :---: |
| Phase 1: Structuration | 2 | 400 | 800 |
| Phase 2: Mise en ligne | 1 | 400 | 400 |

| Désignation | Montant |
| **Total H.T. hors frais (3 JEHs)** | **1200 € HT** |
| Frais de structure | 200 € HT |
| **Total H.T.** | **1400 € HT** *(Mille quatre cents euros HT)* |
| **Total T.T.C.** | **1680 € TTC** |

## PRÉSENTATION DE L'ÉQUIPE
Louis, louis@etu.minesparis.psl.eu, (+33)7 81 79 39 80
"""


def _ce():
    return a.parse(a._nettoyer_md(MD), "md", "24acme.md")


def test_reads_the_header():
    ce = _ce()
    assert ce.ref_ce == "24017_CE"                       # l'espace du « 24 017 » disparaît
    assert ce.client == "Acme Recyclage" and ce.projet == "24acme"
    assert ce.contact == "Jean Dupont"                    # sans « Monsieur »
    assert ce.valable_jusqu_au == date(2026, 1, 16)


def test_reads_the_sections_and_drops_the_standard_paragraph():
    ce = _ce()
    assert ce.contexte == "Acme recycle des batteries."
    assert ce.existant == "Le client fournit un tableur."
    assert ce.resume_cdc == "Un site web."
    assert ce.cdc == "Un site sobre."


def test_reads_phases_with_jeh_prices_and_descriptions():
    ce = _ce()
    assert [(p["nom"], p["jeh"], p["prix_jeh"], p["total_ht"]) for p in ce.phases] == [
        ("Structuration", 2.0, 400.0, 800.0), ("Mise en ligne", 1.0, 400.0, 400.0)]
    assert ce.phases[0]["description"] == "Architecture du site."
    assert ce.phases[1]["description"] == "- Intégration des contenus.\n- Mise en ligne."


def test_reads_the_budget_and_finds_nothing_to_flag():
    ce = _ce()
    assert (ce.total_ht, ce.frais_structure, ce.total_ttc) == (1400.0, 200.0, 1680.0)
    assert ce.anomalies == []


def test_flags_what_it_cannot_read_instead_of_guessing():
    ce = a.parse("Confidentiel\nRéférence : 1_CE\n", "md", "x.md")
    assert {"client introuvable", "contexte introuvable", "budget HT introuvable", "phases introuvable"} <= set(ce.anomalies)


def test_stored_content_has_no_contact_details():
    donnees = repr(a.ce_data(_ce()))
    assert "@" not in donnees and "81 79" not in donnees


def test_reads_the_pdf_layout_with_wrapped_headings_and_numbers():
    texte = "\n".join([
        "Confidentiel", "Valable jusqu’au 10/04/22", "À l’attention de Madame Pascale RIBON",
        "Référence : 22011_CE", "Convention d’Etude", "Direction Générale de la Sécurité civile et de la",
        "gestion des crises", "22resilience", "Site web : www.jump-mines.fr",
        "CONTEXTE ET OBJECTIFS DE L’ÉTUDE ......... 4",             # sommaire : ignoré
        "CONTEXTE  ET OBJECTIFS  DE L’ ÉTUDE  ",                    # titre aux espaces doublés
        "Une première ligne du contexte qui est assez longue pour remplir la largeur de la page ici",
        "et qui continue sur la ligne suivante.",
        "Convention d’Etude– JuMP, La Junior-Entreprise de MINES Paris",   # pied de page
        "DÉFINITION DE L’ÉTUDE", "CAHIER DES CHARGES", "Détail du Cahier des Charges proposé", "Le livrable.",
        "MÉTHODOLOGIE", "Phase 1 : Collecte", "Réunir les données.", "Phase 2 : Analyse", "Analyser.",
        "BUDGET", "Phase 1", "Total phase 1 10 350€ 3 500€", "Phase 2", "Total phase 2 11 350€ 3 850€",
        "Total HT hors frais 21 JEHs 7 350€ HT", "Frais HT 0€ HT", "Total HT 7 350€ HT", "Total TTC 8 820 € TTC",
        "PRÉSENTATION DE L’ÉQUIPE",
    ])
    ce = a.parse(a._nettoyer_pdf(texte), "pdf", "x.pdf")
    assert ce.client == "Direction Générale de la Sécurité civile et de la gestion des crises"
    assert ce.projet == "22resilience"
    assert ce.contexte == "Une première ligne du contexte qui est assez longue pour remplir la largeur de la page ici et qui continue sur la ligne suivante."
    assert [(p["jeh"], p["prix_jeh"], p["total_ht"]) for p in ce.phases] == [(10.0, 350.0, 3500.0), (11.0, 350.0, 3850.0)]
    assert [p["nom"] for p in ce.phases] == ["Collecte", "Analyse"]
    assert ce.total_ht == 7350.0 and ce.anomalies == []


@pytest.mark.parametrize("texte, attendu", [
    ("1 450 450", (1, 450, 450)),                 # JEH, prix, total
    ("10 350€ 3 500€", (10, 350, 3500)),          # « 3 500 » est un seul nombre
    ("48 300 14400", (48, 300, 14400)),
    ("1 350", (1, 350, 350)),                     # JEH et total seulement
    ("200€", (None, None, 200)),
    ("", (None, None, None)),
])
def test_reads_jeh_price_total(texte, attendu):
    assert a._jeh_prix_total(texte) == attendu


def test_a_wrong_total_label_still_goes_with_its_own_phase():
    # Vrai défaut d'un document : la phase 4 est suivie d'un « Total phase 3 ».
    budget = ["Phase 3 : Test", "Total phase 3 6 450 2700", "Phase 4 : Déploiement", "Total phase 3 2 450 900"]
    phases = a._phases([], [], budget)
    assert [(p["nom"], p["jeh"], p["total_ht"]) for p in phases] == [("Test", 6.0, 2700.0), ("Déploiement", 2.0, 900.0)]


@pytest.mark.parametrize("texte, attendu", [
    ("10/04/2022", date(2022, 4, 10)), ("02/11/22", date(2022, 11, 2)),
    ("1er septembre 2025", date(2025, 9, 1)), ("16 janvier 2026", date(2026, 1, 16)),
    ("24 août 2025", date(2025, 8, 24)), ("bientôt", None),
])
def test_reads_dates(texte, attendu):
    assert a._date(texte) == attendu


def test_import_is_idempotent_and_leaves_no_contact_details():
    db = FauxSupabase()
    ce = _ce()
    assert a.enregistrer(db, ce, "u1") == "créée"
    assert a.enregistrer(db, ce, "u1") == "mise à jour"
    assert len(db.tables["missions"]) == 1 and len(db.tables["ce_documents"]) == 1
    mission, doc = db.tables["missions"][0], db.tables["ce_documents"][0]
    assert (mission["status"], mission["category"], mission["budget"]) == ("archived", "convention_etude", 1400.0)
    assert doc["mission_id"] == mission["id"] and doc["status"] == "final"


def test_contracts_that_are_not_conventions_become_plain_archived_missions():
    db = FauxSupabase()
    for _ in range(2):
        a.enregistrer_autre(db, "22armines", "u1")
    [m] = db.tables["missions"]
    assert (m["status"], m["category"]) == ("archived", "mission")
    assert db.tables["ce_documents"] == []
