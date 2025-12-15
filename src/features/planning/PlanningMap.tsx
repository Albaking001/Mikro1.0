import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import {
  createPlanningActions,
  initializeStations,
  type PlanningStation,
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
  const actions = useMemo(
    () => createPlanningActions(() => stations, setStations),
    [stations],
  );
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
    handleReverseGeocode(stationId, lat, lng);
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
        </div>
      </Popup>
    </Marker>
  ));

  return (
    <section style={{ marginTop: "1.5rem" }}>
      <header style={{ marginBottom: "0.75rem" }}>
        <h2 style={{ margin: 0 }}>Planungskarte</h2>
        <p style={{ margin: "0.25rem 0", color: "#4b5563" }}>
          Klicken Sie in die Karte, um einen simulierten Standort hinzuzufügen. Die Daten werden
          automatisch in der URL und im lokalen Speicher gespeichert.
        </p>
        <p style={{ margin: "0.25rem 0", color: "#4b5563" }}>
          Die Heatmap zeigt das aktuelle Potenzial basierend auf Bevölkerung, Points of Interest,
          ÖPNV-Knoten und Abdeckung durch simulierte Stationen.
        </p>
        <div style={{ fontSize: "14px", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <span>Aktive Stationen: {stations.length}</span>
          {stations.length > 0 && (
            <button
              type="button"
              onClick={() => actions.clearStations()}
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

      <div style={{ height: "420px", borderRadius: "12px", overflow: "hidden", border: "1px solid #e5e7eb" }}>
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
          <PotentialHeatLayer points={heatPoints} />
          {markers}
        </MapContainer>
      </div>
    </section>
  );
};

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
