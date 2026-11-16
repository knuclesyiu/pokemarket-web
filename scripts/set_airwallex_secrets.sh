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

for name in AIRWALLEX_CLIENT_ID AIRWALLEX_API_KEY; do
  printf '%s' "${!name}" | firebase functions:secrets:set "$name" --project "$PROJECT" >/dev/null
  echo "  ✔ $name 已推上 Secret Manager"
done

echo "  記得 deploy 一次，秘密先會綁到 function："
echo "    cd functions && firebase deploy --only functions --project $PROJECT"
