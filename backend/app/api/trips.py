import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.encoders import jsonable_encoder

from app.core.auth import AuthenticatedUser
from app.core.logging import hash_user_id
from app.db.trips import TripConstraintError, Trips
from app.schemas import TripCreate, TripUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/trips", tags=["trips"])


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Trip not found")


def _too_large() -> HTTPException:
    return HTTPException(status_code=422, detail="Itinerary is too large to save")


def _trip_id(raw: str) -> str:
    # Malformed ids get the same 404 as a foreign trip, and never reach Postgres.
    try:
        return str(UUID(raw))
    except ValueError:
        raise _not_found() from None


@router.get("")
def list_trips(
    user: AuthenticatedUser,
    repo: Trips,
) -> dict[str, list[dict[str, Any]]]:
    return {"trips": repo.list_trips(user.id)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_trip(
    body: TripCreate,
    user: AuthenticatedUser,
    repo: Trips,
) -> dict[str, Any]:
    try:
        trip = repo.create_trip(user.id, jsonable_encoder(body))
    except TripConstraintError:
        raise _too_large() from None
    logger.info("trip_created", extra={"user_ref": hash_user_id(user.id)})
    return trip


@router.patch("/{trip_id}")
def update_trip(
    trip_id: str,
    body: TripUpdate,
    user: AuthenticatedUser,
    repo: Trips,
) -> dict[str, Any]:
    try:
        trip = repo.update_trip(
            user.id, _trip_id(trip_id), jsonable_encoder(body.itinerary_data)
        )
    except TripConstraintError:
        raise _too_large() from None
    if trip is None:
        raise _not_found()
    logger.info("trip_updated", extra={"user_ref": hash_user_id(user.id)})
    return trip


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip(
    trip_id: str,
    user: AuthenticatedUser,
    repo: Trips,
) -> Response:
    if not repo.delete_trip(user.id, _trip_id(trip_id)):
        raise _not_found()
    logger.info("trip_deleted", extra={"user_ref": hash_user_id(user.id)})
    return Response(status_code=status.HTTP_204_NO_CONTENT)
