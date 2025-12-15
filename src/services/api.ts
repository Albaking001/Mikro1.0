// src/services/api.ts

export type ApiStation = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  capacity: number;
};

export type ContextHex = {
  hexId: string;
  centroid: { lat: number; lng: number };
  population: number;
  density: number;
  transitStops: number;
  poiCount: number;
  poiCategories: Record<string, number>;
};

export type ContextLayers = {
  population: ContextHex[];
  density: ContextHex[];
  transit: ContextHex[];
  pois: ContextHex[];
};

export type ContextSummary = {
  center: { lat: number; lng: number };
  radiusMeters: number;
  population: number;
  averageDensity: number;
  transitStops: number;
  poiCount: number;
  poiCategories: Record<string, number>;
  contributingHex: string[];
  sparklines: {
    population: number[];
    transit: number[];
    pois: number[];
  };
};


const BASE_URL = "/api/v1";

export async function fetchApiStations(): Promise<ApiStation[]> {
  const res = await fetch(`${BASE_URL}/stations`);

  if (!res.ok) {
    const text = await res.text();
    console.error(" Fehler /stations:", res.status, text);
    throw new Error(`Fehler /stations: ${res.status}`);
  }

  const data = (await res.json()) as ApiStation[];
  console.log(" /stations response:", data);
  return data;
}

export async function fetchContextLayers(): Promise<ContextLayers> {
  const res = await fetch(`${BASE_URL}/context/layers`);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fehler /context/layers: ${res.status} ${text}`);
  }

  return (await res.json()) as ContextLayers;
}

export async function fetchContextSummary(
  lat: number,
  lng: number,
  radius = 600,
): Promise<ContextSummary> {
  const url = new URL(`${BASE_URL}/context/summary`, window.location.origin);
  url.searchParams.set("lat", lat.toString());
  url.searchParams.set("lng", lng.toString());
  url.searchParams.set("radius", radius.toString());

  const res = await fetch(url.toString());

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fehler /context/summary: ${res.status} ${text}`);
  }

  return (await res.json()) as ContextSummary;
}
