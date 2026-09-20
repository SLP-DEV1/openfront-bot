#!/usr/bin/env python3
"""Offline, read-only policy candidate report from Brain SQLite experiences.

Holdout split is by whole match, not by snapshot. This does not demonstrate
causal policy improvement and never deploys a candidate.
"""
import argparse
import collections
import hashlib
import json
import math
import pathlib
import sqlite3


def split(match_id: str) -> str:
    bucket = int(hashlib.sha256(match_id.encode()).hexdigest()[:8], 16) % 5
    return "holdout" if bucket == 0 else "training"


def bounded(value: float, low: int, high: int) -> int:
    return max(low, min(high, int(math.floor(value + 0.5)) if value >= 0 else -int(math.floor(-value + 0.5))))


def train(db_path: pathlib.Path) -> dict:
    con = sqlite3.connect(f"file:{db_path.resolve()}?mode=ro", uri=True)
    try:
        rows = con.execute(
            "SELECT match_id,context,reward FROM experiences ORDER BY match_id,seq"
        ).fetchall()
        sessions = con.execute(
            "SELECT outcome,COUNT(*) FROM sessions WHERE finished=1 GROUP BY outcome"
        ).fetchall()
    finally:
        con.close()
    groups = {"training": collections.defaultdict(list),
              "holdout": collections.defaultdict(list)}
    matches = {"training": set(), "holdout": set()}
    for match_id, context, reward in rows:
        if not math.isfinite(reward) or abs(reward) > 1:
            continue
        bucket = split(match_id)
        groups[bucket][context].append(reward)
        matches[bucket].add(match_id)
    candidates = {}
    for context, values in sorted(groups["training"].items()):
        n = len(values)
        mean = sum(values) / n
        confidence = min(1.0, max(0, n - 2) / 15)
        signal = max(-1, min(1, mean * confidence))
        candidates[context] = {
            "samples": n, "mean": round(mean, 6),
            "aggressiveDelta": bounded(signal * 5, -5, 5) if n >= 3 else 0,
            "reserveDelta": bounded(-signal * 4, -4, 4) if n >= 3 else 0,
        }
    holdout = {}
    for context, values in sorted(groups["holdout"].items()):
        holdout[context] = {
            "samples": len(values), "observedMean": round(sum(values) / len(values), 6),
            "seenInTraining": context in candidates,
        }
    return {
        "schema": 1, "candidateOnly": True, "automaticallyDeployed": False,
        "matches": {k: len(v) for k, v in matches.items()},
        "finishedOutcomes": dict(sessions), "candidate": candidates,
        "holdout": holdout,
        "limitations": "Progress proxy is observational, not attack attribution. "
                       "A match-disjoint holdout avoids snapshot leakage but cannot "
                       "prove a policy improves win rate. No self-play or promotion.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=pathlib.Path,
                        default=pathlib.Path(__file__).parent / "data/experiences.sqlite")
    parser.add_argument("--out", type=pathlib.Path,
                        default=pathlib.Path(__file__).parent / "data/policy-candidate.json")
    args = parser.parse_args()
    report = train(args.db)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"out": str(args.out), "matches": report["matches"],
                      "contexts": len(report["candidate"]), "automaticallyDeployed": False}))


if __name__ == "__main__":
    main()
