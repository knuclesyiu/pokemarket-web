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

## 付款 → 放款 嘅鏈（2026-11-16 凌晨）

### 測試
新寫 `scripts/escrow_flow_e2e.mjs`：喺 live project + live Stripe 帳戶行一次
完整鏈，26 項檢查。測試唔會真正付款（PaymentIntent 開完就 cancel），
賣家 Stripe 帳戶用已 onboard 嗰個，只係寫 ledger。

### 原本嘅問題（全部係真 bug，全部已修）

1. **買家根本冇得付款** —— `CheckoutScreen` 喺 App.tsx 有註冊，但**冇任何畫面
   navigate 過去**。「立即購買」只係切去掛牌 tab，每個掛牌只有「出價 →」
   （走 offer 換卡，冇錢）。由掛牌到付款嘅路徑完全斷咗。
   → 修：每個掛牌加「立即購買」掣 → Checkout。

2. **賣家冇得發貨，訂單卡死喺 paid** —— 冇任何 function 寫 `status:'shipped'`，
   而 `confirmReceipt` 要 `shipped`、`releasePayment` 要 `shipped|confirmed`，
   所以**錢永遠放唔落賣家**。
   → 修：新增 `functions/src/escrow/markShipped.ts` + 賣家「我已寄出卡片」掣。
   面交（meetup）冇運費，`confirmReceipt` 接受由 `paid` 直接確認。

3. **價錢由 client 決定** —— `createPaymentIntent` 收 `cardPriceHkd`，
   買家可以自己命名金額。
   → 修：server 查 `listings/{listingId}` 攞價，並檢查掛牌係 `active`、
   賣家對應。運費亦改由 server 決定（順豐 HK$35 / 面交 0）。

4. **重複落單 = 兩次扣款** —— 實測同一個 orderId 落兩次會開兩個 PaymentIntent。
   → 修：同一張單已有未付嘅 PaymentIntent 就攞返嗰個。

5. **webhook 唔冪等** —— Stripe 至少送一次 event，5xx 會重試三日；
   `pendingEscrow` 會被加兩次。
   → 修：先讀訂單狀態，`status !== 'awaiting_payment'` 就唔當新 event 計。

6. **放款唔原子** —— 訂單狀態、兩邊錢包、payout_source 四個獨立寫入。
   → 修：改用 Firestore transaction，狀態檢查喺 transaction 入面。

7. **`source_transaction` 用錯 id** —— Stripe 要 **charge id**（`ch_`），
   我哋傳緊 payment intent id（`pi_`），提現一定失敗。
   → 修：webhook 記低 `chargeId`（`pi.latest_charge`），payout_source 存住，
   提現時用返。

8. **訂單嘅卡牌資料用賣家 profile 嘅「上一張卡」** → 改用掛牌嘅資料。

9. **放款 modal 顯示卡價** —— 賣家實收係卡價減平台費，數字對唔上。

### 仲未做
- 賣家提現要賣家本人完成 Stripe KYC（`stripe_transfers` 仍 restricted）
- 交易紀錄嘅 counterparty 仍然係 uid 前 6 位，應該用 displayName

## 出款行改成 Airwallex / 轉數快（2026-11-16）

### 點解要改
賣家唔想做 Stripe 15 項 KYC 先收到錢。Airwallex 嘅 marketplace
Ledger Account model 做 **light screening**，賣家只需要「戶口持有人姓名 +
收款識別碼（FPS ID / 手機 / 電郵 / HKID，或者行號+帳號）」。

### 程式做咗咩
- `functions/src/payout/airwallex.ts` — Airwallex client：認證、開收款帳戶
  (recipient, RECIPIENT)、開收款人 (beneficiary)、出款 (transfer)
- `functions/src/payout/rail.ts` — 出款行選擇：`PAYOUT_RAIL=airwallex|stripe`，
  預設係 Airwallex（如果憑證存在），Stripe 保留做 fallback
- `functions/src/payout/secrets.ts` — `AIRWALLEX_CLIENT_ID` / `AIRWALLEX_API_KEY`
  經 `defineSecret()` 綁定（`secrets:set` 唔會自動綁，一定要 declare）
- `functions/src/escrow/sellerPayouts.ts`
  - `setSellerPayoutDetails` — 賣家提交收款資料 → server 開帳戶 + 收款人
  - `getSellerPayoutStatus` — 狀態，識別碼會遮住（只顯示最後 4 個字元）
  - `createWithdrawal` — 分岔兩條出款行，兩個都行同一個 `recordPayout`
    transaction（餘額同 payout 記錄一齊寫）
- `src/screens/SellerPayoutDetailsScreen.tsx` — 收款設定表單
- Profile 賣家設定：`收款設定（轉數快）` → 新畫面；`Stripe 收款帳戶` 保留

### 未驗證嘅位（要真憑證先試到）
`scripts/airwallex_payout_probe.mjs` 會行：認證 → 開收款帳戶 → 提交審批 →
讀狀態 → 開收款人 → 出款 HK$10。**用 sandbox 跑唔會郁真錢。**

### Ken 要做嘅嘢
1. Airwallex dashboard → 开发者 → API keys → 產生一組 **Sandbox** key
   （Production 嗰組遲啲先，唔好一開始就用真錢）
2. 填 `~/.hermes/secrets/airwallex-pokemarket.env`（mode 600，唔好 paste 落 chat）
3. `bash scripts/set_airwallex_secrets.sh` → 推上 Secret Manager
4. `cd functions && firebase deploy --only functions`
5. `node scripts/airwallex_payout_probe.mjs` → 睇 4 步過唔過

### 營運上嘅位（要諗清楚）
Airwallex 出款係由**平台自己嘅 Airwallex 戶口**出。而家買家嘅錢收喺
Stripe 平台戶口。所以：

- Stripe 平台餘額 → 要轉去 Airwallex（銀行轉賬，T+2）先出得咗款
- 想賣家即時收到，平台要 keep 一個 float（預先喺 Stripe 戶口留住錢）
- **牌照**：平台「代客持有資金 + 代賣家出款」嘅形態，會唔會觸及 PSRO / MSO，
  要搵律師睇。呢個風險喺改用 Airwallex 之前已經存在（separate charges and
  transfers 一樣係平台短暫持有買家嘅錢），但出款由自己做會令責任更明顯。
  Stripe Connect 版本（平台用持牌機構嘅錢）係監管上另一個位置。

## 收款行也轉 Airwallex（2026-11-16 晚）

### 點解
Stripe **香港完全唔支援 FPS 收款**（Airwallex 對比表自己都寫咗 ✓）。
Airwallex 支援（QR code、HK$2.00 + 方式費、T+1、冇 chargeback ✓）。
而且如果收款同出款唔同一間機構，錢要由 Stripe 過水去 Airwallex（T+2），
平台仲要 keep 一個 float 頂住未清算嘅 escrow —— 兩本帳、兩次對賬。

費率（2026-11-16 查）：本地卡 Airwallex **3.30% + HK$2.35** vs Stripe
**3.40% + HK$2.35** ✓。Marketplace 客製價要去同 Airwallex 傾 ✓。

### 程式做咗咩
- `functions/src/shared/airwallex.ts` — 共同 client（token + fetch + 環境判斷）
- `functions/src/shared/feeCalculator.ts` — `calculateFee(price, rail)`，
  處理商費率跟住收款行；`AIRWALLEX_PERCENT_FEE` 可用 env 覆寫 ✓
- `functions/src/payment/rail.ts` — `paymentRail()`：`PAYMENT_RAIL=airwallex|stripe`，
  預設 Airwallex（憑證存在時），否則 Stripe ✓
- `functions/src/payment/airwallex.ts` — `createCollectionIntent`（PaymentIntent +
  client_secret）、`cancelIntent`、`refundPayment`
- `functions/src/payment/config.ts` — `getPaymentConfig`：client 問 server 用邊條行，
  拎返 public client id（同環境）✓
- `functions/src/escrow/createPaymentIntent.ts` — 分岔兩條收款行；Airwallex 唔需要
  賣家開 Stripe 帳戶 ✓；冪等檢查兩邊都有 ✓
- `functions/src/webhooks/airwallexWebhook.ts` — `payment_intent.succeeded` 事件：
  HMAC-SHA256 驗簽（`x-timestamp` + body）✓、同 Stripe 一樣冪等計法 ✓、
  解析唔到就 200、寫入失敗先 5xx ✓
- `src/services/paymentConfig.ts` + `src/components/AirwallexPaymentForm.web.tsx`
  （drop-in element：卡 + FPS + 錢包喺同一個 UI ✓）
- `src/screens/CheckoutScreen.tsx` — 讀收款行；Airwallex 行：先開 intent，
  再開 element，買家喺 element 入面確認 ✓

### 未驗證
- Airwallex drop-in element 嘅 init/createElement 參數係照文檔寫，未用真憑證跑過
- Airwallex webhook URL 要喺 dashboard 開：
  `https://us-central1-pokemarket-255c6.cloudfunctions.net/airwallexWebhook`
  事件揀 `payment_intent.succeeded`（+ `payment_intent.payment_failed`）✓
- 手機版（native）未有 Airwallex 收款（卡付款本來就係 stub，唔算退步 ✓）

### ⚠️ 漏錢疑點（未查實）
App 假設 Stripe 卡費 **2.9% + HK$2.35**，但 Stripe 香港公開價係
**3.40% + HK$2.35**。之前個測試只驗證「app 收幾多 = Stripe 收幾多」，
**冇驗證 Stripe 實際抽幾多**。如果真係 3.4%，每筆卡費少收 0.5%
（HK$1000 一單 = HK$5）。要查：睇 Stripe dashboard 實際費率，或者拉
`balance_transaction` 睇 fee。

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
