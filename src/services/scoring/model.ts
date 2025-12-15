export type MetricKey =
  | "coverageRatio"
  | "populationDensity"
  | "nearbyUtilization"
  | "congestionLevel"
  | "poiCount"
  | "transitProximity";

export type RawMetricInput = {
  coverageRatio: number; // 0..1
  populationDensity: number; // people per km²
  nearbyUtilization: number; // 0..100 (percentage)
  congestionLevel: number; // 0..1 (higher = worse)
  poiCount: number; // count of relevant POIs nearby
  transitProximity: number; // meters to next transit stop
};

export type ScoreBandId = "excellent" | "caution" | "unsuitable";

export type ScoreBand = {
  id: ScoreBandId;
  label: string;
  minScore: number;
  description: string;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const MAX_POPULATION_DENSITY = 15000;
const MAX_POI_COUNT = 40;
const MAX_TRANSIT_DISTANCE = 1200;

export const scoringBands: ScoreBand[] = [
  {
    id: "excellent",
    label: "Sehr gut",
    minScore: 75,
    description: "Hohe Abdeckung, starke Nachfrage und gute Anbindung",
  },
  {
    id: "caution",
    label: "Vorbehalt",
    minScore: 50,
    description: "Solider Standort mit einzelnen Risiken",
  },
  {
    id: "unsuitable",
    label: "Eher ungeeignet",
    minScore: 0,
    description: "Geringes Potenzial oder deutliche Nutzungskonflikte",
  },
];

export type FactorDefinition = {
  key: MetricKey;
  label: string;
  weight: number;
  description: string;
  extract: (input: RawMetricInput) => number;
  normalize: (value: number, input: RawMetricInput) => number;
  format: (value: number) => string;
};

export const scoringFactors: FactorDefinition[] = [
  {
    key: "coverageRatio",
    label: "Abdeckung & Reichweite",
    weight: 0.25,
    description: "Wie gut schließt der Standort bestehende Lücken im Netz",
    extract: (input) => input.coverageRatio,
    normalize: (value) => clamp01(value),
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    key: "populationDensity",
    label: "Bevölkerungsdichte",
    weight: 0.2,
    description: "Potenzielle Nachfrage im Einzugsgebiet",
    extract: (input) => input.populationDensity,
    normalize: (value) => clamp01(value / MAX_POPULATION_DENSITY),
    format: (value) => `${Math.round(value).toLocaleString("de-DE")}/km²`,
  },
  {
    key: "nearbyUtilization",
    label: "Auslastung nahegelegener Stationen",
    weight: 0.2,
    description: "Signalisiert Nachfrage in kurzer Distanz",
    extract: (input) => input.nearbyUtilization,
    normalize: (value) => clamp01(value / 100),
    format: (value) => `${Math.round(value)}%`,
  },
  {
    key: "congestionLevel",
    label: "Engpässe & Konflikte",
    weight: 0.1,
    description: "Geringere Konflikte erhöhen die Eignung",
    extract: (input) => input.congestionLevel,
    normalize: (value) => 1 - clamp01(value),
    format: (value) => `${Math.round(value * 100)}% Konfliktpotenzial`,
  },
  {
    key: "poiCount",
    label: "Points of Interest",
    weight: 0.15,
    description: "Anziehungspunkte in Fußwegdistanz",
    extract: (input) => input.poiCount,
    normalize: (value) => clamp01(value / MAX_POI_COUNT),
    format: (value) => `${Math.round(value)} POIs`,
  },
  {
    key: "transitProximity",
    label: "ÖPNV-Anbindung",
    weight: 0.1,
    description: "Nähe zu Bus- und Bahnstationen",
    extract: (input) => input.transitProximity,
    normalize: (value) => clamp01(1 - value / MAX_TRANSIT_DISTANCE),
    format: (value) => `${Math.round(value)} m`,
  },
];

export type FactorBreakdown = {
  key: MetricKey;
  label: string;
  weight: number;
  normalizedValue: number;
  contribution: number;
  rawValue: number;
  formattedRaw: string;
  description: string;
};

export type ScoreResult = {
  score: number;
  band: ScoreBand;
  breakdown: FactorBreakdown[];
  totalWeight: number;
};

export const mapScoreToBand = (score: number): ScoreBand =>
  scoringBands.find((band) => score >= band.minScore) ?? scoringBands[2];

export function computeScore(input: RawMetricInput): ScoreResult {
  const totalWeight = scoringFactors.reduce((sum, factor) => sum + factor.weight, 0);

  const breakdown = scoringFactors.map((factor) => {
    const rawValue = factor.extract(input);
    const normalizedValue = factor.normalize(rawValue, input);
    const contribution = normalizedValue * factor.weight;

    return {
      key: factor.key,
      label: factor.label,
      weight: factor.weight,
      normalizedValue,
      contribution,
      rawValue,
      formattedRaw: factor.format(rawValue),
      description: factor.description,
    } satisfies FactorBreakdown;
  });

  const weightedSum = breakdown.reduce((sum, entry) => sum + entry.contribution, 0);
  const score = Math.round((weightedSum / totalWeight) * 100);

  return {
    score,
    band: mapScoreToBand(score),
    breakdown,
    totalWeight,
  };
}
