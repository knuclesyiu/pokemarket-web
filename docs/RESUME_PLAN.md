# PokeMarket — Resume Plan (更新 2026-11-15 早上)

## Goal
用家自己註冊帳戶 → 掛牌 → 出價 → 賣家接受 → 雙方搬卡 → 買家用卡付款 → 賣家收款/提現。

## 而家嘅狀態

| 項目 | 狀態 |
|---|---|
| App `tsc --noEmit` | ✅ 0 error |
| Functions `tsc --noEmit` | ✅ 0 error |
| Emulator E2E | ✅ 22/22（交易流程冇受影響） |
| **線上 callable（30 個）** | ✅ **全部通、0 被平台擋** |
| **線上 Stripe E2E** | ✅ **20/20**（真 Stripe 帳戶、真 PaymentIntent） |
| **線上 UI 實測** | ✅ 註冊→設交易密碼→主頁(真價)→搜尋→錢包→收款帳戶→提現 |
| 卡片價格 | ✅ 18,814 張卡有真實價格 |
| 卡片搜尋 | ✅ `nameLower` 前綴索引，HK$0.17 嘅卡都搵到 |
| Stripe secret | ✅ 已綁定（7 個 function 用 `defineSecret`） |
| Stripe webhook | ✅ 指向 us-central1、7 種事件、`whsec_` 已驗證 |
| **Stripe Connect** | ❌ **平台未開通 Connect —— 要 Ken 喺 dashboard 開** |
| GitHub | ✅ 已 push |

## Ken 只差一步：開通 Stripe Connect

https://dashboard.stripe.com/connect → 開通（country = Hong Kong）

未開通之前：
- 賣家開通收款帳戶 → server 會明確講「平台未開通 Stripe Connect」
- 但**買家付款、託管、訂單、費用計算全部已經行得通**（charge 留喺平台
  帳戶，唔使 Connect）

## 金鑰輪換（重要）

`sk_live_…` 已經貼咗入 WhatsApp 對話 = 當作已洩漏。輪換方法：

```bash
# 1. 去 dashboard 產生新 key，寫入本機檔（唔好貼入 chat）
#    ~/.hermes/secrets/stripe-pokemarket.env
#    STRIPE_SECRET_KEY=sk_live_...
#
# 2. 換新 secret（webhook signing secret 唔會變，除非重設 endpoint）
bash scripts/setup_stripe_secrets.sh ~/.hermes/secrets/stripe-pokemarket.env
```

`sk_live_` 係真正嘅 secret key。`pk_live_`（publishable）係公開嘅，設計上
就係入 client bundle，唔使輪換。`rk_live_` 係 restricted key，視乎用途再輪換。

## 今次修好嘅錢流問題

### 1. 之前根本冇託管
`createPaymentIntent` 用 `transfer_data.destination`（destination charge）——
錢喺付款成功嗰刻**直接送咗去賣家帳戶**。平台冇錢可退，賣家提現時
（`transfers.create` 由平台餘額轉出）亦都冇錢可提。兩者互相矛盾。

→ 改成 **separate charges and transfers**：charge 留喺平台帳戶（真託管），
賣家提現時先由平台轉出。`releasePayment` 只做帳本（賣家餘額 +），
真金白銀喺提現嗰刻先郁。提現用 `source_transaction` 指返原 charge，
所以平台唔使自己備墊未清算嘅資金。

### 2. 買家被收少咗錢
Client 傳「買家總額」，server 當佢係「卡價」再計一次費 → 賣家會攞到
運費、平台費基數又錯。

→ Client 改為傳 **卡價 + 運費**，server 計費（server 仍然係金錢嘅唯一
決定者）。實測：卡價 HK$100 → 費用 HK$20（3% 平台 + 2.9% Stripe
+ HK$2.35，最低 HK$20）→ 買家付 HK$120 + HK$35 運費 = **HK$155**。

⚠️ 最低收費 HK$20 令細卡好貴（HK$20 嘅卡要付 HK$40）。呢個係產品
政策，Ken 可能想改 `functions/src/shared/feeCalculator.ts` 同
`src/utils/feeCalculator.ts`（兩份要同步）。

### 3. `refundPayment` 冇權限檢查
任何登入咗嘅人都可以退款**任何一張單**。→ 改成只有買家本人或
`admin` custom claim 先可以退。

### 4. Client 可以自己 create order
`firestore.rules` 原本畀 client `allow create` orders，而 order 嘅
`amountHkd`、`status` 都係 client 自己填 —— `releasePayment` 照單全收，
可以喺賣家錢包度憑空加錢。→ orders 改成 server-only。

### 5. Secret 冇真正綁到 function
`firebase functions:secrets:set` 會将值寫成**普通環境變數**落 function，
而且**唔會**注入 secret。要用 `defineSecret()` 宣告 +
`{ secrets: [...] }` options，CLI 先會由 Secret Manager 綁定。
撞名會出 "Secret environment variable overlaps non secret environment
variable" → 唯一解係刪除重建嗰啲 function。

### 6. Webhook 對帳
退款時如果錢已 release，應該扣賣家餘額而唔係買家 escrow
（否則賣家收咗錢又收埋退款）。→ webhook 按「錢喺唔喺 escrow」分流。

### 7. Connect 未開通嘅錯誤
以前只會見到 `INTERNAL`。→ 而家會講「平台未開通 Stripe Connect，
需要管理員到 dashboard 開通先可以開通賣家收款帳戶。」

## UI 改進（2026-11-15 下午，已上線）

### 1. 網頁版之前完全冇 feedback
`Alert.alert` 喺 react-native-web **係 no-op** —— 85 個 call site 全部無聲：
驗證失敗、網絡錯誤、「已儲存」都冇提示。用家撳掣冇反應，唔知點解。
（實測：註冊撞「email 已存在」→ 畫面乜都冇出現。）
→ `src/components/Feedback.tsx`：toast + 對話框，兩個平台一致。

### 2. 三套 palette 混用
Login `#12121F`、主頁 `#080810`、SearchBar `#1E1E2E`；同一個品牌紅有兩個版本。
→ `src/theme.ts` 統一，937 處 hardcoded hex 換成 token。

### 3. 冇載字體 / emoji 做 icon / tab bar 係 emoji
→ Sora（`expo-font` + `@expo-google-fonts/sora`），價格用 tabular figures
→ `@expo/vector-icons`，140 處 emoji icon 換晒

### 4. 主頁三個 stat tile 係寫死 `--` 而且 `onPress={() => {}}`
→ 改用真 24h 升跌數據（升幅最多/跌幅最多嗰張卡，可撳入去）
→ 熱門卡 / 市場掛牌加咗 empty state

### 🔴 部署時踩到嘅坑（好易再踩）
`firebase.json` hosting `ignore` 有 `"**/node_modules/**"`，但 Expo 將匯出嘅
字體放喺 `dist/assets/node_modules/...` → **所有字體檔都冇部署**。
後果：@font-face 有註冊但 font 永遠 `unloaded`、`useFonts` 唔 resolve、
**成個 app 卡喺 loading screen**；而且 Ionicons 字體一樣冇部署，
所有 vector icon 會變豆腐。

修正：`ignore` 改成 `"node_modules/**"`（只擋頂層）。另外將
`@expo/vector-icons` 嘅 barrel import 改成直接 import 個別 family，
payload 由 6.9MB 跌到 2.9MB。

⚠️ 壞回應被瀏覽器 cache 咗（Firebase Hosting `max-age=3600`），
所以修正後要等 cache 過期先見到效果 —— 驗證要用
`document.fonts.check('16px FamilyName')` 同每個 face 嘅 status。

### 另外捉到
- `ProfileScreen` 好評率 `undefined / 1` = **NaN%** → 已修
- 主角「會員since」中英夾雜 → 「加入於 2026年11月14日」

## Stripe Connect：改成 Accounts v2 API（2026-11-15 晚）

### 問題
平台揀咗「交易平台」（separate charges and transfers）之後，`transfers.create`
一直畀 Stripe 拒絕：

```
Your destination account needs to have at least one of the following
capabilities enabled: transfers, crypto_transfers, or legacy_payments
```

根因**唔係** dashboard 設定，係**用錯 API**：

v1 `accounts.create({ capabilities: { transfers: { requested: true } } })`
回 HTTP 200，但 capability 係 **`inactive`** —— Stripe 靜靜忽略咗個請求，
冇 error、冇警告。所有 API version（2024-06-20 → 2026-03-25）都一樣。

### 修正
- `functions/src/shared/stripe.ts` 加 `stripeV2()` —— fetch-based，
  帶 `Stripe-Version: 2026-03-25.dahlia`
- `createSellerAccount` 改用 `POST /v2/core/accounts`，
  `configuration.recipient.capabilities.stripe_balance.stripe_transfers.requested = true`，
  `defaults.responsibilities = { fees_collector: application, losses_collector: application }`，
  `dashboard: express`
- onboarding link 改用 `POST /v2/core/account_links`
  （v1 嘅 `account_links` 對 v2 帳戶直接 404）
- `getSellerOnboardingStatus` 改讀 v2，
  `onboarded = stripe_transfers.status === 'active' && payouts.status === 'active'`，
  另外記低 `outstandingRequirements`

### 驗證
- live 賣家開通 E2E **20/20**（`scripts/seller_onboarding_live.mjs`）
- emulator 交易 E2E **22/22**
- functions tsc 0

### 仲要人做
賣家嘅 capability 係 `restricted`，等佢交：
`identity.individual.id_numbers.hk_id`（HK 身份證號碼）、地址、生日、
電話、電郵、銀行戶口、商業登記（MCC + 網址）。**呢個係真人 KYC，
自動化做唔到** —— 要一個真人喺 Stripe 官方 onboarding 頁面完成。

⚠️ 賣家 KYC 完成前，`transfers.create` 一定會被拒絕 —— 唔係 bug。

## Google 登入喺手機上唔到（2026-11-15 晚，已修）

### 症狀
手機瀏覽器撳「用 Google 帳戶登入」，停喺 login screen，冇 error。

### 根因
唔係 provider 問題 —— Firebase 嘅 `google.com` provider 一直有開
（`defaultSupportedIdpConfigs` → `enabled: true`），popup 都真係開咗。
係 **mobile 瀏覽器擋 popup**：`signInWithPopup` 喺手機上會靜靜失敗，
Firebase 官方指定要用 `signInWithRedirect`。

### 修正（`src/contexts/AuthContext.tsx`）
- mobile（UA 判定，iPadOS 用 `maxTouchPoints` 判）→ `signInWithRedirect`
- desktop → 仍然 `signInWithPopup`
- 桌面 popup 被擋（`auth/popup-blocked`）→ fallback 去 redirect
- **redirect 返嚟要先 `getRedirectResult(auth)` settle 咗**，然後
  `await auth.authStateReady()` —— 唔等就會簽匿名入去，
  **把原本由 storage 還原嘅 session 撞爛**（我踩過，reload 就登出）
- redirect 會跌咗 query → `src/services/returnPath.ts` 記住同還原
- `App.tsx` 用 `initialRouteName`（唔係 `navigate()`）開賣家畫面，
  因為 `NavigationContainer` 未 ready 時 `navigate()` 會被忽略

### 驗證
- iPhone UA → 冇 popup，直接 redirect 去 `accounts.google.com` ✅
- 桌面 UA → 仍然 popup ✅
- email 登入 → reload 保持登入 ✅
- `?sellerOnboarding=refresh` → 直接開「收款帳戶」畫面 ✅
- app tsc 0、emulator E2E 22/22

## 淺色主題 + 三語言（2026-11-15 晚）

### 語言掣唔 work 嘅原因
`src/i18n/useTranslation.ts` 一直係 **DEPRECATED stub**，冇任何畫面用緊。
Profile 個掣做嘅 `updateProfile({language})` 有寫入 Firestore，
但**全 app 冇一處讀呢個值** —— 所以撳落去乜都冇發生。
實際規模：248 條中文 hard-code，原表只有 55 個 key。

### 做法
- `src/i18n/strings.ts` —— 三語言表（key = 原本嘅中文原文）
- `src/i18n/index.ts` —— module-level `t()`，唔使逐個檔案插 hook
- `src/contexts/AppearanceContext.tsx` —— theme + language 一個 context
- `scripts/localise_screens.py` —— 自動把 hard-code 換成 `t('...')`
- `scripts/fix_localisation_hooks.py` —— 補返漏咗嘅 hook

### 淺色主題
`src/theme.ts` 加咗 `darkPalette` / `lightPalette`、`C` 改成 live proxy、
`themed()` factory。30 個畫面嘅 `StyleSheet.create` 改成
`themed((C) => StyleSheet.create({...}))` —— 樣式跟 palette 重建。

### 途中揾到嘅 3 個真 bug
1. **theme cache 用錯 key** —— 第一版 `themed()` 個 cache 用 palette 做 key，
   **所有畫面共用同一個 stylesheet**，第一個被讀嘅贏咗，其他畫面
   `styles.xxx` = undefined → Profile 畫面完全冇 style。要每個 `themed()`
   自己嘅 cache。
2. **強制 refresh token 令用戶靜靜登出** —— `refreshSession()` 每次 cold start
   都 `getIdToken(u, true)`，失敗時 SDK 登出，錯誤被 `.catch(() => {})` 吞死。
   改成非強制 refresh + 記低失敗碼。
3. **`refreshSession` 吞咗所有錯誤** —— 而家會 log 失敗 code，同埋每次
   auth state 轉變都 log。

### 驗證
- 淺色：Firestore theme → reload → 成個 app 淺色 ✅（root 背景跟 palette）
- 語言：Firestore language=en → reload → "Hello, Trainer" / "Live quotes 50" ✅
- 主題掣：Profile 撳深色/淺色 → 即時切 ✅
- 語言掣：Profile 撳 English/簡體 → 即時切 ✅
- app tsc 0、emulator E2E 22/22 ✅

## Stripe key 輪換（2026-11-15 20:12）

Ken 喺 Stripe dashboard 開咗新 key 並更新咗本機
`~/.hermes/secrets/stripe-pokemarket.env`。

**已完成**
- 新 `STRIPE_SECRET_KEY` 推入 Firebase Secret Manager（hash 同本機檔一致）
- `STRIPE_WEBHOOK_SECRET` 一併重推（內容無變）
- functions 重新部署 → 線上 live Stripe E2E **20/20**（真 PaymentIntent 建到，
  cardPrice 100 / buyerTotal 155 / sellerNet 97 / deliveryFee 35 全部正確）
- webhook 加咗 payload 形狀守衛：壞 payload 由 500 → 200
  （Stripe 遇 5xx 會重試 3 日然後停用 endpoint；壞 payload 重試都冇用）

**⚠️ 仲要 Ken 手動做**
舊嗰條 `sk_live_`（貼入 chat 嗰條）**仲喺 Stripe 有效** —— API 唔可以
revoke secret key，只能喺 dashboard 撳：
https://dashboard.stripe.com/apikeys → 搵返 20:12 之前建立嗰條 → Revoke

**⚠️ Stripe Connect 仍然未開**（`/v1/accounts` 回 0）
https://dashboard.stripe.com/connect → 揀香港 → 填公司資料 → 啟用
未開之前，賣家收款帳戶／提現行唔到（`createSellerAccount` 會失敗）。

## 工具（scripts/）

- `setup_stripe_secrets.sh <file>` — set secret + 重新部署
- `setup_stripe_webhook.mjs` — 建立/更新 webhook endpoint，攞 `whsec_`
- `check_stripe_key.mjs` — 金鑰 control test（真 200 / 錯 401）
- `stripe_live_e2e.mjs` — 線上真 Stripe E2E（20 項檢查）
- `cleanup_live_test_data.mjs <uid...>` — 清測試殘留
- `purge_test_users.mjs` — 刪測試帳號（含 random 密碼嗰啲）
- `make_test_user.mjs <email> <pw> [--delete]` — 開/刪測試帳號
- `migrate_alerts.py` — `Alert.alert` → `notify` / `confirmAction`（可重跑）
- `tokenise_colors.py` — hardcoded hex → theme token（`--dry-run` 可先睇）
- `emoji_to_icons.py` — emoji icon → `@expo/vector-icons`
- `stripe_account_state.mjs` — 睇帳戶現況（webhook endpoints / connected accounts /
  儲存嘅憑證），輪換後用嚟對數

## 仲未做

- **賣家開通收款**：Connect 開通之後先驗得
- **25 個匿名帳號**：app 每次 cold launch 都自動匿名登入，累積咗 25 個
  冇 email 嘅 session。有冇清嘅話要你自己決定
- **真卡付款**：live mode 要真卡號；web 版有 `<CardElement />`，
  但未用真卡試過一次完整 `payment_intent.succeeded` → webhook →
  `releasePayment` → 賣家餘額
- **提現**：需要賣家有賣出紀錄先有餘額可提
- 香港法律／牌照風險（Cap 390、Cap 106、SFC、AML、跨境）仍未確認
- Decentralink：等你個 USDC txHash

參考：`third-party-service-integration` skill 嘅
`references/stripe-connect-verified-state.md` 有今次驗證過嘅 Stripe +
Firebase 細節。
