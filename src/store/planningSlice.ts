export type PlanningStation = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  createdAt: number;
  analysis: StationAnalysis;
  manualSlots?: number;
};

export type CapacityClass = "micro" | "small" | "standard" | "large";

export type StationAnalysis = {
  suitabilityScore: number;
  demandScore: number;
  populationDensity: number;
  utilisationDelta: number;
  combinedScore: number;
  capacityClass: CapacityClass;
  suggestedSlots: number;
  rationale: string;
};

const STORAGE_KEY = "planningStations";
const QUERY_PARAM = "planning";

const capacityClasses: Record<CapacityClass, { label: string; threshold: number; slots: number }>
  = {
    micro: { label: "Mikro", threshold: 40, slots: 8 },
    small: { label: "Klein", threshold: 65, slots: 12 },
    standard: { label: "Standard", threshold: 80, slots: 18 },
    large: { label: "Groß", threshold: 101, slots: 24 },
  };

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const toFixedScore = (value: number) => Math.round(clamp(value, 0, 100));

const calculateAnalysis = (lat: number, lng: number): StationAnalysis => {
  const suitabilityScore = toFixedScore(
    Math.abs(Math.sin(lat * 0.45)) * 55 + Math.abs(Math.cos(lng * 0.35)) * 45,
  );

  const populationDensity = toFixedScore(
    Math.abs(Math.sin(lat * 0.3) + Math.cos(lng * 0.25)) * 55 + 25,
  );

  const utilisationDelta = clamp(
    Math.round((Math.sin(lat * 0.5) - Math.cos(lng * 0.35)) * 30),
    -40,
    40,
  );

  const utilisationScore = toFixedScore(50 + utilisationDelta * 1.2);

  const demandScore = toFixedScore(populationDensity * 0.6 + utilisationScore * 0.4);

  const combinedScore = toFixedScore(suitabilityScore * 0.5 + demandScore * 0.5);

  const capacityClass = (Object.keys(capacityClasses) as CapacityClass[]).find(
    (key) => combinedScore < capacityClasses[key].threshold,
  ) as CapacityClass;

  const { slots, label } = capacityClasses[capacityClass];

  const rationale =
    `Score ${combinedScore}/100 (Standort ${suitabilityScore} + Nachfrage ${demandScore}). ` +
    `Bevölkerungsdichte: ${populationDensity} Punkte, Netzbelastung: ${utilisationDelta >= 0 ? "Überlastung" : "Unterauslastung"} ` +
    `(${utilisationDelta >= 0 ? "+" : ""}${utilisationDelta}). ` +
    `→ Klasse "${label}" mit ${slots} Stellplätzen empfohlen.`;

  return {
    suitabilityScore,
    populationDensity,
    utilisationDelta,
    demandScore,
    combinedScore,
    capacityClass,
    suggestedSlots: slots,
    rationale,
  };
};

const withAnalysis = (station: PlanningStation): PlanningStation => ({
  ...station,
  analysis: station.analysis ?? calculateAnalysis(station.lat, station.lng),
});

const parseStations = (value: string | null): PlanningStation[] | null => {
  if (!value) return null;

  const candidates = [value];

  // Backward compatibility: older versions stored an encoded payload.
  try {
    candidates.push(decodeURIComponent(value));
  } catch (error) {
    console.warn("Skipping URI decoding for planning stations", error);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as PlanningStation[];

      if (Array.isArray(parsed)) {
        return parsed
          .filter(
            (entry) =>
              typeof entry.lat === "number" &&
              typeof entry.lng === "number" &&
              typeof entry.id === "string",
          )
          .map((entry) =>
            withAnalysis({
              ...entry,
              createdAt: typeof entry.createdAt === "number" ? entry.createdAt : Date.now(),
            } as PlanningStation),
          );
      }
    } catch (error) {
      console.error("Failed to parse planning stations", error);
    }
  }

  return null;
};

const loadFromQuery = () => {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  return parseStations(params.get(QUERY_PARAM));
};

const loadFromStorage = () => {
  if (typeof window === "undefined" || !("localStorage" in window)) return null;

  try {
    return parseStations(window.localStorage.getItem(STORAGE_KEY));
  } catch (error) {
    console.error("Failed to load planning stations from storage", error);
    return null;
  }
};

const updateUrl = (stations: PlanningStation[]) => {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);

  if (stations.length === 0) {
    params.delete(QUERY_PARAM);
  } else {
    params.set(QUERY_PARAM, JSON.stringify(stations));
  }

  const newSearch = params.toString();
  const nextUrl = `${window.location.pathname}${
    newSearch ? `?${newSearch}` : ""
  }${window.location.hash}`;

  window.history.replaceState(null, "", nextUrl);
};

const persistStations = (stations: PlanningStation[]) => {
  if (typeof window !== "undefined" && "localStorage" in window) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stations));
  }

  updateUrl(stations);
};

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const initializeStations = (): PlanningStation[] => {
  const fromQuery = loadFromQuery();
  if (fromQuery) return fromQuery;

  const fromStorage = loadFromStorage();
  if (fromStorage) return fromStorage;

  return [];
};

export type PlanningActions = {
  addStation: (
    station: Omit<PlanningStation, "id" | "createdAt" | "analysis" | "manualSlots">,
  ) => string;
  updateLabel: (id: string, label: string) => void;
  clearStations: () => void;
  updateManualSlots: (id: string, slots: number | null) => void;
};

export const createPlanningActions = (
  getStations: () => PlanningStation[],
  setStations: (stations: PlanningStation[]) => void,
): PlanningActions => ({
  addStation: (station) => {
    const nextStation: PlanningStation = {
      ...station,
      id: createId(),
      createdAt: Date.now(),
      analysis: calculateAnalysis(station.lat, station.lng),
    };

    const next = [...getStations(), nextStation];
    setStations(next);
    persistStations(next);
    return nextStation.id;
  },
  updateLabel: (id, label) => {
    const next = getStations().map((entry) =>
      entry.id === id ? { ...entry, label } : entry,
    );

    setStations(next);
    persistStations(next);
  },
  clearStations: () => {
    setStations([]);
    persistStations([]);
  },
  updateManualSlots: (id, slots) => {
    const next = getStations().map((entry) =>
      entry.id === id
        ? { ...entry, manualSlots: slots ?? undefined }
        : entry,
    );

    setStations(next);
    persistStations(next);
  },
});
