from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    frontend_url: str = "http://localhost:5173"

    # Rédaction des textes du CE : chaque membre fournit SA clé Gemini
    # (Réglages > Intelligence artificielle), il n'y a pas de clé du serveur.
    gemini_model: str = "gemini-3.5-flash"
    # Clé(s) Fernet qui chiffrent les clés des membres en base. Plusieurs,
    # séparées par une virgule : la première chiffre, toutes déchiffrent
    # (rotation). Générer : python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Vide : l'enregistrement d'une clé répond 503, rien n'est jamais stocké en clair.
    ai_keys_secret: str = ""

    # Embeddings du RAG (le LLM ci-dessus n'en fournit pas) et ancien script d'ingestion.
    voyage_api_key: str = ""
    anthropic_api_key: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
