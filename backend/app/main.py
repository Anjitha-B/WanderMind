from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from tavily import TavilyClient

from app.api import itineraries, trips
from app.core.auth import build_token_verifier
from app.core.config import Settings, get_settings
from app.core.errors import RequestContextMiddleware, register_exception_handlers
from app.core.logging import configure_logging
from app.core.rate_limit import limiter
from app.services.itinerary import ItineraryGenerator


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging()

    app = FastAPI(title="WanderMind API")
    app.state.settings = settings
    app.state.limiter = limiter
    app.state.token_verifier = build_token_verifier(settings)
    app.state.itinerary_generator = ItineraryGenerator(
        settings,
        gemini_client=genai.Client(api_key=settings.gemini_api_key),
        tavily_client=TavilyClient(api_key=settings.tavily_api_key),
    )

    # Middleware added last runs first, so CORS wraps the request context.
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origin_list,
        allow_credentials=False,  # auth is a bearer header, not cookies
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["X-Request-ID"],
    )

    register_exception_handlers(app)
    app.include_router(trips.router)
    app.include_router(itineraries.router)
    return app
