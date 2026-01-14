// src/pages/PlanningView.tsx

import { useMemo, useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  useMapEvents,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";
import HeatGridLayer from "../components/HeatGridLayer";

import {
  getPlanningContext,
  getNearbyStations,
  getPrecomputedPlanningScores,
} from "../api/planning";

import type {
  PlanningContextResponse,
  NearbyStationsResponse,
  PrecomputedScoresResponse,
} from "../api/planning";

const theme = {
  colors: {
    textPrimary: "#1f2937",
    textSecondary: "#374151",
    textMuted: "#6b7280",
    accent: "#1f6feb",
    background: "#f5f7fa",
    cardBackground: "#ffffff",
  },
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function ClickHandler({
  onClick,
}: {
  onClick: (lat: number, lng: number) => void;
}) {
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

type Proposal = {
  id: string;
  name: string;
  lat: number;
  lng: number;

  context: PlanningContextResponse | null;
  nearby: NearbyStationsResponse | null;

  loading: boolean;
  error: string | null;
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
    <label
      style={{
        display: "block",
        fontSize: 12,
        color: "#444",
        marginBottom: 6,
      }}
    >
      {children}
    </label>
  );
}

function calculateScore(
  ctx: PlanningContextResponse | null,
  nb: NearbyStationsResponse | null
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
  if (ctx.railway_stations == null)
    missingFields.push("context.railway_stations");

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
  if (nb.stations_in_radius == null)
    missingFields.push("nearby.stations_in_radius");

  const coveragePenalty = Math.min(30, stationsInRadius * 3);

  const rawTotal = weightedDemand + distanceBonus - coveragePenalty;

  const normalized =
    Number.isFinite(rawTotal) && rawTotal > 0
      ? Math.max(
          0,
          Math.min(100, Math.round((rawTotal / (rawTotal + 60)) * 100))
        )
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

function getStationRecommendation(score: number) {
  if (score >= 80) return "Große Station (20+ Räder)";
  if (score >= 60) return "Mittlere Station (10–12 Räder)";
  return "Kleine Station (6–8 Räder)";
}

const btnStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: "8px 12px",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 800,
  color: "#111827",
  fontSize: 13,
  lineHeight: "16px",
  whiteSpace: "nowrap",
  appearance: "none",
  WebkitAppearance: "none",
};

const btnSmallStyle: React.CSSProperties = {
  ...btnStyle,
  padding: "6px 10px",
  fontWeight: 700,
};

const primaryBtn: React.CSSProperties = {
  ...btnStyle,
  background: theme.colors.accent,
  border: `1px solid ${theme.colors.accent}`,
  color: "#fff",
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);
  }
  return (await res.json()) as T;
}

export default function PlanningView() {
  const [radius, setRadius] = useState<number>(500);
  const [cityName, setCityName] = useState<string>("Mainz");

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [bestId, setBestId] = useState<string | null>(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const selected = proposals.find((p) => p.id === selectedId) ?? null;
  const compareProposals = proposals.filter((p) => compareIds.includes(p.id));

  const scoreSelected = calculateScore(
    selected?.context ?? null,
    selected?.nearby ?? null
  );

  const bestProposal = useMemo(() => {
    if (!bestId) return null;
    return proposals.find((p) => p.id === bestId) ?? null;
  }, [bestId, proposals]);

  const [showGrid, setShowGrid] = useState<boolean>(false);

  const [heatMeta, setHeatMeta] = useState<PrecomputedScoresResponse["meta"] | null>(null);
  const [heatPoints, setHeatPoints] = useState<Array<{ ix: number; iy: number; value: number }>>(
    []
  );

  const [heatError, setHeatError] = useState<string | null>(null);

  async function handleClick(lat: number, lng: number) {
    const letter = String.fromCharCode(65 + proposals.length); // A,B,C...
    const id = Date.now().toString();

    const newProposal: Proposal = {
      id,
      name: `Proposal ${letter}`,
      lat,
      lng,
      context: null,
      nearby: null,
      loading: true,
      error: null,
    };

    setProposals((prev) => [...prev, newProposal]);
    setSelectedId(id);

    try {
      const [ctx, nb] = await Promise.all([
        getPlanningContext({ lat, lng, radius }),
        getNearbyStations({ lat, lng, radius, city_name: cityName }),
      ]);

      setProposals((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, context: ctx, nearby: nb, loading: false, error: null }
            : p
        )
      );
    } catch (e: unknown) {
      setProposals((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                context: null,
                nearby: null,
                loading: false,
                error: getErrorMessage(e),
              }
            : p
        )
      );
    }
  }

  function toggleCompare(id: string) {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function clearCompare() {
    setCompareIds([]);
    setBestId(null);
    setSaveError(null);
    setSaveOk(null);
  }

  function removeProposal(id: string) {
    setProposals((prev) => prev.filter((p) => p.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
    setCompareIds((prev) => prev.filter((x) => x !== id));
    setBestId((cur) => (cur === id ? null : cur));
  }

  function clearAll() {
    setProposals([]);
    setSelectedId(null);
    setCompareIds([]);
    setBestId(null);
    setSaveError(null);
    setSaveOk(null);
  }

  function autoPickBest(): string | null {
    let best: { id: string; val: number } | null = null;
    for (const p of compareProposals) {
      const s = calculateScore(p.context, p.nearby)?.normalizedTotal ?? -1;
      if (!best || s > best.val) best = { id: p.id, val: s };
    }
    if (best) {
      setBestId(best.id);
      return best.id;
    }
    return null;
  }

  async function saveBestToBackend() {
    setSaveError(null);
    setSaveOk(null);

    // لازم يكون عندنا جوج Proposals فـ compare
    if (compareProposals.length < 2) {
      setSaveError("Wähle mindestens 2 Proposals zum Vergleichen.");
      return;
    }

    // إذا ماكانش bestId، خليه يتختار أوتوماتيكياً
    let idToSave = bestId;
    if (!idToSave) idToSave = autoPickBest();

    const p = proposals.find((x) => x.id === idToSave) ?? null;
    if (!p) {
      setSaveError("Kein BEST ausgewählt.");
      return;
    }
    if (p.loading) {
      setSaveError("BEST lädt noch Daten… bitte kurz warten.");
      return;
    }
    if (!p.context || !p.nearby) {
      setSaveError("BEST hat keine Daten (Context/Nearby fehlt).");
      return;
    }

    const s = calculateScore(p.context, p.nearby);
    if (!s) {
      setSaveError("Score konnte nicht berechnet werden.");
      return;
    }

    // ✅ هنا حل 422: nearest_distance_m خاصها int
    const nearestDistanceInt =
      p.nearby.nearest_station_distance_m == null
        ? null
        : Math.round(p.nearby.nearest_station_distance_m);

    const payload = {
      city_name: cityName,
      lat: p.lat,
      lng: p.lng,
      radius,

      score: s.normalizedTotal,
      score_label: s.label,

      stations_in_radius: p.nearby.stations_in_radius ?? null,
      nearest_station: p.nearby.nearest_station?.name ?? null,
      nearest_distance_m: nearestDistanceInt,

      bus_stops: p.context.bus_stops ?? 0,
      railway_stations: p.context.railway_stations ?? 0,
      schools: p.context.schools ?? 0,
      universities: p.context.universities ?? 0,
      shops: p.context.shops ?? 0,

      is_best: true,
    };

    try {
      setSaving(true);
      const saved = await postJson<{ id: number }>(
        "/api/v1/planning/proposals",
        payload
      );
      setSaveOk(`Gespeichert! Proposal-ID: ${saved.id}`);
    } catch (e: unknown) {
      setSaveError(`Save-Fehler: ${getErrorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (cityName.trim().toLowerCase() !== "mainz") {
      setHeatMeta(null);
      setHeatPoints([]);
      setHeatError("Heatmap ist aktuell nur für Mainz vorberechnet.");

      return;
    }

    let cancelled = false;
    setHeatError(null);

    getPrecomputedPlanningScores({ city_name: "Mainz", step_m: 250, radius_m: 500 })
      .then((res) => {
        if (cancelled) return;
        setHeatMeta(res.meta);
        setHeatPoints(res.points.map((p) => ({ ix: p.ix, iy: p.iy, value: p.score })));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setHeatMeta(null);
        setHeatPoints([]);
        setHeatError(getErrorMessage(e));

      })
      .finally(() => {
        if (cancelled) return;
      });

    return () => {
      cancelled = true;
    };

  }, [cityName]);

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
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <HeatGridLayer
            enabled={showGrid}
            meta={heatMeta ?? undefined}
            points={heatPoints}
          />

          <ClickHandler onClick={handleClick} />

          {proposals.map((p) => (
            <Marker
              key={p.id}
              position={[p.lat, p.lng]}
              eventHandlers={{
                click: () => setSelectedId(p.id),
              }}
            />
          ))}

          {selected && (
            <Circle
              center={[selected.lat, selected.lng]}
              radius={radius}
              pathOptions={{ color: "blue" }}
            />
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
          color: theme.colors.textSecondary,
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, color: "#1f2937" }}>Planung</h2>
          <div
            style={{
              fontSize: 12,
              color: theme.colors.textMuted,
              marginTop: 4,
            }}
          >
            Standort wählen → Kontext/Netz laden → Score bewerten
          </div>
        </div>

        <Card title="Eingaben">
          <FieldLabel>City</FieldLabel>
          <input
            value={cityName}
            onChange={(e) => setCityName(e.target.value)}
            style={{
              width: "60%",
              marginBottom: 12,
              padding: 8,
              borderRadius: 8,
              border: "1px solid #ddd",
            }}
            placeholder="Mainz"
          />

          <FieldLabel>Radius (m)</FieldLabel>
          <input
            type="number"
            value={radius}
            min={50}
            max={5000}
            onChange={(e) => setRadius(Number(e.target.value))}
            style={{
              width: "60%",
              padding: 8,
              borderRadius: 8,
              border: "1px solid #ddd",
            }}
          />

          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
          <input
            type="checkbox"
            checked={showGrid}
            onChange={() => setShowGrid((v) => !v)}
          />
          Grid anzeigen
        </label>

        <div style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 10 }}>
          Tipp: Klick auf die Karte ⇒ simulierte Station + Context/Network Daten.
        </div>

        </Card>
        <Card title="Proposals (Mehrere Standorte)">
          {proposals.length === 0 ? (
            <div style={{ color: theme.colors.textMuted, fontSize: 13 }}>
              Noch keine Proposals. Klick auf die Karte, um Proposal A/B/C zu
              setzen.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {proposals.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 12,
                    padding: 10,
                    cursor: "pointer",
                    background: p.id === selectedId ? "#eef5ff" : "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 800,
                        color: theme.colors.textPrimary,
                      }}
                    >
                      {p.name}
                      {p.id === bestId && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 12,
                            fontWeight: 900,
                            color: "#0a4a9a",
                            background: "#e8f4ff",
                            padding: "2px 8px",
                            borderRadius: 999,
                          }}
                        >
                          BEST
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: 12, color: theme.colors.textMuted }}>
                      {p.lat.toFixed(3)}, {p.lng.toFixed(3)}
                    </div>

                    {p.loading && (
                      <div style={{ fontSize: 12, color: theme.colors.textMuted }}>
                        Lädt…
                      </div>
                    )}
                    {p.error && (
                      <div style={{ fontSize: 12, color: "#8a0000" }}>Fehler</div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <label
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12,
                        color: "#111827",
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                      title="Für Vergleich auswählen"
                    >
                      <input
                        type="checkbox"
                        checked={compareIds.includes(p.id)}
                        onChange={() => toggleCompare(p.id)}
                      />
                      Compare
                    </label>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeProposal(p.id);
                      }}
                      style={btnSmallStyle}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              <button onClick={clearAll} style={btnStyle}>
                Clear all
              </button>
            </div>
          )}
        </Card>

        {/* ✅ هنا فين خاص يكون Save: تحت compare */}
        <Card title="Vergleich (Compare)">
          {compareProposals.length < 2 ? (
            <div style={{ color: theme.colors.textMuted, fontSize: 13 }}>
              Wähle mindestens 2 Proposals mit “Compare”, um sie zu vergleichen.
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 10,
                  flexWrap: "wrap",
                }}
              >
                <button onClick={autoPickBest} style={btnStyle}>
                  Best automatisch wählen
                </button>

                <button onClick={clearCompare} style={btnStyle}>
                  Compare zurücksetzen
                </button>

                <button
                  onClick={saveBestToBackend}
                  style={primaryBtn}
                  disabled={saving}
                  title="Speichert das aktuelle BEST (oder wählt automatisch das beste) in die Datenbank"
                >
                  {saving ? "Speichere..." : "BEST speichern (DB)"}
                </button>
              </div>

              {saveOk && (
                <div
                  style={{
                    background: "#ecfdf5",
                    border: "1px solid #a7f3d0",
                    color: "#065f46",
                    borderRadius: 10,
                    padding: 10,
                    fontSize: 13,
                    marginBottom: 10,
                  }}
                >
                  {saveOk}
                </div>
              )}

              {saveError && (
                <div
                  style={{
                    background: "#ffecec",
                    border: "1px solid #ffc1c1",
                    color: "#8a0000",
                    borderRadius: 10,
                    padding: 10,
                    fontSize: 13,
                    marginBottom: 10,
                  }}
                >
                  {saveError}
                </div>
              )}

              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #eee", color: "#111827" }}>
                        Proposal
                      </th>
                      <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #eee", color: "#111827" }}>
                        Score
                      </th>
                      <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #eee", color: "#111827" }}>
                        Stations
                      </th>
                      <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #eee", color: "#111827" }}>
                        Nearest (m)
                      </th>
                      <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #eee", color: "#111827" }}>
                        Bus
                      </th>
                      <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #eee", color: "#111827" }}>
                        Rail
                      </th>
                      <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #eee", color: "#111827" }}>
                        Schools
                      </th>
                      <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #eee", color: "#111827" }}>
                        Shops
                      </th>
                      <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #eee", color: "#111827" }}>
                        Aktion
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {compareProposals.map((p) => {
                      const s = calculateScore(p.context, p.nearby)?.normalizedTotal ?? null;

                      return (
                        <tr
                          key={p.id}
                          style={{
                            background: p.id === bestId ? "#eef5ff" : "transparent",
                          }}
                        >
                          <td style={{ padding: 8, borderBottom: "1px solid #f2f2f2" }}>
                            <div style={{ fontWeight: 800, color: "#111827" }}>
                              {p.name}
                            </div>
                            <div style={{ fontSize: 12, color: theme.colors.textMuted }}>
                              {p.lat.toFixed(3)}, {p.lng.toFixed(3)}
                            </div>
                          </td>

                          <td style={{ padding: 8, borderBottom: "1px solid #f2f2f2", textAlign: "right", color: "#111827" }}>
                            {s == null ? "-" : s}
                          </td>

                          <td style={{ padding: 8, borderBottom: "1px solid #f2f2f2", textAlign: "right", color: "#111827" }}>
                            {p.nearby?.stations_in_radius ?? "-"}
                          </td>

                          <td style={{ padding: 8, borderBottom: "1px solid #f2f2f2", textAlign: "right", color: "#111827" }}>
                            {p.nearby?.nearest_station_distance_m ?? "-"}
                          </td>

                          <td style={{ padding: 8, borderBottom: "1px solid #f2f2f2", textAlign: "right", color: "#111827" }}>
                            {p.context?.bus_stops ?? "-"}
                          </td>

                          <td style={{ padding: 8, borderBottom: "1px solid #f2f2f2", textAlign: "right", color: "#111827" }}>
                            {p.context?.railway_stations ?? "-"}
                          </td>

                          <td style={{ padding: 8, borderBottom: "1px solid #f2f2f2", textAlign: "right", color: "#111827" }}>
                            {p.context?.schools ?? "-"}
                          </td>

                          <td style={{ padding: 8, borderBottom: "1px solid #f2f2f2", textAlign: "right", color: "#111827" }}>
                            {p.context?.shops ?? "-"}
                          </td>

                          <td style={{ padding: 8, borderBottom: "1px solid #f2f2f2", textAlign: "right" }}>
                            <button onClick={() => setBestId(p.id)} style={btnStyle}>
                              Best markieren
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {bestProposal && (
                <div style={{ marginTop: 10, fontSize: 12, color: theme.colors.textMuted }}>
                  BEST aktuell: <b>{bestProposal.name}</b> .
                </div>
              )}
            </>
          )}
        </Card>

        <Card title="Score (Potenzial)">
          {scoreSelected ? (
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
                    {scoreSelected.normalizedTotal} / 100
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
                  {scoreSelected.label}
                </span>
              </div>

              <div style={{ fontSize: 12, color: theme.colors.textMuted }}>
                Vorschau der Berechnung.
              </div>

              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                <li>
                  Nachfrage (gewichtet): <b>{scoreSelected.weightedDemand.toFixed(1)}</b>
                </li>
                <li>
                  Distanzbonus: <b>{scoreSelected.distanceBonus}</b>
                </li>
                <li>
                  Abdeckungs-Penalty: <b>-{scoreSelected.coveragePenalty}</b>
                </li>
                <li>
                  Rohwert: <b>{Math.max(0, Math.round(scoreSelected.rawTotal))}</b>
                </li>
              </ul>
            </>
          ) : (
            <div style={{ color: theme.colors.textMuted, fontSize: 13 }}>
              Score wird berechnet, sobald ein Proposal ausgewählt wurde.
            </div>
          )}
        </Card>

        <Card title="Status">
          {selected ? (
            <div style={{ fontFamily: "monospace", fontSize: 13 }}>
              <b>{selected.name}</b>
              <br />
              lat: {selected.lat.toFixed(6)} <br />
              lng: {selected.lng.toFixed(6)}
            </div>
          ) : (
            <div style={{ color: theme.colors.textMuted, fontSize: 13 }}>
              Noch kein Proposal gewählt.
            </div>
          )}

          {selected?.loading && (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                background: "#f6f6f6",
                borderRadius: 10,
              }}
            >
              Lädt Daten…
            </div>
          )}

          {selected?.error && (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                background: "#ffecec",
                borderRadius: 10,
                color: "#8a0000",
              }}
            >
              <b>Fehler:</b> {selected.error}
            </div>
          )}
        </Card>

        <Card title="Netzabdeckung">
          {selected?.nearby ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>
                Stations im Radius: <b>{selected.nearby.stations_in_radius}</b>
              </li>
              <li>
                Nearest: <b>{selected.nearby.nearest_station?.name ?? "-"}</b>
              </li>
              <li>
                Distanz: <b>{selected.nearby.nearest_station_distance_m ?? "-"} m</b>
              </li>
            </ul>
          ) : (
            <div style={{ color: theme.colors.textMuted, fontSize: 13 }}>
              (keine Daten)
            </div>
          )}
        </Card>

        <Card title="Kontext (OSM / Overpass)">
          {selected?.context ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>
                Bus stops: <b>{selected.context.bus_stops}</b>
              </li>
              <li>
                Rail stations: <b>{selected.context.railway_stations}</b>
              </li>
              <li>
                Schools: <b>{selected.context.schools}</b>
              </li>
              <li>
                Universities: <b>{selected.context.universities}</b>
              </li>
              <li>
                Shops (POI): <b>{selected.context.shops}</b>
              </li>
            </ul>
          ) : (
            <div style={{ color: theme.colors.textMuted, fontSize: 13 }}>
              (keine Daten)
            </div>
          )}
        </Card>

        <Card title="Empfehlung Stationsgröße">
          {scoreSelected ? (
            <>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {getStationRecommendation(scoreSelected.normalizedTotal)}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: theme.colors.textMuted,
                  marginTop: 6,
                }}
              >
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
            <li>
              Ø Auslastung: <b>{demoUsage.avgUtilization}%</b>
            </li>
            <li>
              Turnover / Tag: <b>{demoUsage.turnoverPerDay}</b>
            </li>
            <li>
              Vollstände / Tag: <b>{demoUsage.fullEventsPerDay}</b>
            </li>
            <li>
              Leerstände / Tag: <b>{demoUsage.emptyEventsPerDay}</b>
            </li>
          </ul>
          <div style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 8 }}>
            Prognose / Demo-Werte – echte Nutzungsdaten folgen.
          </div>
        </Card>
      </div>
    </div>
  );
}
