// src/api/planning.ts

export type PlanningContextResponse = {
  lat: number;
  lng: number;
  radius_m: number;
  bus_stops: number;
  railway_stations: number;
  schools: number;
  universities: number;
  shops: number;
  poi_elements?: {
    id: number;
    lat: number;
    lng: number;
    category: "shop" | "school" | "university";
    name?: string;
  }[];
};

export type NearbyStation = {
  id: number;
  name: string;
  station_number: number | null;
  lat: number;
  lng: number;
};

export type NearbyStationsResponse = {
  lat: number;
  lng: number;
  radius_m: number;
  stations_in_radius: number;
  nearest_station: NearbyStation | null;
  nearest_station_distance_m: number | null;

 
  debug_city_name?: string;
  debug_stations_total?: number;
  debug_sample_station?: { id: number; name: string; lat: number; lng: number };
};


function buildUrl(path: string, params: Record<string, string | number>) {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  return url.toString();
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}



export async function getPlanningContext(args: {
  lat: number;
  lng: number;
  radius: number;
}): Promise<PlanningContextResponse> {
  const url = buildUrl("/api/v1/planning/context", {
    lat: args.lat,
    lng: args.lng,
    radius: args.radius,
  });
  return fetchJson<PlanningContextResponse>(url);
}

export async function getNearbyStations(args: {
  lat: number;
  lng: number;
  radius: number;
  city_name?: string;
}): Promise<NearbyStationsResponse> {
  const url = buildUrl("/api/v1/planning/nearby-stations", {
    lat: args.lat,
    lng: args.lng,
    radius: args.radius,
    city_name: args.city_name ?? "Mainz",
  });
  return fetchJson<NearbyStationsResponse>(url);
}


export { getErrorMessage };
