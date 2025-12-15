"""Aggregate population points into H3 hexes for downstream tiling."""
import argparse
from pathlib import Path

import pandas as pd
from h3 import geo_to_h3, h3_to_geo_boundary, h3_to_geo


def aggregate_population(df: pd.DataFrame, resolution: int) -> pd.DataFrame:
    df["hex_id"] = df.apply(
        lambda row: geo_to_h3(float(row["lat"]), float(row["lng"]), resolution), axis=1
    )
    grouped = (
        df.groupby("hex_id")["population"].sum().reset_index(name="population_sum")
    )
    grouped["centroid_lat"] = grouped["hex_id"].apply(lambda h: h3_to_geo(h)[0])
    grouped["centroid_lng"] = grouped["hex_id"].apply(lambda h: h3_to_geo(h)[1])
    grouped["boundary"] = grouped["hex_id"].apply(
        lambda h: [{"lat": lat, "lng": lng} for lat, lng in h3_to_geo_boundary(h, geo_json=True)]
    )
    return grouped


def main() -> None:
    parser = argparse.ArgumentParser(description="Aggregate population points into H3 hexes")
    parser.add_argument("input", type=Path, help="CSV with columns lat,lng,population")
    parser.add_argument("output", type=Path, help="Destination CSV for hex summaries")
    parser.add_argument("--resolution", type=int, default=7, help="H3 resolution to use")
    args = parser.parse_args()

    df = pd.read_csv(args.input)
    df = df.rename(columns={c: c.lower() for c in df.columns})
    for col in ["lat", "lng", "population"]:
        if col not in df.columns:
            raise ValueError(f"Column '{col}' is required in the input file")

    aggregated = aggregate_population(df, args.resolution)
    aggregated.to_csv(args.output, index=False)
    print(f"Wrote {len(aggregated)} population hexes to {args.output}")


if __name__ == "__main__":
    main()
