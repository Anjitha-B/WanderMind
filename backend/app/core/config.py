"""Application settings. Missing required values fail at startup, not at first use."""
import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]

MAX_TRIP_DAYS = 14
MAX_ITINERARY_DAYS = 30
MAX_ACTIVITIES_PER_DAY = 15
MAX_ACTIVITY_LENGTH = 500
MAX_DESTINATION_LENGTH = 100
MAX_INTERESTS = 10
MAX_INTEREST_LENGTH = 50


class Settings(BaseSettings):
    # Unknown variables are ignored so that an old .env entry cannot block startup.
    model_config = SettingsConfigDict(extra="ignore")

    gemini_api_key: str = Field(min_length=1)
    tavily_api_key: str = Field(min_length=1)
    supabase_url: str = Field(min_length=1)
    supabase_anon_key: str = Field(min_length=1)

    allowed_origins: str = "http://localhost:3000"

    gemini_model: str = "gemini-3.6-flash"
    gemini_timeout_ms: int = 30_000
    gemini_max_remote_calls: int = 3
    tavily_timeout_seconds: float = 15

    generate_rate_limit: str = "5/minute;30/day"

    jwks_cache_seconds: int = 600
    jwks_timeout_seconds: float = 5

    @property
    def supabase_base_url(self) -> str:
        return self.supabase_url.rstrip("/")

    @property
    def jwks_url(self) -> str:
        return f"{self.supabase_base_url}/auth/v1/.well-known/jwks.json"

    @property
    def jwt_issuer(self) -> str:
        return f"{self.supabase_base_url}/auth/v1"

    @property
    def allowed_origin_list(self) -> list[str]:
        origins = [o.strip() for o in self.allowed_origins.split(",") if o.strip()]
        if "*" in origins:
            raise ValueError("ALLOWED_ORIGINS must list explicit origins, not a wildcard")
        return origins


@lru_cache
def get_settings() -> Settings:
    env_file = os.environ.get("WANDERMIND_ENV_FILE", str(BACKEND_DIR / ".env"))
    return Settings(_env_file=env_file, _env_file_encoding="utf-8")
