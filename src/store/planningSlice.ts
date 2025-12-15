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

  try {
    const decoded = decodeURIComponent(value);
    const parsed = JSON.parse(decoded) as PlanningStation[];

    if (Array.isArray(parsed)) {
      return parsed.filter((entry) =>
        typeof entry.lat === "number" &&
        typeof entry.lng === "number" &&
        typeof entry.id === "string",
      );
    }

    return null;
  } catch (error) {
    console.error("Failed to parse planning stations", error);
    return null;
  }
};

const loadFromQuery = () => {
  const params = new URLSearchParams(window.location.search);
  return parseStations(params.get(QUERY_PARAM));
};

const loadFromStorage = () => parseStations(localStorage.getItem(STORAGE_KEY));

const updateUrl = (stations: PlanningStation[]) => {
  const params = new URLSearchParams(window.location.search);

  if (stations.length === 0) {
    params.delete(QUERY_PARAM);
  } else {
    params.set(QUERY_PARAM, encodeURIComponent(JSON.stringify(stations)));
  }

  const newSearch = params.toString();
  const nextUrl = `${window.location.pathname}${
    newSearch ? `?${newSearch}` : ""
  }${window.location.hash}`;

  window.history.replaceState(null, "", nextUrl);
};

const persistStations = (stations: PlanningStation[]) => {
  localStorage.setItem(STORAGE_KEY, encodeURIComponent(JSON.stringify(stations)));
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
  return fromStorage ?? [];
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
