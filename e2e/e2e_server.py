"""The real API with Gemini and Tavily replaced, for end-to-end tests only.

Auth, the per-user Supabase client, RLS, validation and rate limiting are all
real. Only the model calls are fake, so runs are free and deterministic.
"""

import json
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.main import create_app


class FakeModels:
    def generate_content(self, *, model, contents, config):
        if config.response_mime_type is None:
            # Research phase: no searches, a draft only.
            return SimpleNamespace(
                text="Mock draft",
                function_calls=None,
                automatic_function_calling_history=None,
            )
        # Final phase: `contents` is the conversation, starting with the prompt.
        prompt = contents[0].parts[0].text
        data = prompt.split("<trip_request>\n", 1)[1].split("\n</trip_request>", 1)[0]
        trip = json.loads(data)
        itinerary = [
            {
                "day": day,
                "activities": [f"Mock activity {day}.1", f"Mock activity {day}.2"],
            }
            for day in range(1, trip["total_days"] + 1)
        ]
        text = json.dumps({"destination": trip["destination"], "itinerary": itinerary})
        return SimpleNamespace(text=text)


app = create_app()
app.state.itinerary_generator._gemini = SimpleNamespace(models=FakeModels())
app.state.itinerary_generator._tavily = MagicMock()
