#!/usr/bin/env python3
"""
Find style keys a screen uses but never defines.

`styles.foo` that is not in the stylesheet is `undefined` at runtime,
and React Native renders it as no style at all — the text comes out in
the platform default, a row loses its flex direction, and the screen
looks broken in a way that no error message points at.

The check is static: the keys each file references against the keys it
defines.

    python3 scripts/check_style_keys.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

FILES = list((ROOT / "src").rglob("*.tsx")) + [ROOT / "App.tsx"]

# `styles.someKey`
USED = re.compile(r"\bstyles\.([A-Za-z_][A-Za-z0-9_]*)")
# A key at the start of a line inside a style object.
DEFINED = re.compile(r"^\s{2,}([A-Za-z_][A-Za-z0-9_]*):\s*[{'\[]", re.M)
# A key written on one line: `foo: { ... },`
DEFINED_ONELINE = re.compile(r"^\s{2,}([A-Za-z_][A-Za-z0-9_]*):\s*\{.*\},\s*$", re.M)

problems = 0
for path in sorted(FILES):
    text = path.read_text(encoding="utf-8")
    if "styles." not in text:
        continue
    used = {m.group(1) for m in USED.finditer(text)}

    # The style objects live after the last `themed(`/`StyleSheet.create(`.
    starts = [m.start() for m in re.finditer(r"themed\(|StyleSheet\.create\(", text)]
    if not starts:
        continue
    sheet_text = text[starts[0]:]
    defined = {m.group(1) for m in DEFINED.finditer(sheet_text)}
    defined |= {m.group(1) for m in DEFINED_ONELINE.finditer(sheet_text)}

    missing = sorted(used - defined)
    if missing:
        problems += len(missing)
        print(f"  {path.relative_to(ROOT)}")
        for k in missing:
            print(f"      styles.{k}  ← 冇定義")

print()
print(f"  總共 {problems} 個未定義嘅 style key")
sys.exit(1 if problems else 0)
