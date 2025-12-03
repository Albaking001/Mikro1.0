// src/services/api.ts

export type ApiStation = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  capacity: number;
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
