# tests/ce_sample.py
"""Une convention complète, réutilisée par les tests de rendu et du routeur."""
import copy

SAMPLE = {
    "ref_ce": "CE-2026-014",
    "reference_etude": "Étude de faisabilité d'un procédé de recyclage des batteries",
    "date_redaction": "2026-10-12",
    "validite_mois": 3,
    "client": {
        "societe": "Acme Recyclage SAS",
        "adresse": "12 rue de la Paix",
        "code_postal": "75002",
        "ville": "Paris",
        "pays": "France",
        "siret": "123 456 789 00012",
        "representant": {
            "titre": "Madame", "prenom": "Claire", "nom": "Durand",
            "fonction": "Directrice générale", "email": "claire.durand@acme.example",
        },
        "interlocuteur": {
            "titre": "Monsieur", "prenom": "Paul", "nom": "Martin",
            "email": "paul.martin@acme.example",
        },
    },
    "chef_projet": {
        "titre": "Madame", "prenom": "Léa", "nom": "Toledano",
        "email": "lea.toledano@jump-mines.fr",
        "formation": "Étudiante en deuxième année à l'École des Mines de Paris",
        "fin_mandat": "janvier 2027",
    },
    "intervenants": [{
        "titre": "Madame", "prenom": "Camille", "nom": "Durand",
        "annee": "deuxième", "qualification": "en double diplôme avec l'ENSAE",
    }],
    "exemples": "- Étude de marché des batteries en 2024\n- Optimisation d'un procédé hydrométallurgique",
    "contexte": "Acme souhaite valoriser ses déchets de batteries.\n\nElle cherche un procédé rentable.",
    "existant": "Aujourd'hui les batteries sont broyées puis envoyées à l'étranger.",
    "resume_cdc": "Évaluer trois procédés et recommander le plus rentable.",
    "cdc": "- Revue de la littérature\n- Modèle technico-économique\n- Recommandation",
    "phases": [
        {"nom": "Cadrage", "jeh": 3, "duree_semaines": 2,
         "description": "Réunion de lancement et recueil des données."},
        {"nom": "Modélisation", "jeh": 8, "duree_semaines": 4,
         "description": "Construction du modèle technico-économique.\nValidation des hypothèses."},
        {"nom": "Restitution", "jeh": 2, "duree_semaines": 1, "debut_semaine": 7,
         "description": "Livraison du rapport et soutenance."},
    ],
    "points_controle": [
        {"nom": "Rapport intermédiaire", "format": "Word", "requis_avant_phase": 3},
        {"nom": "Rapport final", "format": "Word et PowerPoint"},
    ],
    "budget": {"prix_jeh": "120.50", "frais_mode": "reel", "taux_tva": "20"},
    "paiement": {"acompte_pct": "30", "intermediaire_pct": "0"},
    "reviews": {},
}


def sample() -> dict:
    return copy.deepcopy(SAMPLE)
