import type { MapStation } from "../types/map";

type KDNode = {
  point: MapStation;
  axis: number;
  left: KDNode | null;
  right: KDNode | null;
};

const euclideanDistance = (a: [number, number], b: [number, number]) => {
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const dLat = lat1 - lat2;
  const dLng = lng1 - lng2;
  return Math.sqrt(dLat * dLat + dLng * dLng);
};

const buildTree = (points: MapStation[], depth = 0): KDNode | null => {
  if (points.length === 0) return null;

  const axis = depth % 2;
  const sorted = [...points].sort(
    (a, b) => a.coordinates[axis] - b.coordinates[axis],
  );
  const median = Math.floor(sorted.length / 2);

  return {
    point: sorted[median],
    axis,
    left: buildTree(sorted.slice(0, median), depth + 1),
    right: buildTree(sorted.slice(median + 1), depth + 1),
  };
};

const nearestSearch = (
  node: KDNode | null,
  target: [number, number],
  best?: { station: MapStation; distance: number },
): { station: MapStation; distance: number } | undefined => {
  if (!node) return best;

  const nodeDistance = euclideanDistance(node.point.coordinates, target);
  let currentBest =
    !best || nodeDistance < best.distance
      ? { station: node.point, distance: nodeDistance }
      : best;

  const axis = node.axis;
  const diff = target[axis] - node.point.coordinates[axis];
  const primary = diff <= 0 ? node.left : node.right;
  const secondary = diff <= 0 ? node.right : node.left;

  currentBest = nearestSearch(primary, target, currentBest) ?? currentBest;

  if (Math.abs(diff) < currentBest.distance) {
    currentBest = nearestSearch(secondary, target, currentBest) ?? currentBest;
  }

  return currentBest;
};

export const createSpatialIndex = (stations: MapStation[]) => buildTree(stations);

export const findNearestStation = (
  tree: KDNode | null,
  target: [number, number],
): { station: MapStation; distance: number } | null => {
  if (!tree) return null;
  const result = nearestSearch(tree, target);
  return result ?? null;
};
