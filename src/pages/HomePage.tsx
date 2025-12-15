// src/pages/HomePage.tsx
import React, { Suspense, useCallback, useEffect, useState, lazy } from "react";
import MapComponent, { type MapStation } from "../components/MapComponent";

import type { ApiStation } from "../services/api";
import type { StationStatus } from "../data/stations";

const PlanningMap = lazy(() => import("../features/planning/PlanningMap"));

const inferStatus = (capacity: number): StationStatus =>
  capacity > 0 ? "in_betrieb" : "planung";

const mapFromApi = (s: ApiStation): MapStation => ({
  id: s.id,
  name: s.name,
  coordinates: [s.lat, s.lng],
  district: "",
  capacity: s.capacity,
  bikesAvailable: s.capacity,
  lastUpdated: "",
  status: inferStatus(s.capacity),
});

const HomePage: React.FC = () => {
  const [stations, setStations] = useState<MapStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStations = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setError(null);
        setLoading(true);

        const res = await fetch("/api/v1/stations?city_uid=160", { signal });

        if (!res.ok) {
          const text = await res.text();
          console.error("Error /stations?city_uid=160:", res.status, text);
          throw new Error(`Fehler /stations?city_uid=160: ${res.status}`);
        }

        const data = (await res.json()) as ApiStation[];
        console.log(" API /stations?city_uid=160 data:", data);

        if (signal?.aborted) return;

        const mapped = data.map(mapFromApi);
        console.log(" Mapped stations for map:", mapped);

        setStations(mapped);
      } catch (err: unknown) {
        if (signal?.aborted) return;
        console.error(" Error loading stations:", err);
        setError(
          err instanceof Error ? err.message : "Unbekannter Fehler beim Laden",
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchStations(controller.signal);

    return () => controller.abort();
  }, [fetchStations]);

  const handleReload = () => fetchStations();

  return (
    <div>
      {loading ? (
        <p style={{ fontWeight: "bold" }}>Stationen werden geladen...</p>
      ) : null}

      {error ? (
        <div
          style={{
            color: "#991b1b",
            background: "#fee2e2",
            border: "1px solid #fecdd3",
            borderRadius: "8px",
            padding: "12px",
            marginBottom: "12px",
          }}
        >
          <p style={{ fontWeight: "bold", margin: 0 }}>
            Fehler beim Laden der Stationen: {error}
          </p>
          <button
            type="button"
            onClick={handleReload}
            style={{
              marginTop: "8px",
              background: "#991b1b",
              color: "white",
              padding: "6px 10px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
            }}
          >
            Erneut laden
          </button>
        </div>
      ) : null}

      <p>
        <strong>Geladene Stationen:</strong> {stations.length}
      </p>

      <MapComponent stations={stations} />

      <Suspense fallback={<p>Planungskarte wird geladen...</p>}>
        <PlanningMap />
      </Suspense>

      <p style={{ marginTop: "1rem", fontSize: "12px", color: "#555" }}>
        Debug: stations.length = {stations.length}
      </p>
    </div>
  );
};

export default HomePage;
