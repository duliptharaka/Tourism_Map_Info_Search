import asyncio
import os
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

_cors_raw = os.getenv("CORS_ORIGINS") or ""
_cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]
_cors_regex = (os.getenv("CORS_ORIGIN_REGEX") or "").strip() or None

app = FastAPI(title="Tourist Expert API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_regex,
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

The user always supplies (1) a place name and (2) WGS84 latitude and longitude at high precision.
- Coordinates are given to 8 decimal degrees (~1 mm along latitude; longitude resolution varies with latitude but is similarly fine-grained). Use every digit as supplied; do not round them mentally to a coarser grid.
- Treat name + latitude + longitude as one unambiguous target. The coordinates are the authoritative pin; the name is context only.
- Identify the real-world attraction or POI at that exact high precision latitude and longitude—not a different place that merely shares the same name elsewhere on Earth or nearby.
- If the name is generic (e.g. "viewpoint", "attraction") or duplicated worldwide, the high-precision latitude and longitude decide which instance you describe.
- All factual-style fields (address, phone, parking) must plausibly correspond to that specific site with the given high precision coordinates.

Rules:
- summary: under 100 characters with emojis.
- tourist_rating: number 0–10.
- parking_availability: exactly "Onsite available" or "Onsite not available".
- parking_address: if onsite parking, that address; otherwise nearest public parking lot address, double check the address with high precision coordinates to confirm the address is correct.
- Use plausible real-style data for THAT site; if uncertain, say so briefly in summary."""


@app.get("/location", response_model=TouristLocationResponse)
def get_location(
    name: str = Query(..., min_length=1, description="Tourist location name (OSM label or common name)"),
    latitude: float = Query(..., ge=-90, le=90, description="WGS84 latitude of the map pin"),
    longitude: float = Query(..., ge=-180, le=180, description="WGS84 longitude of the map pin"),
):
    client = get_client()
    user_payload = (
        "Use this exact target (name + high-precision WGS84 coordinates together):\n"
        f"- location_name: {name.strip()}\n"
        f"- latitude_WGS84 (8 decimal places): {latitude:.8f}\n"
        f"- longitude_WGS84 (8 decimal places): {longitude:.8f}\n\n"
        "Return JSON for the attraction at this geographic point only."
    )
    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": user_payload},
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


class WeatherResponse(BaseModel):
    condition: str = Field(..., description="Short sky condition group (e.g. Clear, Clouds, Rain).")
    description: str = Field(..., description="Human-readable description (e.g. 'light rain').")
    icon: str = Field(..., description="OpenWeather icon code, e.g. '10d' (day) / '10n' (night).")
    icon_url: str = Field(..., description="Fully qualified PNG URL for the icon.")
    is_day: bool
    temp_c: float
    temp_min_c: float
    temp_max_c: float
    precipitation_probability: float = Field(..., ge=0, le=100, description="Max precipitation % in the next ~24h.")


OWM_BASE = "https://api.openweathermap.org/data/2.5"
OWM_ICON_URL = "https://openweathermap.org/img/wn/{icon}@2x.png"
OWM_TIMEOUT_S = 10.0


@app.get("/weather", response_model=WeatherResponse)
async def get_weather(
    latitude: float = Query(..., ge=-90, le=90, description="WGS84 latitude of the map pin"),
    longitude: float = Query(..., ge=-180, le=180, description="WGS84 longitude of the map pin"),
):
    key = os.getenv("OPENWEATHER_API_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="OPENWEATHER_API_KEY is not set")

    params_common = {"lat": f"{latitude:.8f}", "lon": f"{longitude:.8f}", "units": "metric", "appid": key}

    try:
        async with httpx.AsyncClient(timeout=OWM_TIMEOUT_S) as client:
            current_r, forecast_r = await _gather_owm(client, params_common)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"OpenWeather request failed: {e}") from e

    if current_r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"OpenWeather /weather returned {current_r.status_code}: {current_r.text[:200]}")

    current = current_r.json()
    weather0 = (current.get("weather") or [{}])[0]
    icon_code = weather0.get("icon") or "01d"
    condition = weather0.get("main") or "Unknown"
    description = weather0.get("description") or condition
    main = current.get("main") or {}
    temp_c = float(main.get("temp", 0.0))
    temp_min_c = float(main.get("temp_min", temp_c))
    temp_max_c = float(main.get("temp_max", temp_c))

    pop_pct = 0.0
    if forecast_r is not None and forecast_r.status_code == 200:
        forecast = forecast_r.json()
        entries = forecast.get("list") or []
        window = entries[:8] if entries else []
        temps = [float(e.get("main", {}).get("temp", temp_c)) for e in window]
        t_mins = [float(e.get("main", {}).get("temp_min", t)) for e, t in zip(window, temps)]
        t_maxs = [float(e.get("main", {}).get("temp_max", t)) for e, t in zip(window, temps)]
        pops = [float(e.get("pop", 0.0)) for e in window]
        if t_mins:
            temp_min_c = min(temp_min_c, *t_mins)
        if t_maxs:
            temp_max_c = max(temp_max_c, *t_maxs)
        if pops:
            pop_pct = round(max(pops) * 100.0, 0)

    is_day = icon_code.endswith("d")
    sys_block = current.get("sys") or {}
    sunrise = sys_block.get("sunrise")
    sunset = sys_block.get("sunset")
    if isinstance(sunrise, (int, float)) and isinstance(sunset, (int, float)):
        now_s = datetime.now(tz=timezone.utc).timestamp()
        is_day = bool(sunrise <= now_s < sunset)

    return WeatherResponse(
        condition=condition,
        description=description,
        icon=icon_code,
        icon_url=OWM_ICON_URL.format(icon=icon_code),
        is_day=is_day,
        temp_c=round(temp_c, 1),
        temp_min_c=round(temp_min_c, 1),
        temp_max_c=round(temp_max_c, 1),
        precipitation_probability=pop_pct,
    )


async def _gather_owm(client: httpx.AsyncClient, params: dict):
    current_r, forecast_r = await asyncio.gather(
        client.get(f"{OWM_BASE}/weather", params=params),
        client.get(f"{OWM_BASE}/forecast", params=params),
        return_exceptions=True,
    )
    if isinstance(current_r, BaseException):
        raise current_r
    if isinstance(forecast_r, BaseException):
        forecast_r = None
    return current_r, forecast_r
