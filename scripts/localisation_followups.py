#!/usr/bin/env python3
"""
The follow-up fixes the localisation pass needs.

Four things the string replacement cannot do on its own:

1. A file that calls `t()` needs it in scope. Most files get the hook
   from the appearance context; the rest import the module-level
   function.

2. A literal union in a type declaration is a type, not something on
   the screen — `type VersionFilter = '全部' | '日版'` must stay as it
   is, and the values are translated where they are displayed.

3. A callback parameter called `t` shadows the imported `t`, and
   `t('...')` inside it calls the string instead of the function.

4. A constant built at module scope is evaluated before the profile
   arrives, so the language it was translated into is the one that
   happened to be active at import time. Those constants keep their
   source text and are translated where they are read.

    python3 scripts/localisation_followups.py
"""
import pathlib
import re

SRC = pathlib.Path(__file__).resolve().parent.parent / "src"

# ── 1. the module-level import ─────────────────────────────────────────────

added = []
for path in sorted(SRC.rglob("*.tsx")):
    s = path.read_text(encoding="utf-8")
    if not re.search(r"(?<![\w.])t\(", s):
        continue
    if re.search(r"import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*'[^']*i18n'", s):
        continue
    depth = len(path.relative_to(SRC).parts) - 1
    line = "import { t } from '" + "../" * depth + "i18n';"
    m = re.search(r"^import .*?;$", s, re.M)
    s = s[: m.end()] + "\n" + line + s[m.end():]
    path.write_text(s, encoding="utf-8")
    added.append(str(path.relative_to(SRC.parent)))
print(f"  1. module-level t import: {len(added)} 個檔案")


# ── 2. the type declaration's literal union ────────────────────────────────

p = SRC / "components/search/SearchBar.tsx"
s = p.read_text(encoding="utf-8")
s = s.replace("useState<VersionFilter>(t('全部'))", "useState<VersionFilter>('全部')")
s = re.sub(
    r"const versions: VersionFilter\[\] = \[([^\]]*)\];",
    lambda m: "const versions: VersionFilter[] = ["
    + re.sub(r"t\('([^']*)'\)", r"'\1'", m.group(1))
    + "];",
    s,
)
# The value is displayed through the table, so it is translated there.
s = s.replace(">{v}<", ">{t(v)}<")
p.write_text(s, encoding="utf-8")
print("  2. SearchBar: 類型 union 還原，顯示處翻譯")


# ── 3. a callback parameter called `t` ─────────────────────────────────────

def rename_map_param(text):
    out = text
    count = 0
    while True:
        m = re.search(r"\.map\(\s*\(\s*t\s*\)\s*=>\s*\{", out) or re.search(
            r"\.map\(\s*t\s*=>\s*\{", out
        )
        if not m:
            break
        start = m.end() - 1
        depth = 0
        i = start
        while i < len(out):
            if out[i] == "{":
                depth += 1
            elif out[i] == "}":
                depth -= 1
                if depth == 0:
                    break
            i += 1
        body = out[start: i + 1]
        new_body = re.sub(r"(?<![\w.$'\"`])t\b", "item", body)
        out = out[:start] + new_body + out[i + 1:]
        count += 1
    return out, count


renamed = 0
for path in sorted(SRC.rglob("*.tsx")):
    s = path.read_text(encoding="utf-8")
    if not re.search(r"\.map\(\s*\(?\s*t\s*\)?\s*=>\s*\{", s):
        continue
    new, n = rename_map_param(s)
    if n:
        path.write_text(new, encoding="utf-8")
        renamed += n
        print(f"     {path.relative_to(SRC.parent)}: {n} 個 map 參數改名")
print(f"  3. map 參數改名: {renamed} 處")


# ── 4. the constants built at module scope ─────────────────────────────────

# These keep their source text; the reading side translates them.
MODULES = {
    "screens/CheckoutScreen.tsx": ["const MTR_LINES = ["],
    "screens/FeatureShowcaseScreen.tsx": ["const FEATURES: FeatureCard[] = ["],
    "screens/SellerOnboardingScreen.tsx": ["const STATUS_TEXT: Record<Status"],
    "screens/trade/MyOffersScreen.tsx": ["const STATUS_CONFIG: Record<OfferStatus"],
}

for f, starts in MODULES.items():
    p = SRC / f
    s = p.read_text(encoding="utf-8")
    for start in starts:
        i = s.find(start)
        if i == -1:
            continue
        # The block runs to the line that closes it.
        j = s.index("\n];", i) + 3 if "\n];" in s[i:i + 6000] else s.index("};", i) + 2
        block = s[i:j]
        new_block = re.sub(r"(\b(?:title|label|body|tag|subtitle):\s*)t\('([^']*)'\)", r"\1'\2'", block)
        new_block = re.sub(r"(\[\s*)t\('([^']*)'\)", r"\1'\2'", new_block)
        new_block = re.sub(r",\s*t\('([^']*)'\)", r", '\1'", new_block)
        s = s[:i] + new_block + s[j:]
    p.write_text(s, encoding="utf-8")
    print(f"  4. {f}: 模組層常數還原")
