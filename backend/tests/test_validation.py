import pytest

from tests.conftest import auth_header


def day(n=1, activities=("Walk",)):
    return {"day": n, "activities": list(activities)}


INVALID_ITINERARIES = {
    "empty": [],
    "too_many_days": [day(i) for i in range(1, 32)],
    "day_zero": [day(0)],
    "day_above_30": [day(31)],
    "oversized_activity": [day(activities=["x" * 501])],
    "too_many_activities": [day(activities=["x"] * 16)],
    "day_as_string": [{"day": "1", "activities": ["x"]}],
    "activities_not_list": [{"day": 1, "activities": "x"}],
    "activity_not_string": [{"day": 1, "activities": [{"html": "<b>"}]}],
    "unknown_field": [{**day(), "secret": True}],
    "not_objects": ["free text"],
    "not_a_list": {"arbitrary": "json"},
}


@pytest.mark.parametrize("case", INVALID_ITINERARIES)
def test_invalid_itinerary_rejected_on_create(client, trip_body, repo, case):
    body = {**trip_body, "itinerary_data": INVALID_ITINERARIES[case]}
    response = client.post("/api/v1/trips", json=body, headers=auth_header())
    assert response.status_code == 422
    assert repo.rows == []


@pytest.mark.parametrize("case", INVALID_ITINERARIES)
def test_invalid_itinerary_rejected_on_update(client, trip_body, repo, case):
    trip = client.post("/api/v1/trips", json=trip_body, headers=auth_header()).json()
    response = client.patch(
        f"/api/v1/trips/{trip['id']}",
        json={"itinerary_data": INVALID_ITINERARIES[case]},
        headers=auth_header(),
    )
    assert response.status_code == 422
    assert repo.rows[0]["itinerary_data"] == trip_body["itinerary_data"]


def test_limits_are_inclusive(client, trip_body):
    itinerary = [day(i, ["x" * 500] * 15) for i in range(1, 31)]
    body = {**trip_body, "itinerary_data": itinerary}
    assert client.post("/api/v1/trips", json=body, headers=auth_header()).status_code == 201


@pytest.mark.parametrize(
    "field,value",
    [
        ("destination", ""),
        ("destination", "   "),
        ("destination", "x" * 101),
        ("interests", ["x"] * 11),
        ("interests", ["x" * 51]),
        ("start_date", "03/01/2027"),
        ("start_date", "not-a-date"),
    ],
)
@pytest.mark.parametrize(
    "path,body_fixture",
    [("/api/v1/trips", "trip_body"), ("/api/v1/itineraries/generate", "generate_body")],
)
def test_field_limits(client, request, path, body_fixture, field, value):
    body = {**request.getfixturevalue(body_fixture), field: value}
    assert client.post(path, json=body, headers=auth_header()).status_code == 422


def test_destination_is_stripped(client, trip_body):
    body = {**trip_body, "destination": "  Porto  "}
    response = client.post("/api/v1/trips", json=body, headers=auth_header())
    assert response.json()["destination"] == "Porto"


def test_trip_over_14_days_rejected_on_generate(client, generate_body):
    body = {**generate_body, "start_date": "2027-03-01", "end_date": "2027-03-15"}
    response = client.post(
        "/api/v1/itineraries/generate", json=body, headers=auth_header()
    )
    assert response.status_code == 422


def test_end_before_start_rejected_on_generate(client, generate_body):
    body = {**generate_body, "start_date": "2027-03-05", "end_date": "2027-03-04"}
    response = client.post(
        "/api/v1/itineraries/generate", json=body, headers=auth_header()
    )
    assert response.status_code == 422


def test_trip_over_14_days_rejected_on_create(client, trip_body):
    body = {**trip_body, "start_date": "2027-03-01", "end_date": "2027-03-15"}
    assert client.post("/api/v1/trips", json=body, headers=auth_header()).status_code == 422


def test_validation_errors_do_not_echo_input(client, trip_body):
    body = {**trip_body, "destination": "S3NSITIVE" * 50}
    response = client.post("/api/v1/trips", json=body, headers=auth_header())
    assert response.status_code == 422
    assert "S3NSITIVE" not in response.text
