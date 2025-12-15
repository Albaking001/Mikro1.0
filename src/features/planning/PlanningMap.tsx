import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import {
  createPlanningActions,
  initializeStations,
  type PlanningStation,
  type CapacityClass,
} from "../../store/planningSlice";

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const capacityClassLabels: Record<CapacityClass, string> = {
  micro: "Mikro (8 Plätze)",
  small: "Klein (12 Plätze)",
  standard: "Standard (18 Plätze)",
  large: "Groß (24 Plätze)",
};

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
  const [overrideInputs, setOverrideInputs] = useState<Record<string, string>>({});
  const pendingLookup = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const createStation = (lat: number, lng: number) => {
    const fallbackLabel = `Geplanter Standort (${formatCoordinate(lat)}, ${formatCoordinate(lng)})`;
    const stationId = actions.addStation({ lat, lng, label: fallbackLabel });
    setOverrideInputs((current) => ({
      ...current,
      [stationId]: "",
    }));
    handleReverseGeocode(stationId, lat, lng);
  };

  useEffect(() => {
    setOverrideInputs((current) => {
      const next = { ...current };
      stations.forEach((station) => {
        if (!(station.id in next)) {
          next[station.id] = (station.manualSlots ?? station.analysis.suggestedSlots).toString();
        }
      });
      return next;
    });
  }, [stations]);

  const applyManualSlots = (stationId: string) => {
    const rawValue = overrideInputs[stationId];
    const parsed = Number(rawValue);

    if (!rawValue) {
      actions.updateManualSlots(stationId, null);
      return;
    }

    if (!Number.isFinite(parsed) || parsed <= 0) {
      alert("Bitte eine gültige Anzahl an Stellplätzen eingeben.");
      return;
    }

    actions.updateManualSlots(stationId, parsed);
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
          <div>
            Empfehlung: {station.manualSlots ?? station.analysis.suggestedSlots} Plätze
          </div>
          <div style={{ marginTop: "0.25rem", lineHeight: 1.4 }}>
            <span style={{ display: "block", fontWeight: 600 }}>
              {capacityClassLabels[station.analysis.capacityClass]}
            </span>
            <span>Grundlage: {station.analysis.rationale}</span>
          </div>
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
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1rem",
          alignItems: "start",
        }}
      >
        <div
          style={{
            height: "480px",
            borderRadius: "12px",
            overflow: "hidden",
            border: "1px solid #e5e7eb",
          }}
        >
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
            {markers}
          </MapContainer>
        </div>

        <aside
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            background: "#ffffff",
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0 }}>Kapazitätsvorschläge</h3>
              <p style={{ margin: "0.25rem 0", color: "#4b5563" }}>
                Score + Nachfrage ergeben eine diskrete Kapazitätsklasse. Vorschlag kann manuell überschrieben werden.
              </p>
            </div>
          </div>

          {stations.length === 0 ? (
            <p style={{ margin: 0, color: "#4b5563" }}>
              Noch keine geplanten Standorte. Klicken Sie in die Karte, um zu starten.
            </p>
          ) : (
            stations.map((station) => {
              const suggestedSlots = station.analysis.suggestedSlots;
              const plannedSlots = station.manualSlots ?? suggestedSlots;

              return (
                <div
                  key={station.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: "10px",
                    padding: "0.75rem",
                    background: "#f9fafb",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.35rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{station.label ?? "Neuer Standort"}</div>
                      <div style={{ color: "#4b5563", fontSize: "12px" }}>
                        {formatCoordinate(station.lat)}, {formatCoordinate(station.lng)}
                      </div>
                    </div>
                    <span
                      style={{
                        background: "#e5e7eb",
                        borderRadius: "8px",
                        padding: "0.25rem 0.5rem",
                        fontSize: "12px",
                      }}
                    >
                      {capacityClassLabels[station.analysis.capacityClass]}
                    </span>
                  </div>

                  <div style={{ color: "#1f2937", fontSize: "14px" }}>
                    Vorschlag: <strong>{suggestedSlots}</strong> Stellplätze
                    {station.manualSlots ? " (manuell überschrieben)" : ""}
                  </div>

                  <div style={{ fontSize: "12px", color: "#374151", lineHeight: 1.4 }}>
                    <div>Score gesamt: {station.analysis.combinedScore} / 100</div>
                    <div>
                      Nachfrage-Proxy: Bevölkerungsdichte {station.analysis.populationDensity}, Netzlast {station.analysis.utilisationDelta >= 0 ? "über" : "unter"}-ausgelastet ({station.analysis.utilisationDelta >= 0 ? "+" : ""}
                      {station.analysis.utilisationDelta})
                    </div>
                    <div>Begründung: {station.analysis.rationale}</div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.5rem", alignItems: "center" }}>
                    <input
                      type="number"
                      min={1}
                      value={overrideInputs[station.id] ?? ""}
                      onChange={(event) =>
                        setOverrideInputs((current) => ({
                          ...current,
                          [station.id]: event.target.value,
                        }))
                      }
                      placeholder={suggestedSlots.toString()}
                      style={{
                        border: "1px solid #d1d5db",
                        borderRadius: "8px",
                        padding: "0.5rem",
                        fontSize: "14px",
                      }}
                    />
                    <div style={{ display: "flex", gap: "0.35rem" }}>
                      <button
                        type="button"
                        onClick={() => applyManualSlots(station.id)}
                        style={{
                          border: "1px solid #d1d5db",
                          background: "white",
                          padding: "0.45rem 0.65rem",
                          borderRadius: "8px",
                          cursor: "pointer",
                        }}
                      >
                        Speichern
                      </button>
                      {station.manualSlots && (
                        <button
                          type="button"
                          onClick={() => {
                            setOverrideInputs((current) => ({
                              ...current,
                              [station.id]: suggestedSlots.toString(),
                            }));
                            actions.updateManualSlots(station.id, null);
                          }}
                          style={{
                            border: "1px solid #d1d5db",
                            background: "#f3f4f6",
                            padding: "0.45rem 0.65rem",
                            borderRadius: "8px",
                            cursor: "pointer",
                          }}
                        >
                          Vorschlag nutzen
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: "12px", color: "#4b5563" }}>
                    Aktueller Plan: <strong>{plannedSlots} Plätze</strong>
                  </div>
                </div>
              );
            })
          )}
        </aside>
      </div>
    </section>
  );
};

export default PlanningMap;
