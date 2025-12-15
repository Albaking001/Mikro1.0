"""Generate H3 hex summaries from an OpenStreetMap export."""
import argparse
from pathlib import Path

import pandas as pd
from h3 import geo_to_h3, h3_to_geo_boundary, h3_to_geo


def to_hex(df: pd.DataFrame, resolution: int) -> pd.DataFrame:
    """Attach an H3 index to each feature and aggregate counts."""

    df["hex_id"] = df.apply(
        lambda row: geo_to_h3(float(row["lat"]), float(row["lng"]), resolution), axis=1
    )
    grouped = df.groupby("hex_id").size().reset_index(name="feature_count")
    grouped["centroid_lat"] = grouped["hex_id"].apply(lambda h: h3_to_geo(h)[0])
    grouped["centroid_lng"] = grouped["hex_id"].apply(lambda h: h3_to_geo(h)[1])
    grouped["boundary"] = grouped["hex_id"].apply(
        lambda h: [{"lat": lat, "lng": lng} for lat, lng in h3_to_geo_boundary(h, geo_json=True)]
    )
    return grouped


def load_osm_points(file_path: Path) -> pd.DataFrame:
    """Load a lightweight OSM extract exported to CSV with lat/lng columns."""

    if file_path.suffix.lower() in {".csv", ".txt"}:
        df = pd.read_csv(file_path)
    else:
        raise ValueError("Only CSV exports are supported in this lightweight ETL stage")

    expected = {"lat", "lng"}
    if not expected.issubset({col.lower() for col in df.columns}):
        raise ValueError("Input must include lat and lng columns")

    df = df.rename(columns={c: c.lower() for c in df.columns})
    return df


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarise OSM features into H3 hexes")
    parser.add_argument("input", type=Path, help="Path to OSM CSV export containing lat/lng")
    parser.add_argument("output", type=Path, help="Where to write the aggregated CSV")
    parser.add_argument("--resolution", type=int, default=8, help="H3 resolution to use")
    args = parser.parse_args()

    df = load_osm_points(args.input)
    hexes = to_hex(df, args.resolution)
    hexes.to_csv(args.output, index=False)
    print(f"Wrote {len(hexes)} hex buckets to {args.output}")


if __name__ == "__main__":
    main()
