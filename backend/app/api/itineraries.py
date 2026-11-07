from fastapi import APIRouter, Depends, Request

from app.core.auth import CurrentUser, get_current_user
from app.core.rate_limit import generate_limit, limiter
from app.schemas import GenerateRequest, ItineraryResponse

router = APIRouter(prefix="/api/v1/itineraries", tags=["itineraries"])


@router.post("/generate", response_model=ItineraryResponse)
@limiter.limit(generate_limit)
def generate_itinerary(
    request: Request,
    body: GenerateRequest,
    user: CurrentUser = Depends(get_current_user),
) -> ItineraryResponse:
    return request.app.state.itinerary_generator.generate(body)
