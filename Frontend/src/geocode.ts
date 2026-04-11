export type GeocodeHit = {
  lat: number;
  lng: number;
  label: string;
};

type PhotonResponse = {
  features?: Array<{
    geometry?: { type?: string; coordinates?: number[] };
    properties?: Record<string, unknown>;
  }>;
};

function labelFromProps(p: Record<string, unknown>): string {
  const name = typeof p.name === "string" ? p.name : "";
  const street = typeof p.street === "string" ? p.street : "";
  const housenumber = typeof p.housenumber === "string" ? p.housenumber : "";
  const line1 = [housenumber, street].filter(Boolean).join(" ").trim();
  const city = typeof p.city === "string" ? p.city : "";
  const locality =
    typeof p.locality === "string"
      ? p.locality
      : typeof p.district === "string"
        ? p.district
        : "";
  const state = typeof p.state === "string" ? p.state : "";
  const country = typeof p.country === "string" ? p.country : "";
  const place = locality || city;
  const parts = [name, line1, place, state, country].filter(Boolean);
  return parts.length ? parts.join(", ") : "Location";
}

/** Same-origin in dev (Vite) and prod (Vercel rewrite) → Photon (Komoot). */
function geocodeUrl(query: string): string {
  const base = import.meta.env.VITE_PHOTON_PROXY_PATH?.replace(/\/$/, "") ?? "/api/photon";
  return `${base}?q=${encodeURIComponent(query)}&limit=5&lang=en`;
}

export async function searchLocation(query: string, signal?: AbortSignal): Promise<GeocodeHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  let res: Response;
  try {
    res = await fetch(geocodeUrl(q), { signal });
  } catch {
    throw new Error("network");
  }

  if (!res.ok) {
    throw new Error(`http_${res.status}`);
  }

  let data: PhotonResponse;
  try {
    data = (await res.json()) as PhotonResponse;
  } catch {
    throw new Error("json");
  }

  const features = data.features ?? [];
  const out: GeocodeHit[] = [];

  for (const f of features) {
    const c = f.geometry?.coordinates;
    if (!c || c.length < 2) continue;
    const lng = c[0]!;
    const lat = c[1]!;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const props =
      f.properties && typeof f.properties === "object" ? (f.properties as Record<string, unknown>) : {};
    out.push({ lat, lng, label: labelFromProps(props) });
  }

  return out;
}
