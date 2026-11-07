from datetime import date, timedelta
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.core.config import (
    MAX_ACTIVITIES_PER_DAY,
    MAX_ACTIVITY_LENGTH,
    MAX_DESTINATION_LENGTH,
    MAX_INTEREST_LENGTH,
    MAX_INTERESTS,
    MAX_ITINERARY_DAYS,
    MAX_TRIP_DAYS,
)

Destination = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_DESTINATION_LENGTH),
]
Activity = Annotated[str, StringConstraints(max_length=MAX_ACTIVITY_LENGTH)]
Interest = Annotated[str, StringConstraints(max_length=MAX_INTEREST_LENGTH)]
Interests = Annotated[list[Interest], Field(max_length=MAX_INTERESTS)]


class StrictModel(BaseModel):
    # Unknown fields are refused, which also rejects any client-sent user_id.
    model_config = ConfigDict(extra="forbid")


class DayPlan(StrictModel):
    day: int = Field(ge=1, le=MAX_ITINERARY_DAYS, strict=True)
    activities: Annotated[list[Activity], Field(max_length=MAX_ACTIVITIES_PER_DAY)]


ItineraryData = Annotated[
    list[DayPlan], Field(min_length=1, max_length=MAX_ITINERARY_DAYS)
]


class TripDates(StrictModel):
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def check_range(self) -> Self:
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if self.total_days > MAX_TRIP_DAYS:
            raise ValueError(f"trip cannot be longer than {MAX_TRIP_DAYS} days")
        return self

    @property
    def total_days(self) -> int:
        return (self.end_date - self.start_date + timedelta(days=1)).days


class GenerateRequest(TripDates):
    destination: Destination
    interests: Interests


class TripCreate(TripDates):
    destination: Destination
    interests: Interests
    itinerary_data: ItineraryData


class TripUpdate(StrictModel):
    itinerary_data: ItineraryData


class ItineraryResponse(StrictModel):
    destination: Destination
    itinerary: ItineraryData
