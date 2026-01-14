// src/services/loadStationsFromCsv.ts
export type StationForHeat = {
  id: number;
  name: string;
  coordinates: [number, number]; // [lat, lng]
};

// versucht Koordinaten zu normalisieren (falls int-Scaling drin ist)
function normalizeCoord(n: number, isLat: boolean): number {
  const max = isLat ? 90 : 180;
  const abs = Math.abs(n);
  if (abs <= max) return n;

  // probiere typische Skalierungen
  const candidates = [1e6, 1e7, 1e8].map((s) => n / s);
  const ok = candidates.find((v) => Math.abs(v) <= max);
  return ok ?? n; // fallback
}

function stripQuotes(s: string) {
  return s.replace(/^"+|"+$/g, "").trim();
}

function extractName(label: string) {
  // label sieht bei dir aus wie: "Name: Dyckerhoffstraße; Station Number: 42500"
  const m = label.match(/Name:\s*([^;"]+)/i);
  return m?.[1]?.trim() ?? label;
}

export async function loadStationsFromCsv(url = "/meinRad_Stationen.csv"): Promise<StationForHeat[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CSV konnte nicht geladen werden: ${res.status} ${res.statusText}`);

  const text = await res.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  // header: id;label;latitude;longitude
  const out: StationForHeat[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(";");
    if (parts.length < 4) continue;

    const id = Number(stripQuotes(parts[0]));
    const label = stripQuotes(parts[1]);
    const latRaw = Number(stripQuotes(parts[2]));
    const lngRaw = Number(stripQuotes(parts[3]));

    if (!Number.isFinite(id) || !Number.isFinite(latRaw) || !Number.isFinite(lngRaw)) continue;

    const lat = normalizeCoord(latRaw, true);
    const lng = normalizeCoord(lngRaw, false);

    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;

    out.push({
      id,
      name: extractName(label),
      coordinates: [lat, lng],
    });
  }

  return out;
}
