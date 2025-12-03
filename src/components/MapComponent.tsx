// src/components/MapComponent.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  ScaleControl,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L, { latLngBounds } from "leaflet";

import { stationStatusLabels, type StationStatus } from "../data/stations";

export type MapStation = {
  id: number;
  name: string;
  coordinates: [number, number];
  district: string;
  capacity: number;
  bikesAvailable: number;
  lastUpdated: string;
  status: StationStatus;
};

type MapComponentProps = {
  stations: MapStation[];
};

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

const tileLayers = {
  light: {
    name: "Hell (OSM Standard)",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  dark: {
    name: "Dunkel (CartoDB Dark Matter)",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://carto.com/attributions">CARTO</a> | &copy; OpenStreetMap contributors',
  },
  satellite: {
    name: "Satellit (Esri World Imagery)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
  },
} as const;

type TileKey = keyof typeof tileLayers;

const statusColors: Record<StationStatus, string> = {
  in_betrieb: "#22c55e",
  planung: "#f97316",
  wartung: "#ef4444",
};

const initialFilters: Record<StationStatus, boolean> = {
  in_betrieb: true,
  planung: true,
  wartung: false,
};

function MapReadyHandler({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();

  useEffect(() => {
    onReady(map);
  }, [map, onReady]);

  return null;
}

const MapComponent: React.FC<MapComponentProps> = ({ stations }) => {
  const [currentStyle, setCurrentStyle] = useState<TileKey>("light");
  const [activeFilters, setActiveFilters] = useState(initialFilters);
  const mapRef = useRef<L.Map | null>(null);

  console.log("🗺️ MapComponent received stations:", stations);

  const filteredStations = useMemo(
    () => stations.filter((station) => activeFilters[station.status]),
    [stations, activeFilters],
  );

  const summary = useMemo(() => {
    const totals = filteredStations.reduce(
      (acc, station) => {
        acc.capacity += station.capacity;
        acc.available += station.bikesAvailable;
        return acc;
      },
      { capacity: 0, available: 0 },
    );

    return {
      stationCount: filteredStations.length,
      capacity: totals.capacity,
      available: totals.available,
      utilization: totals.capacity
        ? Math.round((totals.available / totals.capacity) * 100)
        : 0,
    };
  }, [filteredStations]);

  const latestUpdate = useMemo(() => {
    if (filteredStations.length === 0) {
      return null;
    }

    return filteredStations.reduce(
      (latest, station) =>
        station.lastUpdated > latest ? station.lastUpdated : latest,
      filteredStations[0].lastUpdated,
    );
  }, [filteredStations]);

  const handleFilterChange = (status: StationStatus) => {
    setActiveFilters((current) => ({
      ...current,
      [status]: !current[status],
    }));
  };

  const activeLayer = tileLayers[currentStyle];
  const defaultCenter =
    filteredStations[0]?.coordinates ?? [49.992863, 8.247263];

  useEffect(() => {
    if (!mapRef.current) return;

    const handleResize = () => mapRef.current?.invalidateSize();

    // Ensure the map tiles render after layout shifts or filter changes
    mapRef.current.invalidateSize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [filteredStations.length, currentStyle]);

  useEffect(() => {
    if (!mapRef.current || filteredStations.length === 0) return;

    if (filteredStations.length === 1) {
      mapRef.current.setView(filteredStations[0].coordinates, 14);
      return;
    }

    const bounds = latLngBounds(
      filteredStations.map((station) => station.coordinates),
    );
    mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, [filteredStations]);

  const handleFitToBounds = () => {
    if (!mapRef.current || filteredStations.length === 0) return;

    if (filteredStations.length === 1) {
      mapRef.current.setView(filteredStations[0].coordinates, 14);
      return;
    }

    const bounds = latLngBounds(
      filteredStations.map((station) => station.coordinates),
    );
    mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">
            Kartenstil:
          </label>
          <select
            value={currentStyle}
            onChange={(e) => setCurrentStyle(e.target.value as TileKey)}
            className="border border-gray-300 rounded-md px-3 py-1 text-sm shadow-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(tileLayers).map(([key, layer]) => (
              <option key={key} value={key}>
                {layer.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleFitToBounds}
          className="text-sm px-3 py-1 rounded-md border border-gray-300 bg-white shadow-sm hover:bg-gray-50"
        >
          Alle Stationen anzeigen
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        {Object.entries(activeFilters).map(([status, enabled]) => (
          <button
            key={status}
            type="button"
            onClick={() => handleFilterChange(status as StationStatus)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition ${
              enabled
                ? "border-transparent text-white"
                : "border-gray-300 text-gray-600 bg-white"
            }`}
            style={
              enabled
                ? { backgroundColor: statusColors[status as StationStatus] }
                : undefined
            }
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: statusColors[status as StationStatus] }}
            />
            {stationStatusLabels[status as StationStatus]}
          </button>
        ))}
      </div>

      <div className="h-[600px] w-full">
        <MapContainer
          center={defaultCenter}
          zoom={13}
          scrollWheelZoom
          className="leaflet-container rounded-lg overflow-hidden"
        >
          <MapReadyHandler
            onReady={(mapInstance) => {
              mapRef.current = mapInstance;
              mapInstance.invalidateSize();
            }}
          />
          <TileLayer
            url={activeLayer.url}
            attribution={activeLayer.attribution}
          />

          {filteredStations.map((station) => {
            const utilization = Math.round(
              (station.bikesAvailable / station.capacity) * 100,
            );

            return (
              <CircleMarker
                key={station.id}
                center={station.coordinates}
                radius={12}
                pathOptions={{
                  color: statusColors[station.status],
                  fillColor: statusColors[station.status],
                  fillOpacity: 0.85,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="space-y-1">
                    <p className="font-semibold">{station.name}</p>
                    <p className="text-sm text-gray-700">
                      Bezirk: {station.district}
                    </p>
                    <p className="text-sm text-gray-700">
                      Kapazität: {station.bikesAvailable}/{station.capacity} Bikes
                    </p>
                    <p className="text-sm text-gray-700">
                      Auslastung: {utilization}%
                    </p>
                    <p className="text-sm text-gray-600">
                      Status: {stationStatusLabels[station.status]}
                    </p>
                    <p className="text-xs text-gray-500">
                      Aktualisiert: {station.lastUpdated}
                    </p>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

          <ScaleControl position="bottomleft" />
        </MapContainer>

        {filteredStations.length === 0 ? (
          <div className="mt-3 text-center text-sm text-gray-600">
            Keine Stationsdaten gefunden. Bitte versuche es später erneut.
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Aktive Stationen" value={summary.stationCount} />
        <SummaryCard
          label="Freie Fahrräder"
          value={`${summary.available} / ${summary.capacity}`}
          helper="(Bikes verfügbar / Gesamt)"
        />
        <SummaryCard
          label="Aktuelle Auslastung"
          value={`${summary.utilization}%`}
          helper={latestUpdate ? `Stand ${latestUpdate}` : undefined}
        />
      </div>
    </div>
  );
};

type SummaryCardProps = {
  label: string;
  value: string | number;
  helper?: string;
};

function SummaryCard({ label, value, helper }: SummaryCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      {helper ? (
        <p className="text-xs text-gray-500 mt-1">{helper}</p>
      ) : null}
    </div>
  );
}

export default MapComponent;
