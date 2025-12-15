import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  Tooltip,
  useMapEvents,
} from "react-leaflet";
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
} from "../../store/planningSlice";
import {
  computeScore,
  type RawMetricInput,
  type ScoreBandId,
} from "../../services/scoring/model";

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

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
  const [layers, setLayers] = useState<ContextLayers | null>(null);
  const [summary, setSummary] = useState<ContextSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingLayers, setLoadingLayers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingLookup = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);

  const scoredStations = useMemo(
    () =>
      stations.map((station) => {
        const metrics = deriveMetricsFromCoordinates(station.lat, station.lng);
        const evaluation = computeScore(metrics);

        return { station, metrics, evaluation };
      }),
    [stations],
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
    async function loadLayers() {
      try {
        setLoadingLayers(true);
        const response = await fetchContextLayers();
        setLayers(response);
      } catch (layerError) {
        console.error("Failed to load context layers", layerError);
        setError("Layer konnten nicht geladen werden");
      } finally {
        setLoadingLayers(false);
      }
    }

    void loadLayers();
  }, []);

  const loadSummary = async (lat: number, lng: number) => {
    try {
      setLoadingSummary(true);
      setError(null);
      const res = await fetchContextSummary(lat, lng, 700);
      setSummary(res);
    } catch (summaryError) {
      console.error("Failed to fetch context summary", summaryError);
      setError("Kontext konnte nicht geladen werden");
    } finally {
      setLoadingSummary(false);
    }
  };

  const createStation = (lat: number, lng: number) => {
    const fallbackLabel = `Geplanter Standort (${formatCoordinate(lat)}, ${formatCoordinate(lng)})`;
    const stationId = actions.addStation({ lat, lng, label: fallbackLabel });
    setSelectedStationId(stationId);
    handleReverseGeocode(stationId, lat, lng);
    void loadSummary(lat, lng);
  };

  const selectedStation = stations.find((station) => station.id === selectedStationId);

  const markers = stations.map((station) => (
    <Marker key={station.id} position={[station.lat, station.lng]}>
      <Popup>
        <strong>{station.label ?? "Neuer Standort"}</strong>
        <div style={{ marginTop: "0.5rem", fontSize: "12px", color: "#4b5563" }}>
          <div>
            Koordinaten: {formatCoordinate(station.lat)}, {" "}
            {formatCoordinate(station.lng)}
          </div>
          {nearest.length > 0 && (
            <div style={{ marginTop: "0.75rem" }}>
              <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
                Nächste Bestandsstationen
              </div>
              <ol style={{ paddingLeft: "1.25rem", margin: 0 }}>
                {nearest.map((hit) => (
                  <li key={hit.id} style={{ fontSize: "12px", color: "#374151" }}>
                    {hit.name ?? `Station ${hit.id}`} – {(hit.distanceMeters / 1000).toFixed(2)} km
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Popup>
      </Marker>
    );
  });

  const coverageOverlays = existingStations.map((station) => (
    <Circle
      key={station.id}
      center={[station.lat, station.lng]}
      radius={station.coverageRadiusMeters}
      pathOptions={{ color: "#0ea5e9", fillColor: "#0ea5e9", fillOpacity: 0.12 }}
    >
      <Tooltip direction="top" offset={[0, -8]} opacity={0.9} permanent>
        <div style={{ fontSize: "12px" }}>
          {station.name ?? "Bestandsstation"}
          <br />
          Radius: {Math.round(station.coverageRadiusMeters)} m
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
        {loadError && (
          <div style={{ marginTop: "0.5rem", color: "#b91c1c", fontSize: "14px" }}>
            Fehler beim Laden der Bestandsstationen: {loadError}
          </div>
        )}
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "1rem",
          alignItems: "start",
        }}
      >
        <div style={{ height: "440px", borderRadius: "12px", overflow: "hidden", border: "1px solid #e5e7eb" }}>
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

        <PlanningSidebar
          selectedLabel={selectedStation?.label}
          summary={summary}
          layers={layers}
          loading={loadingSummary || loadingLayers}
          error={error}
        />
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
