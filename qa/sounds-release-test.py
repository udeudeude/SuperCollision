#!/usr/bin/env python3
"""Release regression: protect Code/runtime while updating both sound workspaces."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.build_offline_manifest import REQUIRED
from scripts.stage_sounds_release import LIBRIVOX, release_files, stage_release


def main() -> None:
    assets = release_files(ROOT)
    assert set(LIBRIVOX).issubset(assets)
    # Releasing an old label with a new manifest must fail before publication.
    with TemporaryDirectory() as wrong_version:
        fixture = Path(wrong_version)
        for name in assets:
            (fixture / name).write_bytes((ROOT / name).read_bytes())
        (fixture / "app-version.json").write_text('{"version":"0.0"}', encoding="utf-8")
        try:
            release_files(fixture)
        except ValueError as exc:
            assert "version disagrees" in str(exc), exc
        else:
            raise AssertionError("Release staging accepted a contradictory version")
    assert "librivox-test.html" not in assets, "Do not publish an experimental test page"
    assert "index.html" in assets, "Code must ship with the integrated Sounds navigation"
    for name in ("sounds-bench-preview.html", "sounds-workspace.css", "sounds-reach.css",
                 "sounds-bench-engine.mjs", "sounds-bench-visuals.mjs", "sounds-bench-links.mjs"):
        assert name in assets, "Instrument Bench must be part of the release: " + name
    ui_workflow = (ROOT / ".github/workflows/publish-ui.yml").read_text()
    assert "python3 source/scripts/stage_sounds_release.py source site" in ui_workflow, (
        "Code's publishing lane must atomically stage Sounds and LibriVox")
    assert "git add sounds.html sounds-lab.html sounds-bench-preview.html sounds-workspace.css sounds-reach.css sound-surfaces-design.css sound-surfaces-theme.mjs" in ui_workflow

    with TemporaryDirectory() as temporary:
        site = Path(temporary)
        # Use harmless stand-ins for the large compiled runtime. The actual
        # production workflow independently verifies the real compiled engine.
        for required in REQUIRED:
            destination = site / required
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(("UNCHANGED:" + required).encode("utf-8"))
        sentinel = {
            name: (site / name).read_bytes()
            for name in ("runtime/sclang/sclang.wasm",
                         "runtime/scsynth/scsynth.wasm", "lab-sw.js")
        }
        original_index = (site / "index.html").read_bytes()
        (site / "sounds.html").write_text("outdated Sounds page", encoding="utf-8")
        (site / "librivox-explorer.html").write_text("outdated LibriVox page", encoding="utf-8")
        (site / "lab-offline-assets.json").write_text('{"version":"outdated"}', encoding="utf-8")
        (site / "unrelated.txt").write_text("keep this", encoding="utf-8")

        assert not (site / "librivox-combine.mjs").exists()
        staged = stage_release(ROOT, site)
        assert staged == assets
        manifest = json.loads((site / "lab-offline-assets.json").read_text(encoding="utf-8"))
        paths = {entry["path"]: entry["bytes"] for entry in manifest["files"]}
        assert set("/" + name for name in staged).issubset(paths)
        assert manifest["version"] == subprocess.check_output(
            ["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True
        ).strip()
        for name in staged:
            assert (site / name).read_bytes() == (ROOT / name).read_bytes(), name
            assert paths["/" + name] == (site / name).stat().st_size, name
        assert (site / "index.html").read_bytes() == (ROOT / "index.html").read_bytes()
        assert (site / "index.html").read_bytes() != original_index, "Legacy Code recorder not replaced"
        for name, before in sentinel.items():
            assert (site / name).read_bytes() == before, f"Overwrote protected {name}"
        assert (site / "unrelated.txt").read_text(encoding="utf-8") == "keep this"
        before_manifest = (site / "lab-offline-assets.json").read_bytes()
        stage_release(ROOT, site)
        assert (site / "lab-offline-assets.json").read_bytes() == before_manifest, "Not idempotent"
    print("Release staging passed: unified Code + Sounds + LibriVox, fresh offline index, unchanged audio runtime")


if __name__ == "__main__":
    main()
