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

export type ProposalCreatePayload = {
  city_name: string;
  lat: number;
  lng: number;
  radius: number;

  score: number;
  score_label: string;

  stations_in_radius?: number | null;
  nearest_station?: string | null;
  nearest_distance_m?: number | null;

  bus_stops: number;
  railway_stations: number;
  schools: number;
  universities: number;
  shops: number;

  is_best: boolean;
};

export type ProposalOut = ProposalCreatePayload & {
  id: number;
};

function buildUrl(path: string, params: Record<string, string | number>) {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  return url.toString();
}

export function getErrorMessage(err: unknown): string {
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

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

export async function createPlanningProposal(
  payload: ProposalCreatePayload
): Promise<ProposalOut> {
  return postJson<ProposalOut>("/api/v1/planning/proposals", payload);
}
export type PrecomputedScorePoint = {
  ix: number;
  iy: number;
  lat: number;
  lng: number;
  score: number;
};

export type PrecomputedScoresResponse = {
  meta: {
    city_name: string;
    step_m: number;
    radius_m: number;

    generated_at?: string;
    points_total?: number;
    points_returned?: number;
    bbox?: { sw_lat: number; sw_lng: number; ne_lat: number; ne_lng: number };

    origin_center: { lat: number; lng: number };
    step_lat: number;
    step_lng: number;
    nx: number;
    ny: number;
  };
  points: PrecomputedScorePoint[];
};

export type PoiPoint = {
  lat: number;
  lng: number;
};

export type PlanningPoiLayersResponse = {
  bbox: { sw_lat: number; sw_lng: number; ne_lat: number; ne_lng: number };
  bus_stops: PoiPoint[];
  rail_stations: PoiPoint[];
  schools: PoiPoint[];
  universities: PoiPoint[];
  shops: PoiPoint[];
};

export async function getPrecomputedPlanningScores(args: {
  city_name?: string;
  step_m?: number;
  radius_m?: number;
  sw_lat?: number;
  sw_lng?: number;
  ne_lat?: number;
  ne_lng?: number;
}): Promise<PrecomputedScoresResponse> {
  const url = buildUrl("/api/v1/planning/precomputed-scores", {
    city_name: args.city_name ?? "Mainz",
    step_m: args.step_m ?? 250,
    radius_m: args.radius_m ?? 500,
    ...(args.sw_lat != null ? { sw_lat: args.sw_lat } : {}),
    ...(args.sw_lng != null ? { sw_lng: args.sw_lng } : {}),
    ...(args.ne_lat != null ? { ne_lat: args.ne_lat } : {}),
    ...(args.ne_lng != null ? { ne_lng: args.ne_lng } : {}),
  } as Record<string, string | number>);

  return fetchJson<PrecomputedScoresResponse>(url);
}

export async function getPlanningPoiLayers(args: {
  sw_lat: number;
  sw_lng: number;
  ne_lat: number;
  ne_lng: number;
}): Promise<PlanningPoiLayersResponse> {
  const url = buildUrl("/api/v1/planning/poi-layers", {
    sw_lat: args.sw_lat,
    sw_lng: args.sw_lng,
    ne_lat: args.ne_lat,
    ne_lng: args.ne_lng,
  });
  return fetchJson<PlanningPoiLayersResponse>(url);
}

export async function setBestProposal(proposalId: number): Promise<ProposalOut> {
  return postJson<ProposalOut>(`/api/v1/planning/proposals/${proposalId}/set-best`, {});
}
