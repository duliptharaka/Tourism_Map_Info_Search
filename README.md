# Tourism Map Search

A small full-stack demo: a **dark-themed map** (React, Leaflet) backed by **FastAPI**. Click a marker and the app calls the API, which uses **OpenAI** to return structured tourist-style facts for that place.

---

## Highlights

- **Map UI** — React 18, TypeScript, Vite, react-leaflet; CARTO dark basemap.
- **API** — FastAPI `GET /location` with a typed JSON response (`Backend/main.py`).
- **Local dev** — Vite proxies `/api/*` to the backend so the frontend keeps calling `/api/location` while FastAPI serves `/location`.
- **Production-ready split** — Frontend on **Vercel**, API on **Render** (or any host), with env-driven CORS and API URL.

---

## Repository layout

| Area | Stack | Role |
|------|--------|------|
| **Frontend** | React, TypeScript, Vite, Leaflet | Map, markers, popups, API calls |
| **Backend** | FastAPI, OpenAI Python SDK | `GET /location` → JSON for a place name |
| **Config** | Root `.env` (local only) | Secrets and local CORS; **not** committed |

```
├── Backend/
│   └── main.py              # FastAPI app
├── Frontend/
│   ├── src/                 # React app (see App.tsx for API base URL logic)
│   ├── vite.config.ts       # Dev proxy: /api → http://127.0.0.1:8000
│   ├── package.json
│   ├── package-lock.json    # Commit this; used by npm ci on CI/Vercel
│   └── vercel.json          # Used when Vercel “Root Directory” is Frontend
├── requirements.txt         # Python deps for the API
├── vercel.json              # Used when Vercel root is the repo root
├── .vercelignore            # Skips Backend/.venv from Vercel uploads
├── .gitignore               # .env, node_modules/, dist/, __pycache__/, etc.
└── README.md
```

---

## Prerequisites

- **Python** 3.11+ (3.10+ usually works)
- **Node.js** 18+ and npm
- An **OpenAI API key** for the model configured in `Backend/main.py` (e.g. `gpt-4o-mini`)

---

## Environment variables

### Local development (root `.env`)

Create `.env` in the **repository root** (same level as `README.md`). The backend loads it on startup.

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | Your OpenAI API key |
| `CORS_ORIGINS` | Yes* | Comma-separated browser origins allowed to call the API (no trailing slashes). Example: `http://localhost:5173,http://127.0.0.1:5173` |

\*If omitted, the list is empty and browsers will be blocked by CORS.

Optional, for advanced setups:

| Variable | Description |
|----------|-------------|
| `CORS_ORIGIN_REGEX` | Single regex (e.g. `https://.*\.vercel\.app`) to allow all matching Vercel preview/production hosts without listing each URL |

### Render (backend)

Set in the service **Environment** tab (same names as above). Typical production combo:

- `OPENAI_API_KEY`
- `CORS_ORIGINS` — include every origin users actually open in the browser, e.g. `https://your-app.vercel.app,http://localhost:5173` if you still test locally against production API.
- `CORS_ORIGIN_REGEX` (optional) — e.g. `https://.*\.vercel\.app` for all `*.vercel.app` hosts. Custom domains must still appear in `CORS_ORIGINS` (regex does not replace exact origins you use outside `*.vercel.app`).

### Vercel (frontend)

`VITE_*` variables are embedded at **build time**. After changing them, **redeploy** so a new build runs.

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Public URL of your API **without** a trailing slash, e.g. `https://your-service.onrender.com`. If unset, the app uses `/api/...` (local Vite proxy only). |

**CORS tip:** The value of `Origin` sent by the browser must match an entry in `CORS_ORIGINS` or your `CORS_ORIGIN_REGEX`. Use the exact URL from the address bar (`https://…`), not a path.

---

## Local setup

### 1. Clone and `.env`

```env
OPENAI_API_KEY=sk-...
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

### 2. Backend

From the **repository root**:

```bash
python -m venv .venv
```

**Windows (PowerShell):**

```powershell
.\.venv\Scripts\Activate.ps1
```

**Install and run:**

```bash
pip install -r requirements.txt
python -m uvicorn Backend.main:app --reload --host 127.0.0.1 --port 8000
```

Prefer **`python -m uvicorn`** over calling the `uvicorn` executable directly if you ever **moved or renamed** the project folder—Windows entry points can still point at an old path.

- **Docs:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Sample call:** `GET /location?name=Eiffel%20Tower` (needs a valid key)

### 3. Frontend

`package.json` lives under **`Frontend/`**. Always install and run scripts from there:

```bash
cd Frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The dev server proxies `/api` to `http://127.0.0.1:8000` (see `Frontend/vite.config.ts`).

### Frontend production build (local check)

```bash
cd Frontend
npm run build
npm run preview
```

Output is `Frontend/dist/`.

---

## Deploying with GitHub

### Backend on Render

1. New **Web Service**, connect the repo.
2. **Root directory:** leave empty (repo root has `requirements.txt` and `Backend/`).
3. **Build:** `pip install -r requirements.txt`
4. **Start:** `uvicorn Backend.main:app --host 0.0.0.0 --port $PORT`
5. Set **environment variables** (`OPENAI_API_KEY`, `CORS_ORIGINS`, optional `CORS_ORIGIN_REGEX`).
6. Confirm **Swagger** at `https://<your-service>.onrender.com/docs`.

Free instances may **sleep**; the first request after idle can be slow.

### Frontend on Vercel

The repo supports **either** Vercel root strategy—pick one and align the dashboard.

| Vercel “Root Directory” | Config used |
|-------------------------|-------------|
| **Empty** (repo root) | Root `vercel.json`: install/build run in `Frontend/`, output `Frontend/dist` |
| **`Frontend`** | `Frontend/vercel.json` (`npm ci`); framework output is `Frontend/dist` |

1. Import the **same** GitHub repo.
2. Set **Root Directory** as above (do not mix: the active `vercel.json` must match the folder Vercel treats as the project root).
3. **Build command / output** are usually auto-filled for Vite; with root `vercel.json` they are explicit.
4. Add **`VITE_API_BASE_URL`** = your Render URL (no trailing slash), for **Production** (and **Preview** if those builds should hit the same API).
5. Deploy.

`.vercelignore` reduces upload noise (e.g. `Backend/`, `.venv`).

---

## Troubleshooting

| Symptom | Likely cause | What to do |
|---------|----------------|------------|
| **Failed to fetch** from the deployed site | Missing/wrong `VITE_API_BASE_URL`, or CORS | Set `VITE_API_BASE_URL` on Vercel and **redeploy**. On Render, set `CORS_ORIGINS` / `CORS_ORIGIN_REGEX` for your real browser origins. |
| **`npm run dev` / ENOENT package.json** | Ran npm from repo root | `cd Frontend` first. |
| **Uvicorn “Fatal error in launcher”** after moving the repo | Old venv script paths | Recreate `.venv` or use `python -m uvicorn …`. |
| **Vercel build exit 126 or endless build** | `node_modules` committed from Windows, or a stray root `package-lock.json` without a root `package.json` | Keep `node_modules/` and `dist/` **gitignored**; commit only `Frontend/package-lock.json`; use the provided `vercel.json` layout. |
| API works in Swagger but not from the browser | CORS | Origins must match the **exact** scheme + host (and port for localhost). |

---

## API reference

### `GET /location`

| Query | Description |
|-------|-------------|
| `name` | Required. Tourist place name (e.g. `Eiffel Tower`). |

**200** — JSON: `summary`, `tourist_rating`, `location_address`, `location_phone`, `parking_availability`, `parking_address` (see `TouristLocationResponse` in `Backend/main.py`).

**500** — `OPENAI_API_KEY` missing. **502** — model/upstream or invalid JSON from the model.

---

## Map data

Basemap: **CARTO Dark Matter** (OpenStreetMap data). Attribution is shown on the map. Marker positions are defined in `Frontend/src/App.tsx`; swapping in dynamic POIs would be a separate change.

---

## License

No license file is included; add one if you distribute the project.
