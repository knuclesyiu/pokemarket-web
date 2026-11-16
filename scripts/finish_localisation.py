#!/usr/bin/env python3
"""
Finish the localisation pass.

Two steps the first script leaves alone:

  - files that now call t() but never imported it
  - strings with a value in them: `'更新於 ${x}'` becomes
    `t('更新於 {p0}', { p0: x })`, so the value has a name the
    translation can put where it belongs

Run it from the repository root.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

CJK = re.compile(r"[\u4e00-\u9fff]")

# A template literal with a value in it.
TPL = re.compile(r"(['\"`])([^'\"`\n]*?)\$\{([^}]+)\}([^'\"`\n]*?)\1")

# t('…') already in the line.
ALREADY = re.compile(r"\bt\(\s*['\"`]")


def add_imports() -> int:
    added = 0
    for f in list(SRC.rglob("*.ts")) + list(SRC.rglob("*.tsx")):
        if "i18n" in f.parts:
            continue
        text = f.read_text(encoding="utf-8")
        if not re.search(r"\bt\('", text):
            continue
        if re.search(r"import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*'[^']*i18n'", text):
            continue
        lines = text.split("\n")
        idx = next((i for i, l in enumerate(lines) if l.startswith("import ")), None)
        if idx is None:
            continue
        # The path back to src/ is one level up per directory.
        depth = len(f.relative_to(ROOT).parts) - 1
        rel = "../" * depth + "i18n"
        lines.insert(idx, f"import {{ t }} from '{rel}';")
        f.write_text("\n".join(lines), encoding="utf-8")
        added += 1
    return added


def interpolate() -> dict:
    found = {}
    for f in list(SRC.rglob("*.ts")) + list(SRC.rglob("*.tsx")):
        if "i18n" in f.parts:
            continue
        lines = f.read_text(encoding="utf-8").split("\n")
        dirty = False
        for i, line in enumerate(lines):
            if "${" not in line or not CJK.search(line):
                continue
            if ALREADY.search(line):
                continue
            m = TPL.search(line)
            if not m:
                continue
            _, pre, expr, post = m.groups()
            if not CJK.search(pre + post):
                continue
            source = pre + "{p0}" + post
            lines[i] = (
                line[: m.start()] + f"t('{source}', {{ p0: {expr} }})" + line[m.end():]
            )
            dirty = True
            found.setdefault(source, []).append(f"{f.relative_to(ROOT)}:{i + 1}")
        if dirty:
            f.write_text("\n".join(lines), encoding="utf-8")
    return found


if __name__ == "__main__":
    print(f"  補咗 t import 嘅檔案：{add_imports()} 個")
    found = interpolate()
    print(f"  插值字串：{len(found)} 條")
    for source, where in found.items():
        print(f"    {source[:64]}  ← {where[0]}")
    if "--json" in sys.argv:
        import json

        (ROOT / "scripts" / "interpolated_strings.json").write_text(
            json.dumps(found, ensure_ascii=False, indent=2), encoding="utf-8"
        )
