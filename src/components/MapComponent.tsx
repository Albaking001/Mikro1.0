import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L, { type LatLngExpression } from "leaflet";
import { useState } from "react";

const position: LatLngExpression = [49.992863, 8.247263]; // Mainz

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

export default function MapComponent() {
  const [currentStyle, setCurrentStyle] = useState<TileKey>("light");

  const activeLayer = tileLayers[currentStyle];

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center gap-3">
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

      <div className="h-[600px] w-full">
        <MapContainer
          center={position}
          zoom={13}
          scrollWheelZoom={true}
          className="leaflet-container rounded-lg overflow-hidden"
        >
          <TileLayer
            url={activeLayer.url}
            attribution={activeLayer.attribution}
          />
          <Marker position={position}>
            <Popup>Mainz Innenstadt</Popup>
          </Marker>
        </MapContainer>
      </div>
    </div>
  );
}



/* Falls wird lieber Buttons für Mapwechsel wollen

<div className="mb-4 flex flex-wrap gap-2">
  {Object.entries(tileLayers).map(([key, layer]) => (
    <button
      key={key}
      onClick={() => setCurrentStyle(key as TileKey)}
      className={`px-3 py-1 text-sm rounded-md border ${
        currentStyle === key
          ? "bg-blue-600 text-white border-blue-700"
          : "bg-white text-gray-800 border-gray-300"
      }`}
    >
      {layer.name}
    </button>
  ))}
</div>

*/
