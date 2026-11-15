#!/usr/bin/env python3
"""
Make sure every component that calls `t()` has the hook in scope.

The first pass matched component declarations with a regular expression
that could not cope with a typed prop list — `React.FC<{ onPress: () =>
void }>` has an `=` in the type, so the pattern never matched and the
hook was left out of those components.

This walks the file line by line instead: a line that starts a
component and ends with the brace that opens its body is a component,
and the hook goes in there if the body calls `t()`.

    python3 scripts/fix_localisation_hooks.py
"""
import pathlib
import re
import sys

SRC = pathlib.Path(__file__).resolve().parent.parent / "src"

# A line that opens a component: `const X... = ... => {` or `function X... {`
DECL = re.compile(
    r"^(?:export\s+)?(?:default\s+)?(?:const\s+[A-Z]\w*|function\s+[A-Z]\w*)"
)
HOOK = "  const { t } = useAppearance();"


def body_of(lines, start):
    """The lines of a component body, given the line that opens it."""
    depth = 0
    out = []
    for i in range(start, len(lines)):
        line = lines[i]
        depth += line.count("{") - line.count("}")
        out.append(line)
        if depth <= 0 and i > start:
            break
        if depth <= 0 and "{" in line and "}" in line and line.count("{") == line.count("}"):
            break
    return "\n".join(out)


def fix(text: str) -> tuple:
    lines = text.split("\n")
    inserts = []
    for i, line in enumerate(lines):
        if not line.rstrip().endswith("{"):
            continue
        if not DECL.match(line):
            continue
        if "=>" not in line and "function" not in line:
            continue
        body = body_of(lines, i)
        if not re.search(r"\bt\(", body):
            continue
        if "useAppearance()" in body:
            continue
        inserts.append(i)

    for i in reversed(inserts):
        indent = re.match(r"\s*", lines[i]).group(0)
        lines.insert(i + 1, f"{indent}const {{ t }} = useAppearance();")

    return "\n".join(lines), len(inserts)


total = 0
for path in sorted(SRC.rglob("*.tsx")):
    text = path.read_text(encoding="utf-8")
    if "t(" not in text:
        continue
    new, n = fix(text)
    if n:
        path.write_text(new, encoding="utf-8")
        total += n
        print(f"    +{n} hook   {path.relative_to(SRC.parent)}")

print(f"  總共加咗 {total} 個 hook")
