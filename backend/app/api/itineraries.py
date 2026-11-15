from fastapi import APIRouter, Request

from app.core.auth import AuthenticatedUser
from app.core.rate_limit import generate_limit, limiter
from app.schemas import GenerateRequest, ItineraryResponse

router = APIRouter(prefix="/api/v1/itineraries", tags=["itineraries"])


@router.post("/generate", response_model=ItineraryResponse)
@limiter.limit(generate_limit)
def generate_itinerary(
    request: Request,
    body: GenerateRequest,
    user: AuthenticatedUser,
) -> ItineraryResponse:
    return request.app.state.itinerary_generator.generate(body)
