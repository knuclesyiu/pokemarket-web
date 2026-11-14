# PokeMarket — Resume Plan (更新 2026-11-14 晚上)

## Goal
用家自己註冊帳戶 → 掛牌 → 出價 → 賣家接受 → 雙方搬卡 → 賣家收款/提現。

## 而家嘅狀態

| 項目 | 狀態 |
|---|---|
| App `tsc --noEmit` | ✅ 0 error |
| Functions `tsc --noEmit` | ✅ 0 error |
| Emulator E2E | ✅ 22/22 |
| **線上 callable（30 個）** | ✅ **全部部署、有應聲、冇被平台擋** |
| **線上交易 E2E** | ✅ 掛牌→出價→接受→搬卡→總數守恆→sold→交易紀錄 |
| **線上 UI 實測** | ✅ 註冊→設交易密碼→主頁→錢包→收款帳戶→提現 |
| **卡片價格** | ✅ 18,814 張卡有真實價格（原本畫面全部 HK$ 0） |
| **卡片搜尋** | ✅ `nameLower` 前綴索引，HK$0.17 嘅卡都搵到 |
| **賣家收款/提現 UI** | ✅ 已上線並實測 |
| Stripe 金鑰 | ❌ **未設定**（唯一阻塞項，要 Ken 做） |
| GitHub push | ❌ 8 個 commit 未 push（要 `gh auth login --web`） |

## 今次修好嘅嘢

### 1. 價格全部 HK$ 0
**唔係** collection 空 —— 有 23,158 個文件、18,814 個有真價。
HomeScreen 用 `limit(50)` 冇 `orderBy`，Firestore 依 doc ID 排 → 顯示咗
`2011bw-*`（McDonald's 2011 promo，冇市價）。
只按價排亦唔啱：最貴嗰批係 promo bundle，一個「平均價」套落好多張唔相干嘅卡。
→ 改用價格帶 HK$20–5,000（`src/config/platform.ts` 嘅 `HOME_FEED_*`）。

### 2. 搜尋搵唔到平卡
之前只 pull 最貴 500 張再 memory filter，HK$1 嘅卡永遠搵唔到。
→ 每個 doc 加 `nameLower`，用前綴 range 查。
backfill 要用游標分頁（Firestore 查唔到「呢個 field 唔存在」嘅 query，
`limit()` 永遠返同一頁）。

### 3. 價格過期
`card_prices` 係 6 個月前 Python scraper 寫落去嘅。
→ 新增 `syncCardPrices`（手動）+ `scheduledCardPriceSync`（每 6 個鐘），
由 TCGdex 讀實時 pricing。

### 4. 賣家收款/提現
- `SellerOnboardingScreen`（新）：開 Stripe 官方頁面、查狀態、列出要準備咩文件
- `WithdrawScreen`（新）：餘額、金額輸入、「全部」掣、最小提現額 HK$50、驗證
- 入口：錢包「提現 →」（原本係「即將推出」Alert）+ 個人頁「賣家設定」

底下三個 bug：
- `createPaymentIntent` 讀 `users/{uid}.stripeAccountId`，但 `createSellerAccount`
  寫落 `sellers/{uid}` → **已 setup 嘅賣家都收唔到錢**
- 提現用 `payouts.create`（唔可以指定 connected account）→ 改 `transfers.create`
- `payouts` collection 冇 rule → 賣家睇唔到自己提現紀錄，已補

### 5. 平台層 403 / 401（兩個唔同成因）
- 舊 function 被擋：覆蓋部署保留舊 Cloud Run invoker → **刪除重建**
- 新 function 被擋：`syncCardPrices` 一 deploy 就 HTML 401 →
  **加 `invoker: 'public'`**（v5 支援，tsc 會捉）

## Ken 要做嘅兩步

### 1. Stripe 金鑰（真收款嘅唯一阻塞）
1. https://dashboard.stripe.com/apikeys → 拎 `sk_test_…` 同 `pk_test_…`
2. https://dashboard.stripe.com/webhooks → endpoint 指向
   `https://us-central1-pokemarket-255c6.cloudfunctions.net/stripeWebhook` → 拎 `whsec_…`
3. 兩個 key 放喺一個檔（**唔好貼入 chat**）：
   ```
   STRIPE_SECRET_KEY=***
   STRIPE_WEBHOOK_SECRET=***
   ```
4. `bash scripts/setup_stripe_secrets.sh <檔案路徑>`（會 set secret + 重新部署 + 驗證 webhook）
5. `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` 而家係**空嘅**，要填入根目錄 `.env`
   （publishable key 係公開嘅，唔使保密）

### 2. GitHub push
```bash
gh auth login --web
git push origin flat-public
```

## 未做 / 下一步

- **Stripe 接通後**：用測試卡跑一次 `createPaymentIntent` → webhook → `releasePayment`
  → 賣家餘額增加 → 提現轉 `transfers.create`
- **賣家上架時機**：`createListing` 應要求賣家已 onboard（目前係付款時先擋）
- `card_prices` 仲有約 4,300 張冇價（TCGdex 冇報價），唔影響但值得知
- **Emulator 模式**：app 而家可以對住 emulator 行
  （`EXPO_PUBLIC_USE_EMULATOR=true` + `npx expo export`），
  方便測試要 server 資料嘅畫面（例如有餘額嘅提現畫面）
