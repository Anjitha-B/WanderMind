"""SupabaseTripRepository against a mocked transport: the real client, no network."""
import json

import httpx
import pytest

from app.core.config import get_settings
from app.db.trips import (
    SupabaseTripRepository,
    TripConstraintViolation,
    build_user_client,
)
from tests.conftest import USER_A

TRIP = "11111111-1111-4111-8111-111111111111"


@pytest.fixture
def transport():
    state = {"requests": [], "status": 200, "body": []}

    def handler(request: httpx.Request) -> httpx.Response:
        state["requests"].append(request)
        return httpx.Response(state["status"], json=state["body"])

    state["handler"] = handler
    return state


@pytest.fixture
def repository(transport):
    client = build_user_client(get_settings(), "user.jwt.token")
    client.postgrest.session._transport = httpx.MockTransport(transport["handler"])
    return SupabaseTripRepository(client)


def test_requests_run_as_the_user_with_the_anon_key(repository, transport):
    repository.list_trips(USER_A)
    request = transport["requests"][0]
    assert request.headers["authorization"] == "Bearer user.jwt.token"
    assert request.headers["apikey"] == "test-anon-key"


def test_two_clients_never_share_a_token():
    settings = get_settings()
    first = build_user_client(settings, "token-a")
    second = build_user_client(settings, "token-b")
    assert first.postgrest.session.headers["authorization"] == "Bearer token-a"
    assert second.postgrest.session.headers["authorization"] == "Bearer token-b"


def test_list_filters_by_user(repository, transport):
    repository.list_trips(USER_A)
    query = transport["requests"][0].url.params
    assert query["user_id"] == f"eq.{USER_A}"
    assert "user_id" not in query["select"]


def test_update_filters_by_id_and_user(repository, transport):
    assert repository.update_trip(USER_A, TRIP, []) is None
    query = transport["requests"][0].url.params
    assert (query["id"], query["user_id"]) == (f"eq.{TRIP}", f"eq.{USER_A}")


def test_delete_filters_by_id_and_user(repository, transport):
    assert repository.delete_trip(USER_A, TRIP) is False
    query = transport["requests"][0].url.params
    assert (query["id"], query["user_id"]) == (f"eq.{TRIP}", f"eq.{USER_A}")


def test_create_sets_owner_and_strips_it_from_the_result(repository, transport):
    transport["status"] = 201
    transport["body"] = [{"id": TRIP, "user_id": USER_A, "destination": "Lisbon"}]
    trip = repository.create_trip(USER_A, {"destination": "Lisbon"})
    assert json.loads(transport["requests"][0].content)["user_id"] == USER_A
    assert trip == {"id": TRIP, "destination": "Lisbon"}


def test_check_violation_becomes_a_typed_error(repository, transport):
    transport["status"] = 400
    transport["body"] = {
        "code": "23514",
        "message": "violates check",
        "details": None,
        "hint": None,
    }
    with pytest.raises(TripConstraintViolation):
        repository.create_trip(USER_A, {"destination": "x"})
