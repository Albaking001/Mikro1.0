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

export const stationStatusLabels: Record<StationStatus, string> = {
  in_betrieb: "In Betrieb",
  planung: "In Planung",
  wartung: "Wartung",
};

export const stations: Station[] = [
  {
    id: 1,
    name: "Hauptbahnhof",
    district: "Mainz-Neustadt",
    coordinates: [49.99858, 8.27325],
    bikesAvailable: 18,
    capacity: 24,
    status: "in_betrieb",
    lastUpdated: "2025-01-15 09:10",
  },
  {
    id: 2,
    name: "Universität Campus",
    district: "Mainz-Oberstadt",
    coordinates: [49.99113, 8.24167],
    bikesAvailable: 12,
    capacity: 30,
    status: "in_betrieb",
    lastUpdated: "2025-01-15 08:55",
  },
  {
    id: 3,
    name: "Altstadt Markt",
    district: "Mainz-Altstadt",
    coordinates: [50.00051, 8.27127],
    bikesAvailable: 7,
    capacity: 16,
    status: "in_betrieb",
    lastUpdated: "2025-01-15 08:40",
  },
  {
    id: 4,
    name: "Zollhafen",
    district: "Mainz-Neustadt",
    coordinates: [50.00828, 8.26565],
    bikesAvailable: 5,
    capacity: 18,
    status: "planung",
    lastUpdated: "2025-01-12 15:20",
  },
  {
    id: 5,
    name: "Gonsenheim Bahnhof",
    district: "Mainz-Gonsenheim",
    coordinates: [50.0152, 8.22414],
    bikesAvailable: 2,
    capacity: 14,
    status: "wartung",
    lastUpdated: "2025-01-14 17:45",
  },
  {
    id: 6,
    name: "Rathaus",
    district: "Mainz-Altstadt",
    coordinates: [50.00002, 8.26938],
    bikesAvailable: 10,
    capacity: 20,
    status: "in_betrieb",
    lastUpdated: "2025-01-15 09:00",
  },
  {
    id: 7,
    name: "Innenstadt Süd",
    district: "Mainz-Neustadt",
    coordinates: [49.99592, 8.25617],
    bikesAvailable: 9,
    capacity: 22,
    status: "planung",
    lastUpdated: "2025-01-10 11:05",
  },
  {
    id: 8,
    name: "Hechtsheim Gewerbegebiet",
    district: "Mainz-Hechtsheim",
    coordinates: [49.97094, 8.28638],
    bikesAvailable: 4,
    capacity: 12,
    status: "in_betrieb",
    lastUpdated: "2025-01-15 08:50",
  },
];
