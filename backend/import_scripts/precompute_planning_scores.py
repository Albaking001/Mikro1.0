import sys
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "app"))

try:
    from database import SessionLocal
except ModuleNotFoundError:
    from app.database import SessionLocal

from services.planning_precompute import PrecomputeError, precompute_planning_scores


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", default="Mainz")
    ap.add_argument("--step-m", type=int, default=250)
    ap.add_argument("--radius-m", type=int, default=500)
    args = ap.parse_args()

    city_name = args.city
    step_m = int(args.step_m)
    radius_m = int(args.radius_m)

    db = SessionLocal()
    try:
        out_path, payload = precompute_planning_scores(db, city_name, step_m, radius_m)
        print(f"[precompute] wrote {out_path} ({payload['meta']['points_total']} points)")
    except PrecomputeError as exc:
        raise SystemExit(str(exc))

    finally:
        db.close()


if __name__ == "__main__":
    main()
