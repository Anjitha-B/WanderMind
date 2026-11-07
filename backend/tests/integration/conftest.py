"""Integration fixtures. Needs `npx supabase start`; see the README."""
import os
import uuid
from dataclasses import dataclass

import httpx
import pytest

API_URL = os.environ.get("SUPABASE_TEST_API_URL", "http://127.0.0.1:54321")
ANON_KEY = os.environ.get("SUPABASE_TEST_ANON_KEY", "")


@dataclass
class TestUser:
    id: str
    token: str
    __test__ = False


@pytest.fixture(scope="session")
def anon_key() -> str:
    if not ANON_KEY:
        pytest.fail("Set SUPABASE_TEST_ANON_KEY (see the README)")
    return ANON_KEY


def _sign_up(anon_key: str) -> TestUser:
    response = httpx.post(
        f"{API_URL}/auth/v1/signup",
        headers={"apikey": anon_key},
        json={"email": f"it-{uuid.uuid4()}@example.com", "password": uuid.uuid4().hex},
    )
    response.raise_for_status()
    body = response.json()
    return TestUser(id=body["user"]["id"], token=body["access_token"])


@pytest.fixture
def user_a(anon_key) -> TestUser:
    return _sign_up(anon_key)


@pytest.fixture
def user_b(anon_key) -> TestUser:
    return _sign_up(anon_key)


class Rest:
    """Raw PostgREST calls: no repository, no API layer, no user_id filter."""

    def __init__(self, anon_key: str) -> None:
        self.anon_key = anon_key

    def _headers(self, user: TestUser | None, returning: str) -> dict[str, str]:
        token = user.token if user else self.anon_key
        return {
            "apikey": self.anon_key,
            "Authorization": f"Bearer {token}",
            "Prefer": f"return={returning}",
        }

    def request(
        self, method, table, user, *, params=None, json=None, returning="representation"
    ) -> httpx.Response:
        return httpx.request(
            method,
            f"{API_URL}/rest/v1/{table}",
            headers=self._headers(user, returning),
            params=params,
            json=json,
        )


@pytest.fixture
def rest(anon_key) -> Rest:
    return Rest(anon_key)


def trip_row(user_id: str, **overrides) -> dict:
    return {
        "user_id": user_id,
        "destination": "Lisbon",
        "start_date": "2027-03-01",
        "end_date": "2027-03-02",
        "interests": ["food"],
        "itinerary_data": [{"day": 1, "activities": ["Tram 28"]}],
        **overrides,
    }


@pytest.fixture
def a_trip(rest, user_a) -> dict:
    response = rest.request("POST", "itineraries", user_a, json=trip_row(user_a.id))
    assert response.status_code == 201, response.text
    return response.json()[0]
