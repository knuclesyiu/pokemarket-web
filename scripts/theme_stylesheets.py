#!/usr/bin/env python3
"""
Make every screen's stylesheet follow the active theme.

A stylesheet built at module scope freezes the colours it was built
with: the module is evaluated once, and the palette it read is the
palette of that moment. Every screen in this app builds its styles
that way, so the theme could not be switched without rewriting them
all.

`themed()` in `src/theme.ts` takes the factory instead and rebuilds
the sheet for whichever palette is active, remembering the build per
palette. This script rewrites the call sites — the stylesheet factory
becomes an arrow function passed to `themed`, and the palette arrives
as its argument.

A stylesheet built *inside* a component is already re-evaluated on
every render and already reads the live palette, so only the ones at
module scope are touched.
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent / "src"


def find_matching(text: str, open_at: int) -> int:
    """Index of the parenthesis that closes the one at `open_at`."""
    depth = 0
    i = open_at
    n = len(text)
    while i < n:
        ch = text[i]
        if ch in "\"'`":
            quote = ch
            i += 1
            while i < n:
                if text[i] == "\\":
                    i += 2
                    continue
                if text[i] == quote:
                    break
                i += 1
        elif ch == "/" and i + 1 < n and text[i + 1] == "/":
            while i < n and text[i] != "\n":
                i += 1
            continue
        elif ch == "/" and i + 1 < n and text[i + 1] == "*":
            end = text.find("*/", i)
            i = end if end != -1 else n
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ValueError("unbalanced parenthesis")


def add_import(text: str, name: str) -> str:
    """Add `name` to the existing import from the theme module."""
    m = re.search(r"import\s*\{([^}]*)\}\s*from\s*'([^']*theme)'", text)
    if m:
        names = [n.strip() for n in m.group(1).split(",") if n.strip()]
        if name in names:
            return text
        names.append(name)
        names.sort(key=lambda x: x.lower())
        return (
            text[: m.start()]
            + "import { " + ", ".join(names) + " } from '" + m.group(2) + "'"
            + text[m.end():]
        )
    m2 = re.search(r"import\s*\{[^}]*\}\s*from\s*'react-native';", text)
    if m2:
        return (
            text[: m2.end()]
            + f"\nimport {{ {name} }} from '../theme';"
            + text[m2.end():]
        )
    return text


changed = []
for path in sorted(ROOT.rglob("*.tsx")):
    original = path.read_text(encoding="utf-8")
    out = []
    pos = 0
    touched = False

    for m in re.finditer(r"^const (\w+) = StyleSheet\.create\(", original, re.M):
        var = m.group(1)
        head = f"const {var} = StyleSheet.create("
        open_paren = m.start() + len(head) - 1
        close = find_matching(original, open_paren)
        out.append(original[pos: m.start()])
        out.append(
            f"const {var} = themed((C) => StyleSheet.create("
            + original[open_paren + 1: close]
            + "))"
        )
        pos = close + 1
        if original[pos: pos + 1] == ";":
            pos += 1
        touched = True

    if not touched:
        continue

    out.append(original[pos:])
    text = "".join(out)
    text = add_import(text, "themed")
    path.write_text(text, encoding="utf-8")
    changed.append(str(path.relative_to(ROOT.parent)))

print(f"  轉換咗 {len(changed)} 個檔案：")
for c in changed:
    print("   ", c)
