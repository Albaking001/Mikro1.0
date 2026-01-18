import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

type HeatPoint = { ix: number; iy: number; value: number };

type HeatMeta = {
  origin_center: { lat: number; lng: number };
  step_lat: number;
  step_lng: number;
};

type Props = {
  enabled?: boolean;
  points?: HeatPoint[];
  meta?: HeatMeta;

  fillOpacity?: number;
  showGridLines?: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function valueToColor(v: number) {
  const t = clamp(v, 0, 100) / 100;
  const r = Math.round(255 * (1 - t));
  const g = Math.round(255 * t);
  return `rgb(${r}, ${g}, 0)`;
}

export default function HeatGridLayer({
  enabled = true,
  points = [],
  meta,
  fillOpacity = 0.45,
  showGridLines = true,
}: Props) {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);
  const rendererRef = useRef<L.Canvas | null>(null);

  useEffect(() => {
    if (!enabled) {
      groupRef.current?.remove();
      groupRef.current = null;
      rendererRef.current = null;
      return;
    }

    const paneName = "heatGridPane";
    if (!map.getPane(paneName)) {
      const pane = map.createPane(paneName);
      pane.style.zIndex = "450";
      pane.style.pointerEvents = "none";
    }

    if (!rendererRef.current) rendererRef.current = L.canvas({ pane: paneName });
    if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);

    const draw = () => {
      const group = groupRef.current!;
      group.clearLayers();

      if (!meta?.origin_center || !meta.step_lat || !meta.step_lng) return;

      const { origin_center, step_lat, step_lng } = meta;

      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();

      const mapVals = new Map<string, number>();
      for (const p of points) mapVals.set(`${p.ix}:${p.iy}`, p.value);

      const ixMin = Math.floor((sw.lng - origin_center.lng) / step_lng) - 1;
      const ixMax = Math.floor((ne.lng - origin_center.lng) / step_lng) + 1;
      const iyMin = Math.floor((sw.lat - origin_center.lat) / step_lat) - 1;
      const iyMax = Math.floor((ne.lat - origin_center.lat) / step_lat) + 1;

      for (let ix = ixMin; ix <= ixMax; ix++) {
        for (let iy = iyMin; iy <= iyMax; iy++) {
          const centerLat = origin_center.lat + iy * step_lat;
          const centerLng = origin_center.lng + ix * step_lng;

          const cellBounds = L.latLngBounds(
            L.latLng(centerLat - step_lat / 2, centerLng - step_lng / 2),
            L.latLng(centerLat + step_lat / 2, centerLng + step_lng / 2)
          );

          const v = mapVals.get(`${ix}:${iy}`) ?? 0;

          L.rectangle(cellBounds, {
            pane: paneName,
            renderer: rendererRef.current!,
            fill: true,
            fillColor: valueToColor(v),
            fillOpacity: fillOpacity,
            stroke: showGridLines,
            weight: 1,
            opacity: 0.15,
          }).addTo(group);
        }
      }
    };

    map.whenReady(() => {
      draw();
      map.on("moveend", draw);
      map.on("zoomend", draw);
    });

    return () => {
      map.off("moveend", draw);
      map.off("zoomend", draw);
      groupRef.current?.remove();
      groupRef.current = null;
      rendererRef.current = null;
    };
  }, [map, enabled, points, meta, fillOpacity, showGridLines]);

  return null;
}
