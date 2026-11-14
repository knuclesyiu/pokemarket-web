# PokeMarket — Resume Plan (更新 2026-11-14)

## Goal
用家自己註冊帳戶 → 然後交易卡。

## 而家嘅狀態：**線上部署好，實測通過**

| 項目 | 狀態 |
|---|---|
| App `tsc --noEmit` | ✅ 0 error |
| Functions `tsc --noEmit` | ✅ 0 error |
| `expo export --platform web` | ✅ 成功 |
| Portfolio 單元測試 | ✅ 8/8（含總數守恆） |
| Emulator E2E | ✅ 22/22 通過 |
| **線上部署（真實專案 pokemarket-255c6）** | ✅ **functions 29 個 + rules + indexes 全部上線** |
| **線上 E2E 探測** | ✅ **全部通過**（註冊→掛牌→出價→接受→搬卡→總數守恆→sold→交易紀錄） |
| 未 push commits | 9 個（GitHub token 失效，要 Ken re-auth） |
| Stripe 金鑰 | ❌ 未設定（`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`） |

## 線上探測結果（scripts/probe_deployed.mjs）

```
24 個 callable 全部已部署、有應聲
註冊 → 掛牌 → 買家見到 → 出價
買家試住自己 accept 自己個出價 → 被拒（「只有賣家可以回應」）
賣家 accept → accepted
賣家 → {"hermes-probe-card-002":1}
買家 → {"hermes-probe-card-001":1}
總卡數守恆 2 張 · 掛牌 sold · 交易紀錄 completed
```

## 部署途中修好嘅 6 個問題

1. **Node 20 runtime 已收爐**（2026-10-30）→ 升到 Node 22
2. **Index 格式錯**：`"order": "ARRAY_CONTAINS"` → `"arrayConfig": "CONTAINS"`；
   另外 4 個單欄 index 要用 single-field index controls，唔可以留喺 file
3. **App 叫緊 4 個 source 冇嘅 function**（`createSellerAccount`,
   `getSellerOnboardingStatus`, `createWithdrawal`, `confirmPayment`）
   → 新增 `functions/src/escrow/sellerPayouts.ts`
4. **`trades` collection 冇任何 rule** → Firestore default-deny，交易紀錄存在但冇人讀得到
5. **12 個 function 被平台層 403 擋死**（HTML 403，function 根本冇收到請求）
   → 原因係 IAM：覆蓋部署係 "update operation"，保留舊 Cloud Run service 嘅 invoker binding。
   刪除再部署 → "create operation" → 全新 service + 預設 binding → function 自己驗證身份。
   **下次遇到平台層 403，先試刪除重建，唔好以為係 code 問題。**
6. **17 個線上殘留 function**（代碼已冇）→ 刪除

## Ken 要做嘅一步

```bash
gh auth login --web
git push origin flat-public
```
（9 個 commit 未 push；舊 token 已當洩漏處理，唔好再用。）

## 未做 / 下一步

- **Stripe 未接**：`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` 未設定，
  所以 `createPaymentIntent` / `releasePayment` / `stripeWebhook` 會喺
  「缺少 key」時失敗（而家係清楚嘅錯誤訊息，唔會靜靜哋死）。
  要真收款就要設定 secret + 測試卡。
- **賣家 onboarding / 提現 UI 未接**（`startSellerOnboarding` 等 4 個
  function 有後端，app 嘅 service 有 wrapper，但冇畫面用）。
- **FPS 付款流程**：`confirmPayment` 只記錄「買家話畀咗錢」，唔會放錢；
  要人工或 bank 核對先可以 `releasePayment`。
- `card_prices` 卡片目錄未入 emulator（`loadCardCatalog` 會 warn 同降級）。
- Firestore composite index 已部署 20 個；新 query 要記得加 index。
