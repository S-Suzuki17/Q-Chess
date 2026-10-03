# T3: 承認済み新規約と新同意必須化（2026-10-03）

実装基点: e77e2980c24d593b2e742a43e291aa2117e2305a。
ブランチ: feature/t3-approved-terms-20261003。公開・push・本番DB・Stripe操作は未実施。広告、販売、券の各release gateはOFFのまま。

## 変更

- 承認済み全文は src/config/currentTerms.ts の 2026-10-03.1。無料各20、会員各60、未ログイン／未受取日の後日一括受取なし、上限外の返還分、削除前の購読解約確認、最小限の決済識別子の分離保持を日英で記載。/terms で全文と未発効表示、旧全文を別枠表示。
- 旧 src/config/terms.ts、旧 /account/terms の GET/POST・版2026-09-25.1はそのまま。一般プレイの TermsGate は従来版の同意を使う。旧同意済みユーザーに新規約を一般プレイの条件として強制しない。
- 券受取用の任意の同意欄を設定画面に追加。新規約を確認し、明示的に同意した後に /account/current-terms に保存。Checkout画面にも全文と明示同意。クライアントの同意日時・ユーザーIDをPOST本文に受け付けない。サーバー検証後のみ受取を再試行し、アカウント変更・アンマウント時は中断。
- 新しい本人認証済みAPI /account/current-terms は旧APIから分離。SQLの公開日・版・サーバー同意日時を返す。日付未設定／未来ならPOST拒否。元のサーバー同意日時をリトライで変更しない。
- daily-login/claim、Stripe daily-grant、Stripe checkoutだけWeb/API/SQLの新同意必須。APIは旧同意だけなら403 CURRENT_TERMS_REQUIREDでStripe呼び出し前に拒否。SQL preflightとintent登録も両方ガードし、APIを迂回しても不可。
- 新migration 20261003042315_approved_current_terms_consent.sql は service_role限定、security invoker、空search_path。新policyはRLS有効、service_roleはSELECTのみ。既存の無料／会員付与のロック・日付・上限・返還・idempotencyの本文は同意判定以外維持。
- 決済通知、projection、状態照会、portal、アカウント削除の購読取消、既存券消費／一般プレイに新同意条件を追加していない。新規購入停止と既加入者管理は独立。新規約だけを持つ本人は無料残高照会も可能。
- 個人情報説明に遅延通知対策の決済識別子保持を追記。Androidの新同意欄に購入・外部決済CTAなし。請求管理・購入画面は従来のWeb境界を維持。

## 公開担当への引き継ぎ

実際の公開日は未確定のため CURRENT_TERMS_EFFECTIVE_DATE と current_terms_policy.effective_date は両方NULL。Rootが公開直前に実際のJST公開日を決定し、Web定数とDBのpolicyに同じ日付を設定する。SQL側だけ／Web側だけの設定ではWeb新同意・Checkoutはfail closed。適用済みmigrationを編集して再適用せず、必要ならCLIで後続migrationを作る。policyの変更権限をAPIに与えない。

日付設定は販売／券機能のrelease gateを開かない。承認済み公開手順・統合検証に従い、Rootが別途判断する。公開前に新版画面、server、migrationを揃える。旧端末向け/account/termsの版を変更しない。新規約未同意の旧Androidで一般機能は従来どおり、新しい券受取は拒否される設計。旧Androidから新版同意を行う実機経路は未検証。

## 検証

- focused Vitest: 27 files / 189 tests passed。current/legacy terms HTTP、認証・改ざん・未発効・旧同意拒否、無料券、Stripe Checkout/webhook/status/portal、削除／購読取消、gateway互換、Web/Android UI境界、同意後再受取と古いリクエスト中断。
- npm run typecheck: PASS。
- server: node ../node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.json: PASS。
- node scripts/qa/test-current-terms-sql.mjs: test/live 両方PASS。既存PGlite依存を使うメモリ内の実SQLのみで、DBディレクトリ／追加クラスタなし。NULL/未来/旧同意のみ拒否、同意後claim/Checkout、旧契約成立後の新同意前payment projection/status、同意時刻不変、無料20／会員60、ロールACL、削除中拒否を検証。
- 旧APIと旧規約本文への変更なし。全release gates OFF。
- Next build、Android build、実機・公開URL・実Stripe/本番DB・Supabase advisors は未実施。容量対策の指示により最終Web buildはRootが統合後に一回実施する。今回の証拠は実機や本番動作の保証ではない。

新規約は法的保証／税登録済み／広告承認済み／販売開始済みの表明を追加しない。QUBE追記なし（追加統合では投稿しない指示を継続）。
