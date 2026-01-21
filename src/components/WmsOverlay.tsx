import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

type Props = {
  url: string;
  layers: string;
  format?: string;
  transparent?: boolean;
  opacity?: number;
  zIndex?: number;
  attribution?: string;
  styles?: string;
  version?: string;
};

export default function WmsOverlay({
  url,
  layers,
  format = "image/png",
  transparent = true,
  opacity = 0.7,
  zIndex = 500,
  attribution,
  styles = "",
  version = "1.3.0",
}: Props) {
  const map = useMap();

  useEffect(() => {
    if (!url || !layers) return;

    const wms = L.tileLayer.wms(url, {
      layers,
      format,
      transparent,
      opacity,
      zIndex,
      attribution,
      styles,
      version: "1.1.1",
      crs: L.CRS.EPSG3857,
      uppercase: true,
    });

    wms.addTo(map);

    return () => {
      map.removeLayer(wms);
    };
  }, [map, url, layers, format, transparent, opacity, zIndex, attribution, styles, version]);

  return null;
}
