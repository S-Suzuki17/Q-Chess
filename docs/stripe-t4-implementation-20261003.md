# T4 Stripe会員実装・検証（2026-10-03、販売OFF・公開未反映）

基点は `9102ad4a2230bf88379f53550362f70d1fd439c2`、専用ブランチは `fix/stripe-web-membership-20261003`。共有checkoutのソースは編集していない。本書を含むT4コミットを統合担当が取り込む。**実Checkoutの購入完了から券付与までのE2Eは未確認なので、販売可能とは判定しない。**

## 実装

- Stripe `22.6.2` の公式SDKクライアントをCheckout、照合、返金系の読取り、Portal、退会前解約へ共通適用。全要求とWebhook schemaは `2026-08-26.dahlia` に固定。raw bodyの署名・タイムスタンプ・API版・modeを検証し、不正入力は400、API/DB/処理リースの一時障害は503で再送を求める。
- 削除された `invoice.paid` / `paid_out_of_band` / `invoice.subscription` を決済証拠に使わない。Invoiceの親購読・customer・通貨・合計/支払額・税設定、唯一のpaid InvoicePayment、成功PaymentIntent、未返金/未紛争Chargeを照合する。初回/更新とも299 cents USDだけを会員権利へ反映する。
- `checkout.session.completed` と `async_payment_succeeded/failed` を扱う。complete/unpaidは未払いとして保存し、paid状態とStripeの実支払い証拠が揃って初めてactive。購入成功URLから権利を付けない。subscription.createdがCheckout完了より先なら503にして再送を待つ。
- CheckoutはinclusiveのUSD299/月Price、数量1、初回合計299をtest/liveで同じ厳しさで確認。動的決済方法を維持し、`integration_identifier=qg_web_membership_<ランダム英字8字>` を付ける。
- `automaticTaxEnabled` は既定false。trueにするには独立した `taxRegistrationConfirmed=true` が必要。税登録は未登録/不明なので今回は両方OFF。Checkoutごとに `managed_payments.enabled=false` を明示し、アカウント既定設定を変更しない。税の販売方針はRootが最終判断する。
- 新migration `20261003023533_stripe_canonical_reconciliation.sql` は、Stripe読取り前の90秒のDB処理リースとUUIDのfenceを追加。期限切れ/交代したworkerはコミット不可。同一購読の読取り→投影は直列化し、`event.created` は監査情報として保存する。より古いイベントでも、その処理が読んだ現在のpaid状態で未払いから復旧できる。投影とimmutable raw-body hashの受領記録は同じDBトランザクション。
- canceled/incomplete_expiredの同一Subscription IDは復活させない。返金/紛争のholdは同じ期間のpaidイベントで解除しない。検証済みの次の支払期間だけ解除可能。通常解約は期末までactive。会員券の別枠3+3、同日一回、失効、旧購読から新購読への持ち越し禁止は既存の原子的財布処理を使用する。
- 退会は開いているCheckoutをexpireし、全購読の外部cancelを検証してから最小のSubscription ID/mode tombstoneを保存する。保存に失敗したら退会を止める。プロフィールFKを持たないtombstoneで退会後の署名付き遅延Webhookを受領し、ユーザー/会員/財布を再作成しない。氏名・email・customer IDはtombstoneに残さない。
- `STRIPE_BILLING_ENVIRONMENT=production` はmode=live、sandboxはmode=testを要求する。DBは最初のlive Checkout intentでliveに永久固定し、退会後も消えない。test QAは別deployment/DB。サーバーの4個とWebの3個のrelease-readyフラグはすべてfalseのまま。

## 検証と証拠の範囲

| 検証 | 結果 | 範囲 |
|---|---|---|
| Stripe対象Vitest | 10ファイル/64件PASS | 署名、現行schema、非同期、決済グラフの不正証拠、owner、リース取得順/競合/退会、Portal/OFF分離。外部APIはモック |
| 退会/OFF/QUBE回帰 | 3ファイル/20件PASS | 既存退会とOFFゲート、雑談原稿 |
| `npm run typecheck` / server build | PASS | T4専用worktreeで実行 |
| `test-stripe-canonical-sql.mjs` | PASS | 12本のraw migration全順序、逆順復旧、重複/hash衝突、旧fence拒否、返金hold、別枠3+3、期限/再加入/退会/tombstone、live固定、RLS/client拒否。PGliteの実SQL |
| `test-stripe-native-postgres.mjs` | PASS | ネイティブPostgreSQL、独立した複数DB接続・別workerプロセス、強制終了、12回の返金/逆順競合。終了時にDBとworker停止を確認 |
| 本物のStripeサンドボックスAPI | PASS | 固有metadataの使い捨て資源でCheckout作成/期限切れ、Test Clock初回・翌月更新ともUSD299/自動税OFF、全額返金、期末/即時解約 |
| T4 SDKの本物Invoice照合 | PASS | 最新Invoice→InvoicePayment→PaymentIntent→Chargeの読取りをT4コードで実行。SDKのHTTP test seamから既存CLI認証を使用し、実キーを抽出しない |
| 実署名Webhook | 8件PASS | CLI localhost転送の実raw bodyを公式SDKとT4 verifierが検証。実受領eventのAPI版もdahlia。アプリDB投影の証明ではない |
| 実Checkout→会員→3+3枚 | **未確認** | ブラウザ購入とsandbox用DB/認証まで含む通し試験が必要。APIで直接作ったSubscriptionは購入E2Eと呼ばない |
| 本番API/キー/税/配信 | **T4未実施** | Rootが管理。T4は本番変更・実カード・live請求・販売ONを行っていない |

別workerは実アプリの `StripeMembershipStore` を使用する。Supabase/PostgRESTのHTTP transportだけをlocalhostのnative PostgreSQL Clientへ置き換え、実際のRPC SQLを実行する。Stripeのprovider stateはfixtureなので、これはDB競合/障害注入の試験であり、本物Stripe購入E2Eの代わりにはしない。

ネイティブPostgreSQLでは、2つの別プロセスの同時リース取得が一方だけ成功した。期限切れの生存workerは新しいcanceled投影を大きなevent.createdでも上書きできず、受領記録も増えなかった。コミット前死亡はTTL後に再取得、コミット後/HTTP応答前死亡は受領記録で重複排除。2接続の同日claimは一方だけ3+3枚を付与。12回の現在期間invoice/refund競合でholdと残券失効を維持した。TTL経過は試験用DBの期限列を過去へ進めて短縮した。

サンドボックス実測の固有runは `qg_t4_20261003_deedytox`。詳細JSONはT4チャットのoutputsに保存。Checkout expire、Subscription cancel、Test Clock/customer削除、Price/Product archiveを確認。カードはStripe公式test tokenのみ。秘密鍵/署名secret/raw署名/カード番号は記録しない。

再現用ライブラリは既存依存へのjunctionで読み取る。大量コピーはしない。VitestはT4の `scratch/t4/vitest.config.ts` で `cacheDir` を自身のscratchへ向けた。native PG依存は `scratch/stripe-postgres/node_modules` に既存 `pg@8.16.3` と `@embedded-postgres/windows-x64@18.4.0-beta.17` を読み取るjunctionを置き、クラスタはT4にだけ作る。T1のソース/クラスタは編集しない。環境のlockfileは既存npm ciのpeer不整合があるため、今回その無関連変更は含めない。

## Root/T6へのAPI・権限契約

raw endpointは `POST /membership/stripe/webhook`。Root報告の本番URLは `https://q-chess.onrender.com/membership/stripe/webhook`、own account、API `2026-08-26.dahlia`。T4は本番destinationを操作していない。

必要イベント15個:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.paused
customer.subscription.resumed
invoice.paid
invoice.payment_failed
invoice.voided
invoice.marked_uncollectible
charge.refunded
charge.dispute.created
radar.early_fraud_warning.created
```

| Restricted Key権限 | 呼出し |
|---|---|
| Checkout Sessions Read/Write | retrieve/list/line_items、create、expire |
| Prices Read | reviewed Price確認 |
| Subscriptions Read/Write | canonical retrieve、退会の即時cancel（prorate=false/invoice_now=false） |
| Invoices Read（UI上はInvoice Paymentsも含む） | invoice.retrieve / invoicePayments.list |
| Payment Intents Read | invoiceの実決済証拠 |
| Charges Read | 未返金/未紛争の証拠、risk lineage |
| Customer Portal Write | sessions.createとconfigurations.list。Root UIでは両endpointが同じgroupなのでWriteが必要 |

Customers/Products/Refunds Write、送金Write、Webhook destination Writeは本番アプリ実行鍵に不要。Portal groupの追加承認/キー作成/secret配置はRootが人間と扱う。Stripe UIのpermission groupingはRootの現物確認に基づく。RAKで必要endpointに403がないことはRootのsandbox/本番準備で実測する。

## sandbox再認証と残る購入E2E

CLIの既存認証は2026-10-03 02:50:58 UTCに失効。Rootで `stripe login --non-interactive` を実行し、返された `next_step` を直ちに開始する。Root/人間のブラウザでQ-Gambitサンドボックスを承認し、`stripe whoami --format json` のaccount/mode=test/期限を確認する。`--new-session`で既存ログインを不用意に破棄しない。実キーをチャットへ貼らず、OS credential storeまたは専用deploymentのsecretへ保存する。

購入E2Eは別sandbox deployment/DBに対象migrationだけを順序適用し、使い捨てプロフィール/規約同意を作る。認証APIでCheckoutを作ってDB intent登録を確認し、Rootがテスト購入を完了する。実署名Webhookのリース→canonical read→receipt/会員投影、status、同日/複数端末daily-grant（3+3一回）を照合する。続けてasync成功/失敗、更新USD299、期末Portal解約、返金/紛争/早期警告、退会、再送/応答喪失も本物Stripe資源で確認する。逆順/競合のDB部分は上記native試験が完了している。

## 統合・販売前に残る事項

- T3/T5から `GET /membership/stripe/status` と `POST /membership/stripe/daily-grant`（空JSON、Bearer認証）へ接続する。会員claimは無料ログインclaimとは別。Webの購入成功URLだけではclaimしない。T4は担当外UIを編集していない。
- 会員券各20枚の上限は未確定。既存SQL上限を販売仕様の確定とみなさない。新しい規約版へのDB consent更新はT3/T5と統合する。T4 QAの旧版consentは基点fixtureの互換用で、販売の同意証拠ではない。
- 最小tombstoneの保持方針と商取引/税/販売地域をRootが確定する。自動税をONにする場合は登録確認と初回/更新USD299総額を改めて実測する。現状OFF。
- processing、Portal、退会guardは最初の販売後に維持する。新規購入を止める際はCheckout gateだけをOFFにし、mode/key/webhook secret/Price/URL設定を消さない。test QAのために本番をtestへ切り替えない。
- Rootはlive RAKとwebhook secretをserver-only secretへ保存し、API版/mode/RLS/適用履歴を確認する。購入OFFで既存管理経路と不正署名400・一時503・同一event副作用一回を確認する。T4のmutation migrationだけを選定し、広告など他pending migrationを一括適用しない。
- 本番購入、販売ON、実請求を伴う検証はRootの別判断。**このローカル成果だけで販売を開始しない。**

QUBE雑談原稿 `t4-stripe-20261003-tea` を自分のbranchの `src/data/devDiary.ts` に追記・exportし、テスト済み。正本への取り込みと公開表示は統合担当が扱う。公開未反映、X送信なし。
