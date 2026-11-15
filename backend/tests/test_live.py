"""Smoke test against the real Gemini and Tavily APIs.

Skipped by default. It spends real quota, so run it on purpose:

    uv run pytest -m live -s
"""

from datetime import date, timedelta
from pathlib import Path

import pytest
from dotenv import dotenv_values
from google import genai
from tavily import TavilyClient

from app.core.config import Settings, get_settings
from app.schemas import GenerateRequest, ItineraryResponse
from app.services.itinerary import ItineraryGenerator

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


class RecordingTavily:
    """The real client, keeping each query and result for the report."""

    def __init__(self, client: TavilyClient) -> None:
        self._client = client
        self.searches: list[tuple[str, str]] = []

    def get_search_context(self, **kwargs) -> str:
        result = self._client.get_search_context(**kwargs)
        self.searches.append((kwargs["query"], result))
        return result


@pytest.fixture
def live_settings() -> Settings:
    # conftest points the app at placeholder keys, so read the real ones directly.
    env = dotenv_values(ENV_FILE)
    missing = [k for k in ("GEMINI_API_KEY", "TAVILY_API_KEY") if not env.get(k)]
    if missing:
        pytest.skip(f"{', '.join(missing)} not set in {ENV_FILE}")
    overrides = {"gemini_model": env["GEMINI_MODEL"]} if env.get("GEMINI_MODEL") else {}
    return get_settings().model_copy(
        update={
            "gemini_api_key": env["GEMINI_API_KEY"],
            "tavily_api_key": env["TAVILY_API_KEY"],
            **overrides,
        }
    )


@pytest.mark.live
@pytest.mark.enable_socket
def test_real_gemini_generates_a_valid_two_day_itinerary(live_settings):
    tavily = RecordingTavily(TavilyClient(api_key=live_settings.tavily_api_key))
    generator = ItineraryGenerator(
        live_settings,
        gemini_client=genai.Client(api_key=live_settings.gemini_api_key),
        tavily_client=tavily,
    )
    start = date.today() + timedelta(days=30)
    request = GenerateRequest(
        destination="Lisbon",
        start_date=start,
        end_date=start + timedelta(days=1),
        interests=["food", "museums"],
    )

    result = generator.generate(request)

    # Printed for a person to compare the itinerary with what the searches found.
    print(f"\nmodel: {live_settings.gemini_model}")
    print(f"searches: {len(tavily.searches)}")
    for query, context in tavily.searches:
        print(f"  query: {query}\n  result: {context[:600]}\n")
    print(result.model_dump_json(indent=2))

    ItineraryResponse.model_validate(result.model_dump())
    assert result.destination == "Lisbon"
    assert [day.day for day in result.itinerary] == [1, 2]
    assert all(day.activities for day in result.itinerary)
    assert len(tavily.searches) <= live_settings.gemini_max_remote_calls
