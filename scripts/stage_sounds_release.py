#!/usr/bin/env python3
"""Stage Sounds and LibriVox as one versioned release on the existing Pages site.

This script does not build, delete, or modify the SuperCollider engine.
It regenerates the opt-in offline *index*, not the download policy or service
worker. The caller must commit the staged files together, or none of them.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path
from shutil import copy2

PAGES = ("index.html", "sounds.html", "sounds-lab.html",
         "sounds-bench-preview.html", "sounds-workspace.css", "sounds-reach.css",
         "sound-surfaces-design.css", "sound-surfaces-theme.mjs")
LIBRIVOX = (
    "librivox-explorer.html",
    "librivox-explorer.css",
    "librivox-explorer.mjs",
    "librivox-audio-extract.mjs",
    "librivox-combine.mjs",
    "librivox-text-locator.mjs",
)


def release_files(source: Path) -> tuple[str, ...]:
    modules = tuple(sorted(path.name for path in source.glob("sounds-*.mjs")))
    if len(modules) < 5:
        raise ValueError("Refusing incomplete Sounds source: missing modules")
    files = (*PAGES, *modules, *LIBRIVOX)
    missing = [name for name in files if not (source / name).is_file()]
    if missing:
        raise ValueError("Refusing incomplete release: " + ", ".join(missing))

    # A tested Code entrypoint must open the SAME Sounds workspace. It must
    # never launch an old inline recorder with incompatible local audio data.
    code = (source / "index.html").read_text(encoding="utf-8")
    if "location.assign('./sounds-bench-preview.html#play')" not in code or "sounds-overlay" in code:
        raise ValueError("Code does not open the integrated Sounds workspace")
    # Legacy address is a same-origin redirect, not a second application.
    sounds = (source / "sounds.html").read_text(encoding="utf-8")
    if "location.replace(target.href)" not in sounds or "sounds-bench-preview.html" not in sounds:
        raise ValueError("Legacy Sounds URL must redirect to Instrument Bench")
    explorer = (source / "librivox-explorer.html").read_text(encoding="utf-8")
    if "sound-surfaces-theme.mjs" not in explorer or "sound-surfaces-design.css" not in explorer:
        raise ValueError("LibriVox does not load the shared design")
    bench = (source / "sounds-bench-preview.html").read_text(encoding="utf-8")
    if "sounds-bench-engine.mjs" not in bench or "sounds-bench-acquire.mjs" not in bench:
        raise ValueError("Instrument Bench does not load its native engine and acquisition")
    if "sounds-bench-links.mjs" not in (source / "sounds-bench-engine.mjs").read_text(encoding="utf-8"):
        raise ValueError("Instrument Bench source-to-control linking is absent")
    # Use one canonical public version instead of a frozen literal.
    try:
        version = json.loads((source / "app-version.json").read_text(encoding="utf-8"))["version"]
    except (OSError, KeyError, json.JSONDecodeError) as exc:
        raise ValueError("Missing or invalid canonical release version") from exc
    if not isinstance(version, str) or not re.fullmatch(r"\d+\.\d+(?:\.\d+)?", version):
        raise ValueError("Invalid canonical release version")
    sample_lab = (source / "sounds-lab.html").read_text(encoding="utf-8")
    version_markers = (
        ("Code", code, f'<small class="app-version" aria-label="Version {version}">v{version}</small>'),
        ("Instrument Bench", bench, f'<small class="app-version" aria-label="Version {version}">v{version}</small>'),
        ("Sample Lab", sample_lab, f'<small class="app-version" aria-label="Version {version}">v{version}</small>'),
        ("LibriVox", explorer, f'<small class="app-version" aria-label="Version {version}">v{version}</small>'),
    )
    for name, html, marker in version_markers:
        if marker not in html:
            raise ValueError(f"{name} version disagrees with SuperCollision v{version}")
    if "librivox-explorer.css" not in explorer or "librivox-explorer.mjs" not in explorer:
        raise ValueError("LibriVox page does not load its bundled stylesheet and module")
    return files


def stage_release(source: Path, site: Path) -> tuple[str, ...]:
    source, site = source.resolve(), site.resolve()
    files = release_files(source)
    if not (site / "index.html").is_file():
        raise ValueError("Refusing release without the existing Code entrypoint")
    for engine in ("sclang", "scsynth"):
        folder = site / "runtime" / engine
        if not (folder / (engine + ".js")).is_file() or not list(folder.glob("*.wasm")):
            raise ValueError(f"Refusing release without compiled {engine} engine")

    for name in files:
        copy2(source / name, site / name)

    subprocess.run(
        [sys.executable, str(source / "scripts" / "build_offline_manifest.py"), str(site)],
        check=True,
    )

    manifest = json.loads((site / "lab-offline-assets.json").read_text(encoding="utf-8"))
    entries = {entry["path"]: entry["bytes"] for entry in manifest["files"]}
    if manifest["format"] != "supercollision-offline-v1":
        raise ValueError("Unexpected offline manifest format")
    for name in files:
        deployed = site / name
        if deployed.read_bytes() != (source / name).read_bytes():
            raise ValueError(f"Release did not stage current {name}")
        if entries.get("/" + name) != deployed.stat().st_size:
            raise ValueError(f"Offline manifest is missing current {name}")
    print(f"Validated one Sounds + LibriVox release: {len(files)} assets and offline index")
    return files


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: stage_sounds_release.py SOURCE_DIR SITE_DIR")
    stage_release(Path(sys.argv[1]), Path(sys.argv[2]))
