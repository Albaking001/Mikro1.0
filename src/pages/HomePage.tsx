// src/pages/HomePage.tsx
import React, { useEffect, useState } from "react";
import MapComponent, { type MapStation } from "../components/MapComponent";
import PlanningMap from "../features/planning/PlanningMap";

import type { ApiStation } from "../services/api";
import type { StationStatus } from "../data/stations";

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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setError(null);
        setLoading(true);

        
        const res = await fetch("/api/v1/stations?city_uid=160");

        if (!res.ok) {
          const text = await res.text();
          console.error("Error /stations?city_uid=160:", res.status, text);
          throw new Error(`Fehler /stations?city_uid=160: ${res.status}`);
        }

        const data = (await res.json()) as ApiStation[];
        console.log(" API /stations?city_uid=160 data:", data);

        if (cancelled) return;

        const mapped = data.map(mapFromApi);
        console.log(" Mapped stations for map:", mapped);

        setStations(mapped);
      } catch (err: unknown) {
        console.error(" Error loading stations:", err);
        setError(
          err instanceof Error ? err.message : "Unbekannter Fehler beim Laden",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p>Stationen werden geladen...</p>;
  }

  return (
    <div>
      {error && (
        <p style={{ color: "red", fontWeight: "bold" }}>
          Fehler beim Laden der Stationen: {error}
        </p>
      )}

      <p>
        <strong>Geladene Stationen:</strong> {stations.length}
      </p>

      <MapComponent stations={stations} />

      <PlanningMap />

      <p style={{ marginTop: "1rem", fontSize: "12px", color: "#555" }}>
        Debug: stations.length = {stations.length}
      </p>
    </div>
  );
};

export default HomePage;
