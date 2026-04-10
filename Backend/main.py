import os
from enum import Enum
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

app = FastAPI(title="Tourist Expert API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
_client: OpenAI | None = None


def get_client() -> OpenAI:
    global _client
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set")
    if _client is None:
        _client = OpenAI(api_key=key)
    return _client


class ParkingAvailability(str, Enum):
    onsite_available = "Onsite available"
    onsite_not_available = "Onsite not available"


class TouristLocationResponse(BaseModel):
    summary: str = Field(..., max_length=100)
    tourist_rating: float = Field(..., ge=0, le=10)
    location_address: str
    location_phone: str
    parking_availability: ParkingAvailability
    parking_address: str


_SYSTEM = """You are a tourism facts assistant. Reply with one JSON object only, no markdown.
Keys (exact names): summary, tourist_rating, location_address, location_phone, parking_availability, parking_address.
Rules:
- summary: under 100 characters.
- tourist_rating: number 0–10.
- parking_availability: exactly "Onsite available" or "Onsite not available".
- parking_address: if onsite parking, that address; otherwise nearest public parking lot address.
- Use plausible real-style data; if unsure, use best-effort estimates and say so in summary briefly."""


@app.get("/location", response_model=TouristLocationResponse)
def get_location(name: str = Query(..., min_length=1, description="Tourist location name")):
    client = get_client()
    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": f"Tourist location: {name.strip()}"},
            ],
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    raw = completion.choices[0].message.content
    if not raw:
        raise HTTPException(status_code=502, detail="Empty model response")
    try:
        return TouristLocationResponse.model_validate_json(raw)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Invalid JSON: {e}") from e
