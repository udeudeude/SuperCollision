#!/usr/bin/env python3
"""Build the opt-in SuperCollision offline cache manifest for a compiled site.

Use an existing verified WebAssembly runtime; never rebuild or remove it here.
The manifest is not automatically downloaded as an offline pack by the browser.
"""
import json
import subprocess
import sys
from pathlib import Path

ALLOWED = {".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".svg", ".png"}
RUNTIME = (
    "runtime/sclang/sclang.js",
    "runtime/sclang/sclang.wasm",
    "runtime/sclang/sclang.data",
    "runtime/sclang/init.js",
    "runtime/scsynth/scsynth.js",
    "runtime/scsynth/scsynth.wasm",
    "runtime/scsynth/init.js",
)
REQUIRED = (
    "index.html",
    "lab-sw.js",
    "lab-offline.mjs",
    "lab-composition-vault.mjs",
    "instrument-layout.js",
    "instrument-layout.css",
    "manifest.webmanifest",
    "language-catalog.json",
    *RUNTIME,
)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: build_offline_manifest.py SITE_DIR")
    site = Path(sys.argv[1]).resolve()
    missing = [file for file in REQUIRED if not (site / file).is_file()]
    if missing:
        raise SystemExit("Refusing to publish incomplete offline site: " + ", ".join(missing))
    frontend = [
        f for f in site.iterdir()
        if f.is_file() and f.suffix in ALLOWED and f.name != "lab-offline-assets.json"
    ]
    files = sorted(set(frontend + [site / p for p in RUNTIME]), key=lambda p: p.as_posix())
    if not files or len(files) > 128:
        raise SystemExit("Offline pack asset count is invalid")
    for item in files:
        relative = item.relative_to(site).as_posix()
        if not relative or ".." in relative.split("/") or not item.stat().st_size:
            raise SystemExit(f"Invalid offline asset: {relative}")
    source_root = Path(__file__).resolve().parents[1]
    version = subprocess.check_output(
        ["git", "-C", str(source_root), "rev-parse", "HEAD"], text=True
    ).strip()
    entries = [
        {"path": "/" + item.relative_to(site).as_posix(), "bytes": item.stat().st_size}
        for item in files
    ]
    result = {"format": "supercollision-offline-v1", "version": version, "files": entries}
    (site / "lab-offline-assets.json").write_text(
        json.dumps(result, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    print(f"Offline pack: {len(entries)} files, {sum(e['bytes'] for e in entries)} bytes")


if __name__ == "__main__":
    main()
