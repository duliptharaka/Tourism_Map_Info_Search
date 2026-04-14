import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";
import {
  fetchAttractionsInBounds,
  OSM_ATTRACTION_MIN_ZOOM,
  type OsmAttraction,
} from "./overpass";
import { MapSearch } from "./MapSearch";
import logoImg from "../media/logo.png";

const icon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

type LocationInfo = {
  summary: string;
  tourist_rating: number;
  location_address: string;
  location_phone: string;
  parking_availability: string;
  parking_address: string;
};

const DARK_TILES =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

/** Shown until geolocation succeeds (or permanently if denied / unavailable). */
const FALLBACK_CENTER: [number, number] = [48.8566, 2.3522];
const FALLBACK_ZOOM = 12;
const USER_LOCATION_ZOOM = 12;
/** Zoom after geocoding a place or address. */
const SEARCH_RESULT_ZOOM = 14;

type FlyTarget = { lat: number; lng: number; id: number };

function MapFlyTo({ target, zoom }: { target: FlyTarget | null; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.setView([target.lat, target.lng], zoom, { animate: true });
  }, [target, zoom, map]);
  return null;
}

function FlyToUserLocation({ geoSkipRef }: { geoSkipRef: MutableRefObject<boolean> }) {
  const map = useMap();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!("geolocation" in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (geoSkipRef.current) return;
        const { latitude, longitude } = pos.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        map.setView([latitude, longitude], USER_LOCATION_ZOOM, { animate: true });
      },
      () => {
        /* keep FALLBACK_CENTER */
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 }
    );
  }, [map]);

  return null;
}

async function fetchLocation(name: string): Promise<LocationInfo> {
  const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
  const q = `?name=${encodeURIComponent(name)}`;
  const url = base ? `${base}/location${q}` : `/api/location${q}`;
  let r: Response;
  try {
    r = await fetch(url);
  } catch {
    throw new Error(
      "Could not reach the API. On Vercel: set VITE_API_BASE_URL to your Render service URL (no trailing slash) and redeploy. On Render: allow this site in CORS (CORS_ORIGINS and/or CORS_ORIGIN_REGEX=https://.*\\.vercel\\.app)."
    );
  }
  const j: unknown = await r.json().catch(() => null);
  if (!r.ok) {
    const msg =
      j && typeof j === "object" && "detail" in j && typeof (j as { detail: unknown }).detail === "string"
        ? (j as { detail: string }).detail
        : "Request failed";
    throw new Error(msg);
  }
  if (j === null) {
    throw new Error("API returned a non-JSON response—check VITE_API_BASE_URL points to your Render API.");
  }
  return j as LocationInfo;
}

function SpotMarker({ name, lat, lng }: { name: string; lat: number; lng: number }) {
  const [data, setData] = useState<LocationInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <Marker
      position={[lat, lng]}
      icon={icon}
      eventHandlers={{
        click: () => {
          setLoading(true);
          setError(null);
          fetchLocation(name)
            .then(setData)
            .catch((e: Error) => setError(e.message))
            .finally(() => setLoading(false));
        },
      }}
    >
      <Tooltip direction="top" offset={[0, -36]} opacity={1} className="map-pin-tooltip">
        {name}
      </Tooltip>
      <Popup>
        <strong>{name}</strong>
        {loading && <p>Loading…</p>}
        {error && <p className="popup-error">{error}</p>}
        {data && (
          <dl style={{ margin: "0.5rem 0 0", maxWidth: 280 }}>
            <dt>Summary</dt>
            <dd style={{ margin: "0 0 0.5rem" }}>{data.summary}</dd>
            <dt>Rating</dt>
            <dd style={{ margin: "0 0 0.5rem" }}>{data.tourist_rating} / 10</dd>
            <dt>Address</dt>
            <dd style={{ margin: "0 0 0.5rem" }}>{data.location_address}</dd>
            <dt>Phone</dt>
            <dd style={{ margin: "0 0 0.5rem" }}>{data.location_phone}</dd>
            <dt>Parking</dt>
            <dd style={{ margin: "0 0 0.5rem" }}>{data.parking_availability}</dd>
            <dt>Parking address</dt>
            <dd style={{ margin: 0 }}>{data.parking_address}</dd>
          </dl>
        )}
      </Popup>
    </Marker>
  );
}

type OsmHint = { text: string | null; loading: boolean };

/** Longer idle window reduces Overpass 429/504 from rapid pan/zoom. */
const OSM_FETCH_DEBOUNCE_MS = 1400;

function AttractionsFromOsm({ onHint }: { onHint: (h: OsmHint) => void }) {
  const map = useMap();
  const [attractions, setAttractions] = useState<OsmAttraction[]>([]);
  const [hintText, setHintText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    const mySeq = ++seqRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      if (mySeq !== seqRef.current) return;

      const z = map.getZoom();
      if (z < OSM_ATTRACTION_MIN_ZOOM) {
        setAttractions([]);
        setHintText(
          `Zoom to level ${OSM_ATTRACTION_MIN_ZOOM}+ to load tourist places from OpenStreetMap (Overpass).`
        );
        setLoading(false);
        return;
      }

      if (mySeq !== seqRef.current) return;
      setHintText(null);
      setLoading(true);

      const ac = new AbortController();
      abortRef.current = ac;

      const result = await fetchAttractionsInBounds(map.getBounds(), z, { signal: ac.signal });

      if (mySeq !== seqRef.current) return;

      if (!result.ok) {
        setLoading(false);
        if ("aborted" in result && result.aborted) return;
        if ("error" in result) {
          setAttractions([]);
          setHintText(result.error);
        }
        return;
      }

      setLoading(false);
      setAttractions(result.attractions);
      if (result.softHint) {
        setHintText(result.softHint);
      } else if (result.attractions.length === 0) {
        setHintText("No OSM tourism tags in this view — pan or zoom.");
      } else {
        setHintText(null);
      }
    }, OSM_FETCH_DEBOUNCE_MS);
  }, [map]);

  useMapEvents({
    moveend: load,
    zoomend: load,
  });

  useEffect(() => {
    load();
    return () => {
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [load]);

  useEffect(() => {
    onHint({ text: hintText, loading });
  }, [hintText, loading, onHint]);

  return (
    <>
      {attractions.map((a) => (
        <SpotMarker key={a.key} name={a.name} lat={a.lat} lng={a.lng} />
      ))}
    </>
  );
}

function AppLogo() {
  return (
    <span className="app-header__logo-wrap">
      <img
        src={logoImg}
        alt=""
        width={40}
        height={40}
        decoding="async"
        className="app-header__logo"
      />
    </span>
  );
}

export default function App() {
  const [osmHint, setOsmHint] = useState<OsmHint>({ text: null, loading: false });
  const onOsmHint = useCallback((h: OsmHint) => setOsmHint(h), []);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const geoSkipRef = useRef(false);

  const goToSearchResult = useCallback((lat: number, lng: number) => {
    geoSkipRef.current = true;
    setFlyTarget((prev) => ({
      lat,
      lng,
      id: (prev?.id ?? 0) + 1,
    }));
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <AppLogo />
        <div className="app-header__titles">
          <h1 className="app-header__name">Your Tourism Guide</h1>
        </div>
      </header>
      <main className="map-shell">
        <MapSearch className="map-search" onNavigate={goToSearchResult} />
        <MapContainer
          center={FALLBACK_CENTER}
          zoom={FALLBACK_ZOOM}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='Places data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> (Overpass) · Basemap &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url={DARK_TILES}
          />
          <MapFlyTo target={flyTarget} zoom={SEARCH_RESULT_ZOOM} />
          <FlyToUserLocation geoSkipRef={geoSkipRef} />
          <AttractionsFromOsm onHint={onOsmHint} />
        </MapContainer>
        {(osmHint.loading || osmHint.text) && (
          <div className="map-osm-hint" aria-live="polite">
            {osmHint.loading && <span>Loading OpenStreetMap places…</span>}
            {!osmHint.loading && osmHint.text}
          </div>
        )}
      </main>
    </div>
  );
}
