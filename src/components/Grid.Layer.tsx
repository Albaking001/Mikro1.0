import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

type Props = {
  cellSize?: number;
  color?: string;
  weight?: number;
  opacity?: number;
  enabled?: boolean;
};

export default function GridLayer({
  cellSize = 100,
  color = "#000000",
  weight = 1,
  opacity = 0.25,
  enabled = true,
}: Props) {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (groupRef.current) {
        groupRef.current.remove();
        groupRef.current = null;
      }
      return;
    }

    if (!groupRef.current) {
      groupRef.current = L.layerGroup().addTo(map);
    }

    const drawGrid = () => {
      const group = groupRef.current!;
      group.clearLayers();

      const bounds = map.getBounds();
      const zoom = map.getZoom();

      const sw = map.project(bounds.getSouthWest(), zoom);
      const ne = map.project(bounds.getNorthEast(), zoom);


      const lat = map.getCenter().lat;
      const metersPerPixel =
        (156543.03392804097 * Math.cos((lat * Math.PI) / 180)) /
        Math.pow(2, zoom);


      const step = cellSize / metersPerPixel;


      const xStart = Math.floor(sw.x / step) * step;
      const yStart = Math.floor(ne.y / step) * step;


      for (let x = xStart; x <= ne.x; x += step) {
        const a = map.unproject(L.point(x, sw.y), zoom);
        const b = map.unproject(L.point(x, ne.y), zoom);
        L.polyline([a, b], { color, weight, opacity }).addTo(group);
      }


      for (let y = yStart; y <= sw.y; y += step) {
        const a = map.unproject(L.point(sw.x, y), zoom);
        const b = map.unproject(L.point(ne.x, y), zoom);
        L.polyline([a, b], { color, weight, opacity }).addTo(group);
      }
    };

    drawGrid();
    map.on("moveend", drawGrid);
    map.on("zoomend", drawGrid);

    return () => {
      map.off("moveend", drawGrid);
      map.off("zoomend", drawGrid);

      if (groupRef.current) {
        groupRef.current.remove();
        groupRef.current = null;
      }
    };
  }, [map, cellSize, color, weight, opacity, enabled]);

  return null;
}
