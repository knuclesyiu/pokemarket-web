#!/usr/bin/env bash
# Read the Airwallex sandbox client ID and store it without echoing it.
#
# The client ID arrives at the terminal, not into the chat: `read -s`
# keeps it off the screen, and the value is written by a script so it
# never appears in a command line or in the shell history.
#
# Usage:
#   bash scripts/set_airwallex_sandbox_client.sh
#
set -euo pipefail

ENV_FILE="${HOME}/.hermes/secrets/airwallex-pokemarket.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "  搵唔到 $ENV_FILE" >&2
  exit 1
fi

read -r -s -p "Airwallex sandbox client ID: " CLIENT_ID
echo

if [ -z "${CLIENT_ID}" ]; then
  echo "  冇輸入到嘢，冇改過。" >&2
  exit 1
fi

export CLIENT_ID
python3 - "$ENV_FILE" <<'PY'
import os
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
value = os.environ["CLIENT_ID"]

if "AIRWALLEX_SANDBOX_CLIENT_ID=" in text:
    text = re.sub(
        r"^AIRWALLEX_SANDBOX_CLIENT_ID=.*$",
        f"AIRWALLEX_SANDBOX_CLIENT_ID={value}",
        text,
        flags=re.M,
    )
else:
    text = text.rstrip("\n") + f"\nAIRWALLEX_SANDBOX_CLIENT_ID={value}\n"

path.write_text(text, encoding="utf-8")
print(f"  存咗（{len(value)} chars，值冇顯示）")
PY

chmod 600 "$ENV_FILE"

# 驗證：行得唔行得
if [ -f "${HOME}/.hermes/secrets/airwallex-pokemarket.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ENV_FILE"
  set +a
  if [ -n "${AIRWALLEX_SANDBOX_CLIENT_ID:-}" ] && [ -n "${AIRWALLEX_SANDBOX_API_KEY:-}" ]; then
    echo "  ✅ sandbox client ID + API key 齊咗"
  else
    echo "  ⚠️ 仲有嘢唔齊" >&2
  fi
fi
