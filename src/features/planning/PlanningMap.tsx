import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import {
  DEFAULT_COVERAGE_RADIUS_METERS,
  buildHexGrid,
  createPlanningActions,
  createNearestNeighborSearcher,
  initializeStations,
  mapExistingStations,
  markCoverageGaps,
  type ExistingStation,
  type NearestStationHit,
  type PlanningStation,
  type CapacityClass,
} from "../../store/planningSlice";
import {
  DEFAULT_WEIGHTS,
  computeHeatPoints,
  createBaseGrid,
  type HeatPoint,
  type PotentialWeights,
} from "./potentialModel";

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const capacityClassLabels: Record<CapacityClass, string> = {
  micro: "Mikro (8 Plätze)",
  small: "Klein (12 Plätze)",
  standard: "Standard (18 Plätze)",
  large: "Groß (24 Plätze)",
};

L.Marker.prototype.options.icon = defaultIcon;

const REVERSE_GEOCODE_DELAY = 400;

const formatCoordinate = (value: number) => value.toFixed(5);

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const bandStyles: Record<ScoreBandId, { background: string; color: string; border: string }>
  = {
    excellent: {
      background: "#ecfdf3",
      color: "#166534",
      border: "#bbf7d0",
    },
    caution: {
      background: "#fffbeb",
      color: "#92400e",
      border: "#fcd34d",
    },
    unsuitable: {
      background: "#fef2f2",
      color: "#991b1b",
      border: "#fecdd3",
    },
  };

const deriveMetricsFromCoordinates = (lat: number, lng: number): RawMetricInput => {
  const demandSignal = Math.abs(Math.sin(lat * 0.9) + Math.cos(lng * 1.1));

  const coverageRatio = clamp(0.35 + Math.abs(Math.sin(lat * 1.15)) * 0.55);
  const populationDensity = 2500 + demandSignal * 8500;
  const nearbyUtilization = clamp(42 + Math.abs(Math.cos((lat + lng) * 2.3)) * 52, 0, 100);
  const congestionLevel = clamp(0.12 + Math.abs(Math.sin(lat * lng)) * 0.55);
  const poiCount = clamp(8 + Math.abs(Math.cos(lat * 1.9) + Math.sin(lng * 1.7)) * 18, 0, 60);
  const transitProximity = clamp(
    240 + Math.abs(Math.sin(lng * 2.1) + Math.cos(lat * 1.6)) * 860,
    120,
    2400,
  );

  return {
    coverageRatio,
    populationDensity,
    nearbyUtilization,
    congestionLevel,
    poiCount,
    transitProximity,
  };
};

async function reverseGeocode(lat: number, lng: number) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", lat.toString());
  url.searchParams.set("lon", lng.toString());

  const response = await fetch(url.toString(), {
    headers: {
      "Accept-Language": "de",
    },
  });

  if (!response.ok) {
    throw new Error(`Reverse geocoding failed: ${response.status}`);
  }

  const data = (await response.json()) as { display_name?: string };
  return data.display_name;
}

type MapClickHandlerProps = {
  onCreateStation: (lat: number, lng: number) => void;
};

const MapClickHandler: React.FC<MapClickHandlerProps> = ({ onCreateStation }) => {
  useMapEvents({
    click: (event) => {
      onCreateStation(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
};

const PlanningMap: React.FC = () => {
  const [stations, setStations] = useState<PlanningStation[]>(initializeStations);
  const [existingStations, setExistingStations] = useState<ExistingStation[]>([]);
  const [nearestLookup, setNearestLookup] = useState<
    Map<string, NearestStationHit[]>
  >(new Map());
  const [coverageCells, setCoverageCells] = useState<
    Array<{ id: string; polygon: [number, number][]; covered: boolean }>
  >([]);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const actions = useMemo(
    () => createPlanningActions(() => stations, setStations),
    [stations],
  );
  const [overrideInputs, setOverrideInputs] = useState<Record<string, string>>({});
  const pendingLookup = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [weights, setWeights] = useState<PotentialWeights>(DEFAULT_WEIGHTS);
  const baseGrid = useMemo(() => createBaseGrid(), []);
  const [heatPoints, setHeatPoints] = useState<HeatPoint[]>(() =>
    computeHeatPoints(baseGrid, stations, weights),
  );

  const handleReverseGeocode = (stationId: string, lat: number, lng: number) => {
    if (pendingLookup.current) {
      clearTimeout(pendingLookup.current);
    }

    pendingLookup.current = setTimeout(async () => {
      try {
        const label = await reverseGeocode(lat, lng);
        if (label) {
          actions.updateLabel(stationId, label);
        }
      } catch (error) {
        console.warn("Reverse geocoding skipped", error);
      }
    }, REVERSE_GEOCODE_DELAY);
  };

  useEffect(() => () => {
    if (pendingLookup.current) {
      clearTimeout(pendingLookup.current);
    }
  }, []);

  useEffect(() => {
    const debounceHandle = setTimeout(() => {
      setHeatPoints(computeHeatPoints(baseGrid, stations, weights));
    }, 200);

    return () => clearTimeout(debounceHandle);
  }, [baseGrid, stations, weights]);

  const createStation = (lat: number, lng: number) => {
    const fallbackLabel = `Geplanter Standort (${formatCoordinate(lat)}, ${formatCoordinate(lng)})`;
    const stationId = actions.addStation({ lat, lng, label: fallbackLabel });
    setOverrideInputs((current) => ({
      ...current,
      [stationId]: "",
    }));
    handleReverseGeocode(stationId, lat, lng);
    void loadSummary(lat, lng);
  };

  useEffect(() => {
    setOverrideInputs((current) => {
      const next = { ...current };
      stations.forEach((station) => {
        if (!(station.id in next)) {
          next[station.id] = (station.manualSlots ?? station.analysis.suggestedSlots).toString();
        }
      });
      return next;
    });
  }, [stations]);

  const applyManualSlots = (stationId: string) => {
    const rawValue = overrideInputs[stationId];
    const parsed = Number(rawValue);

    if (!rawValue) {
      actions.updateManualSlots(stationId, null);
      return;
    }

    if (!Number.isFinite(parsed) || parsed <= 0) {
      alert("Bitte eine gültige Anzahl an Stellplätzen eingeben.");
      return;
    }

    actions.updateManualSlots(stationId, parsed);
  };

  const markers = stations.map((station) => (
    <Marker key={station.id} position={[station.lat, station.lng]}>
      <Popup>
        <strong>{station.label ?? "Neuer Standort"}</strong>
        <div style={{ marginTop: "0.5rem", fontSize: "12px", color: "#4b5563" }}>
          <div>
            Koordinaten: {formatCoordinate(station.lat)}, {" "}
            {formatCoordinate(station.lng)}
          </div>
          <div>Erstellt: {new Date(station.createdAt).toLocaleString()}</div>
          <div>
            Empfehlung: {station.manualSlots ?? station.analysis.suggestedSlots} Plätze
          </div>
          <div style={{ marginTop: "0.25rem", lineHeight: 1.4 }}>
            <span style={{ display: "block", fontWeight: 600 }}>
              {capacityClassLabels[station.analysis.capacityClass]}
            </span>
            <span>Grundlage: {station.analysis.rationale}</span>
          </div>
        </div>
      </Tooltip>
    </Circle>
  ));

  const uncoveredPolygons = coverageCells.map((cell) => (
    <Polygon
      key={cell.id}
      pathOptions={{ color: "#ef4444", fillOpacity: 0.18, weight: 1, dashArray: "4 2" }}
      positions={cell.polygon.map((entry) => [entry[0], entry[1]])}
    >
      <Tooltip direction="center" opacity={0.9} permanent>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "#991b1b" }}>
          Versorgungslücke
        </div>
      </Tooltip>
    </Polygon>
  ));

  return (
    <section style={{ marginTop: "1.5rem" }}>
      <header style={{ marginBottom: "0.75rem" }}>
        <h2 style={{ margin: 0 }}>Planungskarte</h2>
        <p style={{ margin: "0.25rem 0", color: "#4b5563" }}>
          Klicken Sie in die Karte, um einen simulierten Standort hinzuzufügen. Die Daten werden
          automatisch in der URL und im lokalen Speicher gespeichert. Bestehende Stationen werden
          zur Lücken- und Nachbarschaftsanalyse automatisch geladen.
        </p>
        <p style={{ margin: "0.25rem 0", color: "#4b5563" }}>
          Die Heatmap zeigt das aktuelle Potenzial basierend auf Bevölkerung, Points of Interest,
          ÖPNV-Knoten und Abdeckung durch simulierte Stationen.
        </p>
        <div style={{ fontSize: "14px", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <span>Aktive Stationen: {stations.length}</span>
          <span>
            Bestandsstationen: {loadingExisting ? "lädt..." : existingStations.length}
          </span>
          {stations.length > 0 && (
            <button
              type="button"
              onClick={() => {
                actions.clearStations();
                setSummary(null);
                setSelectedStationId(null);
              }}
              style={{
                border: "1px solid #d1d5db",
                background: "#f9fafb",
                padding: "0.25rem 0.5rem",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              Stationen zurücksetzen
            </button>
          )}
        </div>
        <div
          style={{
            marginTop: "0.75rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "0.75rem",
          }}
        >
          <WeightSlider
            label="Bevölkerungsdichte"
            value={weights.population}
            onChange={(value) => setWeights((current) => ({ ...current, population: value }))}
          />
          <WeightSlider
            label="Points of Interest"
            value={weights.poi}
            onChange={(value) => setWeights((current) => ({ ...current, poi: value }))}
          />
          <WeightSlider
            label="ÖPNV-Anbindung"
            value={weights.transit}
            onChange={(value) => setWeights((current) => ({ ...current, transit: value }))}
          />
          <WeightSlider
            label="Deckungslücken"
            helper="Erhöht Potenzial in nicht abgedeckten Bereichen"
            value={weights.coverage}
            onChange={(value) => setWeights((current) => ({ ...current, coverage: value }))}
          />
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1rem",
          alignItems: "start",
        }}
      >
        <div
          style={{
            height: "480px",
            borderRadius: "12px",
            overflow: "hidden",
            border: "1px solid #e5e7eb",
          }}
        >
          <MapContainer
            center={[49.992863, 8.247263]}
            zoom={12}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapClickHandler onCreateStation={createStation} />
            {markers}
          </MapContainer>
        </div>

        <aside
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            background: "#ffffff",
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onCreateStation={createStation} />
          <PotentialHeatLayer points={heatPoints} />
          {markers}
        </MapContainer>
      </div>

      {scoredStations.length > 0 && (
        <div
          style={{
            marginTop: "1.25rem",
            padding: "1rem",
            borderRadius: "12px",
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>Standortbewertung</h3>
              <p style={{ margin: "0.25rem 0", color: "#4b5563", fontSize: "14px" }}>
                Kennzahlen werden bei jeder Änderung der Simulation neu berechnet.
              </p>
            </div>
            <span style={{ fontSize: "13px", color: "#4b5563" }}>
              Bewertete Punkte: {scoredStations.length}
            </span>
          </div>

          <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.5rem" }}>
            {scoredStations.map(({ station, evaluation }) => {
              const badgeStyle = bandStyles[evaluation.band.id];

              return (
                <article
                  key={station.id}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    borderRadius: "10px",
                    padding: "0.75rem 0.85rem",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "0.75rem",
                      flexWrap: "wrap",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{station.label ?? "Neuer Standort"}</div>
                      <div style={{ fontSize: "13px", color: "#4b5563" }}>
                        {formatCoordinate(station.lat)}, {formatCoordinate(station.lng)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          padding: "0.2rem 0.65rem",
                          borderRadius: "999px",
                          background: badgeStyle.background,
                          color: badgeStyle.color,
                          border: `1px solid ${badgeStyle.border}`,
                          fontSize: "12px",
                          fontWeight: 600,
                        }}
                      >
                        {evaluation.band.label}
                      </span>
                      <div style={{ fontSize: "13px", color: "#4b5563", marginTop: "0.25rem" }}>
                        Score: <strong style={{ color: "#111827" }}>{evaluation.score}</strong>/100
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: "0.35rem",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      marginBottom: "0.5rem",
                    }}
                  >
                    {evaluation.breakdown.map((entry) => (
                      <MetricBadge
                        key={entry.key}
                        label={entry.label}
                        value={`${Math.round(entry.normalizedValue * 100)}%`}
                      />
                    ))}
                  </div>

                  <div style={{ display: "grid", gap: "0.5rem" }}>
                    {evaluation.breakdown.map((entry) => (
                      <div
                        key={entry.key}
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          padding: "0.6rem 0.65rem",
                          background: "#f9fafb",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "0.5rem",
                            flexWrap: "wrap",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600 }}>{entry.label}</div>
                            <div style={{ fontSize: "12px", color: "#4b5563" }}>{entry.description}</div>
                          </div>
                          <div style={{ fontSize: "12px", color: "#4b5563" }}>
                            Gewichtung: {Math.round(entry.weight * 100)}%
                          </div>
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: "0.4rem",
                            marginTop: "0.4rem",
                            fontSize: "13px",
                            color: "#374151",
                          }}
                        >
                          <span>Rohwert: {entry.formattedRaw}</span>
                          <span>Normalisiert: {Math.round(entry.normalizedValue * 100)}%</span>
                          <span>
                            Beitrag: {Math.round((entry.contribution / evaluation.totalWeight) * 100)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

type MetricBadgeProps = {
  label: string;
  value: string;
};

const MetricBadge: React.FC<MetricBadgeProps> = ({ label, value }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      border: "1px solid #e5e7eb",
      borderRadius: "8px",
      padding: "0.35rem 0.5rem",
      background: "#f8fafc",
      fontSize: "13px",
      color: "#374151",
    }}
  >
    <span style={{ color: "#4b5563" }}>{label}</span>
    <strong style={{ color: "#111827" }}>{value}</strong>
  </div>
);

export default PlanningMap;

type WeightSliderProps = {
  label: string;
  value: number;
  helper?: string;
  onChange: (value: number) => void;
};

function WeightSlider({ label, value, helper, onChange }: WeightSliderProps) {
  return (
    <label
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "10px",
        padding: "0.75rem",
        background: "#f9fafb",
        display: "grid",
        gap: "0.25rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ fontVariantNumeric: "tabular-nums", color: "#111827" }}>
          {value.toFixed(2)}
        </span>
      </div>
      {helper ? (
        <span style={{ fontSize: "12px", color: "#4b5563" }}>{helper}</span>
      ) : null}
      <input
        type="range"
        min={0}
        max={1.5}
        step={0.05}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function PotentialHeatLayer({ points }: { points: HeatPoint[] }) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!map) return;

    if (!layerRef.current) {
      layerRef.current = L.layerGroup().addTo(map);
    }

    return () => {
      layerRef.current?.remove();
      layerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    if (!layerRef.current) return;

    const intensityToColor = (intensity: number) => {
      const value = Math.min(1, intensity);
      if (value < 0.3) return "#60a5fa";
      if (value < 0.55) return "#3b82f6";
      if (value < 0.75) return "#f59e0b";
      return "#ef4444";
    };

    layerRef.current.clearLayers();
    points.forEach(([lat, lng, intensity]) => {
      const radius = 14 + intensity * 12;
      const color = intensityToColor(intensity);

      L.circleMarker([lat, lng], {
        radius,
        color,
        fillColor: color,
        fillOpacity: Math.min(0.75, 0.35 + intensity * 0.35),
        opacity: 0,
        interactive: false,
      }).addTo(layerRef.current as L.LayerGroup);
    });
  }, [points]);

  return null;
}
