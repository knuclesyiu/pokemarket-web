#!/usr/bin/env python3
"""
Rewrite the two Airwallex probes to the shapes the API actually accepts.

The payout probe used to open a connected account and then a
beneficiary before moving money. Airwallex takes the beneficiary with
the transfer, and our account cannot open a connected account for an
individual seller, so both steps are gone: the seller's details go
with the transfer.

The collection probe's cancel needs a request id, which it did not
send.

Run it from the repository root.
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent

# ── the payout probe ──────────────────────────────────────────────────
p = ROOT / "scripts/airwallex_payout_probe.mjs"
s = p.read_text(encoding="utf-8")

# 換掉整個「開收款帳戶 + 收款人」段落
start = s.find("// ── 2.")
end = s.find("// ── 4.") if "// ── 4." in s else s.find("// ── 3.")
assert start != -1 and end != -1, "payout probe sections"

block = """// ── 2. 出款（beneficiary 內嵌，唔使開收款帳戶）────
const transfer = await call('/api/v1/transfers/create', {
  transfer_amount: 100000, // HK$1,000.00 in the minor unit
  source_currency: 'HKD',
  transfer_currency: 'HKD',
  transfer_method: 'LOCAL',
  request_id: `probe-${Date.now()}`,
  reason: 'PokeMarket 出款探測',
  reference: `PM-PROBE-${Date.now()}`,
  beneficiary: {
    entity_type: 'PERSONAL',
    bank_details: {
      account_name: 'Test Seller',
      account_currency: 'HKD',
      bank_country_code: 'HK',
      local_clearing_system: 'FPS',
      account_routing_type1: 'phone_number',
      account_routing_value1: '+852-91234567',
    },
  },
});
const transferId = transfer?.id;
console.log(
  transferId
    ? `  ✅ 出款 request 被接受 — id=${transferId} status=${transfer.status} ` +
        `recipient=${transfer.amount_beneficiary_receives} ` +
        `payer=${transfer.amount_payer_pays} fee=${transfer.fee_amount}`
    : `  ❌ 出款 request 被拒絕 — ${JSON.stringify(transfer).slice(0, 220)}`,
);

if (transferId) {
  const read = await call(`/api/v1/transfers/${transferId}`, undefined, 'GET');
  console.log(
    read?.id
      ? `  ✅ 讀得返出款單 — status=${read.status} date=${read.transfer_date}`
      : `  ❌ 讀唔返出款單 — ${JSON.stringify(read).slice(0, 160)}`,
  );
}

"""
s = s[:start] + block + s[end:]
# 結果統計：而家淨係得一個步驟
s = re.sub(r"const results = \[\];", "const results = [];", s)
p.write_text(s, encoding="utf-8")
print("  ✅ airwallex_payout_probe.mjs 改成內嵌 beneficiary")

# ── the collection probe: the cancel needs a request id ───────────────
p = ROOT / "scripts/airwallex_collection_probe.mjs"
s = p.read_text(encoding="utf-8")
before = s
s = re.sub(
    r"(/api/v1/pa/payment_intents/\$\{[^}]+\}/cancel',\s*\{)",
    r"\1 request_id: `probe-cancel-${Date.now()}`, ",
    s,
)
if s == before:
    # 另一種寫法：body 係一個空物件
    s = re.sub(
        r"(/api/v1/pa/payment_intents/\$\{[^}]+\}/cancel',\s*)\{\s*\}",
        r"\1{ request_id: `probe-cancel-${Date.now()}` }",
        s,
    )
p.write_text(s, encoding="utf-8")
print("  ✅ airwallex_collection_probe.mjs: cancel 加咗 request_id")
