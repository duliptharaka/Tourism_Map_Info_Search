import { useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";

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

const SPOTS: { name: string; lat: number; lng: number }[] = [
  { name: "Eiffel Tower", lat: 48.8584, lng: 2.2945 },
  { name: "Central Park", lat: 40.7829, lng: -73.9654 },
  { name: "Colosseum", lat: 41.8902, lng: 12.4922 },
];

const DARK_TILES =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

async function fetchLocation(name: string): Promise<LocationInfo> {
  const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
  const q = `?name=${encodeURIComponent(name)}`;
  const url = base ? `${base}/location${q}` : `/api/location${q}`;
  const r = await fetch(url);
  const j: unknown = await r.json();
  if (!r.ok) {
    const msg =
      j && typeof j === "object" && "detail" in j && typeof (j as { detail: unknown }).detail === "string"
        ? (j as { detail: string }).detail
        : "Request failed";
    throw new Error(msg);
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

function MapPinIcon() {
  return (
    <span className="app-header__mark" aria-hidden>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
        <path
          d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="11" r="2" fill="currentColor" />
      </svg>
    </span>
  );
}

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <MapPinIcon />
        <div className="app-header__titles">
          <h1 className="app-header__name">Tourism Map Search</h1>
          <p className="app-header__tagline">Click a marker for details from the API</p>
        </div>
      </header>
      <main className="map-shell">
        <MapContainer center={[45, 10]} zoom={3} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url={DARK_TILES}
          />
          {SPOTS.map((s) => (
            <SpotMarker key={s.name} name={s.name} lat={s.lat} lng={s.lng} />
          ))}
        </MapContainer>
      </main>
    </div>
  );
}
