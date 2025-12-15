// src/pages/HomePage.tsx
import React, { useEffect, useState } from "react";
import MapComponent, { type MapStation } from "../components/MapComponent";

type MainzApiStation = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  station_number: number;
};

const mapFromMainzApi = (s: MainzApiStation): MapStation => ({
  id: s.id,
  name: s.name,
  coordinates: [s.lat, s.lng],
  stationNumber: s.station_number,
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

        const res = await fetch("/api/v1/stations/mainz");

        if (!res.ok) {
          const text = await res.text();
          console.error("Error /api/v1/stations/mainz:", res.status, text);
          throw new Error(`Fehler /api/v1/stations/mainz: ${res.status}`);
        }

        const data = (await res.json()) as MainzApiStation[];
        if (cancelled) return;

        const mapped = data
          .map(mapFromMainzApi)
          .filter((s) => Number.isFinite(s.coordinates[0]) && Number.isFinite(s.coordinates[1]));

        setStations(mapped);
      } catch (err: unknown) {
        console.error("Error loading stations:", err);
        setError(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p>Stationen werden geladen...</p>;

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
    </div>
  );
};

export default HomePage;
