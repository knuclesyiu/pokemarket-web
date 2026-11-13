#!/usr/bin/env bash
#
# Deploy PokeMarket and verify it against the live project.
#
# Run this after `firebase login`. It deploys the functions, the rules
# and the indexes, then probes the live project to prove the
# deployment actually took — a successful deploy command is not the
# same claim as a working backend.
#
# The probe is the part that matters. The repo was green for a long
# time while the deployed functions could not even load.

set -uo pipefail

PROJECT="pokemarket-255c6"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIREBASE="${FIREBASE_BIN:-/home/user/.npm-global/bin/firebase}"

cd "$ROOT" || exit 1

echo "════════ 1. 檢查登入狀態"
if ! "$FIREBASE" projects:list 2>/dev/null | grep -q "$PROJECT"; then
  echo "  未登入 —— 請先執行："
  echo "    $FIREBASE login"
  exit 1
fi
echo "  ✅ 已登入，project $PROJECT"

echo
echo "════════ 2. 確保 functions 係最新編譯"
(cd functions && npm run build) || exit 1

echo
echo "════════ 3. 部署 functions + rules + indexes"
"$FIREBASE" deploy \
  --only functions,firestore:rules,firestore:indexes \
  --project "$PROJECT" || exit 1

echo
echo "════════ 4. 線上探測（真實項目，唔係 repo）"
node scripts/probe_deployed.mjs || exit 1

echo
echo "════════ 5. Push 到 GitHub"
if gh auth status >/dev/null 2>&1; then
  git push origin flat-public && echo "  ✅ 已 push"
else
  echo "  ⚠️  gh 未登入 —— 執行 gh auth login 之後再 push"
fi

echo
echo "完成。"
