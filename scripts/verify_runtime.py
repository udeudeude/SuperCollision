#!/usr/bin/env python3
import pathlib,sys
root=pathlib.Path(sys.argv[1])
files=list(root.rglob("*"))
for name in ("sclang.js","scsynth.js"):
    hits=[p for p in files if p.is_file() and p.name==name]
    if not hits:sys.exit("Missing "+name+" in "+str(root))
    print(name, hits[0])
if not any(p.suffix==".wasm" for p in files):sys.exit("No WASM binary found")
