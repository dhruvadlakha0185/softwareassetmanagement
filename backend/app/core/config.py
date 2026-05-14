from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── Database ──────────────────────────────────────────────────────────────
    # Local  (Supabase CLI):  postgresql+asyncpg://postgres:postgres@localhost:54322/postgres
    # Prod   (PostgreSQL):    postgresql+asyncpg://user:pass@db:5432/drl_sam
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:54322/postgres"

    # ── Auth ──────────────────────────────────────────────────────────────────
    jwt_secret: str = "local-dev-secret-change-in-prod"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7
    auth_provider: str = "jwt"  # "jwt" | "saml" — production switches to saml

    # ── Storage ───────────────────────────────────────────────────────────────
    # STORAGE_BACKEND controls which implementation is loaded at startup:
    #   "supabase" — local dev via Supabase Storage API
    #   "s3"       — production via AWS S3
    storage_backend: str = "supabase"

    # Supabase (local dev) — single API gateway URL from `supabase start`
    # Storage endpoint: {supabase_url}/storage/v1
    # Get the service key from: supabase status
    supabase_url: str = "http://localhost:54321"
    supabase_service_key: str = ""

    # AWS S3 (production)
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "ap-south-1"
    aws_s3_bucket_active: str = "drl-sam-active"
    aws_s3_bucket_archive: str = "drl-sam-archive"

    # ── AI ────────────────────────────────────────────────────────────────────
    openai_api_key: str = "dummy"


settings = Settings()
