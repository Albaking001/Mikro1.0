import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

export default function GridLayer() {
  const map = useMap();

  useEffect(() => {
    let lines: L.Polyline[] = [];

    const drawGrid = () => {
      // alte Linien löschen
      lines.forEach((line) => map.removeLayer(line));
      lines = [];

      const bounds = map.getBounds();
      const south = bounds.getSouth();
      const north = bounds.getNorth();
      const west = bounds.getWest();
      const east = bounds.getEast();

      const zoom = map.getZoom();

      let step: number;
      if (zoom <= 10) {
        step = 0.05;
      } else if (zoom <= 12) {
        step = 0.02;
      } else if (zoom <= 14) {
        step = 0.01;
      } else if (zoom <= 16) {
        step = 0.005;
      } else {
        step = 0.0025;
      }

      const startLat = Math.floor(south / step) * step;
      const startLng = Math.floor(west / step) * step;

      for (let lat = startLat; lat <= north; lat += step) {
        const line = L.polyline(
          [
            [lat, west],
            [lat, east],
          ],
          { color: "#000000", weight: 1, opacity: 0.25 }
        ).addTo(map);
        lines.push(line);
      }

      for (let lng = startLng; lng <= east; lng += step) {
        const line = L.polyline(
          [
            [south, lng],
            [north, lng],
          ],
          { color: "#000000", weight: 1, opacity: 0.25 }
        ).addTo(map);
        lines.push(line);
      }
    };

    drawGrid();

    map.on("moveend", drawGrid);
    map.on("zoomend", drawGrid);

    return () => {
      map.off("moveend", drawGrid);
      map.off("zoomend", drawGrid);
      lines.forEach((line) => map.removeLayer(line));
    };
  }, [map]);

  return null;
}
