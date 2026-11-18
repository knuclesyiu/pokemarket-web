#!/usr/bin/env python3
"""
Write the static copy of the public page.

The app's public page needs the app's javascript to run. A payment
provider's review does not always run javascript, so the hosting also
serves a plain HTML copy of the same text at /legal.html.

The business details are read from src/config/business.ts so the two
copies cannot drift apart on the details that matter — the company
name, the registration number, the address and the contact numbers.

The prose lives in this file. When it changes, change it here and in
src/screens/PublicInfoScreen.tsx.

Run it from the repository root.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONFIG = ROOT / "src/config/business.ts"
OUT = ROOT / "public/legal.html"


def business_values() -> dict:
    text = CONFIG.read_text(encoding="utf-8")
    values = {}
    for key in (
        "companyName",
        "registrationNumber",
        "address",
        "supportEmail",
        "supportPhone",
        "siteUrl",
        "governingLaw",
    ):
        m = re.search(rf"{key}:\s*'([^']*)'", text)
        values[key] = m.group(1) if m else ""
    return values


SECTIONS = [
    (
        "About PokeMarket",
        [
            "PokeMarket is a Hong Kong marketplace for second-hand Pokémon trading "
            "cards, operated by Ming Tai Advisory Limited. The aim is simple: let "
            "collectors trade cards with confidence, without worrying about "
            "counterfeit cards or sellers who disappear.",
            "The platform offers live global price references, offers between buyers "
            "and sellers, escrow-protected trades, and an interface in Traditional "
            "Chinese, Simplified Chinese and English.",
        ],
    ),
    (
        "What we sell",
        [
            "Second-hand Pokémon trading cards (Pokémon TCG) — Japanese, Chinese and "
            "English editions. Price data comes from TCGdex and refreshes every six "
            "hours, as a reference for pricing.",
            "Buyers check the price, the photos and the reviews before buying or "
            "making an offer. Sellers list their own cards and set the delivery "
            "method and fee.",
        ],
    ),
    (
        "How to buy",
        [
            "1. Create an account (phone, email or Google) and set a transaction PIN.",
            "2. Browse the prices on the home screen, or search by name, series or "
            "rarity, and open a card for its details, condition and live listings.",
            "3. Tap Buy now to take it, or make an offer and wait for the seller to "
            "accept.",
            "4. Pay. The money is collected by the payment provider (Visa, "
            "Mastercard or FPS) and held by the platform — the seller is not paid yet.",
            "5. The seller ships the card (or you meet up), and you confirm receipt "
            "in your orders.",
            "6. Only once you confirm receipt does the platform release the money to "
            "the seller, who can withdraw it to their own bank account from the "
            "wallet.",
        ],
    ),
    (
        "Payment methods",
        [
            "Visa, Mastercard and FPS. The processing fee and the platform service "
            "fee are shown before you pay — there are no extra charges that appear "
            "afterwards.",
            "You are never redirected to an external site to pay: every payment "
            "happens on PokeMarket or on the payment provider's own payment page.",
        ],
    ),
    (
        "Shipping & Refund Policy",
        [
            "Delivery: a seller can offer SF Express cash on delivery or a meet-up. "
            "With SF Express the buyer pays the freight, and the amount is listed "
            "before you order. A meet-up has no freight.",
            "Receipt: when the card arrives, press Confirm receipt on the order. "
            "Until you do, the money stays with the platform and the seller is not "
            "paid.",
            "Returns: if the card you received does not match the description — a "
            "different card, a counterfeit, or serious damage — raise a dispute on "
            "the order within 7 days of purchase. We hold the money while it is "
            "sorted out.",
            "Return freight: if the seller is at fault — wrong card, or a condition "
            "that does not match the description — the seller pays the return "
            "freight. If the buyer is at fault — bought and no longer wants it — the "
            "buyer pays. While a dispute is open neither side is paid.",
            "Refunds: once a return is agreed, the refund goes back to the original "
            "payment method. Card refunds usually take 5–10 business days depending "
            "on the issuing bank; FPS refunds 1–3 business days.",
        ],
    ),
    (
        "Terms and Conditions",
        [
            "PokeMarket is a marketplace where buyers and sellers deal with each "
            "other directly. The platform provides escrow-protected payments, price "
            "data and messaging, but it does not certify the authenticity or value of "
            "any card — judge by the stated condition and ask questions before you "
            "commit.",
            "Sellers must be entitled to sell the cards they list — genuine cards, "
            "official Sending cards, or goods they are authorised to resell.",
            "Any fraud, counterfeit cards, money laundering or breach of Hong Kong "
            "law leads us to freeze the account and the funds immediately, and to "
            "report it to the police or a regulator.",
        ],
    ),
    (
        "Privacy Policy",
        [
            "We collect only what the service needs: your account details (phone or "
            "email), your transaction history, your payout details if you sell, and "
            "the device and sign-in records that keep the trading safe.",
            "Your payout identifier — an FPS phone number, say — is stored encrypted "
            "and masked in the app; only the last four characters are shown.",
            "We do not sell your personal data. It is shared only with the payment "
            "providers (Stripe, Airwallex) to collect and pay out, or with regulators "
            "where the law requires it.",
            "You can ask us at any time to show, correct or delete your account data. "
            "Email or call us.",
        ],
    ),
]

CSS = """
:root {
  color-scheme: light dark;
  --bg: #0f0f1a;
  --card: #17172b;
  --text: #f2f2f7;
  --muted: #a0a0b4;
  --line: #2a2a50;
  --accent: #ffd166;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #f7f7fb;
    --card: #ffffff;
    --text: #16162a;
    --muted: #5a5a70;
    --line: #e2e2ea;
    --accent: #8a6d1f;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans HK",
    "PingFang HK", "Microsoft JhengHei", sans-serif;
  line-height: 1.6;
}
main { max-width: 780px; margin: 0 auto; padding: 32px 20px 64px; }
header { border-bottom: 1px solid var(--line); padding-bottom: 20px; margin-bottom: 24px; }
h1 { font-size: 28px; margin: 0 0 6px; letter-spacing: -0.02em; }
.tagline { color: var(--muted); margin: 0; }
section {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 20px 22px;
  margin-bottom: 16px;
}
h2 { font-size: 18px; margin: 0 0 10px; }
p { margin: 0 0 10px; color: var(--muted); }
p:last-child { margin-bottom: 0; }
dl { display: grid; grid-template-columns: minmax(140px, max-content) 1fr; gap: 6px 18px; margin: 0; }
dt { color: var(--muted); font-size: 14px; }
dd { margin: 0; font-size: 14px; }
a { color: var(--accent); }
footer { color: var(--muted); font-size: 13px; margin-top: 24px; border-top: 1px solid var(--line); padding-top: 16px; }
"""


def main() -> int:
    b = business_values()
    if not b["companyName"]:
        print("  搵唔到 business values", file=sys.stderr)
        return 1

    detail_rows = [
        ("Company name", b["companyName"]),
        ("Business registration number", b["registrationNumber"]),
        ("Company address", b["address"]),
        ("Contact email", b["supportEmail"]),
        ("Contact phone", b["supportPhone"]),
        ("Payment methods", "Visa · Mastercard · FPS (轉數快)"),
        ("Governing law", b["governingLaw"]),
    ]
    details = "\n".join(
        f"    <dt>{label}</dt>\n    <dd>{value}</dd>" for label, value in detail_rows
    )

    sections = []
    for title, paragraphs in SECTIONS:
        body = "\n".join(f"    <p>{p}</p>" for p in paragraphs)
        sections.append(f"  <section>\n    <h2>{title}</h2>\n{body}\n  </section>")

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>About PokeMarket — second-hand Pokémon card marketplace, Hong Kong</title>
<meta name="description" content="PokeMarket is a Hong Kong marketplace for second-hand Pokémon trading cards, operated by Ming Tai Advisory Limited. Escrow-protected trades, live card prices, sellers paid by FPS.">
<link rel="canonical" href="{b['siteUrl']}/legal.html">
<style>{CSS}</style>
</head>
<body>
<main>
  <header>
    <h1>PokeMarket</h1>
    <p class="tagline">A Hong Kong marketplace for second-hand Pokémon trading cards — operated by {b['companyName']}.</p>
  </header>

  <section>
    <h2>Business details</h2>
    <dl>
{details}
    </dl>
  </section>

{chr(10).join(sections)}

  <footer>
    <p>© {b['companyName']}. Registered in Hong Kong. Governed by the laws of the {b['governingLaw']}.</p>
    <p><a href="{b['siteUrl']}">Open PokeMarket</a> · <a href="{b['siteUrl']}/legal.html">About, terms and policies</a></p>
  </footer>
</main>
</body>
</html>
"""

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"  ✅ 寫咗 {OUT.relative_to(ROOT)}（{len(html)} bytes）")
    if "TO BE CONFIRMED" in html:
        print("  ! 仲有 'TO BE CONFIRMED' —— 商業登記號碼同地址要填")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
