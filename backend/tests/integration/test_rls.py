"""RLS alone must stop cross-user access. These calls carry no user_id filter."""
import pytest

from app.core.config import Settings
from app.db.trips import SupabaseTripRepository, build_user_client
from tests.integration.conftest import API_URL, trip_row

pytestmark = [pytest.mark.integration, pytest.mark.enable_socket]


def by_id(trip):
    return {"id": f"eq.{trip['id']}"}


def stored(rest, user, trip):
    return rest.request("GET", "itineraries", user, params=by_id(trip)).json()


def test_owner_sees_own_trip(rest, user_a, a_trip):
    assert stored(rest, user_a, a_trip)[0]["id"] == a_trip["id"]


def test_b_reads_nothing_of_a(rest, user_a, user_b, a_trip):
    response = rest.request("GET", "itineraries", user_b)
    assert response.status_code == 200
    assert a_trip["id"] not in [row["id"] for row in response.json()]


def test_unauthenticated_reads_nothing(rest, a_trip):
    response = rest.request("GET", "itineraries", None)
    assert [r for r in response.json() if r["id"] == a_trip["id"]] == []


def test_b_cannot_update_a(rest, user_a, user_b, a_trip):
    response = rest.request(
        "PATCH",
        "itineraries",
        user_b,
        params=by_id(a_trip),
        json={"destination": "Hijacked"},
    )
    assert response.json() == []
    assert stored(rest, user_a, a_trip)[0]["destination"] == "Lisbon"


def test_b_cannot_delete_a(rest, user_a, user_b, a_trip):
    response = rest.request("DELETE", "itineraries", user_b, params=by_id(a_trip))
    assert response.json() == []
    assert len(stored(rest, user_a, a_trip)) == 1


# Uses return=minimal. With return=representation, PostgREST reads the row back and
# the USING clause refuses that read, so the 403 would appear even without WITH CHECK.
def test_with_check_blocks_inserting_as_someone_else(rest, user_a, user_b):
    response = rest.request(
        "POST", "itineraries", user_b, json=trip_row(user_a.id), returning="minimal"
    )
    assert response.status_code == 403
    assert response.json()["code"] == "42501"


def test_owner_cannot_give_a_trip_to_another_user(rest, user_a, user_b, a_trip):
    response = rest.request(
        "PATCH",
        "itineraries",
        user_a,
        params=by_id(a_trip),
        json={"user_id": user_b.id},
        returning="minimal",
    )
    assert response.status_code == 403
    assert stored(rest, user_a, a_trip)[0]["user_id"] == user_a.id


def test_b_cannot_read_or_change_a_profile(rest, user_a, user_b):
    params = {"id": f"eq.{user_a.id}"}
    assert rest.request("GET", "profiles", user_b, params=params).json() == []
    response = rest.request(
        "PATCH", "profiles", user_b, params=params, json={"firstname": "Hijacked"}
    )
    assert response.json() == []


def test_repository_works_with_a_real_user_token(user_a, user_b, anon_key):
    """The per-request client, end to end, with RLS doing the isolation."""
    settings = Settings(
        _env_file=None, supabase_url=API_URL, supabase_anon_key=anon_key
    )
    repo_a = SupabaseTripRepository(build_user_client(settings, user_a.token))
    repo_b = SupabaseTripRepository(build_user_client(settings, user_b.token))
    body = {k: v for k, v in trip_row(user_a.id).items() if k != "user_id"}

    trip = repo_a.create_trip(user_a.id, body)

    assert [t["id"] for t in repo_a.list_trips(user_a.id)] == [trip["id"]]
    # Passing A's id with B's token: the filter matches, so only RLS can refuse this.
    assert repo_b.list_trips(user_a.id) == []
    assert repo_b.update_trip(user_a.id, trip["id"], []) is None
    assert repo_b.delete_trip(user_a.id, trip["id"]) is False
    assert repo_a.delete_trip(user_a.id, trip["id"]) is True
