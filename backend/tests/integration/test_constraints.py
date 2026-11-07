"""CHECK constraints reject bad writes that bypass FastAPI entirely."""
import json
import random
import string

import pytest

from app.core.config import Settings
from app.db.trips import (
    SupabaseTripRepository,
    TripConstraintViolation,
    build_user_client,
)
from tests.integration.conftest import API_URL, trip_row

pytestmark = [pytest.mark.integration, pytest.mark.enable_socket]

CHECK_VIOLATION = "23514"


def random_text(length: int) -> str:
    return "".join(random.choices(string.ascii_letters + string.digits, k=length))


def oversized_itinerary() -> list[dict]:
    """Over 64 KiB, and random so that compression cannot shrink it below the cap."""
    return [{"day": i, "activities": [random_text(4000)]} for i in range(1, 21)]


def assert_rejected(response) -> None:
    assert response.status_code == 400, response.text
    assert response.json()["code"] == CHECK_VIOLATION


def test_oversized_itinerary_rejected_on_direct_insert(rest, user_a):
    assert len(json.dumps(oversized_itinerary())) > 65536
    row = trip_row(user_a.id, itinerary_data=oversized_itinerary())
    assert_rejected(rest.request("POST", "itineraries", user_a, json=row))


def test_compressible_oversized_itinerary_rejected_on_direct_insert(rest, user_a):
    itinerary = [{"day": i, "activities": ["x" * 4000]} for i in range(1, 21)]
    row = trip_row(user_a.id, itinerary_data=itinerary)
    assert_rejected(rest.request("POST", "itineraries", user_a, json=row))


def test_oversized_itinerary_rejected_on_direct_update(rest, user_a, a_trip):
    response = rest.request(
        "PATCH",
        "itineraries",
        user_a,
        params={"id": f"eq.{a_trip['id']}"},
        json={"itinerary_data": oversized_itinerary()},
    )
    assert_rejected(response)


@pytest.mark.parametrize(
    "overrides",
    [
        {"itinerary_data": {"not": "an array"}},
        {"itinerary_data": "a string"},
        {"itinerary_data": []},
        {"itinerary_data": [{"day": 1, "activities": []}] * 31},
        {"destination": "x" * 101},
        {"interests": ["x"] * 11},
        {"interests": {"not": "an array"}},
    ],
    ids=[
        "object",
        "string",
        "empty",
        "31_days",
        "long_destination",
        "11_interests",
        "interests_object",
    ],
)
def test_invalid_rows_rejected_on_direct_insert(rest, user_a, overrides):
    row = trip_row(user_a.id, **overrides)
    assert_rejected(rest.request("POST", "itineraries", user_a, json=row))


def test_boundary_values_are_accepted(rest, user_a):
    row = trip_row(
        user_a.id,
        destination="x" * 100,
        interests=["x"] * 10,
        itinerary_data=[{"day": 1, "activities": []}] * 30,
    )
    assert rest.request("POST", "itineraries", user_a, json=row).status_code == 201


def test_null_interests_are_accepted(rest, user_a):
    row = trip_row(user_a.id, interests=None)
    assert rest.request("POST", "itineraries", user_a, json=row).status_code == 201


@pytest.mark.parametrize(
    "column,value",
    [
        ("firstname", "x" * 101),
        ("lastname", "x" * 101),
        ("home_country", "x" * 101),
        ("preferred_currency", "x" * 11),
        ("preferences", "x" * 2001),
    ],
)
def test_profile_length_caps(rest, user_a, column, value):
    response = rest.request(
        "PATCH",
        "profiles",
        user_a,
        params={"id": f"eq.{user_a.id}"},
        json={column: value},
    )
    assert_rejected(response)


def test_repository_surfaces_constraint_failure_as_a_typed_error(user_a, anon_key):
    settings = Settings(
        _env_file=None, supabase_url=API_URL, supabase_anon_key=anon_key
    )
    repo = SupabaseTripRepository(build_user_client(settings, user_a.token))
    body = {k: v for k, v in trip_row(user_a.id).items() if k != "user_id"}
    with pytest.raises(TripConstraintViolation):
        repo.create_trip(user_a.id, {**body, "itinerary_data": oversized_itinerary()})


def test_triggers_work_with_an_empty_search_path(rest, user_a):
    """Signing up ran handle_new_user; this update runs set_current_modified_at."""
    params = {"id": f"eq.{user_a.id}"}
    created = rest.request("GET", "profiles", user_a, params=params).json()[0]
    assert (created["firstname"], created["preferred_currency"]) == ("", "USD")

    updated = rest.request("PATCH", "profiles", user_a, params=params, json={"firstname": "Ada"})
    assert updated.status_code == 200
    assert updated.json()[0]["firstname"] == "Ada"
    assert updated.json()[0]["modified_at"] > created["modified_at"]
