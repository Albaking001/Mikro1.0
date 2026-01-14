// src/components/HeatGridLayer.tsx

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

type CellInfo = {
  bounds: L.LatLngBounds;
  center: L.LatLng;
  ix: number;
  iy: number;
  zoom: number;
};

type HeatPoint = { ix: number; iy: number; value: number };

type HeatMeta = {
  origin_center: { lat: number; lng: number };
  step_lat: number;
  step_lng: number;
  nx: number;
  ny: number;
};

type Props = {
  enabled?: boolean;

  fillOpacity?: number;
  showGridLines?: boolean;
  lineColor?: string;
  lineWeight?: number;
  lineOpacity?: number;

  points?: HeatPoint[];
  meta?: HeatMeta;

  aggregate?: "avg" | "max";
  getValue?: (cell: CellInfo) => number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function quantize20(v: number) {
  const c = clamp(v, 0, 100);
  return Math.round(c / 20) * 20;
}

function valueToColor20(v: number) {
  const q = quantize20(v);
  const t = q / 100;
  const r = Math.round(255 * (1 - t));
  const g = Math.round(255 * t);
  return `rgb(${r}, ${g}, 0)`;
}

export default function HeatGridLayer({
  enabled = true,
  fillOpacity = 0.45,
  showGridLines = true,
  lineColor = "#000000",
  lineWeight = 1,
  lineOpacity = 0.15,
  points,
  meta,
  aggregate = "avg",
  getValue,
}: Props) {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);
  const rendererRef = useRef<L.Canvas | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (groupRef.current) {
        groupRef.current.remove();
        groupRef.current = null;
      }
      rendererRef.current = null;
      return;
    }

    const paneName = "heatGridPane";
    if (!map.getPane(paneName)) {
      const pane = map.createPane(paneName);
      pane.style.zIndex = "450";
      pane.style.pointerEvents = "none";
    }

    if (!rendererRef.current) {
      rendererRef.current = L.canvas({ pane: paneName });
    }

    if (!groupRef.current) {
      groupRef.current = L.layerGroup().addTo(map);
    }

    const draw = () => {
      const group = groupRef.current!;
      group.clearLayers();

      if (!meta) return;

      const { origin_center, step_lat, step_lng } = meta;

      const bounds = map.getBounds();
      const zoom = map.getZoom();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();

      const bins = new Map<string, { sum: number; count: number; max: number }>();

      if (points && points.length > 0) {
        for (const p of points) {
          const key = `${p.ix}:${p.iy}`;
          const cur = bins.get(key) ?? { sum: 0, count: 0, max: -Infinity };
          cur.sum += p.value;
          cur.count += 1;
          cur.max = Math.max(cur.max, p.value);
          bins.set(key, cur);
        }
      }

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

          const center = cellBounds.getCenter();
          const cell: CellInfo = { bounds: cellBounds, center, ix, iy, zoom };

          const b = bins.get(`${ix}:${iy}`);
          const hasData = !!b && b.count > 0;

          let v: number;
          if (getValue) v = getValue(cell);
          else if (!hasData) v = 0;
          else v = aggregate === "max" ? b!.max : b!.sum / b!.count;

          L.rectangle(cellBounds, {
            pane: paneName,
            renderer: rendererRef.current!,
            fill: true,
            fillColor: valueToColor20(v),
            fillOpacity: hasData ? fillOpacity : 0,
            stroke: showGridLines,
            color: lineColor,
            weight: lineWeight,
            opacity: lineOpacity,
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
      if (groupRef.current) {
        groupRef.current.remove();
        groupRef.current = null;
      }
      rendererRef.current = null;
    };
  }, [
    map,
    enabled,
    fillOpacity,
    showGridLines,
    lineColor,
    lineWeight,
    lineOpacity,
    points,
    meta,
    aggregate,
    getValue,
  ]);

  return null;
}
