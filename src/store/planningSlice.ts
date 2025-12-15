export type PlanningStation = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  createdAt: number;
};

const STORAGE_KEY = "planningStations";
const QUERY_PARAM = "planning";

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
          .map((entry) => ({
            ...entry,
            createdAt: typeof entry.createdAt === "number" ? entry.createdAt : Date.now(),
          }));
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
  addStation: (station: Omit<PlanningStation, "id" | "createdAt">) => string;
  updateLabel: (id: string, label: string) => void;
  clearStations: () => void;
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
});
