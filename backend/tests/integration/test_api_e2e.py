"""The whole chain with nothing stubbed: JWKS, verifier, FastAPI, PostgREST, RLS.

The local stack signs ES256 tokens like the live project, so the production
verifier runs unchanged against the stack's own JWKS endpoint.
"""
import random
import string

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from tests.integration.conftest import API_URL

pytestmark = [pytest.mark.integration, pytest.mark.enable_socket]

TRIPS = "/api/v1/trips"


@pytest.fixture
def api(anon_key):
    settings = Settings(
        _env_file=None,
        gemini_api_key="unused",
        tavily_api_key="unused",
        supabase_url=API_URL,
        supabase_anon_key=anon_key,
    )
    return TestClient(create_app(settings), raise_server_exceptions=False)


def bearer(user):
    return {"Authorization": f"Bearer {user.token}"}


@pytest.fixture
def body():
    return {
        "destination": "Lisbon",
        "start_date": "2027-03-01",
        "end_date": "2027-03-02",
        "interests": ["food"],
        "itinerary_data": [{"day": 1, "activities": ["Tram 28"]}],
    }


def test_full_trip_lifecycle(api, user_a, body):
    created = api.post(TRIPS, json=body, headers=bearer(user_a))
    assert created.status_code == 201
    trip_id = created.json()["id"]

    assert [t["id"] for t in api.get(TRIPS, headers=bearer(user_a)).json()["trips"]] == [
        trip_id
    ]

    updated = api.patch(
        f"{TRIPS}/{trip_id}",
        json={"itinerary_data": [{"day": 1, "activities": ["Changed"]}]},
        headers=bearer(user_a),
    )
    assert updated.json()["itinerary_data"][0]["activities"] == ["Changed"]
    assert api.delete(f"{TRIPS}/{trip_id}", headers=bearer(user_a)).status_code == 204
    assert api.get(TRIPS, headers=bearer(user_a)).json() == {"trips": []}


def test_other_user_gets_404_for_everything(api, user_a, user_b, body):
    trip_id = api.post(TRIPS, json=body, headers=bearer(user_a)).json()["id"]
    url = f"{TRIPS}/{trip_id}"
    update = {"itinerary_data": body["itinerary_data"]}

    assert api.get(TRIPS, headers=bearer(user_b)).json() == {"trips": []}
    assert api.patch(url, json=update, headers=bearer(user_b)).status_code == 404
    assert api.delete(url, headers=bearer(user_b)).status_code == 404
    assert len(api.get(TRIPS, headers=bearer(user_a)).json()["trips"]) == 1


def test_real_token_is_needed(api):
    assert api.get(TRIPS).status_code == 401
    assert api.get(TRIPS, headers={"Authorization": "Bearer junk"}).status_code == 401


def test_itinerary_within_api_limits_but_over_db_cap_is_422(api, user_a, body):
    text = "".join(random.choices(string.ascii_letters, k=500))
    itinerary = [{"day": i, "activities": [text] * 15} for i in range(1, 31)]
    response = api.post(
        TRIPS, json={**body, "itinerary_data": itinerary}, headers=bearer(user_a)
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "Itinerary is too large to save"
