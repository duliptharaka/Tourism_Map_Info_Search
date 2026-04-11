import type { LatLngBounds } from "leaflet";

export type OsmAttraction = {
  key: string;
  name: string;
  lat: number;
  lng: number;
};

const MAX_MARKERS = 60;
const MIN_ZOOM = 11;
/** Skip Overpass when the view is this wide (degrees) to avoid timeouts and overload. */
const MAX_LAT_SPAN = 0.42;
const MAX_LNG_SPAN = 0.55;

const RETRY_STATUSES = new Set([408, 429, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 1000;

/** Same-origin path in dev (Vite proxy) and prod (Vercel rewrite). */
function overpassEndpoint(): string {
  const raw = import.meta.env.VITE_OVERPASS_PROXY_PATH?.trim();
  if (raw) return raw.replace(/\/$/, "");
  return "/api/overpass";
}

function buildQuery(south: number, west: number, north: number, east: number): string {
  return `[out:json][timeout:18];
(
  node["tourism"~"^(attraction|museum|gallery|viewpoint|theme_park|zoo)$"](${south},${west},${north},${east});
  way["tourism"~"^(attraction|museum|gallery|viewpoint|theme_park|zoo)$"](${south},${west},${north},${east});
);
out center tags;`;
}

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassResponse = { elements?: OverpassElement[] };

function pickName(tags: Record<string, string> | undefined): string {
  if (!tags) return "Unnamed place";
  const n =
    tags.name ??
    tags["name:en"] ??
    tags["name:es"] ??
    tags["name:fr"] ??
    Object.keys(tags)
      .filter((k) => k.startsWith("name:"))
      .sort()
      .map((k) => tags[k])
      .find(Boolean);
  if (n) return n;
  const t = tags.tourism;
  if (t) return t.replace(/_/g, " ");
  return "Unnamed place";
}

function elementPosition(el: OverpassElement): { lat: number; lng: number } | null {
  if (el.type === "node" && typeof el.lat === "number" && typeof el.lon === "number") {
    return { lat: el.lat, lng: el.lon };
  }
  const c = el.center;
  if (c && typeof c.lat === "number" && typeof c.lon === "number") {
    return { lat: c.lat, lng: c.lon };
  }
  return null;
}

function lngSpanDegrees(west: number, east: number): number {
  if (east >= west) return east - west;
  return east - west + 360;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = window.setTimeout(resolve, ms);
    const onAbort = () => {
      window.clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export type FetchAttractionsResult =
  | { ok: true; attractions: OsmAttraction[]; softHint?: string }
  | { ok: false; error: string; attractions: [] }
  | { ok: false; aborted: true; attractions: [] };

export async function fetchAttractionsInBounds(
  bounds: LatLngBounds,
  zoom: number,
  options?: { signal?: AbortSignal }
): Promise<FetchAttractionsResult> {
  const signal = options?.signal;

  if (zoom < MIN_ZOOM) {
    return { ok: true, attractions: [] };
  }

  const south = bounds.getSouth();
  const west = bounds.getWest();
  const north = bounds.getNorth();
  const east = bounds.getEast();
  const latSpan = north - south;
  const lngSpan = lngSpanDegrees(west, east);

  if (latSpan > MAX_LAT_SPAN || lngSpan > MAX_LNG_SPAN) {
    return {
      ok: true,
      attractions: [],
      softHint: `Zoom in closer — area is too large to query reliably (max ~${MAX_LAT_SPAN}° × ${MAX_LNG_SPAN}°).`,
    };
  }

  const data = buildQuery(south, west, north, east);
  const url = overpassEndpoint();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) {
      return { ok: false, aborted: true, attractions: [] };
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(data)}`,
        signal,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return { ok: false, aborted: true, attractions: [] };
      }
      return {
        ok: false,
        error:
          "Could not reach the Overpass proxy. Check dev proxy / Vercel rewrite for /api/overpass.",
        attractions: [],
      };
    }

    if (res.ok) {
      let json: OverpassResponse;
      try {
        json = (await res.json()) as OverpassResponse;
      } catch {
        return { ok: false, error: "Invalid JSON from Overpass", attractions: [] };
      }

      const elements = json.elements ?? [];
      const out: OsmAttraction[] = [];

      for (const el of elements) {
        const pos = elementPosition(el);
        if (!pos) continue;
        out.push({
          key: `${el.type}/${el.id}`,
          name: pickName(el.tags),
          lat: pos.lat,
          lng: pos.lng,
        });
        if (out.length >= MAX_MARKERS) break;
      }

      return { ok: true, attractions: out };
    }

    const retry = RETRY_STATUSES.has(res.status) && attempt < MAX_ATTEMPTS - 1;
    if (retry) {
      const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * 500;
      try {
        await sleep(delay, signal);
      } catch {
        return { ok: false, aborted: true, attractions: [] };
      }
      continue;
    }

    const friendly =
      res.status === 429
        ? "Map data service is busy (rate limit). Wait a moment or zoom to a smaller area."
        : res.status === 504
          ? "Map data request timed out. Try zooming in or moving slightly."
          : `Overpass returned HTTP ${res.status}`;

    return { ok: false, error: friendly, attractions: [] };
  }

  return {
    ok: false,
    error: "Map data unavailable after retries. Try again in a moment.",
    attractions: [],
  };
}

export const OSM_ATTRACTION_MIN_ZOOM = MIN_ZOOM;
