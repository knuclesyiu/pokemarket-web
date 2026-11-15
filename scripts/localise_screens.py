#!/usr/bin/env python3
"""
Point the screens at the translation table.

The strings were written inline, in Traditional Chinese, in every
screen. This rewrites them into a lookup, so the language switcher
has something to switch.

Only strings that are in the table are touched — a string the table
does not have stays as it is, which is safer than a guess.

Four shapes are rewritten:

    <Text style={styles.x}>設定收款帳戶</Text>
        → <Text style={styles.x}>{t('設定收款帳戶')}</Text>

    <TextInput placeholder="搜尋卡名" />
        → <TextInput placeholder={t("搜尋卡名")} />

    notify('登入失敗', e.message)
        → notify(t('登入失敗'), e.message)

    const label = '待回覆';
        → const label = t('待回覆');

Three things are left alone, because wrapping them would change what
they mean:

  - a type declaration's literal union — `type X = 'a' | 'b'` is a
    type, not something on the screen
  - an object key — `'a': 1` is a key, not something on the screen
  - a string that is already inside a `t(...)` call

    python3 scripts/localise_screens.py
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

MARK = "\x00T%d\x00"


def load_keys() -> set:
    """The keys of the translation table, read out of the table itself."""
    text = (SRC / "i18n" / "strings.ts").read_text(encoding="utf-8")
    return {k.replace("\\n", "\n") for k in
            re.findall(r"^\s*'((?:[^'\\]|\\.)*)':\s*\{", text, re.M)}


KEYS = load_keys()


def collapse(s: str) -> str:
    return " ".join(s.split())


def quote(text: str) -> str:
    """A JavaScript string literal for a key."""
    if "'" in text:
        return '"' + text.replace('"', '\\"') + '"'
    return "'" + text.replace("\\", "\\\\").replace("'", "\\'") + "'" 


def protect(text: str, store: list) -> str:
    """Hide the calls that are already there, so nothing is wrapped twice."""
    def repl(m):
        store.append(m.group(0))
        return MARK % (len(store) - 1)
    return re.sub(r"t\((['\"])(?:[^'\\]|\\.)*\1\)", repl, text)


def restore(text: str, store: list) -> str:
    for i, original in enumerate(store):
        text = text.replace(MARK % i, original)
    return text


TEXT_JSX = re.compile(r"(<Text\b[^>]*>)([^<>{}]+)(</Text>)", re.S)

# Any JSX attribute holding a Chinese string.
ATTR = re.compile(r"(\b[A-Za-z][\w-]*)=(\"[^\"{}]*\")")

# A string literal in code — single quoted, so a JSX attribute value
# (double quoted) is not caught by this one.
LITERAL = re.compile(r"(?<![\w.])'((?:[^'\\\n]|\\.)*[\u4e00-\u9fff](?:[^'\\\n]|\\.)*)'")

# A type declaration — its literal union is a type.
TYPE_LINE = re.compile(r"^\s*(?:export\s+)?type\s+\w+[^\n]*$", re.M)


def localise(text: str) -> tuple:
    """Rewrite the strings in one file. Returns (text, count)."""
    store: list = []
    text = protect(text, store)
    count = 0

    # A type declaration's literals stay as they are.
    type_lines = []

    def stash_type(m):
        type_lines.append(m.group(0))
        return MARK % (len(store) + len(type_lines) - 1)

    text = TYPE_LINE.sub(stash_type, text)

    def text_jsx(m):
        nonlocal count
        body = collapse(m.group(2))
        if body not in KEYS:
            return m.group(0)
        count += 1
        return m.group(1) + "{t(" + quote(body) + ")}" + m.group(3)

    def attr(m):
        nonlocal count
        body = collapse(m.group(2)[1:-1])
        if body not in KEYS:
            return m.group(0)
        count += 1
        return f"{m.group(1)}={{t({quote(body)})}}"

    def literal(m):
        nonlocal count
        body = m.group(1).replace("\\n", "\n")
        if body not in KEYS:
            return m.group(0)
        # An object key is not something on the screen: `'全部': null`.
        # A ternary branch is, and it is followed by a colon too — so
        # the position is what tells them apart.
        before = text[: m.start()].rstrip()
        after = text[m.end():].lstrip()
        if after.startswith(":") and (before.endswith("{") or before.endswith(",")):
            return m.group(0)
        count += 1
        return "t(" + quote(body) + ")"

    # The code-literal rule goes first: the rules after it create
    # `t('...')` calls, and a rule that ran afterwards would wrap
    # those a second time.
    text = LITERAL.sub(literal, text)
    text = TEXT_JSX.sub(text_jsx, text)
    text = ATTR.sub(attr, text)

    # Put the type declarations back.
    for i, original in enumerate(type_lines):
        text = text.replace(MARK % (len(store) + i), original)

    text = restore(text, store)
    return text, count


DECL = re.compile(
    r"^(?:export\s+)?(?:default\s+)?(?:const\s+[A-Za-z0-9_]+\s*(?::\s*[^=]+?)?\s*=\s*"
    r"(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>|function\s+[A-Za-z0-9_]+\s*\([^()]*\))\s*\{",
    re.M,
)

HOOK = "  const { t } = useAppearance();"


def add_hook(text: str) -> tuple:
    """Put the hook in every component that now calls `t`."""
    lines = text.split("\n")
    inserts = []
    for i, line in enumerate(lines):
        if not line.rstrip().endswith("{"):
            continue
        if not re.match(r"^(?:export\s+)?(?:default\s+)?(?:const\s+[A-Za-z0-9_]+|function\s+[A-Za-z0-9_]+)", line):
            continue
        if "=>" not in line and "function" not in line:
            continue
        depth = 0
        body = []
        for j in range(i, len(lines)):
            body.append(lines[j])
            depth += lines[j].count("{") - lines[j].count("}")
            if depth <= 0 and j > i:
                break
        blob = "\n".join(body)
        if not re.search(r"\bt\(", blob):
            continue
        if "useAppearance()" in blob:
            continue
        inserts.append(i)

    for i in reversed(inserts):
        indent = re.match(r"\s*", lines[i]).group(0)
        lines.insert(i + 1, f"{indent}const {{ t }} = useAppearance();")

    return "\n".join(lines), len(inserts)


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
