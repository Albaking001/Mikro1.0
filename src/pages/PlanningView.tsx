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

type ScoreBreakdown = {
  total: number;
  weightedDemand: number;
  distanceBonus: number;
  coveragePenalty: number;
};

function calculateScore(
  ctx: PlanningContextResponse | null,
  nb: NearbyStationsResponse | null,
): ScoreBreakdown | null {
  if (!ctx || !nb) return null;

  const weightedDemand =
    ctx.schools * 2 +
    ctx.universities * 3 +
    ctx.shops * 0.5 +
    ctx.bus_stops * 0.5 +
    ctx.railway_stations * 1.5;

  const distanceMeters = nb.nearest_station_distance_m ?? 0;
  const distanceBonus = Math.min(20, Math.round(distanceMeters / 100));
  const coveragePenalty = Math.min(30, nb.stations_in_radius * 3);

  const total = Math.max(0, Math.round(weightedDemand + distanceBonus - coveragePenalty));

  return { total, weightedDemand, distanceBonus, coveragePenalty };
}

export default function PlanningView() {
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState<number>(500);
  const [cityName, setCityName] = useState<string>("Mainz");

  const [context, setContext] = useState<PlanningContextResponse | null>(null);
  const [nearby, setNearby] = useState<NearbyStationsResponse | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const score = calculateScore(context, nearby);

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

        {/* Scoreboard */}
        <div style={{ borderTop: "1px solid #eee", paddingTop: 10, marginTop: 10 }}>
          <h3 style={{ margin: "8px 0" }}>Scoreboard (Potenzial)</h3>
          {score ? (
            <>
              <div
                style={{
                  padding: 10,
                  borderRadius: 8,
                  background: "#f2f7ff",
                  border: "1px solid #d6e5ff",
                  marginBottom: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 14, color: "#2c3e50" }}>Gesamtscore</span>
                <strong style={{ fontSize: 22, color: "#1f6feb" }}>{score.total}</strong>
              </div>

              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                <li>
                  Nachfrage (gewichtet): <b>{score.weightedDemand.toFixed(1)}</b>
                  <div style={{ color: "#666", fontSize: 12 }}>
                    Schulen ×2, Unis ×3, Shops ×0.5, Bus ×0.5, Bahn ×1.5
                  </div>
                </li>
                <li>
                  Distanzbonus: <b>{score.distanceBonus}</b>
                  <div style={{ color: "#666", fontSize: 12 }}>
                    Mehr Punkte, je weiter die nächste Station entfernt ist
                  </div>
                </li>
                <li>
                  Abdeckungs-Penalty: <b>-{score.coveragePenalty}</b>
                  <div style={{ color: "#666", fontSize: 12 }}>
                    Wird höher, je mehr Stationen im Radius liegen
                  </div>
                </li>
              </ul>
              <p style={{ color: "#444", fontSize: 12, marginTop: 10 }}>
                Der Score fasst Nachfrage (Schulen/Unis/POIs), Abstand zur nächsten
                Station und bestehende Abdeckung zusammen. Höher = besserer Kandidat
                für einen neuen Standort.
              </p>
            </>
          ) : (
            <div style={{ color: "#666", fontSize: 13 }}>
              Score wird berechnet, sobald ein Punkt auf der Karte gewählt wurde.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
