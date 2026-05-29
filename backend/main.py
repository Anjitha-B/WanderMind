import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import os
from dotenv import load_dotenv
from google import genai
import json

# ensure logs directory exists before configuring logging
os.makedirs("logs", exist_ok=True)

logging.basicConfig(
    filename="logs/app.log",
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    logger.error("GEMINI_API_KEY is not set in environment")
    raise RuntimeError("GEMINI_API_KEY not set")

client = genai.Client(api_key=api_key)



app = FastAPI(title = "WanderMind API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ItineraryRequest(BaseModel):
    destination: str
    days: int
    interests: List[str]

class DayPlan(BaseModel):
    day: int
    activities: List[str]

class ItineraryResponse(BaseModel):
    destination: str
    itinerary: List[DayPlan]


@app.post("/generate-itinerary", response_model=ItineraryResponse)
def generate_itinerary(request:ItineraryRequest):
    logger.info(f"Request received: destination={request.destination}, days={request.days}")
    prompt = f"""

    Create a {request.days} - days travel itinerary for {request.destination}.
    Interests: {", ".join(request.interests)}
    Respond ONLY in JSON using this format:
    {{
         "itinerary": [
            {{
                "day":1,
                "activities":["activity 1", "activity 2"]
            }} ]
    }}
    """
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=prompt
        )

        # prefer a JSON-safe parsing path instead of eval()
        ai_text = None
        if hasattr(response, "text") and response.text:
            ai_text = response.text
        else:
            # fallback to string or dict representation
            try:
                ai_text = response.to_dict()
            except Exception:
                ai_text = str(response)

        try:
            payload = json.loads(ai_text)
        except json.JSONDecodeError:
            # try to extract JSON substring if model adds surrounding text
            start = ai_text.find("{")
            end = ai_text.rfind("}") + 1
            if start != -1 and end != -1 and end > start:
                try:
                    payload = json.loads(ai_text[start:end])
                except Exception:
                    logger.exception("Failed to parse AI output as JSON")
                    raise HTTPException(status_code=502, detail="Invalid AI response format")
            else:
                logger.exception("Failed to parse AI output as JSON")
                raise HTTPException(status_code=502, detail="Invalid AI response format")

        itinerary_data = payload.get("itinerary")
        if not isinstance(itinerary_data, list):
            logger.error("AI returned unexpected itinerary structure")
            raise HTTPException(status_code=502, detail="Invalid AI response structure")

        logger.info(f"Itinerary generated successfully for {request.destination}")

        return {
            "destination": request.destination,
            "itinerary": itinerary_data,
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("Error generating itinerary")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/error-demo")
def error_demo():
    try:
        1/0
    except Exception as e:
        logger.error("Something went wrong:", exc_info=True)
        return{"error": "Internal server error"}
