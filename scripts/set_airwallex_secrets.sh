#!/usr/bin/env bash
# Push the Airwallex credentials into Firebase Secret Manager.
#
# The credentials never appear in a command line, so they never land in
# the shell history or in the process list.
set -euo pipefail

ENV_FILE="${1:-$HOME/.hermes/secrets/airwallex-pokemarket.env}"
PROJECT="${2:-pokemarket-255c6}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "搵唔到憑證檔：$ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${AIRWALLEX_CLIENT_ID:-}" || -z "${AIRWALLEX_API_KEY:-}" ]]; then
  echo "憑證檔入面 AIRWALLEX_CLIENT_ID / AIRWALLEX_API_KEY 未填" >&2
  exit 1
fi

# The webhook secret is optional: without it the webhook still works,
# but every event is unsigned and the handler says so in the log.
if [[ -z "${AIRWALLEX_WEBHOOK_SECRET:-}" ]]; then
  echo "  ! AIRWALLEX_WEBHOOK_SECRET 未填 —— webhook 會冇簽名驗證" >&2
fi

for name in AIRWALLEX_CLIENT_ID AIRWALLEX_API_KEY AIRWALLEX_WEBHOOK_SECRET; do
  printf '%s' "${!name}" | firebase functions:secrets:set "$name" --project "$PROJECT" >/dev/null
  echo "  ✔ $name 已推上 Secret Manager"
done

# The sandbox pair is optional: it only exists once someone has
# created a sandbox account. It is kept separately so a test never
# reaches the production merchant.
if [[ -n "${AIRWALLEX_SANDBOX_CLIENT_ID:-}" && -n "${AIRWALLEX_SANDBOX_API_KEY:-}" ]]; then
  for name in AIRWALLEX_SANDBOX_CLIENT_ID AIRWALLEX_SANDBOX_API_KEY; do
    printf '%s' "${!name}" | firebase functions:secrets:set "$name" --project "$PROJECT" >/dev/null
    echo "  ✔ $name 已推上 Secret Manager"
  done
else
  echo "  · 冇 sandbox 憑證 —— 跳過（測試可以直接行 scripts/airwallex_*_probe.mjs）"
fi

echo "  記得 deploy 一次，秘密先會綁到 function："
echo "    cd functions && firebase deploy --only functions --project $PROJECT"
