import os
import time
import uuid
from typing import Any

# Must run before app imports: placeholder config, and the real .env is never read.
os.environ["WANDERMIND_ENV_FILE"] = os.devnull
os.environ.update(
    GEMINI_API_KEY="test-gemini-key",
    TAVILY_API_KEY="test-tavily-key",
    SUPABASE_URL="https://test-project.supabase.co",
    SUPABASE_ANON_KEY="test-anon-key",
    ALLOWED_ORIGINS="http://localhost:3000",
    GENERATE_RATE_LIMIT="5/minute;30/day",
)

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from jwt import PyJWKClient
from jwt.algorithms import ECAlgorithm

from app.core.auth import JwksTokenVerifier
from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.db.trips import get_trip_repository
from app.main import create_app

USER_A = "aaaaaaaa-0000-4000-8000-00000000000a"
USER_B = "bbbbbbbb-0000-4000-8000-00000000000b"
TEST_KID = "test-key"
ISSUER = "https://test-project.supabase.co/auth/v1"

PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())
OTHER_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())


def _jwks() -> dict[str, Any]:
    key = ECAlgorithm.to_jwk(PRIVATE_KEY.public_key(), as_dict=True)
    return {"keys": [{**key, "kid": TEST_KID, "alg": "ES256", "use": "sig"}]}


class StaticJwksClient(PyJWKClient):
    """The real client with its HTTP fetch replaced, so key selection stays real."""

    def fetch_data(self) -> dict[str, Any]:
        return _jwks()


def make_token(
    sub: str | None = USER_A,
    *,
    key=PRIVATE_KEY,
    algorithm: str = "ES256",
    kid: str = TEST_KID,
    **overrides: Any,
) -> str:
    claims = {
        "sub": sub,
        "aud": "authenticated",
        "iss": ISSUER,
        "exp": int(time.time()) + 3600,
        "role": "authenticated",
        **overrides,
    }
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key, algorithm=algorithm, headers={"kid": kid})


def auth_header(sub: str = USER_A) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(sub)}"}


class FakeTripRepository:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []

    @staticmethod
    def _public(row: dict[str, Any]) -> dict[str, Any]:
        return {k: v for k, v in row.items() if k != "user_id"}

    def list_trips(self, user_id: str) -> list[dict[str, Any]]:
        return [self._public(r) for r in self.rows if r["user_id"] == user_id]

    def create_trip(self, user_id: str, trip: dict[str, Any]) -> dict[str, Any]:
        row = {**trip, "id": str(uuid.uuid4()), "user_id": user_id}
        self.rows.append(row)
        return self._public(row)

    def _find(self, user_id: str, trip_id: str) -> dict[str, Any] | None:
        return next(
            (r for r in self.rows if r["id"] == trip_id and r["user_id"] == user_id),
            None,
        )

    def update_trip(self, user_id, trip_id, itinerary_data):
        row = self._find(user_id, trip_id)
        if row is None:
            return None
        row["itinerary_data"] = itinerary_data
        return self._public(row)

    def delete_trip(self, user_id: str, trip_id: str) -> bool:
        row = self._find(user_id, trip_id)
        if row is None:
            return False
        self.rows.remove(row)
        return True


@pytest.fixture
def repo() -> FakeTripRepository:
    return FakeTripRepository()


@pytest.fixture
def app(repo):
    application = create_app(get_settings())
    application.state.token_verifier = JwksTokenVerifier(
        StaticJwksClient("https://jwks.invalid/keys", cache_keys=True), issuer=ISSUER
    )
    application.dependency_overrides[get_trip_repository] = lambda: repo
    limiter.reset()
    return application


@pytest.fixture
def client(app):
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def trip_body() -> dict[str, Any]:
    return {
        "destination": "Lisbon",
        "start_date": "2027-03-01",
        "end_date": "2027-03-03",
        "interests": ["food"],
        "itinerary_data": [{"day": 1, "activities": ["Tram 28"]}],
    }


@pytest.fixture
def generate_body() -> dict[str, Any]:
    return {
        "destination": "Lisbon",
        "start_date": "2027-03-01",
        "end_date": "2027-03-03",
        "interests": ["food"],
    }
