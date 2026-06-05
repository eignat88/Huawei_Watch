#!/usr/bin/env python3
"""Inspect a Huawei .hwt file as a ZIP-like archive."""
from __future__ import annotations

import sys
from pathlib import Path
from zipfile import ZipFile, is_zipfile

REQUIRED = [
    "description.xml",
    "preview/cover.jpg",
    "preview/icon_small.jpg",
    "com.huawei.watchface",
]


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python3 tools/inspect_hwt.py path/to/file.hwt", file=sys.stderr)
        return 2

    hwt = Path(sys.argv[1])
    print(f"file: {hwt}")
    print(f"exists: {hwt.exists()}")
    if not hwt.exists():
        return 1

    print(f"size_bytes: {hwt.stat().st_size}")
    zip_like = is_zipfile(hwt)
    print(f"is_zip: {zip_like}")
    if not zip_like:
        return 1

    with ZipFile(hwt) as zf:
        names = zf.namelist()
        print("\narchive_files:")
        for name in names:
            info = zf.getinfo(name)
            print(f"- {name}\t{info.file_size} bytes")

    normalized = {name.strip("/") for name in names}
    print("\nrequired_checks:")
    for item in REQUIRED:
        print(f"- {item}: {'yes' if item in normalized else 'no'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
