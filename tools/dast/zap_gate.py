#!/usr/bin/env python3
"""Fail the pipeline when a ZAP report contains a risk we do not accept.

The rules live in .zap/rules.json. Every suppressed alert needs a written
reason in that file, so an exception is a reviewed decision rather than a
silent ignore.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

RISK_NAMES = {0: "Informational", 1: "Low", 2: "Medium", 3: "High"}
RULES_PATH = Path(".zap/rules.json")


def load_json(path: Path) -> dict:
    try:
        # utf-8-sig tolerates a BOM, which Windows editors like to add.
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        print(f"error: {path} does not exist", file=sys.stderr)
        raise SystemExit(2)
    except json.JSONDecodeError as error:
        print(f"error: {path} is not valid JSON: {error}", file=sys.stderr)
        raise SystemExit(2)


def alerts_from(report: dict) -> list[dict]:
    collected: list[dict] = []

    for site in report.get("site", []):
        for alert in site.get("alerts", []):
            collected.append(
                {
                    "pluginid": str(alert.get("pluginid", "")),
                    "alert": alert.get("alert", "unknown"),
                    "riskcode": int(alert.get("riskcode", 0)),
                    "instances": len(alert.get("instances", [])),
                    "site": site.get("@name", ""),
                }
            )

    return collected


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply Sauda's ZAP acceptance rules")
    parser.add_argument("report", help="ZAP JSON report")
    parser.add_argument("--target", default="", help="scanned target, for the summary")
    parser.add_argument("--rules", default=str(RULES_PATH), help="rules file")
    args = parser.parse_args()

    rules = load_json(Path(args.rules))
    report = load_json(Path(args.report))

    fail_on = {name.lower() for name in rules.get("failOnRisk", ["High", "Medium"])}
    allow = {str(key): str(value) for key, value in rules.get("allow", {}).items()}
    min_sites = int(rules.get("minSites", 1))

    sites = report.get("site", [])
    if len(sites) < min_sites:
        print(f"error: report contains {len(sites)} site(s), expected at least {min_sites}")
        return 2

    alerts = alerts_from(report)
    failures: list[dict] = []

    print(f"ZAP gate: {args.target or 'report'} ({len(alerts)} alert type(s))")

    for alert in sorted(alerts, key=lambda item: (-item["riskcode"], item["pluginid"])):
        risk = RISK_NAMES.get(alert["riskcode"], "Unknown")
        reason = allow.get(alert["pluginid"])
        accepted = reason is not None
        blocking = alert["riskcode"] >= 0 and risk.lower() in fail_on and not accepted

        if blocking:
            failures.append(alert)

        status = "ACCEPTED" if accepted else ("FAIL" if blocking else "report")
        print(
            f"  {status:8} {risk:13} {alert['pluginid']:>5}  {alert['alert']} "
            f"({alert['instances']} instance(s))"
        )
        if accepted:
            print(f"           reason: {reason}")

    if failures:
        print("")
        print(f"ZAP gate failed: {len(failures)} alert type(s) at or above the allowed risk.")
        print("Fix the finding, or add a reviewed exception to .zap/rules.json.")
        return 1

    print("ZAP gate passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
