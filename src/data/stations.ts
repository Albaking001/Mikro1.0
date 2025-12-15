export type StationStatus = "in_betrieb" | "planung" | "wartung";

export interface Station {
  id: number;
  name: string;
  district: string;
  coordinates: [number, number];
  bikesAvailable: number;
  capacity: number;
  status: StationStatus;
  lastUpdated: string;
}
