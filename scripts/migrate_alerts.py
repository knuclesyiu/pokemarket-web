#!/usr/bin/env python3
"""
Migrate `Alert.alert(...)` to the in-app feedback calls.

`Alert.alert` is a no-op on react-native-web, so every error and
every confirmation was invisible in the deployed web build. This
rewrites the call sites to `notify` / `confirmAction`.

The classification:
  - two arguments                      -> notify (a toast)
  - three arguments, one plain button  -> notify (an acknowledgement)
  - three arguments, anything else     -> confirmAction (a dialog that
                                          waits for a choice)

The parse is done by matching brackets rather than by pattern, so a
call whose arguments contain strings, template literals, nested calls
or trailing commas is still read correctly.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "src"

CALL = "Alert.alert("


def find_close(text, open_idx):
    """Index of the ')' matching the '(' at open_idx."""
    depth = 0
    i = open_idx
    while i < len(text):
        c = text[i]
        if c in "'\"`":
            quote = c
            i += 1
            while i < len(text) and text[i] != quote:
                if text[i] == "\\":
                    i += 1
                i += 1
        elif c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return i
        elif c == "/" and i + 1 < len(text) and text[i + 1] == "/":
            while i < len(text) and text[i] != "\n":
                i += 1
        i += 1
    return -1


def split_args(inner):
    """Split a call's arguments at the top level."""
    args, depth, cur, i = [], 0, "", 0
    while i < len(inner):
        c = inner[i]
        if c in "'\"`":
            quote = c
            cur += c
            i += 1
            while i < len(inner) and inner[i] != quote:
                cur += inner[i]
                if inner[i] == "\\":
                    i += 1
                    cur += inner[i]
                i += 1
            cur += quote if i < len(inner) else ""
        elif c in "([{":
            depth += 1
            cur += c
        elif c in ")]}":
            depth -= 1
            cur += c
        elif c == "," and depth == 0:
            args.append(cur.strip())
            cur = ""
        else:
            cur += c
        i += 1
    tail = cur.strip()
    if tail:
        args.append(tail)
    return args


def classify(args):
    """'notify' or 'confirmAction' for one call."""
    if len(args) <= 2:
        return "notify"
    third = args[2]
    # A single button with no callback is just an acknowledgement.
    if third.startswith("[") and third.endswith("]"):
        body = third[1:-1].strip()
        if body.count("{") == 1 and "onPress" not in body:
            return "notify"
    return "confirmAction"


def migrate(text):
    out = text
    changed = 0
    # Work backwards so the offsets of earlier calls stay valid.
    spans = []
    pos = 0
    while True:
        idx = out.find(CALL, pos)
        if idx == -1:
            break
        open_idx = idx + len(CALL) - 1
        close_idx = find_close(out, open_idx)
        if close_idx == -1:
            pos = idx + len(CALL)
            continue
        spans.append((idx, open_idx, close_idx))
        pos = close_idx

    for start, open_idx, close_idx in reversed(spans):
        inner = out[open_idx + 1 : close_idx]
        args = split_args(inner)
        fn = classify(args)
        if fn == "notify" and len(args) >= 3:
            # A single plain button is only an acknowledgement — it
            # becomes a toast, and the button has to go with it.
            inner = args[0] + ", " + args[1]
        out = out[:start] + f"{fn}(" + inner + ")" + out[close_idx + 1 :]
        changed += 1
    return out, changed


def rel_import_path(file: pathlib.Path):
    """Path from the file to src/components/Feedback."""
    rel = file.relative_to(SRC)
    depth = len(rel.parts) - 1  # minus the file name
    return "../" * depth + "components/Feedback"


total_calls = 0
touched = []

for file in sorted(SRC.rglob("*.tsx")) + sorted(SRC.rglob("*.ts")):
    text = file.read_text(encoding="utf-8")
    if CALL not in text:
        continue

    # A call can sit inside another call's arguments. Scanning stops at
    # the first closing bracket, so the nested one is only reached on a
    # later pass — keep going until nothing is left.
    new_text, n = text, 0
    while CALL in new_text:
        new_text, k = migrate(new_text)
        if k == 0:
            break
        n += k
    total_calls += n

    # Drop the Alert import if nothing else uses it.
    if re.search(r"\bAlert\b", new_text.replace("Alert.alert", "")):
        pass  # still referenced elsewhere — leave the import alone
    else:
        new_text = re.sub(r"\bAlert,\s*", "", new_text)
        new_text = re.sub(r",\s*Alert\b", "", new_text)
        new_text = re.sub(r"\{\s*Alert\s*\}", "{}", new_text)

    # Add the import for the calls this file now makes.
    needed = []
    if re.search(r"\bnotify\(", new_text):
        needed.append("notify")
    if re.search(r"\bconfirmAction\(", new_text):
        needed.append("confirmAction")
    if needed:
        imp = f"import {{ {', '.join(sorted(needed))} }} from '{rel_import_path(file)}';"
        if imp not in new_text:
            # Put it after the last existing import.
            lines = new_text.split("\n")
            last_import = -1
            for i, line in enumerate(lines):
                if line.startswith("import ") or line.startswith("} from "):
                    last_import = i
            insert_at = last_import + 1 if last_import >= 0 else 0
            lines.insert(insert_at, imp)
            new_text = "\n".join(lines)

    file.write_text(new_text, encoding="utf-8")
    touched.append((file.relative_to(ROOT), n))

print(f"  遷移咗 {total_calls} 個 Alert.alert，涉��� {len(touched)} 個檔案:")
for f, n in touched:
    print(f"    {n:3d}  {f}")
