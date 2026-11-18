#!/usr/bin/env python3
"""
Write the public website.

A payment provider reviews the site before it activates a payment
method, and it checks that the site carries the business's own details
and its policies. It also reads like a marketplace, not a login form,
so this is a proper page: a header, a hero, what we sell, how a trade
works, the policies, the business details and a way to get in touch.

The business details come from src/config/business.ts so the app and
this page cannot disagree about the company name, the registration
number, the address or the contact details.

Run it from the repository root.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONFIG = ROOT / "src/config/business.ts"
OUT = ROOT / "public/about.html"
# Kept as an alias: the older link still works.
ALIAS = ROOT / "public/legal.html"

CONTACT_ENDPOINT = "/contactInquiry"


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


CSS = """
:root {
  color-scheme: dark;
  --bg: #0c0c16;
  --bg2: #12121f;
  --card: #16162a;
  --line: #26264a;
  --text: #f3f3f8;
  --muted: #9c9cb4;
  --gold: #ffd166;
  --goldDim: #6b5620;
  --radius: 16px;
  --shadow: 0 18px 40px -24px rgba(0,0,0,.8);
}
@media (prefers-color-scheme: light) {
  :root {
    color-scheme: light;
    --bg: #f6f6fa;
    --bg2: #eeeef5;
    --card: #ffffff;
    --line: #e3e3ec;
    --text: #14142a;
    --muted: #5c5c74;
    --gold: #9a6f00;
    --goldDim: #f3e6c4;
    --shadow: 0 14px 34px -26px rgba(20,20,42,.45);
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans HK",
    "PingFang HK", "Microsoft JhengHei", system-ui, sans-serif;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; }
.wrap { max-width: 1080px; margin: 0 auto; padding: 0 22px; }

header.site {
  position: sticky; top: 0; z-index: 20;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}
.nav { display: flex; align-items: center; gap: 26px; height: 64px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 800; letter-spacing: -.02em; font-size: 17px; }
.brand .dot { width: 26px; height: 26px; border-radius: 8px; background: linear-gradient(135deg, var(--gold), #e08a3c); }
.nav ul { display: flex; gap: 22px; list-style: none; margin: 0; padding: 0; margin-left: auto; }
.nav a { color: var(--muted); text-decoration: none; font-size: 14px; font-weight: 600; }
.nav a:hover { color: var(--text); }
.nav .cta { color: #14142a; background: var(--gold); padding: 9px 16px; border-radius: 999px; }
.nav .company { font-size: 12.5px; color: var(--muted); margin-left: 2px; }
@media (max-width: 900px) { .nav .company { display: block; } }
@media (max-width: 900px) { .nav ul { display: none; } }

.hero { padding: 78px 0 56px; position: relative; overflow: hidden; }
.hero::after {
  content: ""; position: absolute; inset: -40% 30% auto -10%; height: 420px;
  background: radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--gold) 22%, transparent), transparent 62%);
  pointer-events: none;
}
.eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 12px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase;
  color: var(--gold); border: 1px solid var(--line); border-radius: 999px; padding: 6px 13px;
  background: var(--card);
}
h1 { font-size: clamp(34px, 6vw, 56px); line-height: 1.1; letter-spacing: -.035em; margin: 20px 0 16px; max-width: 17ch; }
.lead { font-size: clamp(16px, 2.2vw, 19px); color: var(--muted); max-width: 56ch; margin: 0 0 26px; }
.buttons { display: flex; flex-wrap: wrap; gap: 12px; }
.btn {
  display: inline-flex; align-items: center; gap: 8px; text-decoration: none;
  font-weight: 700; font-size: 15px; padding: 13px 24px; border-radius: 12px;
  border: 1px solid var(--line); background: var(--card); color: var(--text);
}
.btn.primary { background: var(--gold); border-color: var(--gold); color: #14142a; }
.btn:hover { transform: translateY(-1px); }

.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-top: 46px; }
.stat { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 20px; }
.stat b { display: block; font-size: 26px; letter-spacing: -.02em; }
.stat span { color: var(--muted); font-size: 13px; }

section.block { padding: 58px 0; }
h2 { font-size: clamp(24px, 3.4vw, 32px); letter-spacing: -.025em; margin: 0 0 10px; }
.sub { color: var(--muted); margin: 0 0 28px; max-width: 62ch; }
.card {
  background: var(--card); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 24px; box-shadow: var(--shadow);
}
.grid3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; }
.grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
.feature h3 { margin: 14px 0 6px; font-size: 17px; }
.feature p { margin: 0; color: var(--muted); font-size: 14.5px; }
.ico {
  width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center;
  background: color-mix(in srgb, var(--gold) 16%, transparent); color: var(--gold); font-size: 19px;
}
.steps { counter-reset: s; display: grid; gap: 14px; }
.step { display: flex; gap: 16px; align-items: flex-start; }
.step::before {
  counter-increment: s; content: counter(s);
  flex: 0 0 32px; height: 32px; border-radius: 50%;
  display: grid; place-items: center; font-weight: 800; font-size: 14px;
  background: color-mix(in srgb, var(--gold) 18%, transparent); color: var(--gold);
}
.step b { display: block; margin-bottom: 2px; }
.step p { margin: 0; color: var(--muted); font-size: 14.5px; }

.policy-layout { display: grid; grid-template-columns: 230px 1fr; gap: 28px; align-items: start; }
@media (max-width: 860px) { .policy-layout { grid-template-columns: 1fr; } }
.policy-nav { position: sticky; top: 84px; display: grid; gap: 2px; }
.policy-nav a {
  text-decoration: none; color: var(--muted); font-size: 14px; font-weight: 600;
  padding: 9px 13px; border-radius: 10px;
}
.policy-nav a:hover { background: var(--card); color: var(--text); }
.policy h3 { font-size: 19px; margin: 0 0 10px; }
.policy p { color: var(--muted); margin: 0 0 11px; }
.policy em { color: var(--text); font-style: normal; font-weight: 700; }

.contact-form { display: grid; gap: 13px; }
label { font-size: 13.5px; font-weight: 700; color: var(--muted); display: grid; gap: 6px; }
input, textarea {
  font: inherit; font-size: 15px; color: var(--text); background: var(--bg2);
  border: 1px solid var(--line); border-radius: 11px; padding: 12px 14px; width: 100%;
}
input:focus, textarea:focus { outline: 2px solid color-mix(in srgb, var(--gold) 55%, transparent); outline-offset: 1px; }
textarea { min-height: 120px; resize: vertical; }
.formnote { font-size: 13px; color: var(--muted); }
.formstatus { font-size: 14px; font-weight: 700; }
.formstatus.ok { color: #35c07a; }
.formstatus.err { color: #e2603f; }

footer.site { border-top: 1px solid var(--line); margin-top: 40px; padding: 30px 0 44px; color: var(--muted); font-size: 13.5px; }
footer.site .wrap { display: flex; flex-wrap: wrap; gap: 14px; justify-content: space-between; }
.badge { display: inline-flex; gap: 8px; align-items: center; border: 1px solid var(--line); border-radius: 999px; padding: 5px 12px; font-size: 12.5px; }
"""

JS = """
const form = document.getElementById('contactForm');
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = document.getElementById('formStatus');
    const button = form.querySelector('button[type=submit]');
    status.className = 'formstatus';
    status.textContent = 'Sending...';
    button.disabled = true;
    try {
      const res = await fetch(form.dataset.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.value.trim(),
          email: form.email.value.trim(),
          message: form.message.value.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Something went wrong.');
      status.className = 'formstatus ok';
      status.textContent = 'Thank you - we will reply to you by email.';
      form.reset();
    } catch (err) {
      status.className = 'formstatus err';
      status.textContent = 'Could not send: ' + err.message;
    } finally {
      button.disabled = false;
    }
  });
}
"""

FEATURES = [
    (
        "🃏",
        "Second-hand Pokémon TCG",
        "Japanese, Chinese and English editions. Every card is listed by a collector with its condition stated up front.",
    ),
    (
        "📈",
        "Live market prices",
        "Price references from TCGdex, refreshed every six hours, so you can tell whether a deal is fair before you commit.",
    ),
    (
        "🤝",
        "Offers and negotiation",
        "Buy outright or make an offer and negotiate. The card's price history and the seller's reviews sit on the same page.",
    ),
    (
        "🛡️",
        "Escrow on every trade",
        "The money is collected by a payment provider and held by the platform. The seller is paid only after you confirm the card arrived.",
    ),
    (
        "🚚",
        "Your choice of delivery",
        "SF Express cash on delivery with the freight listed before you order, or a meet-up with no freight at all.",
    ),
    (
        "🌏",
        "Three languages",
        "Traditional Chinese, Simplified Chinese and English throughout the app.",
    ),
]

STEPS = [
    ("Create an account", "Phone, email or Google, and set a transaction PIN."),
    ("Find a card", "Browse the prices, or search by name, series or rarity. Every card page shows its condition and the live listings."),
    ("Buy or offer", "Take it at the asking price, or make an offer and wait for the seller to accept."),
    ("Pay securely", "Visa, Mastercard or FPS. The money is held by the platform, not passed to the seller."),
    ("Receive the card", "SF Express or a meet-up. Confirm receipt in your orders when it arrives."),
    ("Seller gets paid", "Only then is the money released, and the seller withdraws it to their own bank account."),
]

POLICIES = [
    (
        "payment",
        "Payment methods",
        [
            "Visa, Mastercard and FPS (轉數快) are accepted.",
            "The processing fee and the platform service fee are shown before you pay. There are no charges that appear only afterwards.",
            "You are never redirected to an external site to pay: every payment happens on PokeMarket or on the payment provider's own payment page.",
        ],
    ),
    (
        "shipping",
        "Shipping &amp; Refund Policy",
        [
            "Delivery: a seller can offer SF Express cash on delivery or a meet-up. With SF Express the buyer pays the freight, and the amount is listed before you order. A meet-up has no freight.",
            "Receipt: when the card arrives, press <em>Confirm receipt</em> on the order. Until you do, the money stays with the platform and the seller is not paid.",
            "Returns: if the card you received does not match the description - a different card, a counterfeit, or serious damage - raise a dispute on the order within 7 days of purchase. We hold the money while it is sorted out.",
            "Return freight: if the seller is at fault - wrong card, or a condition that does not match the description - the seller pays the return freight. If the buyer is at fault - bought and no longer wants it - the buyer pays. While a dispute is open neither side is paid.",
            "Refunds: once a return is agreed, the refund goes back to the original payment method. Card refunds usually take 5-10 business days depending on the issuing bank; FPS refunds 1-3 business days.",
        ],
    ),
    (
        "terms",
        "Terms and Conditions",
        [
            "PokeMarket is a marketplace where buyers and sellers deal with each other directly. The platform provides escrow-protected payments, price data and messaging, but it does not certify the authenticity or value of any card - judge by the stated condition and ask questions before you commit.",
            "Sellers must be entitled to sell the cards they list - genuine cards, official Sending cards, or goods they are authorised to resell.",
            "Any fraud, counterfeit cards, money laundering or breach of Hong Kong law leads us to freeze the account and the funds immediately, and to report it to the police or a regulator.",
        ],
    ),
    (
        "privacy",
        "Privacy Policy",
        [
            "We collect only what the service needs: your account details (phone or email), your transaction history, your payout details if you sell, and the device and sign-in records that keep the trading safe.",
            "Your payout identifier - an FPS phone number, say - is stored encrypted and masked in the app; only the last four characters are shown.",
            "We do not sell your personal data. It is shared only with the payment providers (Stripe, Airwallex) to collect and pay out, or with regulators where the law requires it.",
            "You can ask us at any time to show, correct or delete your account data, using the contact form above.",
        ],
    ),
]

DETAIL_ROWS = [
    ("Company name", "companyName"),
    ("Business registration number", "registrationNumber"),
    ("Company address", "address"),
    ("Contact email", "supportEmail"),
    ("Contact phone", "supportPhone"),
    ("Payment methods", None),
    ("Governing law", "governingLaw"),
]


def main() -> int:
    b = business_values()
    if not b["companyName"]:
        print("  搵唔到 business values", file=sys.stderr)
        return 1

    feature_html = "\n".join(
        f"""      <article class="card feature">
        <div class="ico">{icon}</div>
        <h3>{title}</h3>
        <p>{body}</p>
      </article>"""
        for icon, title, body in FEATURES
    )

    steps_html = "\n".join(
        f"""      <div class="step"><div><b>{title}</b><p>{body}</p></div></div>"""
        for title, body in STEPS
    )

    nav_html = "\n".join(
        f'        <a href="#{key}">{label}</a>'
        for key, label in [
            ("payment", "Payment methods"),
            ("shipping", "Shipping &amp; Refund"),
            ("terms", "Terms and Conditions"),
            ("privacy", "Privacy Policy"),
        ]
    )

    policy_html = "\n".join(
        f"""      <article class="card policy" id="{key}">
        <h3>{label}</h3>
        {"".join(f"<p>{p}</p>" for p in paragraphs)}
      </article>"""
        for key, label, paragraphs in POLICIES
    )

    detail_rows = [
        (label, "Visa · Mastercard · FPS (轉數快)" if key is None else b[key])
        for label, key in DETAIL_ROWS
    ]
    details_html = "\n".join(
        f"        <dt>{label}</dt>\n        <dd>{value}</dd>" for label, value in detail_rows
    )

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PokeMarket - Hong Kong second-hand Pokémon card marketplace</title>
<meta name="description" content="PokeMarket is a Hong Kong marketplace for second-hand Pokémon trading cards, operated by {b['companyName']}. Live card prices, escrow-protected trades, sellers paid by FPS.">
<meta property="og:title" content="PokeMarket - Hong Kong second-hand Pokémon card marketplace">
<meta property="og:description" content="Escrow-protected trades, live market prices and offers between collectors.">
<meta property="og:type" content="website">
<link rel="canonical" href="{b['siteUrl']}/about.html">
<style>{CSS}</style>
</head>
<body>
<header class="site">
  <div class="wrap nav">
    <div class="brand"><span class="dot"></span>PokeMarket</div>
    <ul>
      <li><a href="#what">What we sell</a></li>
      <li><a href="#how">How it works</a></li>
      <li><a href="#policies">Policies</a></li>
      <li><a href="#business">Business details</a></li>
      <li><a href="#contact">Contact</a></li>
      <li><a class="cta" href="{b['siteUrl']}">Open the app</a></li>
    </ul>
  </div>
</header>

<main>
  <section class="hero">
    <div class="wrap">
      <span class="eyebrow">● Hong Kong · Escrow protected</span>
      <h1>Second-hand Pokémon cards, traded with confidence.</h1>
      <p class="lead">
        PokeMarket is a marketplace for collectors, operated by {b['companyName']}.
        Live price references, offers between buyers and sellers, and a payment
        held safely until you confirm the card arrived.
      </p>
      <div class="buttons">
        <a class="btn primary" href="{b['siteUrl']}">Browse cards →</a>
        <a class="btn" href="#how">How a trade works</a>
      </div>
      <div class="stats">
        <div class="stat"><b>6 hrs</b><span>Price reference refresh</span></div>
        <div class="stat"><b>3</b><span>Languages supported</span></div>
        <div class="stat"><b>Escrow</b><span>On every single trade</span></div>
        <div class="stat"><b>Visa · FPS</b><span>Cards and local transfer</span></div>
      </div>
    </div>
  </section>

  <section class="block" id="what">
    <div class="wrap">
      <h2>What we sell</h2>
      <p class="sub">
        A marketplace for second-hand Pokémon trading cards - every listing states
        its condition, and every trade is paid through a licensed payment provider
        rather than between two strangers.
      </p>
      <div class="grid3">
{feature_html}
      </div>
    </div>
  </section>

  <section class="block" id="how" style="background:var(--bg2)">
    <div class="wrap">
      <h2>How a trade works</h2>
      <p class="sub">Six steps, and the money only moves at the end - when you say the card arrived.</p>
      <div class="steps">
{steps_html}
      </div>
    </div>
  </section>

  <section class="block" id="policies">
    <div class="wrap">
      <h2>Policies</h2>
      <p class="sub">How you pay, what happens if something is wrong, and what we do with your data.</p>
      <div class="policy-layout">
        <nav class="policy-nav">
{nav_html}
        </nav>
        <div class="grid2" style="align-content:start">
{policy_html}
        </div>
      </div>
    </div>
  </section>

  <section class="block" id="business" style="background:var(--bg2)">
    <div class="wrap">
      <h2>Business details</h2>
      <p class="sub">Who operates the marketplace, and how to reach us.</p>
      <div class="card">
        <dl class="details">
{details_html}
        </dl>
      </div>
    </div>
  </section>

  <section class="block" id="contact">
    <div class="wrap">
      <h2>Contact us</h2>
      <p class="sub">
        A question about a card, an order, or selling? Send a message and we will
        reply by email.
      </p>
      <div class="grid2" style="align-items:start">
        <div class="card">
          <form class="contact-form" id="contactForm" data-endpoint="{CONTACT_ENDPOINT}">
            <label>Your name<input name="name" required autocomplete="name" placeholder="How should we address you?"></label>
            <label>Your email<input name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label>
            <label>Message<textarea name="message" required placeholder="How can we help?"></textarea></label>
            <button class="btn primary" type="submit">Send message</button>
            <div class="formstatus" id="formStatus"></div>
            <div class="formnote">We use what you send here only to answer you.</div>
          </form>
        </div>
        <div class="card">
          <h3 style="margin-top:0">Business details</h3>
          <dl class="details">
{details_html}
          </dl>
          <p class="formnote" style="margin-top:18px">
            Registered in Hong Kong. Governed by the laws of the {b['governingLaw']}.
          </p>
        </div>
      </div>
    </div>
  </section>
</main>

<footer class="site">
  <div class="wrap">
    <div>© {b['companyName']} · PokéMarket</div>
    <div class="badge">Registered in Hong Kong · Visa · Mastercard · FPS</div>
  </div>
</footer>

<script>{JS}</script>
</body>
</html>
"""

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    ALIAS.write_text(html, encoding="utf-8")
    print(f"  ✅ 寫咗 {OUT.relative_to(ROOT)} 同 {ALIAS.relative_to(ROOT)}（{len(html)} bytes）")
    if "TO BE CONFIRMED" in html:
        print("  ! 仲有 'TO BE CONFIRMED' —— 商業登記號碼／地址／電話要填")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
