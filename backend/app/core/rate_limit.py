"""Per-user rate limits. In-memory, so counters are per process (see README)."""
from fastapi import Request
from slowapi import Limiter

from app.core.config import get_settings


def user_key(request: Request) -> str:
    # Set by get_current_user, which FastAPI resolves before the route wrapper runs.
    return request.state.user_id


limiter = Limiter(key_func=user_key, storage_uri="memory://")


def generate_limit() -> str:
    return get_settings().generate_rate_limit
