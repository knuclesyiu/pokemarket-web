#!/usr/bin/env bash
# Set the Stripe secrets on the deployed Firebase project.
#
# The keys never go into a chat message and never get committed. This
# script reads them from a local file and hands them to the Firebase
# CLI, which stores them as encrypted project secrets.
#
#   1. Create a Stripe account and copy the secret key from
#      https://dashboard.stripe.com/apikeys
#   2. Create a webhook endpoint pointing at
#      https://us-central1-pokemarket-255c6.cloudfunctions.net/stripeWebhook
#      and copy its signing secret (whsec_...)
#   3. Put both into a file (chmod 600) and run:
#
#        bash scripts/setup_stripe_secrets.sh /path/to/stripe-secrets.txt
#
# The file format is one KEY=VALUE per line:
#
#   STRIPE_SECRET_KEY=sk_test_...
#   STRIPE_WEBHOOK_SECRET=whsec_...

set -euo pipefail

PROJECT="pokemarket-255c6"
SECRETS_FILE="${1:-}"
CLI="$HOME/.npm-global/bin/firebase"

if [ -z "$SECRETS_FILE" ]; then
  echo "usage: bash scripts/setup_stripe_secrets.sh <file with KEY=VALUE lines>" >&2
  exit 1
fi
if [ ! -f "$SECRETS_FILE" ]; then
  echo "no such file: $SECRETS_FILE" >&2
  exit 1
fi

for key in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET; do
  value=$(grep -E "^${key}=" "$SECRETS_FILE" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  if [ -z "$value" ]; then
    echo "  ❌ $key is missing from $SECRETS_FILE" >&2
    exit 1
  fi
  # The value goes straight into the CLI through a pipe — it is never
  # passed on a command line, where it would land in the shell history.
  printf '%s' "$value" | "$CLI" functions:secrets:set "$key" --project "$PROJECT" >/dev/null
  echo "  ✅ $key set"
done

echo
echo "  Redeploying the functions so the new secrets are bound:"
"$CLI" deploy --only functions --project "$PROJECT" --non-interactive 2>&1 | grep -E "✔ Deploy complete|Error" | sed 's/^/    /'

echo
echo "  Check the webhook endpoint answers:"
printf '  %s\n' \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST "https://us-central1-${PROJECT}.cloudfunctions.net/stripeWebhook")  ← 400 is correct: it means the endpoint is live and the signature was missing"
