#!/usr/bin/env python3
"""
Move the hard-coded colour literals onto the theme tokens.

The colours were written out in every screen, so the same dark purple
was spelled several different ways and the brand red existed in two
nearly identical versions. Changing the palette meant finding each
one by hand.

Only literal strings are rewritten, and a colour is only rewritten
where the token means the same thing — a hex used as a background is
left alone when the token is a text colour, and the rare one-off tints
are left alone entirely.

Run it with `--dry-run` to see what it would change.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
DRY = "--dry-run" in sys.argv

# hex → (token, only_safe_in) where only_safe_in is None for "anywhere",
# or a list of property names the colour is only interchangeable in.
MAP = {
    "#8888cc": ("textSecondary", None),
    "#8888aa": ("textSecondary", None),
    "#f0f0ff": ("text", None),
    "#ffffff": ("text", ["color", "borderColor", "shadowColor"]),
    "#2a2a50": ("border", None),
    "#2a2a3e": ("border", None),
    "#3d3d70": ("borderActive", None),
    "#14142a": ("card", None),
    "#1c1c38": ("elevated", None),
    "#1e1e2e": ("elevated", None),
    "#12121f": ("surface", None),
    "#0e0e1a": ("surface", None),
    "#080810": ("void", None),
    "#6666aa": ("textTertiary", None),
    "#4a4a70": ("textDisabled", None),
    "#d4af37": ("gold", None),
    "#ffb800": ("gold", None),
    "#ff3c3c": ("action", None),
    "#ff4060": ("ruby", None),
    "#00c896": ("up", None),
    "#00c864": ("up", None),
    "#ff6b6b": ("down", None),
    "#ff6b35": ("warn", None),
    "#00b4ff": ("info", None),
    "#8b5cf6": ("violet", None),
}

# A colour used as a background behind white text must stay white.
PROP = re.compile(r"(color|backgroundColor|borderColor|shadowColor|tintColor|"
                  r"placeholderTextColor|headerTintColor|headerStyle)\s*:\s*"
                  r"['\"](#[0-9A-Fa-f]{6})['\"]")

# A JSX attribute: color="#FF3C3C"
JSX = re.compile(r"\b(color|backgroundColor|borderColor|tintColor|"
                 r"placeholderTextColor)=['\"](#[0-9A-Fa-f]{6})['\"]")

# A hex used as a plain value: '? '#00C864' : ...'
BARE = re.compile(r"['\"](#[0-9A-Fa-f]{6})['\"]")

total = 0
touched = 0
skipped = []

for file in sorted(list(SRC.rglob("*.tsx")) + list(SRC.rglob("*.ts"))):
    # The theme file holds the literals themselves. Rewriting them
    # would turn every token into a reference to itself.
    if file.name == "theme.ts":
        continue
    text = file.read_text(encoding="utf-8")
    original = text
    changed = 0

    def repl(m):
        global changed
        prop, hexv = m.group(1), m.group(2).lower()
        entry = MAP.get(hexv)
        if not entry:
            return m.group(0)
        token, only_in = entry
        if only_in is not None and prop not in only_in:
            skipped.append((file.name, hexv, prop))
            return m.group(0)
        changed += 1
        return f"{prop}: C.{token}"

    text = PROP.sub(repl, text)

    # JSX attributes: color="#FF3C3C" → color={C.action}
    def jsx_repl(m):
        global changed
        prop, hexv = m.group(1), m.group(2).lower()
        entry = MAP.get(hexv)
        if not entry:
            return m.group(0)
        token, only_in = entry
        if only_in is not None and prop not in only_in:
            skipped.append((file.name, hexv, prop))
            return m.group(0)
        changed += 1
        return f"{prop}={{C.{token}}}"

    text = JSX.sub(jsx_repl, text)

    # A hex used as a value in a ternary or an object: '... ? '#00C864' : ...'
    def bare_repl(m):
        global changed
        hexv = m.group(1).lower()
        entry = MAP.get(hexv)
        if not entry:
            return m.group(0)
        changed += 1
        return f"C.{entry[0]}"

    text = BARE.sub(bare_repl, text)

    if changed and "from '../theme'" not in text and "from '../../theme'" not in text:
        rel = file.relative_to(SRC)
        depth = len(rel.parts) - 1
        imp = f"import {{ C }} from '{'../' * depth}theme';"
        lines = text.split("\n")
        last_import = -1
        for i, line in enumerate(lines):
            if line.startswith("import ") or line.startswith("} from "):
                last_import = i
        lines.insert(last_import + 1 if last_import >= 0 else 0, imp)
        text = "\n".join(lines)

    if text != original:
        total += changed
        touched += 1
        if not DRY:
            file.write_text(text, encoding="utf-8")

print(f"  {'會改' if DRY else '改咗'} {total} 處，{touched} 個檔案")
if skipped:
    print(f"  跳過 {len(skipped)} 處（色值意思唔同，保留原樣）:")
    seen = set()
    for name, hexv, prop in skipped:
        key = (hexv, prop)
        if key in seen:
            continue
        seen.add(key)
        print(f"    {hexv} 用作 {prop}")
