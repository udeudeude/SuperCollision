#!/usr/bin/env python3
"""Retrieve the latest successful official SuperCollider WASM CI artifact.

GitHub API rate limits apply. Set GH_TOKEN in the environment.
"""
import json, os, pathlib, subprocess, urllib.request, zipfile, io, shutil, sys

API="https://api.github.com/repos/supercollider/supercollider"
token=os.environ.get("GH_TOKEN")
if not token: sys.exit("GH_TOKEN is required")
def get(url):
    req=urllib.request.Request(url,headers={"Authorization":"Bearer "+token,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"SuperCollision-CI"})
    with urllib.request.urlopen(req,timeout=90) as res:return res.read()
def jsonget(url):return json.loads(get(url))
runs=jsonget(API+"/actions/workflows/build_wasm.yml/runs?status=success&per_page=30").get("workflow_runs",[])
# Reusable workflows may not expose standalone runs: search repository-wide successful runs.
if not runs:
    runs=jsonget(API+"/actions/runs?status=success&per_page=60").get("workflow_runs",[])
artifact=None
for run in runs:
    artifacts=jsonget(API+f"/actions/runs/{run['id']}/artifacts?per_page=100").get("artifacts",[])
    artifact=next((a for a in artifacts if "wasm" in a["name"].lower() and not a.get("expired")),None)
    if artifact:break
if not artifact:sys.exit("No unexpired upstream WASM artifact found. Build from upstream develop instead.")
print("Using",artifact["name"],"from run",run["id"])
data=get(artifact["archive_download_url"])
root=pathlib.Path("runtime");root.mkdir(exist_ok=True)
def unpack(data,dest):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for info in z.infolist():
            path=pathlib.PurePosixPath(info.filename)
            if path.is_absolute() or ".." in path.parts:raise ValueError("Unsafe archive path")
        z.extractall(dest)
unpack(data,root)
# GitHub actions artifact can contain a nested wasm-dist.zip.
for nested in list(root.rglob("wasm-dist.zip")):
    unpack(nested.read_bytes(),nested.parent)
    nested.unlink()
# Normalize typical upstream structure: wasm-dist/{sclang,scsynth}
print("Downloaded files:",sum(1 for _ in root.rglob("*")))
