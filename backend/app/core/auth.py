"""Supabase JWT verification.

This project signs tokens with an asymmetric ES256 key published at
`/auth/v1/.well-known/jwks.json`, so tokens are verified locally against the
public key. The accepted algorithm is fixed here and never read from the token.
"""
import logging
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

import jwt
from fastapi import HTTPException, Request
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError, PyJWTError

from app.core.config import Settings

logger = logging.getLogger(__name__)

ALLOWED_ALGORITHMS = ("ES256",)
AUDIENCE = "authenticated"


@dataclass(frozen=True)
class CurrentUser:
    id: str
    token: str

    def __repr__(self) -> str:  # never let the token reach a log or traceback
        return f"CurrentUser(id={self.id!r})"


class InvalidToken(Exception):
    pass


class VerifierUnavailable(Exception):
    pass


class TokenVerifier(Protocol):
    def verify(self, token: str) -> str:
        """Return the verified user id, or raise InvalidToken."""


class JwksTokenVerifier:
    def __init__(self, jwks_client: PyJWKClient, issuer: str) -> None:
        self._jwks_client = jwks_client
        self._issuer = issuer

    def verify(self, token: str) -> str:
        try:
            # Checked before any key lookup so that forged headers cannot trigger
            # JWKS refetches and `none`/HS256 tokens are refused outright.
            if jwt.get_unverified_header(token).get("alg") not in ALLOWED_ALGORITHMS:
                raise InvalidToken
            signing_key = self._jwks_client.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=list(ALLOWED_ALGORITHMS),
                audience=AUDIENCE,
                issuer=self._issuer,
                options={"require": ["exp", "sub", "aud", "iss"]},
            )
            return str(UUID(claims["sub"]))
        except PyJWKClientConnectionError as exc:
            raise VerifierUnavailable from exc
        except (PyJWTError, ValueError, TypeError) as exc:
            raise InvalidToken from exc


def build_token_verifier(settings: Settings) -> TokenVerifier:
    client = PyJWKClient(
        settings.jwks_url,
        cache_keys=True,
        cache_jwk_set=True,
        lifespan=settings.jwks_cache_seconds,
        timeout=settings.jwks_timeout_seconds,
    )
    return JwksTokenVerifier(client, issuer=settings.jwt_issuer)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="Invalid or missing access token",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(request: Request) -> CurrentUser:
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise _unauthorized()

    try:
        user_id = request.app.state.token_verifier.verify(token)
    except InvalidToken:
        raise _unauthorized() from None
    except VerifierUnavailable:
        # A 401 here would sign every user out during a brief JWKS outage.
        logger.exception("jwks_unavailable")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable") from None

    request.state.user_id = user_id  # read by the rate limiter
    return CurrentUser(id=user_id, token=token)
