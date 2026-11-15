#!/usr/bin/env python3
"""
Point the screens at the translation table.

The strings were written inline, in Traditional Chinese, in every
screen. This rewrites them into a lookup, so the language switcher
has something to switch.

Only strings that are in the table are touched — a string the table
does not have stays as it is, which is safer than a guess.

Two things are rewritten:

  <Text style={styles.x}>設定收款帳戶</Text>
      → <Text style={styles.x}>{t('設定收款帳戶')}</Text>

  <TextInput placeholder="搜尋卡名" />
      → <TextInput placeholder={t('搜尋卡名')} />

and the hook is added to the components that now call `t`.

    python3 scripts/localise_screens.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

sys.path.insert(0, str(ROOT / "scripts"))


def load_keys() -> set:
    """The keys of the translation table, read out of the table itself."""
    text = (SRC / "i18n" / "strings.ts").read_text(encoding="utf-8")
    return set(re.findall(r"^\s*'((?:[^'\\]|\\.)*)':\s*\{", text, re.M))


KEYS = load_keys()
KEYSET = {k.replace("\\n", "\n") for k in KEYS}


def collapse(s: str) -> str:
    return " ".join(s.split())


def quote(text: str) -> str:
    """A JavaScript string literal for a key."""
    if "'" in text:
        return '"' + text.replace('"', '\\"') + '"'
    return "'" + text.replace("\\", "\\\\").replace("'", "\\'") + "'"


# ── the patterns ───────────────────────────────────────────────────────────

# <Text ...>text</Text>, on one line or across several.
TEXT_JSX = re.compile(
    r"(<Text\b[^>]*>)\s*([^<>{}]+?)\s*(</Text>)", re.S
)

# placeholder="text" / accessibilityLabel="text" / title="text"
ATTR = re.compile(
    r"\b(placeholder|accessibilityLabel|title|label)\s*=\s*\"([^\"{}]*)\""
)

# notify('text', ...) / confirmAction('text', ...)
CALL = re.compile(r"\b(notify|confirmAction)\(\s*'((?:[^'\\]|\\.)*)'")

# title: 'text' inside an options object
OPTION = re.compile(r"(\btitle:\s*)'((?:[^'\\]|\\.)*)'")


def localise(text: str) -> tuple:
    """Rewrite the strings in one file. Returns (text, count)."""
    count = 0

    def text_jsx(m):
        nonlocal count
        body = collapse(m.group(2))
        if body not in KEYSET:
            return m.group(0)
        count += 1
        return m.group(1) + "{t(" + quote(body) + ")}" + m.group(3)

    def attr(m):
        nonlocal count
        body = collapse(m.group(2))
        if body not in KEYSET:
            return m.group(0)
        count += 1
        return f"{m.group(1)}={{t({quote(body)})}}"

    def call(m):
        nonlocal count
        body = m.group(2).replace("\\n", "\n")
        if body not in KEYSET:
            return m.group(0)
        count += 1
        return f"{m.group(1)}(t({quote(body)})"

    def option(m):
        nonlocal count
        body = m.group(2).replace("\\n", "\n")
        if body not in KEYSET:
            return m.group(0)
        count += 1
        return f"{m.group(1)}t({quote(body)})"

    text = TEXT_JSX.sub(text_jsx, text)
    text = ATTR.sub(attr, text)
    text = CALL.sub(call, text)
    text = OPTION.sub(option, text)
    return text, count


# ── the hook ───────────────────────────────────────────────────────────────

# A component declaration and the brace that opens its body.
COMPONENT = re.compile(
    r"^(export default )?(const [A-Za-z0-9_]+\s*(?::\s*[^=]+?)?\s*=\s*"
    r"(?:\([^()]*\)|\w+)\s*=>|function [A-Za-z0-9_]+\s*\([^()]*\))\s*\{",
    re.M,
)

HOOK = "  const { t } = useAppearance();\n"


def add_hook(text: str) -> tuple:
    """Put the hook in every component that now calls `t`."""
    if "useAppearance()" in text:
        return text, 0
    out = []
    pos = 0
    added = 0
    for m in COMPONENT.finditer(text):
        out.append(text[pos: m.end()])
        pos = m.end()
        # Find the body of this component and see whether it uses `t`.
        depth = 1
        i = pos
        while i < len(text) and depth:
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
            i += 1
        body = text[pos:i]
        if re.search(r"\bt\(", body):
            out.append("\n" + HOOK)
            added += 1
    out.append(text[pos:])
    return "".join(out), added


def add_import(text: str, depth: int) -> str:
    if "contexts/AppearanceContext" in text:
        return text
    rel = "../" * depth + "contexts/AppearanceContext"
    line = f"import {{ useAppearance }} from '{rel}';"
    m = re.search(r"^import .*?;$", text, re.M)
    if m:
        return text[: m.end()] + "\n" + line + text[m.end():]
    return line + "\n" + text


total_strings = 0
total_hooks = 0
changed = []

for path in sorted(SRC.rglob("*.tsx")):
    original = path.read_text(encoding="utf-8")
    if "t(" not in original:
        continue
    text, n = localise(original)
    if n == 0:
        continue
    depth = len(path.relative_to(SRC).parts) - 1
    text, hooks = add_hook(text)
    if hooks:
        text = add_import(text, depth)
    path.write_text(text, encoding="utf-8")
    total_strings += n
    total_hooks += hooks
    changed.append((str(path.relative_to(ROOT)), n, hooks))

print(f"  換咗 {total_strings} 條字串、加咗 {total_hooks} 個 hook")
for c in changed:
    print(f"    {c[1]:3d} 字串 {c[2]:2d} hook   {c[0]}")
