# Tourism Map Search

A small full-stack demo that combines a **dark-themed map** (React + Leaflet) with a **FastAPI** backend. Clicking a marker asks the API for structured tourist information about that place, generated with the OpenAI API.

## What’s in the repo

| Part | Stack | Role |
|------|--------|------|
| **Frontend** | React 18, TypeScript, Vite, react-leaflet | Map UI, markers, popups |
| **Backend** | FastAPI, OpenAI Python SDK | `GET /location` returns JSON facts for a named place |
| **Config** | `.env` at repo root | `OPENAI_API_KEY` |

The dev server proxies browser requests from `/api/*` to the backend (see `Frontend/vite.config.ts`), so the frontend calls paths like `/api/location` while FastAPI serves `/location`.

## Prerequisites

- **Python** 3.11+ (3.10+ should work)
- **Node.js** 18+ and npm
- An **OpenAI API key** with access to the model used in code (`gpt-4o-mini` in `Backend/main.py`)

## Setup

### 1. Environment variables

Create a `.env` file in the **project root** (same folder as this `README.md`):

```env
OPENAI_API_KEY=sk-...
```

The backend loads this file automatically on startup.

### 2. Backend

From the project root:

```bash
python -m venv .venv
```

Activate the virtual environment (Windows PowerShell):

```powershell
.\.venv\Scripts\Activate.ps1
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Run the API from the `Backend` folder:

```bash
cd Backend
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Alternatively, from the project root:

```bash
python -m uvicorn Backend.main:app --reload --host 127.0.0.1 --port 8000
```

- Interactive docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- Health check: open the docs or call `GET /location?name=Eiffel%20Tower` (requires a valid API key)

### 3. Frontend

```bash
cd Frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The Vite dev server expects the API on `http://127.0.0.1:8000`.

### Production build (frontend only)

```bash
cd Frontend
npm run build
npm run preview
```

Serving the built SPA and the API together in production is not configured in this repo; you would typically put the static `Frontend/dist` files behind nginx or similar and run uvicorn (or gunicorn+uvicorn workers) for the API, with CORS origins updated for your domain.

## API

### `GET /location`

Query parameter:

- **`name`** (required) — tourist place name, e.g. `Eiffel Tower`

Success response (JSON): `summary`, `tourist_rating`, `location_address`, `location_phone`, `parking_availability`, `parking_address` (see `TouristLocationResponse` in `Backend/main.py`).

Errors: `502` for upstream/model issues, `500` if `OPENAI_API_KEY` is missing.

## Project layout

```
Tourism_Map_Search/
├── Backend/
│   └── main.py          # FastAPI app
├── Frontend/
│   ├── src/
│   │   ├── App.tsx      # Map, markers, popup + fetch
│   │   ├── main.tsx
│   │   └── index.css
│   ├── vite.config.ts   # dev proxy /api → backend
│   └── package.json
├── requirements.txt
├── .env                 # you create this (not committed)
└── README.md
```

## Map data

Basemap tiles use **CARTO Dark Matter** with **OpenStreetMap** data (attribution is shown on the map). Marker positions in the frontend are currently defined in code; swapping them for viewport-based or API-driven POIs would be a separate feature.

## License

No license file is included in this repository; add one if you plan to distribute the project.
