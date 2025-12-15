import React from "react";
import type { ContextLayers, ContextSummary } from "../../services/api";

const tileStyle: React.CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "0.75rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
};

const sparkBarStyle = (value: number, max: number): React.CSSProperties => ({
  flex: 1,
  height: `${Math.max(6, (value / max) * 28)}px`,
  borderRadius: "4px",
  background: "linear-gradient(180deg, #22c55e 0%, #16a34a 100%)",
  opacity: 0.9,
});

const Sparkline: React.FC<{ values: number[] }> = ({ values }) => {
  if (values.length === 0) return <p style={{ color: "#9ca3af", margin: 0 }}>Keine Daten</p>;
  const max = Math.max(...values);

  return (
    <div style={{ display: "flex", gap: "4px", alignItems: "flex-end", minHeight: "32px" }}>
      {values.map((value, index) => (
        <div key={`${value}-${index}`} style={sparkBarStyle(value, max)} />
      ))}
    </div>
  );
};

const StatRow: React.FC<{ label: string; value: string | number; accent?: string }> = ({
  label,
  value,
  accent,
}) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <span style={{ color: "#6b7280" }}>{label}</span>
    <span style={{ fontWeight: 600, color: accent ?? "#111827" }}>{value}</span>
  </div>
);

const Chip: React.FC<{ label: string }> = ({ label }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "4px 8px",
      background: "#eef2ff",
      color: "#3730a3",
      borderRadius: "999px",
      fontSize: "12px",
      fontWeight: 600,
    }}
  >
    {label}
  </span>
);

export type PlanningSidebarProps = {
  selectedLabel?: string;
  summary: ContextSummary | null;
  layers: ContextLayers | null;
  loading: boolean;
  error: string | null;
};

const PlanningSidebar: React.FC<PlanningSidebarProps> = ({
  selectedLabel,
  summary,
  layers,
  loading,
  error,
}) => {
  const hasSummary = !!summary;

  return (
    <aside
      style={{
        minWidth: "320px",
        maxWidth: "380px",
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: "12px",
        padding: "1rem",
        boxShadow: "0 10px 40px rgba(0,0,0,0.05)",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <header>
        <p style={{ margin: 0, color: "#6b7280", fontSize: "13px" }}>Kontextlage</p>
        <h3 style={{ margin: "0.25rem 0", color: "#111827" }}>
          {selectedLabel ?? "Karte wählen"}
        </h3>
        <p style={{ margin: 0, color: "#6b7280", fontSize: "13px" }}>
          Aggregierte Layer (Hex/Kachel) aus Population, OSM Points of Interest und ÖPNV-Haltestellen.
        </p>
      </header>

      {loading && <p style={{ margin: 0 }}>Kontext wird geladen…</p>}
      {error && (
        <p style={{ margin: 0, color: "#b91c1c" }}>
          {error}
        </p>
      )}

      {!loading && hasSummary && summary && (
        <div style={tileStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ margin: 0, color: "#6b7280", fontSize: "12px" }}>Radius</p>
              <p style={{ margin: 0, fontWeight: 700 }}>{summary.radiusMeters} m</p>
            </div>
            <Chip label={`${summary.contributingHex.length} Hex`} />
          </div>
          <StatRow label="Population" value={`${summary.population.toLocaleString("de-DE")}`} />
          <StatRow label="Ø Dichte" value={`${summary.averageDensity.toLocaleString("de-DE")}/km²`} />
          <StatRow label="ÖPNV-Haltestellen" value={summary.transitStops} />
          <StatRow label="POIs gesamt" value={summary.poiCount} />

          <div style={{ marginTop: "0.5rem" }}>
            <p style={{ margin: "0 0 0.35rem", color: "#6b7280", fontSize: "12px" }}>Sparkline Trends</p>
            <div style={{ display: "grid", gap: "0.5rem" }}>
              <div>
                <p style={{ margin: "0 0 0.1rem", color: "#111827", fontWeight: 600 }}>Population</p>
                <Sparkline values={summary.sparklines.population} />
              </div>
              <div>
                <p style={{ margin: "0 0 0.1rem", color: "#111827", fontWeight: 600 }}>ÖPNV</p>
                <Sparkline values={summary.sparklines.transit} />
              </div>
              <div>
                <p style={{ margin: "0 0 0.1rem", color: "#111827", fontWeight: 600 }}>POIs</p>
                <Sparkline values={summary.sparklines.pois} />
              </div>
            </div>
          </div>
        </div>
      )}

      {layers && (
        <div style={{ display: "grid", gap: "0.65rem" }}>
          {["population", "transit", "pois"].map((key) => {
            const data = (layers as Record<string, ContextLayers[keyof ContextLayers]>)[key];
            const total = data.reduce((sum, entry) => sum + (key === "population" ? entry.population : key === "transit" ? entry.transitStops : entry.poiCount), 0);

            return (
              <div key={key} style={tileStyle}>
                <p style={{ margin: 0, color: "#6b7280", fontSize: "12px" }}>Layer · {key}</p>
                <StatRow label="Hex-Kacheln" value={data.length} />
                <StatRow label="Summe" value={total.toLocaleString("de-DE")} />
              </div>
            );
          })}
        </div>
      )}

      {!loading && !summary && !error && (
        <p style={{ margin: 0, color: "#6b7280" }}>
          Klicken Sie in die Karte, um Kontexte für einen Standort abzurufen.
        </p>
      )}
    </aside>
  );
};

export default PlanningSidebar;
