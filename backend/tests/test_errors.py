import json
import logging
from pathlib import Path

import pytest
from postgrest.exceptions import APIError

from app.core.logging import JsonFormatter, configure_logging, hash_user_id
from app.db.trips import TripConstraintViolation, get_trip_repository
from tests.conftest import USER_A, auth_header

LEAK = "connection to db.internal failed: password=hunter2"
TRIP_ID = "11111111-1111-4111-8111-111111111111"
APP_DIR = Path(__file__).resolve().parents[1] / "app"


class ExplodingRepository:
    def __getattr__(self, name):
        def explode(*args, **kwargs):
            raise RuntimeError(LEAK)

        return explode


@pytest.fixture
def exploding(app):
    app.dependency_overrides[get_trip_repository] = ExplodingRepository


@pytest.mark.parametrize(
    "method,path,body_name",
    [
        ("GET", "/api/v1/trips", None),
        ("POST", "/api/v1/trips", "trip"),
        ("PATCH", f"/api/v1/trips/{TRIP_ID}", "update"),
        ("DELETE", f"/api/v1/trips/{TRIP_ID}", None),
    ],
)
def test_500_never_contains_exception_text(
    client, exploding, trip_body, method, path, body_name
):
    bodies = {
        "trip": trip_body,
        "update": {"itinerary_data": trip_body["itinerary_data"]},
    }
    response = client.request(
        method, path, json=bodies.get(body_name), headers=auth_header()
    )
    assert response.status_code == 500
    payload = response.json()
    assert payload["detail"] == "Internal server error"
    assert payload["request_id"]
    assert "hunter2" not in response.text and "RuntimeError" not in response.text


def test_500_keeps_cors_headers_so_browsers_can_read_it(client, exploding):
    response = client.get(
        "/api/v1/trips",
        headers={**auth_header(), "Origin": "http://localhost:3000"},
    )
    assert response.status_code == 500
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_error_request_id_matches_header(client):
    response = client.get("/api/v1/trips")
    assert response.json()["request_id"] == response.headers["x-request-id"]


def test_client_supplied_request_id_is_ignored(client):
    response = client.get("/api/v1/trips", headers={"X-Request-ID": "forged"})
    assert response.headers["x-request-id"] != "forged"


def test_exception_details_are_logged_on_the_server(client, exploding, caplog):
    with caplog.at_level(logging.ERROR):
        client.get("/api/v1/trips", headers=auth_header())
    assert any(LEAK in str(r.exc_info[1]) for r in caplog.records if r.exc_info)


def test_database_constraint_failure_is_422_not_500(app, client, trip_body):
    class Constrained:
        def create_trip(self, *args):
            raise TripConstraintViolation

    app.dependency_overrides[get_trip_repository] = Constrained
    response = client.post("/api/v1/trips", json=trip_body, headers=auth_header())
    assert response.status_code == 422
    assert response.json()["detail"] == "Itinerary is too large to save"


def test_404_from_a_handler_is_not_swallowed_into_a_500(client):
    response = client.delete(f"/api/v1/trips/{TRIP_ID}", headers=auth_header())
    assert response.status_code == 404


def test_cors_allows_only_configured_origins(client):
    def preflight(origin):
        return client.options(
            "/api/v1/trips",
            headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
        )

    allowed = preflight("http://localhost:3000")
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:3000"
    denied = preflight("https://evil.example")
    assert "access-control-allow-origin" not in denied.headers
    assert "access-control-allow-credentials" not in allowed.headers


def test_wildcard_origin_is_refused():
    from app.core.config import Settings

    settings = Settings(_env_file=None, allowed_origins="*")
    with pytest.raises(ValueError):
        settings.allowed_origin_list


def test_log_lines_are_structured_json():
    record = logging.makeLogRecord(
        {"msg": "trip_created", "levelname": "INFO", "name": "t", "user_ref": "abc"}
    )
    entry = json.loads(JsonFormatter().format(record))
    assert entry["event"] == "trip_created"
    assert entry["user_ref"] == "abc"


def test_user_ids_are_hashed_in_logs(client, trip_body, caplog):
    with caplog.at_level(logging.INFO):
        client.post("/api/v1/trips", json=trip_body, headers=auth_header())
    records = [r for r in caplog.records if r.message == "trip_created"]
    assert records[0].user_ref == hash_user_id(USER_A)
    assert USER_A not in caplog.text
    assert trip_body["destination"] not in caplog.text


def test_httpx_request_urls_are_not_logged_at_info():
    configure_logging()
    assert logging.getLogger("httpx").level == logging.WARNING


def test_no_service_role_key_in_application_code():
    sources = [p.read_text() for p in APP_DIR.rglob("*.py")]
    assert not any("service_role" in s.lower() for s in sources)


def test_postgrest_jwt_rejection_is_401(app, client):
    from app.db.trips import _execute

    class Query:
        def execute(self):
            raise APIError({"code": "PGRST303", "message": "JWT expired"})

    class Repo:
        def list_trips(self, user_id):
            return _execute(Query())

    app.dependency_overrides[get_trip_repository] = Repo
    assert client.get("/api/v1/trips", headers=auth_header()).status_code == 401
