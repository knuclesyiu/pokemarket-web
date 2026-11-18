#!/usr/bin/env python3
"""
Find Chinese that is still hard-coded.

The first scanner looked for quoted literals, which missed two common
cases: Chinese sitting in JSX text ( <Text>放售</Text> ) and Chinese
sitting in a template literal ( `款項 ${x} 已由平台托管` ).

This one looks at the source line rather than the parse tree, so it
catches both, and it also checks that every t('...') has an entry in
the translation table.

Run it from the repository root.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
TABLE = SRC / "i18n" / "strings.ts"

CJK = r"[\u4e00-\u9fff]"
T_CALL = re.compile(r"\bt\(\s*'((?:[^'\\]|\\.)*)'")
TABLE_KEY = re.compile(r"^\s*'((?:[^'\\]|\\.)*)':\s*\{", re.M)


def main() -> int:
    table = TABLE.read_text(encoding="utf-8")
    keys = set(TABLE_KEY.findall(table))

    missing_translation = []
    hardcoded = []

    for f in sorted(list(SRC.glob("**/*.ts")) + list(SRC.glob("**/*.tsx"))):
        rel = f.relative_to(ROOT)
        if "i18n" in rel.parts or rel.name == "business.ts":
            continue
        if rel.name in ("Feedback.tsx",):
            # Its Chinese is a heuristic for tone, not display text.
            continue
        lines = f.read_text(encoding="utf-8").split("\n")
        for i, line in enumerate(lines, 1):
            s = line.strip()
            if not re.search(CJK, line):
                continue
            if s.startswith(("//", "*", "/*", "import ", "export type", "export interface")):
                continue
            # A trailing comment is not display text.
            without_comment = re.sub(r"(?<!:)//.*$", "", line).strip()
            if not re.search(CJK, without_comment):
                continue
            # A template literal inside t(`...`) is already translated.
            if re.search(r"t\(\s*`", line) or re.search(r"t\(\s*$", line):
                continue

            # Already inside a t('...') call on this line.
            if re.search(r"t\(\s*'(?:[^'\\]|\\.)*" + CJK, line):
                for m in T_CALL.finditer(line):
                    key = m.group(1)
                    if re.search(CJK, key) and key not in keys:
                        missing_translation.append((str(rel), i, key))
                continue

            # A t('...') that spans lines: the call started earlier and
            # the string continues on this line.
            prev = " ".join(lines[max(0, i - 3) : i])
            if re.search(r"t\(\s*$", prev) or re.search(r"t\(\s*\n?\s*['\"]?$", prev):
                continue
            if re.match(r"^['\"]", s) and re.search(r"t\([^)]*$", prev):
                continue

            # t('...') with the Chinese after the closing quote? Rare.
            if re.search(r"t\([^)]*\)\s*[,;]?\s*$", line) and re.search(CJK, line):
                pass

            # Chinese inside a JSX attribute or text node.
            if re.search(CJK, line):
                # Is this line a definition of a translation table entry?
                if re.match(r"^\s*'[^']*'\s*:\s*\{", line):
                    continue
                # Is it inside an object literal used only as a lookup?
                hardcoded.append((str(rel), i, s[:110]))

    print(f"════ t() 但翻譯表冇：{len(missing_translation)} ════")
    for rel, i, key in missing_translation:
        print(f"  {rel}:{i}  {key[:70]}")
    print(f"\n════ 仍然 hardcode 嘅中文：{len(hardcoded)} ════")
    for rel, i, s in hardcoded:
        print(f"  {rel}:{i}  {s}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
