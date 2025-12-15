// src/pages/PlanningView.tsx

import { useState } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import {
  getPlanningContext,
  getNearbyStations,
} from "../api/planning";

import type {
  PlanningContextResponse,
  NearbyStationsResponse,
} from "../api/planning";

// Small helper: no `any`
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function PlanningView() {
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState<number>(500);
  const [cityName, setCityName] = useState<string>("Mainz");

  const [context, setContext] = useState<PlanningContextResponse | null>(null);
  const [nearby, setNearby] = useState<NearbyStationsResponse | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(lat: number, lng: number) {
    setPoint({ lat, lng });
    setLoading(true);
    setError(null);

    try {
      const [ctx, nb] = await Promise.all([
        getPlanningContext({ lat, lng, radius }),
        getNearbyStations({ lat, lng, radius, city_name: cityName }),
      ]);

      setContext(ctx);
      setNearby(nb);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
      setContext(null);
      setNearby(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      {/* MAP */}
      <div style={{ flex: 1, height: "100%" }}>
        <MapContainer
          center={[50.0, 8.27]}
          zoom={13}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <ClickHandler onClick={handleClick} />

          {point && (
            <>
              <Marker position={[point.lat, point.lng]} />
              <Circle
                center={[point.lat, point.lng]}
                radius={radius}
                pathOptions={{ color: "blue" }}
              />
            </>
          )}
        </MapContainer>
      </div>

      {/* SIDEBAR */}
      <div
        style={{
          width: 400,
          padding: 16,
          borderLeft: "1px solid #ddd",
          overflowY: "auto",
          background: "white",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Planung</h2>

        <label style={{ display: "block", fontSize: 12, color: "#444" }}>City</label>
        <input
          value={cityName}
          onChange={(e) => setCityName(e.target.value)}
          style={{ width: "100%", marginBottom: 12 }}
          placeholder="Mainz"
        />

        <label style={{ display: "block", fontSize: 12, color: "#444" }}>Radius (m)</label>
        <input
          type="number"
          value={radius}
          min={50}
          max={5000}
          onChange={(e) => setRadius(Number(e.target.value))}
          style={{ width: "100%", marginBottom: 10 }}
        />

        <p style={{ fontSize: 12, color: "#666" }}>
          Tipp: Klick auf die Karte ⇒ simulierte Station + Context/Network Daten.
        </p>

        {point && (
          <div style={{ fontFamily: "monospace", fontSize: 13, marginBottom: 12 }}>
            lat: {point.lat.toFixed(6)} <br />
            lng: {point.lng.toFixed(6)}
          </div>
        )}

        {loading && (
          <div style={{ padding: 10, background: "#f6f6f6", borderRadius: 10 }}>
            Lädt Daten…
          </div>
        )}

        {error && (
          <div style={{ padding: 10, background: "#ffecec", borderRadius: 10, color: "#8a0000" }}>
            <b>Fehler:</b> {error}
          </div>
        )}

        {/* Nearby stations */}
        <div style={{ borderTop: "1px solid #eee", paddingTop: 10, marginTop: 10 }}>
          <h3 style={{ margin: "8px 0" }}>Netzabdeckung (Stations)</h3>
          {nearby ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Stations im Radius: <b>{nearby.stations_in_radius}</b></li>
              <li>Nearest: <b>{nearby.nearest_station?.name ?? "-"}</b></li>
              <li>Distanz: <b>{nearby.nearest_station_distance_m ?? "-"} m</b></li>
            </ul>
          ) : (
            <div style={{ color: "#666", fontSize: 13 }}>(keine Daten)</div>
          )}
        </div>

        {/* Context */}
        <div style={{ borderTop: "1px solid #eee", paddingTop: 10, marginTop: 10 }}>
          <h3 style={{ margin: "8px 0" }}>Kontext (OSM / Overpass)</h3>
          {context ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Bus stops: <b>{context.bus_stops}</b></li>
              <li>Rail stations: <b>{context.railway_stations}</b></li>
              <li>Schools: <b>{context.schools}</b></li>
              <li>Universities: <b>{context.universities}</b></li>
              <li>Shops (POI): <b>{context.shops}</b></li>
            </ul>
          ) : (
            <div style={{ color: "#666", fontSize: 13 }}>(keine Daten)</div>
          )}
        </div>
      </div>
    </div>
  );
}
