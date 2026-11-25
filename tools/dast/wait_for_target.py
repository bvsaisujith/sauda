#!/usr/bin/env python3
"""Wait until a deployed URL is live and serving the build we expect.

DAST runs right after a merge, so the first requests can still hit the previous
deployment. Checking for a marker in the body and for a response header that
only the new build sends makes the scan deterministic instead of racy.
"""

from __future__ import annotations

import argparse
import sys
import time
import urllib.error
import urllib.request


def parse_header(value: str) -> tuple[str, str]:
    name, _, expected = value.partition("=")
    if not name or not expected:
        raise argparse.ArgumentTypeError(f"expected NAME=VALUE, got {value!r}")
    return name.strip().lower(), expected


def check(url: str, needle: str, headers: list[tuple[str, str]]) -> str | None:
    """Return None when the target is ready, or the reason it is not."""
    request = urllib.request.Request(url, headers={"user-agent": "sauda-dast-wait/1"})
    with urllib.request.urlopen(request, timeout=20) as response:
        body = response.read(65536).decode("utf-8", "replace")
        received = {name.lower(): value for name, value in response.headers.items()}

    if needle and needle not in body:
        return f"response body does not contain {needle!r}"

    for name, expected in headers:
        actual = received.get(name)
        if actual is None:
            return f"response is missing the {name} header"
        if expected.lower() not in actual.lower():
            return f"header {name} is {actual!r}, expected it to contain {expected!r}"

    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Wait for a deployed target to be ready")
    parser.add_argument("url", help="URL to poll")
    parser.add_argument("--needle", default="", help="text the response body must contain")
    parser.add_argument(
        "--header",
        dest="headers",
        action="append",
        type=parse_header,
        default=[],
        metavar="NAME=VALUE",
        help="response header that must contain VALUE; repeatable",
    )
    parser.add_argument("--attempts", type=int, default=20, help="how many times to poll")
    parser.add_argument("--delay", type=int, default=15, help="seconds between polls")
    args = parser.parse_args()

    for attempt in range(1, args.attempts + 1):
        try:
            problem = check(args.url, args.needle, args.headers)
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            problem = str(error)

        if problem is None:
            print(f"{args.url} is ready (attempt {attempt})")
            return 0

        print(f"waiting for {args.url} ({attempt}/{args.attempts}): {problem}")
        if attempt < args.attempts:
            time.sleep(args.delay)

    print(f"{args.url} was not ready after {args.attempts} attempts: {problem}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
