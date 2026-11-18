#!/usr/bin/env python3
"""
Put the business details into the app's index.html as a noscript block.

A reviewer who opens the site without running javascript would
otherwise see an empty page: the app is a single page application and
the login form only appears once the bundle has run. The noscript
block is what that visitor — and a crawler — reads.

It also points at the static page, which carries the full content.

Run it after `expo export`, before the hosting deploy.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / "dist/index.html"
CONFIG = ROOT / "src/config/business.ts"


def business_values() -> dict:
    text = CONFIG.read_text(encoding="utf-8")
    values = {}
    for key in ("companyName", "registrationNumber", "address", "supportEmail", "supportPhone", "siteUrl"):
        m = re.search(rf"{key}:\s*'([^']*)'", text)
        values[key] = m.group(1) if m else ""
    return values


def main() -> int:
    if not INDEX.exists():
        print("  搵唔到 dist/index.html —— 係咪未跑 expo export？", file=sys.stderr)
        return 1

    b = business_values()
    html = INDEX.read_text(encoding="utf-8")
    if "data-noscript=\"business\"" in html:
        print("  (已經注入過，跳過)")
        return 0

    block = f"""<noscript data-noscript="business">
<div style="max-width:720px;margin:40px auto;padding:0 20px;font-family:system-ui,sans-serif;line-height:1.65;color:#111">
  <h1 style="font-size:28px;margin:0 0 6px">PokeMarket</h1>
  <p style="color:#555;margin:0 0 20px">A Hong Kong marketplace for second-hand Pokémon trading cards, operated by {b['companyName']}.</p>
  <h2 style="font-size:18px;margin:0 0 8px">Business details</h2>
  <p style="color:#555;margin:0 0 20px">
    Company: {b['companyName']}<br>
    Business registration number: {b['registrationNumber']}<br>
    Company address: {b['address']}<br>
    Contact email: {b['supportEmail']}<br>
    Contact phone: {b['supportPhone']}<br>
    Payment methods: Visa · Mastercard · FPS (轉數快)<br>
    Governing law: Hong Kong Special Administrative Region
  </p>
  <p style="color:#555;margin:0 0 20px">This site is a web app and needs JavaScript to trade. The full description of the business, how a trade works, and our terms, refund and privacy policies are on a static page that does not need it.</p>
  <p style="margin:0"><a href="{b['siteUrl']}/about.html" style="color:#8a6d1f;font-weight:700">Read about PokeMarket, the terms and the policies →</a></p>
</div>
</noscript>"""

    if "</body>" in html:
        html = html.replace("</body>", block + "\n</body>", 1)
    else:
        html += block
    INDEX.write_text(html, encoding="utf-8")
    print(f"  ✅ dist/index.html 加咗 noscript 業務資料（{len(block)} bytes）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
