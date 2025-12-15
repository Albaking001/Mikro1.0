import type { PlanningStation } from "../../store/planningSlice";

type Hotspot = {
  lat: number;
  lng: number;
  weight: number;
};

export type PotentialWeights = {
  population: number;
  poi: number;
  transit: number;
  coverage: number;
};

export type PotentialGridCell = {
  id: string;
  lat: number;
  lng: number;
  layerScores: {
    population: number;
    poi: number;
    transit: number;
  };
};

export type HeatPoint = [number, number, number];

const GRID_BOUNDS = {
  minLat: 49.94,
  maxLat: 50.05,
  minLng: 8.18,
  maxLng: 8.32,
};

const GRID_STEP = 0.0045; // ~350-400m between sample points

const populationHotspots: Hotspot[] = [
  { lat: 49.997, lng: 8.273, weight: 1.2 },
  { lat: 49.99, lng: 8.245, weight: 0.95 },
  { lat: 49.979, lng: 8.276, weight: 0.85 },
  { lat: 50.008, lng: 8.264, weight: 0.75 },
];

const poiHotspots: Hotspot[] = [
  { lat: 49.999, lng: 8.271, weight: 1 },
  { lat: 49.992, lng: 8.24, weight: 0.9 },
  { lat: 50.004, lng: 8.256, weight: 0.8 },
  { lat: 49.971, lng: 8.287, weight: 0.7 },
];

const transitStops: Hotspot[] = [
  { lat: 49.998, lng: 8.274, weight: 1 },
  { lat: 50.008, lng: 8.265, weight: 0.8 },
  { lat: 49.991, lng: 8.241, weight: 0.65 },
  { lat: 49.972, lng: 8.285, weight: 0.6 },
  { lat: 50.015, lng: 8.224, weight: 0.65 },
];

const gaussianInfluence = (distanceMeters: number, sigma: number) =>
  Math.exp(-((distanceMeters * distanceMeters) / (2 * sigma * sigma)));

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const haversineDistanceMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) => {
  const R = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const normalize = (values: number[]): number[] => {
  const max = Math.max(...values, 1);
  return values.map((value) => value / max);
};

const sampleGridPoints = () => {
  const points: { lat: number; lng: number }[] = [];

  for (let lat = GRID_BOUNDS.minLat; lat <= GRID_BOUNDS.maxLat; lat += GRID_STEP) {
    for (let lng = GRID_BOUNDS.minLng; lng <= GRID_BOUNDS.maxLng; lng += GRID_STEP) {
      points.push({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) });
    }
  }

  return points;
};

const scoreFromHotspots = (
  lat: number,
  lng: number,
  hotspots: Hotspot[],
  sigmaMeters: number,
) =>
  hotspots.reduce((total, hotspot) => {
    const distance = haversineDistanceMeters(lat, lng, hotspot.lat, hotspot.lng);
    return total + hotspot.weight * gaussianInfluence(distance, sigmaMeters);
  }, 0);

const buildLayerScores = (
  points: { lat: number; lng: number }[],
  hotspots: Hotspot[],
  sigmaMeters: number,
) => normalize(points.map((point) => scoreFromHotspots(point.lat, point.lng, hotspots, sigmaMeters)));

export const createBaseGrid = (): PotentialGridCell[] => {
  const gridPoints = sampleGridPoints();

  const populationLayer = buildLayerScores(gridPoints, populationHotspots, 480);
  const poiLayer = buildLayerScores(gridPoints, poiHotspots, 380);
  const transitLayer = buildLayerScores(gridPoints, transitStops, 280);

  return gridPoints.map((point, index) => ({
    id: `${point.lat}-${point.lng}`,
    lat: point.lat,
    lng: point.lng,
    layerScores: {
      population: populationLayer[index],
      poi: poiLayer[index],
      transit: transitLayer[index],
    },
  }));
};

const staticLayerScore = (
  layers: PotentialGridCell["layerScores"],
  weights: PotentialWeights,
) => {
  const totalWeight = weights.population + weights.poi + weights.transit;
  if (totalWeight === 0) return 0;

  return (
    (layers.population * weights.population +
      layers.poi * weights.poi +
      layers.transit * weights.transit) /
    totalWeight
  );
};

const findNearestStationDistance = (
  cell: PotentialGridCell,
  stations: PlanningStation[],
) => {
  if (stations.length === 0) return Infinity;

  return stations.reduce((shortest, station) => {
    const distance = haversineDistanceMeters(cell.lat, cell.lng, station.lat, station.lng);
    return Math.min(shortest, distance);
  }, Infinity);
};

const coverageEffect = (
  cell: PotentialGridCell,
  stations: PlanningStation[],
  coverageWeight: number,
) => {
  if (coverageWeight === 0) return 0;

  const distance = findNearestStationDistance(cell, stations);

  if (!Number.isFinite(distance)) {
    return coverageWeight; // no coverage -> boost potential
  }

  const closeCoveragePenalty = Math.exp(-((distance * distance) / (2 * 180 * 180)));
  const gapBoost = 1 - Math.exp(-((distance * distance) / (2 * 650 * 650)));

  return coverageWeight * (gapBoost - closeCoveragePenalty * 0.6);
};

export const computeHeatPoints = (
  grid: PotentialGridCell[],
  stations: PlanningStation[],
  weights: PotentialWeights,
): HeatPoint[] =>
  grid.map((cell) => {
    const baseScore = staticLayerScore(cell.layerScores, weights);
    const adjusted = Math.max(
      0,
      Math.min(1.25, baseScore + coverageEffect(cell, stations, weights.coverage)),
    );

    return [cell.lat, cell.lng, Number(adjusted.toFixed(3))];
  });

export const DEFAULT_WEIGHTS: PotentialWeights = {
  population: 1,
  poi: 0.8,
  transit: 0.9,
  coverage: 0.75,
};
