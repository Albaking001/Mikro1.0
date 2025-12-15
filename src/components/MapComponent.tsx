"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  ScaleControl,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L, { latLngBounds } from "leaflet";

import GridLayer from "./Grid.Layer";

export type MapStation = {
  id: number;
  name: string;
  coordinates: [number, number];
  stationNumber: number;
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
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  dark: {
    name: "Dunkel (CartoDB Dark)",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; CARTO | OpenStreetMap",
  },
} as const;

type TileKey = keyof typeof tileLayers;

function MapReadyHandler({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
  }, [map, onReady]);
  return null;
}

const MapComponent: React.FC<MapComponentProps> = ({ stations }) => {
  const [currentStyle, setCurrentStyle] = useState<TileKey>("light");
  const [showGrid, setShowGrid] = useState(true);
  const mapRef = useRef<L.Map | null>(null);

  const filteredStations = useMemo(() => stations, [stations]);
  const activeLayer = tileLayers[currentStyle];

  const defaultCenter: [number, number] =
    filteredStations[0]?.coordinates ?? [50.0782, 8.2398];

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.invalidateSize();
  }, [filteredStations.length, currentStyle, showGrid]);

  useEffect(() => {
    if (!mapRef.current || filteredStations.length === 0) return;

    const bounds = latLngBounds(filteredStations.map((s) => s.coordinates));
    mapRef.current.fitBounds(bounds, {
      padding: [40, 40],
      maxZoom: 16,
    });
  }, [filteredStations]);

  return (
    <div className="w-full flex justify-center">
      <div className="w-full max-w-6xl px-4 space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={currentStyle}
            onChange={(e) => setCurrentStyle(e.target.value as TileKey)}
            className="border px-2 py-1 text-sm"
          >
            {Object.entries(tileLayers).map(([key, layer]) => (
              <option key={key} value={key}>
                {layer.name}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={() => setShowGrid((v) => !v)}
            />
            Grid anzeigen
          </label>
        </div>

        {/* Map */}
        <MapContainer
          center={defaultCenter}
          zoom={13}
          scrollWheelZoom
          style={{ height: "600px", width: "100%" }}
          className="rounded-lg overflow-hidden"
        >
          <MapReadyHandler
            onReady={(map) => {
              mapRef.current = map;
              map.invalidateSize();
            }}
          />

          <TileLayer
            url={activeLayer.url}
            attribution={activeLayer.attribution}
          />

          {showGrid && <GridLayer />}

          {filteredStations.map((station) => (
            <Marker key={station.id} position={station.coordinates}>
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">{station.name}</div>
                  <div className="text-gray-600">
                    Station Nr: {station.stationNumber}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          <ScaleControl position="bottomleft" />
        </MapContainer>

        {filteredStations.length === 0 && (
          <div className="text-center text-sm text-gray-600">
            Keine Stationsdaten gefunden.
          </div>
        )}
      </div>
    </div>
  );
};

export default MapComponent;
