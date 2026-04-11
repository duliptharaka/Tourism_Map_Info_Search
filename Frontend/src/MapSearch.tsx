import { FormEvent, useCallback, useRef, useState } from "react";
import { searchLocation, type GeocodeHit } from "./geocode";

type MapSearchProps = {
  className?: string;
  onNavigate: (lat: number, lng: number) => void;
};

export function MapSearch({ className, onNavigate }: MapSearchProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) {
      setError("Type at least 2 characters.");
      setHits([]);
      setOpen(false);
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);

    try {
      const results = await searchLocation(q, ac.signal);
      if (results.length === 0) {
        setHits([]);
        setOpen(false);
        setError("No places found — try a different spelling or add a city.");
        return;
      }
      if (results.length === 1) {
        const h = results[0]!;
        onNavigate(h.lat, h.lng);
        setQuery(h.label);
        setHits([]);
        setOpen(false);
        return;
      }
      setHits(results);
      setOpen(true);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError("Search failed. Check your connection and try again.");
      setHits([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, [query, onNavigate]);

  const pickHit = useCallback(
    (h: GeocodeHit) => {
      onNavigate(h.lat, h.lng);
      setQuery(h.label);
      setHits([]);
      setOpen(false);
      setError(null);
    },
    [onNavigate]
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runSearch();
  };

  return (
    <div className={className}>
      <form className="map-search__form" onSubmit={onSubmit} role="search">
        <label className="map-search__label" htmlFor="map-search-input">
          Find location
        </label>
        <div className="map-search__row">
          <input
            id="map-search-input"
            className="map-search__input"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Place, address, city…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-expanded={open}
            aria-controls="map-search-results"
            aria-busy={loading}
          />
          <button className="map-search__submit" type="submit" disabled={loading}>
            {loading ? "…" : "Search"}
          </button>
        </div>
      </form>
      {error && (
        <p className="map-search__error" role="alert">
          {error}
        </p>
      )}
      {open && hits.length > 0 && (
        <ul id="map-search-results" className="map-search__hits" role="listbox" aria-label="Search results">
          {hits.map((h, i) => (
            <li key={`${h.lat},${h.lng},${i}`} className="map-search__hit" role="none">
              <button type="button" className="map-search__hit-btn" role="option" onClick={() => pickHit(h)}>
                {h.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
