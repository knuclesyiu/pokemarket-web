#!/usr/bin/env python3
"""
Replace the emoji used as icons with vector icons.

An emoji in an icon position is drawn by the platform's emoji font:
a different glyph, a different size and a different colour on every
device, and it cannot be tinted. The tab bar and the search field
already moved to `@expo/vector-icons`; this does the rest.

Three shapes are handled:

  <Text style={X}>🎴</Text>            -> a bare <Ionicons>
  <Text style={X}>🎯 目標卡片</Text>   -> an icon beside the text
  '🎴 掛牌中'                          -> the emoji is dropped and the
                                         text kept, because it is part
                                         of a sentence rather than an
                                         icon

Only the emoji in the table below are touched. An emoji that is
genuinely part of a message ("✅ Offer 已發出！") keeps its meaning as
text — but the ones in the table are icon positions.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "src"

# emoji -> (icon name, default size)
ICONS = {
    "🎴": ("card-outline", 22),
    "🎯": ("albums-outline", 15),
    "💬": ("chatbubble-ellipses-outline", 15),
    "🔍": ("search-outline", 16),
    "🌐": ("globe-outline", 13),
    "🔒": ("lock-closed-outline", 13),
    "🔓": ("lock-open-outline", 13),
    "💰": ("wallet-outline", 15),
    "📊": ("stats-chart-outline", 15),
    "📈": ("trending-up-outline", 13),
    "📉": ("trending-down-outline", 15),
    "⚖️": ("swap-horizontal-outline", 13),
    "⚠️": ("warning-outline", 16),
    "🛡️": ("shield-checkmark-outline", 15),
    "👤": ("person-outline", 14),
    "🛒": ("cart-outline", 14),
    "🏠": ("home-outline", 14),
    "🏆": ("trophy-outline", 14),
    "⭐": ("star-outline", 12),
    "⚙️": ("settings-outline", 16),
    "🏷️": ("pricetag-outline", 14),
    "📋": ("list-outline", 15),
    "⏰": ("time-outline", 13),
    "☑️": ("checkbox-outline", 14),
    "🔔": ("notifications-outline", 18),
    "👍": ("thumbs-up", 12),
    "👎": ("thumbs-down", 12),
    "🚀": ("rocket-outline", 14),
    "✅": ("checkmark-circle", 14),
    "❌": ("close-circle", 14),
    "⏳": ("time-outline", 14),
    "📎": ("attach-outline", 14),
    "🕐": ("time-outline", 14),
    "👋": (None, 0),
    "🏷": ("pricetag-outline", 14),
    "📱": ("phone-portrait-outline", 15),
    "💼": ("briefcase-outline", 15),
    "🛍": ("bag-handle-outline", 14),
    "⚙": ("settings-outline", 16),
    "⚠": ("warning-outline", 16),
    "☑": ("checkbox-outline", 14),
}

# A Text whose whole content is one emoji.
BARE = re.compile(
    r"<Text([^>]*?)>(\s*)(" + "|".join(re.escape(e) for e in ICONS) + r")(\s*)</Text>"
)
# A Text that starts with an emoji and continues with words.
LEADING = re.compile(
    r"<Text([^>]*?)>(\s*)(" + "|".join(re.escape(e) for e in ICONS) + r")(\s+)([^<]+?)</Text>"
)
# An emoji inside a string literal.
IN_LITERAL = re.compile(
    r"(['\"])" + "(" + "|".join(re.escape(e) for e in ICONS) + r")" + r"\s*"
)

changed_files = 0
total = 0

for file in sorted(list(SRC.rglob("*.tsx"))):
    text = file.read_text(encoding="utf-8")
    original = text
    n = 0

    def bare(m):
        """<Text style={X}>EMOJI</Text> -> a bare icon.

        The Text's own fontSize is the icon's size when it has one —
        a placeholder that asked for 50pt wants a 50pt icon, not the
        default. The Text's colour is dropped: an icon takes its
        colour from the `color` prop.
        """
        global n
        attrs, pre, emo, post = m.group(1), m.group(2), m.group(3), m.group(4)
        name, size = ICONS[emo]
        n += 1
        if name is None:
            return ""
        fs = re.search(r"fontSize:\s*(\d+)", attrs)
        if fs:
            size = int(fs.group(1))
        return (
            f"<Ionicons name=\"{name}\" size={{{size}}} "
            f"color={{C.textTertiary}} />"
        )

    def leading(m):
        global n
        attrs, pre, emo, sp, rest = m.groups()
        name, size = ICONS[emo]
        n += 1
        if name is None:
            return f"<Text{attrs}>{rest}</Text>"
        return (
            f"<View style={{{{ flexDirection: 'row', alignItems: 'center', gap: 6 }}}}>"
            f"<Ionicons name=\"{name}\" size={{{size}}} color={{C.textTertiary}} />"
            f"<Text{attrs}>{rest}</Text></View>"
        )

    def literal(m):
        global n
        quote, emo = m.group(1), m.group(2)
        n += 1
        if ICONS[emo][0] is None:
            return quote
        return quote

    text = LEADING.sub(leading, text)
    text = BARE.sub(bare, text)
    text = IN_LITERAL.sub(literal, text)

    if text != original:
        # The file needs Ionicons and the theme.
        if "from '@expo/vector-icons'" not in text:
            lines = text.split("\n")
            last = -1
            for i, line in enumerate(lines):
                if line.startswith("import ") or line.startswith("} from "):
                    last = i
            lines.insert(last + 1, "import { Ionicons } from '@expo/vector-icons';")
            text = "\n".join(lines)
        if "theme" not in text.split("const")[0] and "from '../theme'" not in text and "from '../../theme'" not in text:
            rel = file.relative_to(SRC)
            depth = len(rel.parts) - 1
            lines = text.split("\n")
            last = -1
            for i, line in enumerate(lines):
                if line.startswith("import ") or line.startswith("} from "):
                    last = i
            lines.insert(last + 1, f"import {{ C }} from '{'../' * depth}theme';")
            text = "\n".join(lines)
        file.write_text(text, encoding="utf-8")
        changed_files += 1
        total += n
        print(f"  {n:3d}  {file.relative_to(ROOT)}")

print(f"  合共 {total} 處，{changed_files} 個檔案")
