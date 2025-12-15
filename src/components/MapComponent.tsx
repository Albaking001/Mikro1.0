// src/components/MapComponent.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  ScaleControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L, { latLngBounds } from "leaflet";

import { stationStatusLabels, type StationStatus } from "../data/stations";
import { createSpatialIndex, findNearestStation } from "../utils/spatialIndex";
import type { MapStation } from "../types/map";
export type { MapStation } from "../types/map";

type MapComponentProps = {
  stations: MapStation[];
};

type Cluster = {
  id: string;
  coordinates: [number, number];
  count: number;
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

const CLUSTER_ZOOM_THRESHOLD = 13;

const haversineDistanceKm = (a: [number, number], b: [number, number]) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
};

function MapReadyHandler({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();

  useEffect(() => {
    onReady(map);
  }, [map, onReady]);

  return null;
}

function MapClickHandler({
  onClick,
}: {
  onClick: (coords: [number, number]) => void;
}) {
  useMapEvents({
    click: (event) => onClick([event.latlng.lat, event.latlng.lng]),
  });

  return null;
}

const MapComponent: React.FC<MapComponentProps> = ({ stations }) => {
  const [currentStyle, setCurrentStyle] = useState<TileKey>("light");
  const [activeFilters, setActiveFilters] = useState(initialFilters);
  const mapRef = useRef<L.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(13);
  const [nearestStation, setNearestStation] = useState<
    { station: MapStation; distanceKm: number } | null
  >(null);

  console.log("🗺️ MapComponent received stations:", stations);

  const filteredStations = useMemo(
    () => stations.filter((station) => activeFilters[station.status]),
    [stations, activeFilters],
  );

  const spatialIndex = useMemo(
    () => createSpatialIndex(filteredStations),
    [filteredStations],
  );

  const clusterBuckets = useMemo(() => {
    if (zoomLevel >= CLUSTER_ZOOM_THRESHOLD) return [];

    const bucketSize = Math.max(0.01, 0.6 / Math.pow(2, zoomLevel));
    const buckets = new Map<
      string,
      { sumLat: number; sumLng: number; count: number; stations: MapStation[] }
    >();

    filteredStations.forEach((station) => {
      const [lat, lng] = station.coordinates;
      const bucketLat = Math.floor(lat / bucketSize);
      const bucketLng = Math.floor(lng / bucketSize);
      const key = `${bucketLat}-${bucketLng}`;

      const existing = buckets.get(key);
      if (existing) {
        existing.sumLat += lat;
        existing.sumLng += lng;
        existing.count += 1;
        existing.stations.push(station);
        return;
      }

      buckets.set(key, {
        sumLat: lat,
        sumLng: lng,
        count: 1,
        stations: [station],
      });
    });

    return Array.from(buckets.entries()).map<Cluster>(([key, value]) => ({
      id: key,
      coordinates: [value.sumLat / value.count, value.sumLng / value.count],
      count: value.count,
      stations: value.stations,
    }));
  }, [filteredStations, zoomLevel]);

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

  const handleNearestLookup = useCallback(
    (coords: [number, number]) => {
      const nearest = findNearestStation(spatialIndex, coords);
      if (!nearest) return;

      const distanceKm = haversineDistanceKm(nearest.station.coordinates, coords);
      setNearestStation({ station: nearest.station, distanceKm });
    },
    [spatialIndex],
  );

  const handleClusterZoom = (cluster: Cluster) => {
    if (!mapRef.current) return;
    const nextZoom = Math.min(mapRef.current.getZoom() + 2, 18);
    mapRef.current.setView(cluster.coordinates, nextZoom);
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

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    const updateZoom = () => setZoomLevel(map.getZoom());
    map.on("zoomend", updateZoom);
    updateZoom();

    return () => {
      map.off("zoomend", updateZoom);
    };
  }, [mapReady]);

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
              setMapReady(true);
              setZoomLevel(mapInstance.getZoom());
            }}
          />
          <MapClickHandler onClick={handleNearestLookup} />
          <TileLayer
            url={activeLayer.url}
            attribution={activeLayer.attribution}
          />

          {zoomLevel < CLUSTER_ZOOM_THRESHOLD
            ? clusterBuckets.map((cluster) => (
                <CircleMarker
                  key={cluster.id}
                  center={cluster.coordinates}
                  radius={Math.min(22, 12 + cluster.count)}
                  pathOptions={{
                    color: "#2563eb",
                    fillColor: "#3b82f6",
                    fillOpacity: 0.8,
                    weight: 2,
                  }}
                  eventHandlers={{
                    click: () => handleClusterZoom(cluster),
                  }}
                >
                  <Popup>
                    <div className="space-y-1">
                      <p className="font-semibold">{cluster.count} Stationen</p>
                      <p className="text-sm text-gray-700">
                        Tippe für Detailansicht, um näher heranzuzoomen.
                      </p>
                    </div>
                  </Popup>
                </CircleMarker>
              ))
            : filteredStations.map((station) => {
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

          {nearestStation ? (
            <CircleMarker
              center={nearestStation.station.coordinates}
              radius={16}
              pathOptions={{
                color: "#0ea5e9",
                fillColor: "#38bdf8",
                fillOpacity: 0.2,
                weight: 3,
              }}
            >
              <Popup>
                <div className="space-y-1">
                  <p className="font-semibold">
                    Nächstgelegene Station: {nearestStation.station.name}
                  </p>
                  <p className="text-sm text-gray-700">
                    Entfernung: {nearestStation.distanceKm.toFixed(2)} km
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          ) : null}

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
