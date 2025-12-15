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

export type ExistingStation = {
  id: string;
  lat: number;
  lng: number;
  name?: string;
  capacity?: number;
  /**
   * Coverage radius in meters. Defaults to a conservative 400m and can be
   * adjusted per station to reflect higher capacities (max. 500m).
   */
  coverageRadiusMeters: number;
};

export type NearestStationHit = ExistingStation & { distanceMeters: number };

export const DEFAULT_COVERAGE_RADIUS_METERS = 400;

type Bounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

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

const toRadians = (value: number) => (value * Math.PI) / 180;
const toDegrees = (value: number) => (value * 180) / Math.PI;

export const haversineDistanceMeters = (
  origin: { lat: number; lng: number },
  target: { lat: number; lng: number },
): number => {
  const R = 6371000; // meters
  const dLat = toRadians(target.lat - origin.lat);
  const dLng = toRadians(target.lng - origin.lng);
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(target.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

const moveByBearing = (
  lat: number,
  lng: number,
  distanceMeters: number,
  bearingDegrees: number,
): [number, number] => {
  const R = 6371000;
  const bearing = toRadians(bearingDegrees);
  const latRad = toRadians(lat);
  const lngRad = toRadians(lng);
  const angularDistance = distanceMeters / R;

  const destLat = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing),
  );

  const destLng =
    lngRad +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(destLat),
    );

  return [toDegrees(destLat), toDegrees(destLng)];
};

type KdNode = {
  station: ExistingStation;
  left: KdNode | null;
  right: KdNode | null;
  axis: "lat" | "lng";
};

const buildKdTree = (stations: ExistingStation[], depth = 0): KdNode | null => {
  if (stations.length === 0) return null;

  const axis: "lat" | "lng" = depth % 2 === 0 ? "lat" : "lng";
  const sorted = [...stations].sort((a, b) => a[axis] - b[axis]);
  const median = Math.floor(sorted.length / 2);

  return {
    station: sorted[median],
    axis,
    left: buildKdTree(sorted.slice(0, median), depth + 1),
    right: buildKdTree(sorted.slice(median + 1), depth + 1),
  };
};

export const createNearestNeighborSearcher = (stations: ExistingStation[]) => {
  const tree = buildKdTree(stations);

  const search = (
    target: { lat: number; lng: number },
    limit: number,
  ): NearestStationHit[] => {
    const best: NearestStationHit[] = [];

    const tryInsert = (candidate: ExistingStation) => {
      const distanceMeters = haversineDistanceMeters(target, candidate);
      const nextEntry: NearestStationHit = { ...candidate, distanceMeters };
      best.push(nextEntry);
      best.sort((a, b) => a.distanceMeters - b.distanceMeters);
      if (best.length > limit) {
        best.pop();
      }
    };

    const traverse = (node: KdNode | null) => {
      if (!node) return;

      tryInsert(node.station);

      const axis = node.axis;
      const delta = target[axis] - node.station[axis];
      const primary = delta < 0 ? node.left : node.right;
      const secondary = delta < 0 ? node.right : node.left;

      traverse(primary);

      const worstDistance = best[best.length - 1]?.distanceMeters ?? Infinity;
      const axisDistanceMeters =
        axis === "lat"
          ? haversineDistanceMeters(target, { ...target, lat: node.station.lat })
          : haversineDistanceMeters(target, { ...target, lng: node.station.lng });

      if (best.length < limit || axisDistanceMeters < worstDistance) {
        traverse(secondary);
      }
    };

    traverse(tree);
    return best;
  };

  return search;
};

export const mapExistingStations = (
  stations: Array<{
    id: number | string;
    name?: string;
    lat: number;
    lng: number;
    capacity?: number;
  }>,
): ExistingStation[] =>
  stations.map((station) => {
    const capacityScore = Math.min(Math.max(station.capacity ?? 0, 0), 20);
    const coverageRadiusMeters =
      DEFAULT_COVERAGE_RADIUS_METERS + (capacityScore / 20) * 100;

    return {
      id: station.id.toString(),
      lat: station.lat,
      lng: station.lng,
      name: station.name,
      capacity: station.capacity,
      coverageRadiusMeters: Math.min(coverageRadiusMeters, 500),
    } satisfies ExistingStation;
  });

const computeBounds = (points: Array<{ lat: number; lng: number }>): Bounds | null => {
  if (points.length === 0) return null;

  return points.reduce<Bounds>(
    (acc, point) => ({
      minLat: Math.min(acc.minLat, point.lat),
      maxLat: Math.max(acc.maxLat, point.lat),
      minLng: Math.min(acc.minLng, point.lng),
      maxLng: Math.max(acc.maxLng, point.lng),
    }),
    {
      minLat: points[0].lat,
      maxLat: points[0].lat,
      minLng: points[0].lng,
      maxLng: points[0].lng,
    },
  );
};

export const expandBounds = (bounds: Bounds, paddingMeters: number): Bounds => {
  const metersPerDegreeLat = 111320;
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const metersPerDegreeLng = 111320 * Math.cos(toRadians(centerLat));

  const latDelta = paddingMeters / metersPerDegreeLat;
  const lngDelta = paddingMeters / metersPerDegreeLng;

  return {
    minLat: bounds.minLat - latDelta,
    maxLat: bounds.maxLat + latDelta,
    minLng: bounds.minLng - lngDelta,
    maxLng: bounds.maxLng + lngDelta,
  };
};

export const hexagonAround = (
  center: { lat: number; lng: number },
  radiusMeters: number,
): [number, number][] => {
  const vertices: [number, number][] = [];
  for (let i = 0; i < 6; i += 1) {
    vertices.push(moveByBearing(center.lat, center.lng, radiusMeters, i * 60));
  }
  return vertices;
};

export const buildHexGrid = (
  points: Array<{ lat: number; lng: number }>,
  cellRadiusMeters: number,
): { id: string; polygon: [number, number][]; center: [number, number] }[] => {
  const bounds = computeBounds(points);
  if (!bounds) return [];

  const expanded = expandBounds(bounds, cellRadiusMeters * 2);
  const metersPerDegreeLat = 111320;
  const centerLat = (expanded.minLat + expanded.maxLat) / 2;
  const metersPerDegreeLng = 111320 * Math.cos(toRadians(centerLat));

  const latStep = (Math.sqrt(3) * cellRadiusMeters) / metersPerDegreeLat;
  const lngStep = (1.5 * cellRadiusMeters) / metersPerDegreeLng;
  const lngOffset = cellRadiusMeters / metersPerDegreeLng;

  const cells: { id: string; polygon: [number, number][]; center: [number, number] }[] = [];

  let row = 0;
  for (let lat = expanded.minLat; lat <= expanded.maxLat + latStep; lat += latStep) {
    const isOddRow = row % 2 === 1;
    const startLng = expanded.minLng + (isOddRow ? lngOffset : 0);

    for (let lng = startLng; lng <= expanded.maxLng + lngStep; lng += lngStep) {
      const center: [number, number] = [lat, lng];
      const polygon = hexagonAround({ lat, lng }, cellRadiusMeters);
      cells.push({
        id: `${row}-${polygon[0][0].toFixed(4)}-${polygon[0][1].toFixed(4)}`,
        polygon,
        center,
      });
    }

    row += 1;
  }

  return cells;
};

export const markCoverageGaps = (
  cells: { id: string; polygon: [number, number][]; center: [number, number] }[],
  stations: ExistingStation[],
): Array<{ id: string; polygon: [number, number][]; center: [number, number]; covered: boolean }> =>
  cells.map((cell) => {
    const center = { lat: cell.center[0], lng: cell.center[1] };
    const covered = stations.some((station) =>
      haversineDistanceMeters(center, station) <= station.coverageRadiusMeters,
    );

    return {
      ...cell,
      covered,
    };
  });

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
