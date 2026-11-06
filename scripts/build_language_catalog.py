#!/usr/bin/env python3
"""Generate a compact SuperCollider class/method catalog from official .schelp files.

Usage:
  python3 scripts/build_language_catalog.py /path/to/HelpSource/Classes output.json

Source: https://github.com/supercollider/supercollider/tree/develop/HelpSource/Classes
Argument defaults are deliberately *not inferred* from help prose: they are not
present reliably in .schelp. The client only labels a default where verified.
"""
import json
import re
import sys
from pathlib import Path

FIELDS = re.compile(r"^\s*(class|summary|categories|classMethods|instanceMethods|method|argument|description|examples|private)::\s*(.*)", re.I)
SAFE_NAME = re.compile(r"^[A-Za-z_]\w*$")
INLINE = re.compile(r"(?:link|code|strong|emphasis|soft|teletype)::(.*?)::", re.S)
SPACES = re.compile(r"\s+")

def plain(s: str) -> str:
    s = INLINE.sub(lambda m: m.group(1).split("#")[0].split("/")[-1], s)
    s = re.sub(r"::|\\[a-zA-Z_]+", " ", s)
    return SPACES.sub(" ", s).strip()[:360]

def parse_file(filename: Path):
    name = filename.stem
    if not SAFE_NAME.fullmatch(name):
        return None
    result = {"name": name, "kind": "class", "category": "Other",
              "summary": "", "methods": [],
              "docs": f"https://doc.sccode.org/Classes/{name}.html"}
    section = ""
    current = None
    current_arg = None
    pending_arg_text = False
    first_description = False
    for line in filename.read_text(encoding="utf8", errors="replace").splitlines():
        match = FIELDS.match(line)
        if match:
            tag, body = match.group(1).lower(), match.group(2).strip()
            current_arg = None
            pending_arg_text = False
            first_description = False
            if tag == "summary":
                result["summary"] = plain(body)
            elif tag == "categories":
                result["category"] = plain(body.split(",")[0]).replace(">", " / ") or "Other"
            elif tag == "classmethods":
                section = "class"; current = None
            elif tag == "instancemethods":
                section = "instance"; current = None
            elif tag == "method":
                names = [n.strip() for n in body.split(",") if SAFE_NAME.fullmatch(n.strip())]
                current = []
                for method_name in names:
                    m = {"name": method_name, "owner": name, "scope": section or "class",
                         "args": [], "summary": ""}
                    result["methods"].append(m)
                    current.append(m)
                first_description = True
            elif tag == "argument":
                arg_name = body.split(",")[0].strip()
                if current and SAFE_NAME.fullmatch(arg_name):
                    for method in current:
                        method["args"].append({"name": arg_name})
                    pending_arg_text = True
                    current_arg = arg_name
            elif tag in ("description", "examples", "private"):
                current = None
            continue
        stripped = line.strip()
        if not stripped or stripped.lower().startswith(("code::", "note::", "discussion::",
                              "subsection::", "list::", "definitionlist::", "returns::",
                              "numberedlist::", "table::", "warning::")):
            continue
        if current and first_description and stripped and not stripped.endswith("::"):
            for method in current:
                if not method["summary"]:
                    method["summary"] = plain(stripped)[:180]
            first_description = False
        elif current and pending_arg_text and current_arg and stripped and not stripped.endswith("::"):
            for method in current:
                arg = method["args"][-1] if method["args"] else None
                if arg and arg["name"] == current_arg and "description" not in arg:
                    arg["description"] = plain(stripped)[:160]
            pending_arg_text = False
    # Duplicate method documentation sometimes repeats the same signature.
    seen = set()
    methods = []
    for m in result["methods"]:
        key = (m["scope"], m["name"])
        if key in seen:
            continue
        seen.add(key)
        methods.append(m)
    result["methods"] = methods
    return result

def main(argv):
    if len(argv) != 3:
        raise SystemExit("Usage: build_language_catalog.py HelpSource/Classes output.json")
    src, output = Path(argv[1]), Path(argv[2])
    if not src.is_dir():
        raise SystemExit(f"Missing official help classes directory: {src}")
    classes = [c for p in sorted(src.glob("*.schelp")) if (c := parse_file(p))]
    if len(classes) < 800:
        raise SystemExit(f"Refusing incomplete catalog: only {len(classes)} class files")
    classes.sort(key=lambda c: c["name"].lower())
    payload = {"schema": 1, "source": "SuperCollider official HelpSource/Classes",
               "classCount": len(classes), "classes": classes}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    print(f"Generated {len(classes)} classes, {sum(len(c['methods']) for c in classes)} documented methods; {output.stat().st_size} bytes -> {output}")

if __name__ == "__main__":
    main(sys.argv)
