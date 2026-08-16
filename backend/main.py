import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Any
import os
from dotenv import load_dotenv
from google import genai
import json
from datetime import datetime
from supabase import create_client, Client


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

supabase_url = os.getenv("SUPABASE_URL")
supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not supabase_url or not supabase_service_role_key:
    logger.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set in environment")
    raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

# Initialize Supabase client so the rest of the app can use `supabase_client`
try:
    supabase_client: Client = create_client(supabase_url, supabase_service_role_key)
    logger.info("Supabase client initialized successfully")
except Exception:
    logger.exception("Failed to initialize Supabase client")
    # Surface an explicit runtime error to avoid starting the app in a bad state
    raise RuntimeError("Failed to initialize Supabase client. Check SUPABASE_URL and SUPABASE_KEY.")

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
    start_date: str  # Format incoming from Next.js calendar: "YYYY-MM-DD"
    end_date: str    # Format incoming from Next.js calendar: "YYYY-MM-DD"
    interests: List[str]

class DayPlan(BaseModel):
    day: int
    activities: List[str]

class ItineraryResponse(BaseModel):
    destination: str
    itinerary: List[DayPlan]

class SaveItineraryRequest(BaseModel):
    user_id: str
    destination: str
    start_date: str
    end_date: str
    interests: List[str]
    itinerary_data: List[dict]    

class UpdateItineraryRequest(BaseModel):
    user_id: str
    itinerary_data: List[Any]


@app.post("/generate-itinerary", response_model=ItineraryResponse)
def generate_itinerary(request:ItineraryRequest):
    logger.info(f"Request received: destination={request.destination}, dates={request.start_date} to {request.end_date}")
    
    # Calculate number of days from start_date and end_date
    try:
        # Parse standard incoming Next.js date strings (YYYY-MM-DD) safely
        start_dt = datetime.strptime(request.start_date, "%Y-%m-%d")
        end_dt = datetime.strptime(request.end_date, "%Y-%m-%d")
        
        # Calculate the direct numerical difference between calendar inputs
        total_days = (end_dt - start_dt).days + 1
        
        if total_days <= 0:
            raise HTTPException(status_code=400, detail="End date must be after or equal to start date.")
             
    except ValueError:
        logger.error("Frontend passed broken date format strings")
        raise HTTPException(status_code=400, detail="Invalid date format. Must match YYYY-MM-DD.")
    
    prompt = f"""
    Create a highly personalized {total_days}-day travel itinerary for {request.destination} 
    explicitly tailored for a vacation starting on {request.start_date} and ending on {request.end_date}.
    
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

@app.post("/save-itinerary")
def save_itinerary(request: SaveItineraryRequest):
    logger.info(f"Save requested by user: {request.user_id} for destination: {request.destination}")
    
    try:
        # Validate date formats on the server side to ensure nobody inserts corrupt data strings
        datetime.strptime(request.start_date, "%Y-%m-%d")
        datetime.strptime(request.end_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Must match YYYY-MM-DD.")

    try:
        # Commit row insertion to Supabase via Python client matching your exact table columns
        response = supabase_client.table("itineraries").insert({
            "user_id": request.user_id,
            "destination": request.destination,
            "start_date": request.start_date,
            "end_date": request.end_date,
            "interests": request.interests,
            "itinerary_data": request.itinerary_data # Safeguarded array input
        }).execute()
        
        # Check if the execution returned any data/errors
        if len(response.data) == 0:
            logger.error("Supabase failed to insert row silently")
            raise HTTPException(status_code=500, detail="Failed to insert itinerary record.")
            
        logger.info(f"Itinerary successfully saved into database for user {request.user_id}")
        return {"status": "success", "message": "Itinerary securely stored!"}
        
    except Exception as e:
        logger.exception("Database transaction failed inside backend gateway")
        raise HTTPException(status_code=500, detail=f"Database write error: {str(e)}")

@app.get("/get-trips/{user_id}")
def get_user_trips(user_id: str):
    logger.info(f"Fetch trips requested for user: {user_id}")
    
    try:
        # In the Python supabase client, order options must be a dictionary: {"descending": True}
        response = supabase_client.table("itineraries") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .execute()
            
        return {"status": "success", "trips": response.data}
        
    except Exception as e:
        logger.exception(f"Failed to fetch historical trips for user {user_id}")
        raise HTTPException(status_code=500, detail=f"Database read error: {str(e)}")

@app.delete("/delete-itinerary/{trip_id}/{user_id}")
def delete_user_itinerary(trip_id: str, user_id: str):
    logger.info(f"Delete requested for trip record {trip_id} by user: {user_id}")
    
    try:
        # Execute deletion targeting the unique row id AND matching user_id for safety
        response = supabase_client.table("itineraries") \
            .delete() \
            .eq("id", trip_id) \
            .eq("user_id", user_id) \
            .execute()
            
        # If the row didn't exist or nothing was deleted, alert the logger
        if len(response.data) == 0:
            logger.warning(f"No itinerary row found matching ID {trip_id} for user {user_id}")
            raise HTTPException(status_code=404, detail="Itinerary not found or unauthorized.")
            
        logger.info(f"Itinerary {trip_id} successfully deleted from the database.")
        return {"status": "success", "message": "Trip erased cleanly!"}
        
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.exception(f"Database deletion transaction failed for trip {trip_id}")
        raise HTTPException(status_code=500, detail=f"Database delete error: {str(e)}")

@app.put("/update-itinerary/{trip_id}")
def update_user_itinerary(trip_id: str, payload: UpdateItineraryRequest):
    logger.info(f"Update requested for trip record {trip_id} by user: {payload.user_id}")
    
    try:
        # Update the itinerary_data column where trip ID AND user_id match
        response = supabase_client.table("itineraries") \
            .update({"itinerary_data": payload.itinerary_data}) \
            .eq("id", trip_id) \
            .eq("user_id", payload.user_id) \
            .execute()
            
        if len(response.data) == 0:
            logger.warning(f"No itinerary found matching ID {trip_id} for user {payload.user_id}")
            raise HTTPException(status_code=404, detail="Itinerary not found or unauthorized.")
            
        logger.info(f"Itinerary {trip_id} successfully updated in database.")
        return {"status": "success", "message": "Itinerary updated successfully!"}
        
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.exception(f"Database update transaction failed for trip {trip_id}")
        raise HTTPException(status_code=500, detail=f"Database update error: {str(e)}")

@app.get("/error-demo")
def error_demo():
    try:
        1/0
    except Exception as e:
        logger.error("Something went wrong:", exc_info=True)
        return{"error": "Internal server error"}
