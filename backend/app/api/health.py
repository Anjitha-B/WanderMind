"""Liveness and readiness probes. No auth, no database, no outbound calls."""

from fastapi import APIRouter, HTTPException, Request

from app.core.rate_limit import limiter

router = APIRouter(tags=["health"])


@router.get("/healthz")
@limiter.exempt
def healthz() -> dict[str, str]:
    """The process is up and serving requests."""
    return {"status": "ok"}


@router.get("/readyz")
@limiter.exempt
def readyz(request: Request) -> dict[str, str]:
    """The app finished starting, which requires valid settings."""
    if getattr(request.app.state, "settings", None) is None:
        raise HTTPException(status_code=503, detail="Not ready")
    return {"status": "ok"}
