import pytest

from app.core.config import get_settings
from app.schemas import GenerateRequest


@pytest.mark.parametrize("path", ["/healthz", "/readyz"])
def test_probe_is_ok_without_auth(client, repo, path):
    response = client.get(path)
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert repo.rows == []


@pytest.mark.parametrize("path", ["/healthz", "/readyz"])
def test_probe_is_not_rate_limited(app, client, path):
    assert all(client.get(path).status_code == 200 for _ in range(50))
    exempt = {name.rsplit(".", 1)[-1] for name in app.state.limiter._exempt_routes}
    assert {"healthz", "readyz"} <= exempt


def test_readyz_is_503_until_settings_are_loaded(app, client):
    app.state.settings = None
    response = client.get("/readyz")
    assert response.status_code == 503
    assert client.get("/healthz").status_code == 200


class TestTripCapSetting:
    @pytest.fixture(autouse=True)
    def _reload_settings(self, monkeypatch):
        monkeypatch.setenv("MAX_TRIP_DAYS", "3")
        get_settings.cache_clear()
        yield
        monkeypatch.undo()
        get_settings.cache_clear()

    def test_trip_cap_comes_from_settings(self):
        GenerateRequest(
            destination="Lisbon",
            start_date="2027-03-01",
            end_date="2027-03-03",
            interests=[],
        )
        with pytest.raises(ValueError, match="longer than 3 days"):
            GenerateRequest(
                destination="Lisbon",
                start_date="2027-03-01",
                end_date="2027-03-04",
                interests=[],
            )
