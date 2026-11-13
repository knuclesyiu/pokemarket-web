# PokeMarket — Resume Plan (更新 2026-11-13)

## Goal
用家自己註冊帳戶 → 然後交易卡。呢個係核心，其他次要。

## 而家嘅狀態

**本地全部通過。線上仲係舊版壞 code。**

| 項目 | 狀態 |
|---|---|
| App `tsc --noEmit` | ✅ 0 error |
| Functions `tsc --noEmit` | ✅ 0 error |
| `expo export --platform web` | ✅ 成功（1.81 MB bundle） |
| Portfolio 單元測試 | ✅ 8/8（含總數守恆） |
| **Emulator E2E：註冊→掛牌→出價→接受→搬卡** | ✅ **全部通過** |
| 線上 Cloud Functions | ❌ 仍然係舊版，要重新部署 |
| 線上 Firestore rules | ❌ 未部署（repo 有，線上未必係） |
| 未 push commits | 7 個（`origin/flat-public` 之後） |

## Emulator E2E 證明咗咩

`scripts/smoke_e2e.mjs`（對 auth + firestore + functions emulator 跑）：

```
✅ 兩個人註冊
✅ 賣家掛牌 → 買家見到（nested card 物件、賣家名）
✅ 買家出價
✅ 買家試住自己 accept 自己個出價 → 被拒（「只有賣家可以回應」）
✅ 賣家 accept
✅ 卡片真係郁：賣家 掛牌卡−1 / 買家 +1；買家 出價卡−1 / 賣家 +1
✅ 總卡數守恆 2 → 2
✅ 掛牌 status=sold、交易紀錄 completed、出價 accepted
```

## 今次修好嘅四個 bug（全部係 typecheck 抓唔到）

1. **成個 functions bundle 載入失敗**
   `new Stripe(process.env.STRIPE_SECRET_KEY ?? '')` 喺 module load 執行，空 key 會 throw →
   bundle 分析失敗 → **全部 callable 回 `not-found`**（連 25 個同 Stripe 冇關嘅都陪葬）。
   改成喺 handler 入面先建 client（`src/shared/stripe.ts`）。

2. **`admin.firestore.FieldValue` / `FieldPath` 喺 emulator 係 undefined**
   typecheck 唔會捉到（types 有 declare）。19 個檔案、37 處寫入會 runtime throw。
   改用 `import { FieldValue, FieldPath } from 'firebase-admin/firestore'`。

3. **Firestore 唔收 `undefined`**
   `createListing` 寫 `grade` / `grading`（冇填就 undefined）→ 掛牌直接失敗
   （"Value for argument data is not a valid Firestore document"）。
   `src/index.ts` 開 `ignoreUndefinedProperties`。

4. **Emulator port 撞車**
   Firestore emulator 原本用 8080，但本地 web preview 霸咗。改 8081。

## Ken 要做嘅兩步（我做唔到）

### 1. 登入 Firebase CLI（部署要用互動式 Google 登入）
```bash
firebase login
firebase deploy --only functions,firestore:rules,firestore:indexes
```
部署完要重跑線上探測（`scripts/probe_rules.mjs`）。

### 2. GitHub re-auth（push 用）
```bash
gh auth login
git push origin flat-public
```
⚠️ `~/.config/gh/hosts.yml` 個 token 已經無效（之前貼入 chat，按保安政策當洩漏處理，唔好再用）。
另外 `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`（pk_live）同之前嗰個 GitHub token 都係貼過入 chat，都要換。

## 未做

- App 未接錢包，所以用家暫時付唔到真錢（escrow 係 server 端邏輯，未接 Stripe 測試卡）。
- 卡片目錄 `card_prices` 未入 emulator（`loadCardCatalog` 會 warn 同降級，唔會死）。
- `loadCardCatalog` 用 `where(FieldPath.documentId(), 'in', chunk)` —— Firestore 對 `in` + `__name__`
  有已知限制，要實測確認；emulator 會 warn 但繼續。
- Firestore composite index：repo 有 `offers[buyerId,createdAt]` 等，要部署後確認線上 index 真係存在。
- `web/` 版嘅 Stripe 用 CardElement，native 用 FPS-only 路徑（上次 commit 改嘅，要真機驗）。
