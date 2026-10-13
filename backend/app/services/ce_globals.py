# app/services/ce_globals.py
"""Variables globales de JuMP : valeurs communes à toutes les conventions.

Un seul endroit à modifier quand le bureau change. Le serveur s'en sert
quand le formulaire ne fournit rien (le président n'est jamais saisi à la
main), et l'interface les lit via GET /api/ce/globals pour préremplir les
champs qui ont une valeur d'usage (prix du JEH, TVA, validité, acompte) :
le rédacteur les voit déjà écrites et peut les modifier si une convention
diffère.
"""
from __future__ import annotations

PRESIDENT = {
    "titre": "Monsieur",
    "prenom": "César",
    "nom": "Colombo",
    "fonction": "Président",
    "email": "cesar.colombo@jump-mines.fr",
}

# Un JEH facturé au client vaut entre ces bornes (€ HT) : règle de la Junior.
JEH_MIN = "80"
JEH_MAX = "450"

DEFAUTS = {
    "prix_jeh": "300",
    "validite_mois": 3,
    "taux_tva": "20",
    "acompte_pct": "30",
    "pays": "France",
}


def globals_payload() -> dict:
    return {"president": dict(PRESIDENT), **DEFAUTS, "jeh_min": JEH_MIN, "jeh_max": JEH_MAX}
