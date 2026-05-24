# scripts/seed_references.py
"""
Seed references_library with JuMP's standard past-reference bullets.
Idempotent — safe to re-run. From the backend/ directory:
    python -m scripts.seed_references
"""
from supabase import create_client
from app.config import settings
from app.services.embedding import embed_texts

REFERENCES: list[tuple[str, str]] = [
    # (bullet text, domain)
    ("Traduction d'un manuel de qualité anglais-français pour un cabinet de conseil", "Traduction"),
    ("Traduction d'articles scientifiques du russe vers le français", "Traduction"),
    ("Traduction français-anglais d'un module de formation aux éléments finis", "Traduction"),
    (
        "Réalisation d'une base de données pour l'optimisation de la gestion client "
        "pour un grand groupe français dans le domaine de l'énergie",
        "Bases de données",
    ),
    ("Analyse des fondamentaux du marché des granulats ensachés pour un grand groupe du bâtiment", "Stratégie"),
    ("Business Plan de rachat d'une société dans le domaine gazier", "Stratégie"),
    (
        "Analyse stratégique de la mise en concurrence des concessions hydroélectriques "
        "pour un grand groupe dans le domaine de l'énergie",
        "Stratégie",
    ),
    ("Analyse pour la due-diligence d'une entreprise technique", "Stratégie"),
    ("Définition de nouvelles règles de gestion des stocks pour une entreprise de vente en ligne", "Ingénierie"),
    (
        "Développement d'un outil pour l'optimisation de la gestion du personnel "
        "pour une enseigne de la grande distribution",
        "Ingénierie",
    ),
    ("Développement d'un logiciel de gestion des stocks et flux de produits", "Ingénierie"),
    ("Étude thermique dynamique d'un bâtiment", "Ingénierie"),
    ("Étude énergétique et réhabilitation d'une maison de retraite en EHPAD", "Ingénierie"),
    ("Programmation en langage Java d'un logiciel de sous-titrage", "Informatique"),
    ("Réalisation d'une application permettant la modification d'images", "Informatique"),
    ("Réalisation d'une brique logicielle en langage Java", "Informatique"),
    ("Réalisation du site web d'une entreprise de développement graphique", "Informatique"),
    (
        "Analyse des solutions techniques et création d'un nouveau site "
        "pour une entreprise de l'industrie électrotechnique",
        "Informatique",
    ),
    ("Refonte du site web d'une société dans le domaine de la santé", "Informatique"),
]


def main() -> None:
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)

    # Clear existing rows so re-running is idempotent
    del_resp = supabase.table("references_library").delete().neq(
        "id", "00000000-0000-0000-0000-000000000000"
    ).execute()
    if not del_resp.data and hasattr(del_resp, "error") and del_resp.error:
        raise RuntimeError(f"Delete failed: {del_resp.error}")

    texts = [r[0] for r in REFERENCES]
    embeddings = embed_texts(texts)

    if len(embeddings) != len(REFERENCES):
        raise RuntimeError(f"Expected {len(REFERENCES)} embeddings, got {len(embeddings)}")

    rows = [
        {"text": text, "domain": domain, "embedding": embedding}
        for (text, domain), embedding in zip(REFERENCES, embeddings)
    ]
    ins_resp = supabase.table("references_library").insert(rows).execute()
    if not ins_resp.data:
        raise RuntimeError(f"Insert failed: {ins_resp}")
    print(f"Seeded {len(ins_resp.data)} references into references_library.")


if __name__ == "__main__":
    main()
