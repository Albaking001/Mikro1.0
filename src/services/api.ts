// src/services/api.ts

export type ApiStation = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  capacity: number;
};

export type UtilizationSnapshot = {
  ts: string;
  bikes_available: number;
  docks_available: number;
  utilization: number | null;
};

export type StationMetrics = {
  station: ApiStation;
  utilization_history: UtilizationSnapshot[];
  turnover: {
    total_changes: number;
    average_daily_changes: number;
    days_count: number;
  };
};

export type NearbyDailyMetrics = {
  date: string;
  average_occupancy: number;
  peak_load: number;
  empty_events: number;
  full_events: number;
};

export type NearbyStation = ApiStation & { distance_km: number };

export type NearbyMetrics = {
  center: { lat: number; lng: number; radius_km: number };
  station_count: number;
  stations: NearbyStation[];
  daily_metrics: NearbyDailyMetrics[];
  overall: {
    average_occupancy: number;
    peak_load: number;
    empty_events: number;
    full_events: number;
  };
};

const BASE_URL = "/api/v1";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    console.error("API error", response.status, text);
    throw new Error(`API error ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchApiStations(cityUid?: number): Promise<ApiStation[]> {
  const url = new URL(`${BASE_URL}/stations`, window.location.origin);
  if (cityUid) {
    url.searchParams.set("city_uid", cityUid.toString());
  }

  const res = await fetch(url.toString().replace(window.location.origin, ""));
  const data = await handleResponse<ApiStation[]>(res);
  console.log(" /stations response:", data);
  return data;
}

export async function fetchStationMetrics(
  stationId: number,
  options?: { lookbackDays?: number },
): Promise<StationMetrics> {
  const params = new URLSearchParams();
  if (options?.lookbackDays) {
    params.set("lookback_days", options.lookbackDays.toString());
  }

  const res = await fetch(`${BASE_URL}/stations/${stationId}/metrics?${params.toString()}`);
  return handleResponse<StationMetrics>(res);
}

export async function fetchNearbyMetrics(
  lat: number,
  lng: number,
  radiusKm: number,
  lookbackDays = 7,
): Promise<NearbyMetrics> {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lng: lng.toString(),
    radius_km: radiusKm.toString(),
    lookback_days: lookbackDays.toString(),
  });

  const res = await fetch(`${BASE_URL}/stations/metrics/nearby?${params.toString()}`);
  return handleResponse<NearbyMetrics>(res);
}
