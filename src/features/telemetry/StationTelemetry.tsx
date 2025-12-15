import React, { useEffect, useMemo, useState } from "react";

import MiniSparkline from "../../components/MiniSparkline";
import {
  fetchNearbyMetrics,
  fetchStationMetrics,
  type ApiStation,
  type NearbyDailyMetrics,
  type NearbyMetrics,
  type StationMetrics,
} from "../../services/api";

const DEFAULT_RADIUS = 0.6;
const HIGH_UTILIZATION_THRESHOLD = 85;
const EVENT_THRESHOLD = 5;

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("de-DE", {
    month: "short",
    day: "numeric",
  });

const InfoChip: React.FC<{ label: string; value: string | number; tone?: "default" | "warn" }> = ({
  label,
  value,
  tone = "default",
}) => (
  <div
    className={`flex flex-col rounded-lg border px-3 py-2 text-sm ${
      tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-gray-200 bg-white"
    }`}
  >
    <span className="text-xs text-gray-500">{label}</span>
    <span className="font-semibold">{value}</span>
  </div>
);

type StationTelemetryProps = {
  stations: ApiStation[];
};

const StationTelemetry: React.FC<StationTelemetryProps> = ({ stations }) => {
  const [selectedStationId, setSelectedStationId] = useState<number | null>(stations[0]?.id ?? null);
  const [metrics, setMetrics] = useState<StationMetrics | null>(null);
  const [nearby, setNearby] = useState<NearbyMetrics | null>(null);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedStation = useMemo(
    () => stations.find((station) => station.id === selectedStationId),
    [stations, selectedStationId],
  );

  useEffect(() => {
    const station = selectedStation;

    if (selectedStationId === null || !station) return;

    const stationId = selectedStationId;
    const { lat, lng } = station;

    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [stationMetrics, nearbyMetrics] = await Promise.all([
          fetchStationMetrics(stationId, { lookbackDays: 7 }),
          fetchNearbyMetrics(lat, lng, radiusKm, 7),
        ]);

        if (cancelled) return;
        setMetrics(stationMetrics);
        setNearby(nearbyMetrics);
      } catch (err) {
        console.error("Failed to load telemetry", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unbekannter Fehler");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [radiusKm, selectedStation, selectedStationId]);

  const utilizationSeries = metrics?.utilization_history
    .map((point) => point.utilization ?? 0)
    .filter((value) => Number.isFinite(value));

  const hotspotDays: NearbyDailyMetrics[] = useMemo(
    () =>
      (nearby?.daily_metrics ?? []).filter(
        (entry) =>
          entry.average_occupancy > HIGH_UTILIZATION_THRESHOLD ||
          entry.empty_events > EVENT_THRESHOLD ||
          entry.full_events > EVENT_THRESHOLD,
      ),
    [nearby],
  );

  if (!selectedStation) {
    return null;
  }

  const averageUtilization = utilizationSeries && utilizationSeries.length
    ? Math.round(utilizationSeries.reduce((a, b) => a + b, 0) / utilizationSeries.length)
    : 0;

  return (
    <section className="mt-10 space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Stations-Telemetrie</h2>
          <p className="text-sm text-gray-600">
            Historische Auslastung, Umschlagshäufigkeit und Hotspots in der Umgebung der gewählten Station.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-sm text-gray-700" htmlFor="station-select">
            Station:
          </label>
          <select
            id="station-select"
            value={selectedStationId ?? undefined}
            onChange={(event) => setSelectedStationId(Number(event.target.value))}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm"
          >
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
          <label className="text-sm text-gray-700" htmlFor="radius-range">
            Radius: {radiusKm.toFixed(2)} km
          </label>
          <input
            id="radius-range"
            type="range"
            min={0.2}
            max={2}
            step={0.1}
            value={radiusKm}
            onChange={(event) => setRadiusKm(Number(event.target.value))}
          />
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="col-span-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Auslastungsverlauf</p>
              <p className="font-semibold text-gray-900">{selectedStation.name}</p>
            </div>
            <InfoChip label="Samples" value={metrics?.utilization_history.length ?? 0} />
          </div>
          <div className="mt-4">
            {utilizationSeries && utilizationSeries.length > 0 ? (
              <MiniSparkline data={utilizationSeries} threshold={HIGH_UTILIZATION_THRESHOLD} />
            ) : (
              <div className="text-sm text-gray-500">Keine Verlaufspunkte vorhanden.</div>
            )}
          </div>
          {metrics && (
            <div className="mt-4 flex flex-wrap gap-3">
              <InfoChip label="Ø Auslastung" value={`${averageUtilization}%`} />
              <InfoChip label="Umschlag/Tag" value={metrics.turnover.average_daily_changes} />
              <InfoChip label="Tage analysiert" value={metrics.turnover.days_count} />
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Umschlag</p>
              <p className="font-semibold text-gray-900">Station {selectedStation.name}</p>
            </div>
          </div>
          <InfoChip
            label="Gesamtbewegungen"
            value={metrics?.turnover.total_changes ?? 0}
            tone={metrics && metrics.turnover.average_daily_changes > 25 ? "warn" : "default"}
          />
          <p className="text-xs text-gray-600">
            Ein Umschlag wird als Veränderung der verfügbaren Räder zwischen zwei Snapshots berechnet.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="col-span-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Umfeld-Rollup</p>
              <p className="font-semibold text-gray-900">
                {nearby?.station_count ?? 0} Stationen im {radiusKm.toFixed(1)} km Radius
              </p>
            </div>
            <InfoChip label="Ø Auslastung" value={`${nearby?.overall.average_occupancy ?? 0}%`} />
          </div>

          <div className="mt-4 space-y-2">
            {(nearby?.daily_metrics ?? []).map((entry) => (
              <div
                key={entry.date}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                  entry.average_occupancy > HIGH_UTILIZATION_THRESHOLD ||
                  entry.empty_events > EVENT_THRESHOLD ||
                  entry.full_events > EVENT_THRESHOLD
                    ? "border-amber-300 bg-amber-50"
                    : "border-gray-200"
                }`}
              >
                <div>
                  <p className="font-semibold text-gray-900">{formatDate(entry.date)}</p>
                  <p className="text-xs text-gray-600">Avg. {entry.average_occupancy}% · Peak {entry.peak_load} Bikes</p>
                </div>
                <div className="flex gap-2 items-center">
                  <InfoChip label="Leer" value={entry.empty_events} tone={entry.empty_events > EVENT_THRESHOLD ? "warn" : "default"} />
                  <InfoChip label="Voll" value={entry.full_events} tone={entry.full_events > EVENT_THRESHOLD ? "warn" : "default"} />
                </div>
              </div>
            ))}
            {(nearby?.daily_metrics.length ?? 0) === 0 && (
              <p className="text-sm text-gray-500">Keine Daten für den angegebenen Radius.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-900">Auffällige Tage</p>
          {hotspotDays.length === 0 && (
            <p className="text-sm text-gray-600">Keine Schwellenüberschreitungen erkannt.</p>
          )}
          <ul className="mt-2 space-y-2">
            {hotspotDays.map((entry) => (
              <li key={entry.date} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="flex justify-between">
                  <span className="font-semibold">{formatDate(entry.date)}</span>
                  <span>{entry.average_occupancy}% Ø</span>
                </div>
                <p className="text-xs mt-1">Leer: {entry.empty_events} · Voll: {entry.full_events}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-600">Lade Telemetrie...</p>}
    </section>
  );
};

export default StationTelemetry;
