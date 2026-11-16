#!/usr/bin/env python3
"""
Find the Chinese strings that never made it into the translation table.

Two kinds of occurrence need different treatment:

  - a string in an expression position: `'全部'` becomes `t('全部')`
  - text between JSX tags: `<Text>全部</Text>` becomes `<Text>{t('全部')}</Text>`

A string that is an object key is left alone: translating a key would
change what the object is indexed by, which is not what anybody wants.

A string with an interpolation in it is reported rather than rewritten:
`t()` takes a plain string, so the sentence has to be split into its
translated parts around the value, and that is worth doing by hand.

Run it with --write to apply the changes.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

CJK = re.compile(r"[\u4e00-\u9fff]")

# A string literal with Chinese in it.
LITERAL = re.compile(r"""(?<![\w$])(['"`])([^'"`\n]*[\u4e00-\u9fff][^'"`\n]*)\1""")

# A string already inside t().
IN_T = re.compile(r"""\bt\(\s*['"`]""")

# A JSX text child: text between > and < with no expression braces.
JSX_TEXT = re.compile(r">([^<>{}\n]*[\u4e00-\u9fff][^<>{}\n]*)<")


def is_object_key(line: str, match_end: int) -> bool:
    """Is this literal being used as an object key?"""
    # What follows the literal decides, not the literal itself.
    rest = line[match_end:]
    after = rest.lstrip()
    if after.startswith(":"):
        return True
    return False


def is_type_position(line: str) -> bool:
    """A type alias or a declared union — types are not values."""
    return bool(
        re.match(r"\s*(export\s+)?type\s+\w+\s*[=<]", line)
        or re.match(r"\s*(export\s+)?(interface|enum)\s+\w+", line)
    )


def main() -> int:
    write = "--write" in sys.argv

    files = [
        f
        for f in sorted(SRC.rglob("*.ts"))
        + sorted(SRC.rglob("*.tsx"))
        if "i18n" not in f.parts
    ]

    changed_files = 0
    new_strings: set[str] = set()
    skipped: list[tuple[str, int, str]] = []

    for path in files:
        text = path.read_text(encoding="utf-8")
        original = text
        lines = text.split("\n")

        for i, line in enumerate(lines):
            stripped = line.strip()
            # Skip imports, comments and lines that already call t().
            if stripped.startswith(("import ", "//", "*", "/*")):
                continue
            if IN_T.search(line):
                continue
            # A type alias or a declared union: the members are types,
            # not text, and a type cannot call a function.
            if is_type_position(line):
                continue
            # A t( that opened on the previous line.
            if i > 0 and re.search(r"\bt\(\s*$", lines[i - 1]):
                continue

            # JSX text: >全部<
            def jsx_repl(m: re.Match) -> str:
                inner = m.group(1)
                if "${" in inner:
                    return m.group(0)
                new_strings.add(inner.strip())
                return ">" + "{t('" + inner.strip() + "')}" + "<"

            line = JSX_TEXT.sub(jsx_repl, line)

            # String literals in an expression position.
            out = []
            last = 0
            for m in LITERAL.finditer(line):
                value = m.group(2).strip()
                if not value or len(value) > 80:
                    continue
                if value.startswith("http"):
                    continue
                if "${" in value:
                    skipped.append((str(path.relative_to(ROOT)), i + 1, value))
                    continue
                if is_object_key(line, m.end()):
                    continue
                before = line[: m.start()]
                # A JSX attribute: `placeholder="全部"` has to become
                # `placeholder={t('全部')}` — `placeholder=t('全部')` is
                # not JSX. Only the attributes that take text count;
                # `message = '…'` is an assignment, not an attribute.
                is_attribute = bool(
                    re.search(r"\b(placeholder|title|label|hint|accessibilityLabel"
                              r"|headerTitle|accessibilityHint)\s*=\s*$", before)
                )
                call = "t('" + value.replace("'", "\\'") + "')"
                out.append(line[last : m.start()])
                out.append(("{" + call + "}") if is_attribute else call)
                last = m.end()
                new_strings.add(value)
            if out:
                out.append(line[last:])
                line = "".join(out)

            lines[i] = line

        text = "\n".join(lines)
        if text != original:
            changed_files += 1
            if write:
                path.write_text(text, encoding="utf-8")

    print(f"  改動咗 {changed_files} 個檔案（{'已寫入' if write else 'dry run'}）")
    print(f"  需要新翻譯嘅字串：{len(new_strings)} 條")
    if skipped:
        print(f"  要手動處理嘅插值字串：{len(skipped)} 條")
        for f, ln, s in skipped:
            print(f"    {f}:{ln}  {s[:60]}")

    out = ROOT / "scripts" / "untranslated_strings.txt"
    out.write_text("\n".join(sorted(new_strings)), encoding="utf-8")
    print(f"  字串清單：{out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
