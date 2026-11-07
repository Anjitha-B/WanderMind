"""Every token here goes through the real verifier. get_current_user is not stubbed."""
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.exceptions import PyJWKClientConnectionError

from app.core.auth import CurrentUser, JwksTokenVerifier
from app.core.config import get_settings
from tests.conftest import (
    ISSUER,
    OTHER_PRIVATE_KEY,
    TEST_KID,
    StaticJwksClient,
    make_token,
)

TRIP_ID = "11111111-1111-4111-8111-111111111111"
ENDPOINTS = [
    ("GET", "/api/v1/trips"),
    ("POST", "/api/v1/trips"),
    ("PATCH", f"/api/v1/trips/{TRIP_ID}"),
    ("DELETE", f"/api/v1/trips/{TRIP_ID}"),
    ("POST", "/api/v1/itineraries/generate"),
]


def _bad_headers():
    expired = make_token(exp=int(time.time()) - 60)
    rsa_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return {
        "missing": {},
        "malformed": {"Authorization": "Bearer not-a-jwt"},
        "empty_bearer": {"Authorization": "Bearer "},
        "wrong_scheme": {"Authorization": f"Basic {make_token()}"},
        "expired": {"Authorization": f"Bearer {expired}"},
        "wrong_audience": {"Authorization": f"Bearer {make_token(aud='anon')}"},
        "wrong_issuer": {
            "Authorization": f"Bearer {make_token(iss='https://evil.example/auth/v1')}"
        },
        "wrong_signature": {"Authorization": f"Bearer {make_token(key=OTHER_PRIVATE_KEY)}"},
        "unknown_kid": {
            "Authorization": f"Bearer {make_token(key=OTHER_PRIVATE_KEY, kid='other')}"
        },
        "no_exp": {"Authorization": f"Bearer {make_token(exp=None)}"},
        "no_sub": {"Authorization": f"Bearer {make_token(sub=None)}"},
        "non_uuid_sub": {"Authorization": f"Bearer {make_token(sub='admin')}"},
        "alg_none": {
            "Authorization": "Bearer "
            + jwt.encode(
                {"sub": "x", "aud": "authenticated", "iss": ISSUER, "exp": 9999999999},
                None,
                algorithm="none",
            )
        },
        "wrong_alg_rs256": {
            "Authorization": "Bearer "
            + make_token(key=rsa_key, algorithm="RS256", kid=TEST_KID)
        },
        "hs256_signed_with_anon_key": {
            "Authorization": "Bearer "
            + make_token(
                key="test-anon-key-padded-to-a-valid-hmac-length-000",
                algorithm="HS256",
                kid=TEST_KID,
            )
        },
    }


BAD_HEADERS = _bad_headers()


@pytest.mark.parametrize("method,path", ENDPOINTS)
@pytest.mark.parametrize("case", BAD_HEADERS)
def test_bad_credentials_get_401_on_every_endpoint(client, method, path, case):
    response = client.request(method, path, headers=BAD_HEADERS[case], json={})
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or missing access token"


def test_valid_token_is_accepted(client):
    headers = {"Authorization": f"Bearer {make_token()}"}
    assert client.get("/api/v1/trips", headers=headers).status_code == 200


def test_bearer_scheme_is_case_insensitive(client):
    headers = {"Authorization": f"bearer {make_token()}"}
    assert client.get("/api/v1/trips", headers=headers).status_code == 200


def test_old_routes_are_gone(client):
    for method, path in [
        ("POST", "/generate-itinerary"),
        ("POST", "/save-itinerary"),
        ("GET", "/get-trips/x"),
        ("PUT", "/update-itinerary/x"),
        ("DELETE", "/delete-itinerary/x/y"),
    ]:
        assert client.request(method, path).status_code == 404


def test_verifier_returns_the_subject_of_a_valid_token():
    verifier = JwksTokenVerifier(StaticJwksClient("https://jwks.invalid"), issuer=ISSUER)
    assert verifier.verify(make_token()) == "aaaaaaaa-0000-4000-8000-00000000000a"


def test_jwks_outage_is_503_not_401(app, client):
    class DownJwksClient(StaticJwksClient):
        def fetch_data(self):
            raise PyJWKClientConnectionError("connection refused to internal-host")

    app.state.token_verifier = JwksTokenVerifier(
        DownJwksClient("https://jwks.invalid"), issuer=ISSUER
    )
    response = client.get(
        "/api/v1/trips", headers={"Authorization": f"Bearer {make_token()}"}
    )
    assert response.status_code == 503
    assert "internal-host" not in response.text


def test_token_never_appears_in_repr():
    assert "s3cret" not in repr(CurrentUser(id="u", token="s3cret"))


def test_jwks_settings_point_at_the_project():
    settings = get_settings()
    assert settings.jwks_url == f"{ISSUER}/.well-known/jwks.json"
    assert settings.jwt_issuer == ISSUER
