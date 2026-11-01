#!/usr/bin/env python3
"""Verify the real SuperCollider WASM runtime distribution layout."""
import pathlib
import sys
root=pathlib.Path(sys.argv[1])
for name in ("sclang", "scsynth"):
    folder=root/name
    loader=folder/(name+".js")
    if not loader.is_file():
        sys.exit(f"Missing {loader}")
    wasm=list(folder.glob("*.wasm"))
    if not wasm:
        sys.exit(f"No WebAssembly module in {folder}")
    print(name, "loader:", loader, "WASM:", [p.name for p in wasm])
print("SuperCollider runtime assets verified")
