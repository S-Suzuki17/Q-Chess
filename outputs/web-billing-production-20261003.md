# Web会員・チケット 本番反映記録

確認日: 2026-10-03（Asia/Tokyo）

## 結果

https://q-gambit.com のWeb会員購入受付、ログイン報酬、チケット使用を有効化した。広告はOFFを維持。実際の請求を伴う購入はユーザー本人が行うため、代行していない。本番での購入完了→署名付き通知→会員反映は、本人の購入後に確認する。

## ソース・公開物

- PR: https://github.com/S-Suzuki17/Q-Chess/pull/6 — MERGED。
- 承認された最終head: `5a68de6170822fb48d69b9012f8bfcb4251cf77d`。
- 当該headに対するユーザーの「承認」を受け、PRスキルの `pr_land.py` で auto / merge を実行。保護回避・admin・force pushなし。watcherで同一headのMERGEDを確認。
- マージcommit: `a6795783dcca5bbdcf441628c4d6e1febb6269ba`、2026-10-03T13:52:30Z。
- マージ前にチェック合格とレビュー未解決0を確認。追加コミット `5a68de6` は会員ヒント復元上限20→60のレビュー修正・回帰テスト・記録。最新の承認を取り直した。本ターンに競合解消は不要だった。
- Cloudflare Pages: `q-gambit-web`、production deployment `d12d6c43-e921-49d6-a2aa-ab71ce659e6b`。
- 配布元: `build/cloudflare-pages-2026-10-03T07-36-52-424Z`（209ファイル、141711708 bytes）。フロント部分は4f2c6b4から変更なし。最終headの差分はSQL・回帰テスト・記録であり、配布物の一致は公開後に検証した。
- アップロードZIP: `build/q-gambit-web-20261003-billing.zip`、136404450 bytes。
- ZIP SHA256: `F2C3EECF2F3C593C7ED2837FE1B83A027BE309D10C5F6C6206D28F6A9C2B8C51`。
- Render: `srv-da5jpcgjo6nc73cpjjl0`、最終deployment `dep-db0gla60tbcc73foubk0`、上記マージcommit。23:01:35 JSTにLive、23:01:26に `checkout_preflight=verified`。
- 初回コードdeploy `dep-db0gh83tqb8s738cpr60`、購入OFFでの設定検証deploy `dep-db0gidugekts739ju580` を経て、最終deployで購入と券をONにした。
- Vercelは今回の公開先ではない。Android AABは本ターンでは作成・更新していない。

## 有効化した仕様

- Web会員: 月額総額USD 2.99、自動更新。毎日のログイン時に会員対局券3枚・会員CPUヒント券3枚。別枠保有上限各60枚、未ログイン日の遡及付与なし。
- 無料ランク戦3回/日＋対局券。待機や対戦開始前の取消では消費しない。
- 無料連続ログイン報酬: 1〜7日目の対局券 `1,1,1,2,2,2,3`、CPUヒント券 `2,2,3,3,4,4,5`。7日目以降は最大値、途切れると1日目。各20枚上限、日付境界UTC。
- 期末解約、通常の日割り返金なし。会員終了・返金・取消時に未使用会員券失効、再加入に持ち越さない。法定の権利に関する例外は規約に従う。
- Webの購入・請求管理導線のみ有効。Androidへの外部購入誘導は追加していない。
- 会員規約 `2026-10-03.1` を公開。会員同意は通常規約とは別で、こちらから同意チェックは操作していない。

## 本番設定（秘密値は記録しない）

```text
STRIPE_BILLING_ENVIRONMENT=production
STRIPE_MEMBERSHIP_MODE=live
STRIPE_MEMBERSHIP_LIVE_ENABLED=true
STRIPE_MEMBERSHIP_TEST_ENABLED=false
STRIPE_MEMBERSHIP_PORTAL_ENABLED=true
STRIPE_MEMBERSHIP_CHECKOUT_ENABLED=true
STRIPE_LIVE_SUCCESS_URL=https://q-gambit.com/
STRIPE_LIVE_CANCEL_URL=https://q-gambit.com/
STRIPE_AUTOMATIC_TAX_ENABLED=false
STRIPE_TAX_REGISTRATION_CONFIRMED=false
DAILY_LOGIN_REWARDS_ENABLED=true
CPU_HINT_TICKETS_ENABLED=true
RANKED_TICKET_ADMISSION_ENABLED=true
RANKED_ADMISSION_RECOVERY_ENABLED=true
```

本番RAK・webhook署名シークレットは本人が保存済みのものを維持し、表示・取得・資料への転記はしていない。本番価格 `price_1ULM9fQWzwYDIuXWgs5Uj3yt` とPortal `bpc_1ULNajQWzwYDIuXWiSt0UJhN` の事前検証成功。秘密値が実際のStripe通知と一致するかの最終確認は、本人購入後の通知で行う。

## 検証結果

- `node scripts/release/verify-pages.mjs https://q-gambit.com build/cloudflare-pages-2026-10-03T07-36-52-424Z.manifest.json` — PASS。97チェック、70配信アセットのハッシュ、報酬BGM15曲を確認。DNS上書きなし、本番データ書込みなし。記録: `scratch/billing-production-web-check.log`。
- GET `/health`: 200、status ok、rulesVersion checkmate-v1、entanglementVersion subset-v1。
- GET `/service/status`: 200、maintenance false、旧Androidの最小バージョン制限を引き上げていない。
- 未認証 GET `/membership/stripe/status`、`/rewards/daily-login`、`/tickets/ranked-refunds`: 401 AUTH_REQUIRED。
- 未認証 POST `/membership/stripe/checkout`（空JSON）: 401 AUTH_REQUIRED。Checkoutセッションを作成していない。
- 未署名 POST `/membership/stripe/webhook`（空JSON）: 400 INVALID_WEBHOOK。通知として受理していない。
- 公開ブラウザーの「設定→アカウント→Web会員」で月額総額2.99 USD、上限各60枚、未加入、未チェックの購入同意を確認。チェック前の決済ボタンは無効。撮影: `outputs/billing-production-20261003.png`。
- ログイン報酬の受取り、同意、対局、実購入、本番テストアカウント作成は実行していない。
- `/updates/` 200。最新QUBE原稿 `t1-cpu-wait-20261003` と本文「記憶を外部保存したはずが」を配信HTMLで確認。Xへの外部投稿なし。
- 事前の全体テスト: 163ファイル / 1271テスト合格、型検査・サーバービルド合格。最終SQL修正後は会員ヒント復元上限・既存ヒント・会員券上限・規約同意の対象回帰テストと型検査に合格。全体テストを最終SQL修正後に再実行したという意味ではない。
- Sandboxで実Checkout・署名通知・付与・再試行・券消費を検証済み。本番課金の検証とは区別する。

## DB適用と既知の境界

- 本番Supabase `gtxbvbsplfkkjlmnqath` に会員・券・規約関連マイグレーション適用済み。最後は `20261003075657_cpu_hint_restoration_member_cap_60`。会員ヒント復元上限60・無料20、SECURITY INVOKER、service_role限定実行を確認済み。本ターンでの再適用はなし。
- 既存の旧認証RPCのSECURITY DEFINER権限、漏洩パスワード保護OFFのアドバイザー警告は別途課題として残る。今回の反映で監査40項目をすべて解消したとはしていない。
- 税登録未確認のためautomatic taxはOFF。法的な免税判定や全地域の税務適合を保証するものではない。
- Render Freeのコールドスタート・実負荷下の同時対戦性能、本番課金後の反映はこの公開確認では実証していない。

## 本人の購入後に確認すること

1. 設定→アカウント→Web会員から、条件を本人が確認して購入する。請求は本人のみが実行。
2. Stripe本番通知が成功し、支払済み会員状態がQ-Gambitへ反映されることを確認。
3. 当日の会員ログイン報酬が各3枚付与され、再読み込み・再受取で二重付与されないことを確認。
4. 解約・請求管理への導線と支払済み期間の表示を確認。本人の許可なく実購読を解約・返金しない。

## 緊急停止時の注意

新規購入だけを止める場合は、まず `STRIPE_MEMBERSHIP_CHECKOUT_ENABLED=false` を反映する。既に支払ったユーザーの通知処理と請求管理を止めないため、live処理やPortalまで一括でOFFにしない。切り戻す際にも現在の会員データ・券残高・本番通知を削除しない。
