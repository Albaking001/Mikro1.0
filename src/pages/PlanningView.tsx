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

const theme = {
  colors: {
    textPrimary: "#1f2937",   // fast schwarz -> Haupttext
    textSecondary: "#374151", // dunkles Grau -> normaler Text
    textMuted: "#6b7280",     // echtes Grau -> Hinweise
    accent: "#1f6feb",        // Blau (Score, Highlights)
    background: "#f5f7fa",    // Sidebar-Hintergrund
    cardBackground: "#ffffff",
  },
};

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
  normalizedTotal: number;
  rawTotal: number;
  weightedDemand: number;
  distanceBonus: number;
  coveragePenalty: number;
  label: string;
  missingFields: string[];
};

function Card({
                title,
                children,
              }: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
      <div
          style={{
            background: theme.colors.cardBackground,
            borderRadius: 14,
            padding: 16,
            marginBottom: 16,
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
          }}
      >
        {title && (
            <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: theme.colors.textPrimary,
                  marginBottom: 12,
                }}
            >
              {title}
            </div>
        )}
        {children}
      </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
      <label style={{ display: "block", fontSize: 12, color: "#444", marginBottom: 6 }}>
        {children}
      </label>
  );
}

function calculateScore(
  ctx: PlanningContextResponse | null,
  nb: NearbyStationsResponse | null,
): ScoreBreakdown | null {
  if (!ctx || !nb) return null;

  const missingFields: string[] = [];

  const schools = ctx.schools ?? 0;
  if (ctx.schools == null) missingFields.push("context.schools");

  const universities = ctx.universities ?? 0;
  if (ctx.universities == null) missingFields.push("context.universities");

  const shops = ctx.shops ?? 0;
  if (ctx.shops == null) missingFields.push("context.shops");

  const busStops = ctx.bus_stops ?? 0;
  if (ctx.bus_stops == null) missingFields.push("context.bus_stops");

  const rail = ctx.railway_stations ?? 0;
  if (ctx.railway_stations == null) missingFields.push("context.railway_stations");

  const weightedDemand =
    schools * 2 +
    universities * 3 +
    shops * 0.5 +
    busStops * 0.5 +
    rail * 1.5;

  const distanceMeters = nb.nearest_station_distance_m ?? 0;
  if (nb.nearest_station_distance_m == null)
    missingFields.push("nearby.nearest_station_distance_m");

  const distanceBonus = Math.min(20, Math.round(distanceMeters / 100));

  const stationsInRadius = nb.stations_in_radius ?? 0;
  if (nb.stations_in_radius == null) missingFields.push("nearby.stations_in_radius");

  const coveragePenalty = Math.min(30, stationsInRadius * 3);

  const rawTotal = weightedDemand + distanceBonus - coveragePenalty;

  const normalized =
    Number.isFinite(rawTotal) && rawTotal > 0
      ? Math.max(0, Math.min(100, Math.round((rawTotal / (rawTotal + 60)) * 100)))
      : 0;

  const label =
    normalized >= 90
      ? "Sehr gut"
      : normalized >= 70
        ? "Gut"
        : normalized >= 50
          ? "Eher okay"
          : "Eher schlecht";

  return {
    normalizedTotal: normalized,
    rawTotal,
    weightedDemand,
    distanceBonus,
    coveragePenalty,
    label,
    missingFields,
  };
}

/* Funktion provisorisch für Größe der Fahrradstation basierend auf Score*/
function getStationRecommendation(score: number) {
  if (score >= 80) return "Große Station (20+ Räder)";
  if (score >= 60) return "Mittlere Station (10–12 Räder)";
  return "Kleine Station (6–8 Räder)";
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

  //Dummy Daten für Häufigkeit der Nutzung einer Station
  const demoUsage = {
    avgUtilization: 78,
    turnoverPerDay: 4.6,
    fullEventsPerDay: 2,
    emptyEventsPerDay: 1,
  };

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
            width: 420,
            padding: 16,
            borderLeft: "1px solid #ddd",
            overflowY: "auto",
            background: theme.colors.background,
            color: theme.colors.textSecondary, // 👈 WICHTIG
          }}
      >

        <div style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 , color: "#1f2937" }}>Planung</h2>
          <div style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 4 }}>
            Standort wählen → Kontext/Netz laden → Score bewerten
          </div>
        </div>

        <Card title="Eingaben">
          <FieldLabel>City</FieldLabel>
          <input
              value={cityName}
              onChange={(e) => setCityName(e.target.value)}
              style={{ width: "60%", marginBottom: 12, padding: 8, borderRadius: 8, border: "1px solid #ddd" }}
              placeholder="Mainz"
          />

          <FieldLabel>Radius (m)</FieldLabel>
          <input
              type="number"
              value={radius}
              min={50}
              max={5000}
              onChange={(e) => setRadius(Number(e.target.value))}
              style={{ width: "60%", padding: 8, borderRadius: 8, border: "1px solid #ddd" }}
          />

          <div style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 10 }}>
            Tipp: Klick auf die Karte ⇒ simulierte Station + Context/Network Daten.
          </div>
        </Card>

        <Card title="Score (Potenzial)">
          {score ? (
              <>
                <div
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      background: "#f2f7ff",
                      border: "1px solid #d6e5ff",
                      marginBottom: 10,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                >
                  <div>
                    <div style={{ fontSize: 13, color: "#2c3e50" }}>Gesamtscore</div>
                    <strong style={{ fontSize: 24, color: "#1f6feb" }}>
                      {score.normalizedTotal} / 100
                    </strong>
                  </div>
                  <span
                      style={{
                        background: "#e8f4ff",
                        color: "#0a4a9a",
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                  >
            {score.label}
          </span>
                </div>

                <div style={{ fontSize: 12, color: theme.colors.textMuted }}>
                  Vorschau der Berechnung (Details kommen gleich unten in den Blöcken).
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  <li>
                    Nachfrage (gewichtet): <b>{score.weightedDemand.toFixed(1)}</b>
                    <div style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                      Schulen ×2, Unis ×3, Shops ×0.5, Bus ×0.5, Bahn ×1.5
                    </div>
                  </li>

                  <li>
                    Distanzbonus: <b>{score.distanceBonus}</b>
                    <div style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                      Mehr Punkte, je weiter die nächste Station entfernt ist
                    </div>
                  </li>

                  <li>
                    Abdeckungs-Penalty: <b>-{score.coveragePenalty}</b>
                    <div style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                      Wird höher, je mehr Stationen im Radius liegen
                    </div>
                  </li>

                  <li>
                    Rohwert vor Normalisierung:{" "}
                    <b>{Math.max(0, Math.round(score.rawTotal))}</b>
                    <div style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                      In einen 0-100-Score skaliert: Score = raw / (raw + 60) × 100,
                      gedeckelt zwischen 0 und 100.
                    </div>
                  </li>
                </ul>

                {score.missingFields.length > 0 && (
                    <div
                        style={{
                          background: "#fff5e6",
                          border: "1px solid #ffd9a0",
                          borderRadius: 6,
                          padding: 8,
                          marginTop: 10,
                          fontSize: 12,
                          color: "#8a5a00",
                        }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        Welche Werte fehlten?
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {score.missingFields.map((field) => (
                            <li key={field}>{field}</li>
                        ))}
                      </ul>
                      <div style={{ marginTop: 6 }}>
                        Fehlende Felder werden mit 0 verrechnet, damit keine NaN-Werte
                        entstehen. Das wirkt neutral auf den Score.
                      </div>
                    </div>
                )}

              </>
          ) : (
              <div style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                Score wird berechnet, sobald ein Punkt auf der Karte gewählt wurde.
              </div>
          )}
        </Card>

        <Card title="Status">
          {point ? (
              <div style={{ fontFamily: "monospace", fontSize: 13 }}>
                lat: {point.lat.toFixed(6)} <br />
                lng: {point.lng.toFixed(6)}
              </div>
          ) : (
              <div style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                Noch kein Punkt gewählt.
              </div>
          )}

          {loading && (
              <div style={{ marginTop: 10, padding: 10, background: "#f6f6f6", borderRadius: 10 }}>
                Lädt Daten…
              </div>
          )}

          {error && (
              <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    background: "#ffecec",
                    borderRadius: 10,
                    color: "#8a0000",
                  }}
              >
                <b>Fehler:</b> {error}
              </div>
          )}
        </Card>

        <Card title="Netzabdeckung">
          {nearby ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li>Stations im Radius: <b>{nearby.stations_in_radius}</b></li>
                <li>Nearest: <b>{nearby.nearest_station?.name ?? "-"}</b></li>
                <li>Distanz: <b>{nearby.nearest_station_distance_m ?? "-"} m</b></li>
              </ul>
          ) : (
              <div style={{ color: theme.colors.textMuted, fontSize: 13 }}>(keine Daten)</div>
          )}
        </Card>

        <Card title="Kontext (OSM / Overpass)">
          {context ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li>Bus stops: <b>{context.bus_stops}</b></li>
                <li>Rail stations: <b>{context.railway_stations}</b></li>
                <li>Schools: <b>{context.schools}</b></li>
                <li>Universities: <b>{context.universities}</b></li>
                <li>Shops (POI): <b>{context.shops}</b></li>
              </ul>
          ) : (
              <div style={{ color: theme.colors.textMuted, fontSize: 13 }}>(keine Daten)</div>
          )}
        </Card>

        <Card title="Empfehlung Stationsgröße">
          {score ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {getStationRecommendation(score.normalizedTotal)}
                </div>
                <div style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 6 }}>
                  Basierend auf Score und erwarteter Nachfrage (Simulation).
                </div>
              </>
          ) : (
              <div style={{ fontSize: 13, color: theme.colors.textMuted }}>
                Empfehlung verfügbar, sobald ein Standort bewertet wurde.
              </div>
          )}
        </Card>

        <Card title="Nutzungsmuster umliegender Stationen">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Ø Auslastung: <b>{demoUsage.avgUtilization}%</b></li>
            <li>Turnover / Tag: <b>{demoUsage.turnoverPerDay}</b></li>
            <li>Vollstände / Tag: <b>{demoUsage.fullEventsPerDay}</b></li>
            <li>Leerstände / Tag: <b>{demoUsage.emptyEventsPerDay}</b></li>
          </ul>
          <div style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 8 }}>
            Prognose / Demo-Werte – echte Nutzungsdaten folgen.
          </div>
        </Card>

      </div>
    </div>
);
}