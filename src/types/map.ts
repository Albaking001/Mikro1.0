import type { StationStatus } from "../data/stations";

export type MapStation = {
  id: number;
  name: string;
  coordinates: [number, number];
  district: string;
  capacity: number;
  bikesAvailable: number;
  lastUpdated: string;
  status: StationStatus;
};
