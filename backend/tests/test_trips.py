from tests.conftest import USER_A, USER_B, auth_header

MISSING_ID = "99999999-9999-4999-8999-999999999999"
UPDATE = {"itinerary_data": [{"day": 1, "activities": ["Changed"]}]}


def _create(client, body, user=USER_A):
    response = client.post("/api/v1/trips", json=body, headers=auth_header(user))
    assert response.status_code == 201
    return response.json()


def test_create_and_list_own_trip(client, trip_body):
    trip = _create(client, trip_body)
    response = client.get("/api/v1/trips", headers=auth_header())
    assert [t["id"] for t in response.json()["trips"]] == [trip["id"]]


def test_responses_do_not_expose_user_id(client, trip_body):
    assert "user_id" not in _create(client, trip_body)
    trips = client.get("/api/v1/trips", headers=auth_header()).json()["trips"]
    assert "user_id" not in trips[0]


def test_owner_can_update_and_delete(client, trip_body, repo):
    trip = _create(client, trip_body)
    url = f"/api/v1/trips/{trip['id']}"
    updated = client.patch(url, json=UPDATE, headers=auth_header())
    assert updated.status_code == 200
    assert updated.json()["itinerary_data"][0]["activities"] == ["Changed"]
    assert client.delete(url, headers=auth_header()).status_code == 204
    assert repo.rows == []


def test_b_list_never_contains_a_trips(client, trip_body):
    _create(client, trip_body, USER_A)
    assert client.get("/api/v1/trips", headers=auth_header(USER_B)).json() == {
        "trips": []
    }


def test_b_cannot_update_a_trip(client, trip_body, repo):
    trip = _create(client, trip_body, USER_A)
    response = client.patch(
        f"/api/v1/trips/{trip['id']}", json=UPDATE, headers=auth_header(USER_B)
    )
    assert response.status_code == 404
    assert repo.rows[0]["itinerary_data"] == trip_body["itinerary_data"]


def test_b_cannot_delete_a_trip(client, trip_body, repo):
    trip = _create(client, trip_body, USER_A)
    response = client.delete(f"/api/v1/trips/{trip['id']}", headers=auth_header(USER_B))
    assert response.status_code == 404
    assert len(repo.rows) == 1


def test_foreign_and_unknown_trips_are_indistinguishable(client, trip_body):
    trip = _create(client, trip_body, USER_A)
    foreign = client.delete(f"/api/v1/trips/{trip['id']}", headers=auth_header(USER_B))
    unknown = client.delete(f"/api/v1/trips/{MISSING_ID}", headers=auth_header(USER_B))
    assert (foreign.status_code, foreign.json()["detail"]) == (
        unknown.status_code,
        unknown.json()["detail"],
    )


def test_malformed_trip_id_is_404(client):
    headers = auth_header()
    assert client.delete("/api/v1/trips/not-a-uuid", headers=headers).status_code == 404
    response = client.patch("/api/v1/trips/not-a-uuid", json=UPDATE, headers=headers)
    assert response.status_code == 404


def test_user_id_in_create_body_is_rejected(client, trip_body, repo):
    body = {**trip_body, "user_id": USER_B}
    assert (
        client.post("/api/v1/trips", json=body, headers=auth_header()).status_code
        == 422
    )
    assert repo.rows == []


def test_user_id_in_update_body_is_rejected(client, trip_body):
    trip = _create(client, trip_body)
    response = client.patch(
        f"/api/v1/trips/{trip['id']}",
        json={**UPDATE, "user_id": USER_B},
        headers=auth_header(),
    )
    assert response.status_code == 422


def test_stored_owner_is_the_token_subject(client, trip_body, repo):
    _create(client, trip_body, USER_B)
    assert repo.rows[0]["user_id"] == USER_B


def test_openapi_documents_trip_responses(client):
    paths = client.get("/openapi.json").json()["paths"]

    def schema(path, method, status):
        content = paths[path][method]["responses"][status]["content"]
        return content["application/json"]["schema"]

    trip = {"$ref": "#/components/schemas/Trip"}
    assert schema("/api/v1/trips", "get", "200") == {
        "$ref": "#/components/schemas/TripList"
    }
    assert schema("/api/v1/trips", "post", "201") == trip
    assert schema("/api/v1/trips/{trip_id}", "patch", "200") == trip


def test_stored_rows_are_returned_as_is_even_outside_the_documented_shape(client, repo):
    # A trip saved before validation existed: the documented model would refuse it.
    legacy = {
        "id": "11111111-1111-4111-8111-111111111111",
        "user_id": USER_A,
        "destination": "Lisbon",
        "itinerary_data": [{"day": 99, "activities": ["x"], "title": "old"}],
    }
    repo.rows.append(legacy)
    response = client.get("/api/v1/trips", headers=auth_header())
    assert response.status_code == 200
    expected = {k: v for k, v in legacy.items() if k != "user_id"}
    assert response.json() == {"trips": [expected]}
