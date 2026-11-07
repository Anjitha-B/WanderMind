"""Trip storage. Handlers depend on TripRepository so tests can use a fake."""
from collections.abc import Iterator
from typing import Any, Protocol

from fastapi import Depends, HTTPException, Request
from postgrest.exceptions import APIError
from supabase import Client, ClientOptions, create_client

from app.core.auth import CurrentUser, get_current_user
from app.core.config import Settings

# Deliberately excludes user_id: ownership is never echoed to clients.
TRIP_COLUMNS = "id,destination,start_date,end_date,interests,itinerary_data,created_at"
CHECK_VIOLATION = "23514"
JWT_REJECTED = ("PGRST301", "PGRST302", "PGRST303")


class TripConstraintViolation(Exception):
    """The database refused the row, e.g. an itinerary over the size limit."""


class TripRepository(Protocol):
    def list_trips(self, user_id: str) -> list[dict[str, Any]]: ...

    def create_trip(self, user_id: str, trip: dict[str, Any]) -> dict[str, Any]: ...

    def update_trip(
        self, user_id: str, trip_id: str, itinerary_data: list[dict[str, Any]]
    ) -> dict[str, Any] | None: ...

    def delete_trip(self, user_id: str, trip_id: str) -> bool: ...


def _execute(query) -> list[dict[str, Any]]:
    try:
        return query.execute().data
    except APIError as exc:
        if exc.code == CHECK_VIOLATION:
            raise TripConstraintViolation from exc
        if exc.code in JWT_REJECTED:
            raise HTTPException(status_code=401, detail="Invalid or missing access token") from exc
        raise


class SupabaseTripRepository:
    """Runs as the signed-in user, so RLS applies. The user_id filters are a
    second layer on top of the policies, not a replacement for them."""

    def __init__(self, client: Client) -> None:
        self._table = lambda: client.table("itineraries")

    def list_trips(self, user_id: str) -> list[dict[str, Any]]:
        return _execute(
            self._table()
            .select(TRIP_COLUMNS)
            .eq("user_id", user_id)
            .order("created_at", desc=True)
        )

    def create_trip(self, user_id: str, trip: dict[str, Any]) -> dict[str, Any]:
        rows = _execute(self._table().insert({**trip, "user_id": user_id}))
        return _public(rows[0])

    def update_trip(
        self, user_id: str, trip_id: str, itinerary_data: list[dict[str, Any]]
    ) -> dict[str, Any] | None:
        rows = _execute(
            self._table()
            .update({"itinerary_data": itinerary_data})
            .eq("id", trip_id)
            .eq("user_id", user_id)
        )
        return _public(rows[0]) if rows else None

    def delete_trip(self, user_id: str, trip_id: str) -> bool:
        rows = _execute(
            self._table().delete().eq("id", trip_id).eq("user_id", user_id)
        )
        return bool(rows)


def _public(row: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in row.items() if k != "user_id"}


def build_user_client(settings: Settings, access_token: str) -> Client:
    """A client that acts as the user: anon key for routing, user JWT for identity."""
    return create_client(
        settings.supabase_base_url,
        settings.supabase_anon_key,
        options=ClientOptions(
            headers={"Authorization": f"Bearer {access_token}"},
            auto_refresh_token=False,
            persist_session=False,
        ),
    )


def get_trip_repository(
    request: Request, user: CurrentUser = Depends(get_current_user)
) -> Iterator[TripRepository]:
    # One client per request. A shared client would risk one user's token being
    # sent on another's query, so the small setup cost is accepted.
    client = build_user_client(request.app.state.settings, user.token)
    try:
        yield SupabaseTripRepository(client)
    finally:
        client.postgrest.session.close()
