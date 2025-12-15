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
import PlanningSidebar from "./PlanningSidebar";
import {
  fetchContextLayers,
  fetchContextSummary,
  type ContextLayers,
  type ContextSummary,
} from "../../services/api";

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

const REVERSE_GEOCODE_DELAY = 400;

const formatCoordinate = (value: number) => value.toFixed(5);

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
    </section>
  );
};

export default PlanningMap;
