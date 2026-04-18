#!/usr/bin/env python3
"""
Backfill / repair cached stats on portfolio_properties.

Problem 1 — Expands display-formatted ranges (em dash, mixed case) in address_range
and additional_streets into individual normalized addresses before any
address_normalized equality queries (matches lib/supabase-search enumerateAddressRange).

Problem 2 — Picks a primary PIN that skips Cook class 299 (common / parking) when
a building has multiple PINs (e.g. condos).

Requires: pip install supabase
Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

Usage:
  python scripts/portfolio_cached_stats_backfill.py --dry-run
  python scripts/portfolio_cached_stats_backfill.py --apply
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from typing import Any

# Hyphen, en dash, em dash
RANGE_DASH_RE = re.compile(r"[\u2013\u2014\u2212\-–—]")

DIR_MAP = [
    (re.compile(r"\bWEST\b", re.I), "W"),
    (re.compile(r"\bEAST\b", re.I), "E"),
    (re.compile(r"\bNORTH\b", re.I), "N"),
    (re.compile(r"\bSOUTH\b", re.I), "S"),
]
TYPE_MAP = [
    (re.compile(r"\bSTREET\b", re.I), "ST"),
    (re.compile(r"\bAVENUE\b", re.I), "AVE"),
    (re.compile(r"\bBOULEVARD\b", re.I), "BLVD"),
    (re.compile(r"\bDRIVE\b", re.I), "DR"),
    (re.compile(r"\bCOURT\b", re.I), "CT"),
    (re.compile(r"\bPLACE\b", re.I), "PL"),
    (re.compile(r"\bLANE\b", re.I), "LN"),
    (re.compile(r"\bROAD\b", re.I), "RD"),
]


def normalize_address(raw: str) -> str:
    """Mirror Next.js normalizeAddress (lib/supabase-search) for query keys."""
    s = raw.strip()
    if not s:
        return s
    s = s.split(",")[0].strip()
    s = re.sub(r"\s+(apt|apartment|unit|#)\s*.*$", "", s, flags=re.I).strip()
    s = re.sub(r"\s+", " ", s).strip()
    s = s.upper()
    for rx, rep in DIR_MAP:
        s = rx.sub(rep, s)
    for rx, rep in TYPE_MAP:
        s = rx.sub(rep, s)
    return s


def _enumerate_street_range(low_num: int, high_num: int, street_rest: str) -> list[str]:
    if not street_rest.strip():
        return []
    start = min(low_num, high_num)
    end = max(low_num, high_num)
    parity = start % 2
    out: list[str] = []
    for num in range(start, end + 1):
        if num % 2 == parity:
            out.append(normalize_address(f"{num} {street_rest}"))
    return out


def expand_segment_to_normalized_addresses(segment: str) -> list[str]:
    """
    One display fragment, e.g. '3900–3902 W Cornelia Ave' or a single address.
    Returns uppercase normalized addresses suitable for address_normalized.
    """
    seg = segment.strip()
    if not seg:
        return []

    # "3900–3902 W CORNELIA AVE" after partial normalize, or mixed case from UI
    m = re.match(r"^(\d+)\s*[\u2013\u2014\u2212\-–—]\s*(\d+)\s+(.+)$", seg)
    if m:
        low_n = int(m.group(1))
        high_n = int(m.group(2))
        rest = m.group(3).strip()
        rest_n = normalize_address(rest)
        # rest_n is full normalized single-line address without leading number — extract street
        parts = rest_n.split()
        if parts and parts[0].isdigit():
            street_only = " ".join(parts[1:])
        else:
            street_only = rest_n
        return _enumerate_street_range(low_n, high_n, street_only)

    return [normalize_address(seg)]


def expanded_normalized_addresses_for_row(row: dict[str, Any]) -> list[str]:
    """All distinct query keys for complaints / violations / permits fan-out."""
    seen: set[str] = set()
    ordered: list[str] = []

    def add(a: str) -> None:
        a = a.strip()
        if not a or a in seen:
            return
        seen.add(a)
        ordered.append(a)

    ca = row.get("canonical_address")
    if isinstance(ca, str) and ca.strip():
        add(normalize_address(ca))

    ar = row.get("address_range")
    if isinstance(ar, str) and ar.strip():
        for part in ar.split("&"):
            for addr in expand_segment_to_normalized_addresses(part):
                add(addr)

    streets = row.get("additional_streets")
    if isinstance(streets, list):
        for s in streets:
            if isinstance(s, str) and s.strip():
                for addr in expand_segment_to_normalized_addresses(s):
                    add(addr)

    return ordered


def _class_is_299(property_class: str | None) -> bool:
    if property_class is None:
        return False
    t = str(property_class).strip()
    return t.startswith("299")


def preferred_pin_skip_299(supabase: Any, pins: list[str] | None) -> str | None:
    """First PIN whose properties.property_class is not 299; fallback to pins[0]."""
    if not pins:
        return None
    clean = [p.strip() for p in pins if isinstance(p, str) and p.strip()]
    if not clean:
        return None

    for pin in clean:
        res = (
            supabase.table("properties")
            .select("pin, property_class")
            .eq("pin", pin)
            .limit(1)
            .execute()
        )
        rows = getattr(res, "data", None) or []
        if not rows:
            continue
        pc = rows[0].get("property_class")
        if not _class_is_299(pc):
            return pin

    return clean[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Print actions only")
    parser.add_argument("--apply", action="store_true", help="Write updates to Supabase")
    args = parser.parse_args()
    if not args.dry_run and not args.apply:
        parser.error("Pass --dry-run or --apply")

    try:
        from supabase import create_client
    except ImportError:
        print("Install: pip install supabase", file=sys.stderr)
        sys.exit(1)

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        sys.exit(1)

    supabase = create_client(url, key)
    res = supabase.table("portfolio_properties").select("*").execute()
    rows = getattr(res, "data", None) or []

    for row in rows:
        pid = row.get("id")
        addrs = expanded_normalized_addresses_for_row(row)
        pins = row.get("pins")
        pin_list = pins if isinstance(pins, list) else []
        primary = preferred_pin_skip_299(supabase, pin_list)

        print(f"id={pid} expanded_addrs={len(addrs)} primary_pin={primary!r}")
        if args.dry_run:
            print(f"  addresses: {addrs[:8]}{'...' if len(addrs) > 8 else ''}")

        if args.apply and primary and pin_list and primary != pin_list[0]:
            new_pins = [primary] + [p for p in pin_list if p != primary]
            supabase.table("portfolio_properties").update({"pins": new_pins}).eq("id", pid).execute()
            print(f"  updated pins order: {new_pins[:3]}...")


if __name__ == "__main__":
    main()
