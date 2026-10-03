# Q-Gambit 別チャット分岐用引き継ぎ（2026-10-03）

この文書は**実装完了報告ではない**。別チャットが会話全文を読まずに着手できるよう、現物監査の結果、担当境界、完了条件、貼り付け用の依頼文をまとめたもの。公開・課金・DB変更の許可をこの文書だけで引き継いだとみなさない。

T0のローカル基点とOFFゲートは `integration/t0-ticket-off-20261003` にまとめる。最新の取り込み境界・検証・未解決事項は [T0基点報告](t0-integration-baseline-20261003.md) を参照。以下の無条件接続/表示ONという記載はT0前の監査結果であり、基点では無効化済み。券処理そのものや販売の完成は意味しない。

## 作業場所と現時点の警戒事項

- 正本: `C:\Users\souta\Documents\Codex\2026-09-09\blender-x20\work\q-gambit-app`
- 2026-10-03 の確認時点: ブランチ `fix/publisher-site-review-20260929`、HEAD `1949a6e`（`origin/main` と同じ）。約136件の変更・未追跡ファイルがある。古いローカル `main` ではなく、この作業ツリーとリモートの現状を再確認すること。
- `AGENTS.md` と `docs/agent-workflow.md` に従い、**同じ作業ツリーを複数チャットで同時編集しない**。まず T0 で変更の所有者と安全な統合基点を確定し、この文書も基点へ含め、その後は別ブランチ・別 worktree に分ける。この文書自体は作成直後には未追跡なので、T0より先に新 worktree を作った場合は元の絶対パスから読む。生成物・ユーザー/Antigravityの変更を一括追加、破棄、上書きしない。
- `docs/web-ticket-rollout-20260930.md` と `docs/ranked-start-admission-recovery.md` は後続の未コミット実装より古い。記述された「すべてOFF」「未接続」を鵜呑みにしない。
- **このツリーを現状のまま Render / Cloudflare Pages / Android に公開しない**。`server/src/index.ts` はランク開始時のDB入場を無条件に呼ぶ一方、対局エンジンと時計が入場確定前に作られる。CPU代替戦のIDとSQLの判定が合わず、void SQLには消費済み券の返還がない。CPU障害経路もvoidを呼ばない。`request_cpu_hint` はクライアント申告の棋譜を信頼する。`src/lib/dailyLoginRewards.ts` のWeb表示ゲートは `true` だがサーバーは環境変数依存。まず失敗閉鎖を確認する。
- Stripeのサーバー側4ゲートとWeb側3ゲートはソース上 `false`。ライブStripeには月額 $2.99（税込総額想定）の商品・価格があるが、文書上は購入受付、ライブWebhook、会員券の本番運用は未開始。外部環境はこの監査では照合していない。
- Web本番は資料上 Cloudflare Pages `q-gambit-web` の Direct Upload（Git pushのみでは更新されない）。Renderは `main` 連携、Supabase migrationとAndroid AABはそれぞれ別の配布工程。広告・回数制限は公開版でOFFのままという方針を維持する。

## 確定した商品・ゲーム仕様

- ランク戦はアカウントごとにUTC日付で**開始した対局3試合まで無料**。4試合目以降は対局券1枚。待機・マッチ不成立・開始前キャンセルは消費しない。PvPは両者原子的に判定、CPU代替戦は人間側のみ。
- 無料の連続ログイン報酬: 1〜7日目の対局券 `[1,1,1,2,2,2,3]`、CPU練習ヒント券 `[2,2,3,3,4,4,5]`。7日目以降は最大段階を継続、1日逃すと1日目へ戻り、無料券は各20枚上限。
- Web向け月額会員案は税込み総額 USD $2.99、毎日対局券3枚とCPU練習ヒント券3枚を無料券とは**別枠**で付与。通常解約は次回更新を停止し支払済み期間末日まで利用、通常解約の日割り返金なし（法定権利は制限しない）。会員終了・返金・決済取消で未使用会員券は失効し再加入へ持ち越さない。
- **未確定**: 会員券の各20枚保有上限はローカル実装上の値で、ユーザーの確定回答はない。販売者の正式氏名/所在地/電話/責任者と公開方式、販売地域・Stripe Tax登録、Stripeの事業適合判断も未確定。推測で埋めず、秘密情報や本人情報をチャット・Gitへ載せない。
- AndroidはWebで購入した特典の利用のみ。Playアプリ内にStripe購入・外部購入リンク・誘導を出さない。AdSense/H5 Games Ads/AdMobの審査や広告ONはこの課金作業とは独立。

## 分岐順と担当境界

1. **T0 共通基点・緊急ゲート**を先に完了する。現ツリーの変更を安全に整理し、危険な未完成機能が誤配布されない状態と統合基点を作る。以後のチャットはそのコミット/ブランチを指定して別 worktree で開始する。
2. **T1 ランク入場と復旧、T2 CPU練習ヒント、T3 ログイン報酬と財布、T4 Stripe課金**は基点の後に別 worktree で並行可能。ただし `server/src/index.ts`、`server/src/services/SupabaseService.ts`、財布SQLは共通接点なので、互いの作業を取り込む統合担当は一人にする。
3. **T5 表示・規約・Android境界**は T1〜T4 の確定したAPI契約に接続する。運営者情報など本人判断が要る箇所は下書き止まりにする。
4. **T6 統合QA・公開**は最後に一人だけ担当。開発DBで依存migrationを全順序検証し、本番は適用履歴を照合して**対象migrationだけ個別選定**する。続いてRender、Cloudflare Webをそれぞれ確認。Androidの「購入誘導なし」は実機/ビルドで必ず検証し、AAB作成・Play配布は別ゲートにする。販売開始はさらに別の最終判断。**T7 広告審査**と**T8 40項目の残課題監査**は独立して進められるが、承認・実装確認まで広告や未完成の制限をONにしない。

各チャットの最終報告は、目的、基点コミット、変更ファイル、実行した検証と結果、未解決事項、公開/未公開の区別を短く示すこと。PRやコミットを作った場合はその識別子も記す。未コミット変更の所有者も明示する。

## 貼り付け用依頼文

以下の各ブロックを**別チャットへ1つずつ**貼る。T0の統合基点ができるまでT1〜T6のコード編集を同じ checkout で同時に始めない。

### T0 — 共通基点と誤公開防止（最優先）

> Q-Gambit の統合基点を作ってください。正本は `C:\Users\souta\Documents\Codex\2026-09-09\blender-x20\work\q-gambit-app` です。`AGENTS.md`、`docs/agent-workflow.md`、`docs/parallel-work-handoff-20261003.md` を読み、現在の未コミット/未追跡変更の所有者と差分を確認してください。資料より新しいランク入場、CPUヒント、ログイン報酬のコードを特に監査し、未完成機能が誤配布されても券喪失・未払い対局・画面エラーを起こさない失敗閉鎖ゲートを整えて検証してください。券機能OFFでは既存の無料ランク対局が止まらない回帰テストも必須です。既存変更を破棄・上書き・一括コミットしないでください。この文書も含め、検証済みの変更だけをレビュー可能な統合基点へまとめ、基点コミット/ブランチ、残した変更、テスト結果を報告してください。本番DB・Render・Cloudflare・Stripe・Playには触れないでください。

### T1 — ランク戦の開始確定・券返還・CPU代替戦

> Q-Gambit のランク戦入場を安全に完成させてください。`docs/parallel-work-handoff-20261003.md` と `docs/ranked-start-admission-recovery.md` を読み、T0の確定基点から専用 worktree を作ってください。主担当は `server/src/matchmaking/`、`server/src/game/RankedRuntime.ts`、`server/src/index.ts` のランク部分、`server/src/services/SupabaseService.ts` の入場部分、`supabase/migrations/20261001000001_ranked_match_admissions.sql` と `...000002_ranked_match_void.sql` です。現コードはエンジン/時計が入場確定前に始まり、CPU実ID `ai:` とSQLの `cpu-%` が不一致、重複UUIDのメタデータ確認なし、voidに返還なし、CPU障害がvoidを呼ばない問題があります。3試合/UTC日無料・以後1券を、PvP原子的入場、CPU片側、再接続、プロセス停止、曖昧なRPC応答、settle/void競合、UTC境界、残高上限を含めて直し、DB実行テストと障害注入で証明してください。入場コミット前は時計・操作・`match_start` を止めてください。T2〜T4のコードを巻き込まず、本番反映や制限ONは行わないでください。

### T2 — CPU練習ヒントのサーバー所有化

> Q-Gambit のCPU練習ヒントを券で安全に提供できる状態にしてください。`docs/parallel-work-handoff-20261003.md` のT2と `docs/web-ticket-rollout-20260930.md` のCPUヒント節を読み、T0基点から専用 worktree で作業してください。主担当は `server/src/services/CpuPracticeService.ts`、`server/src/quantum-engine/`、`supabase/migrations/20261001000000_cpu_hint_receipts.sql`、`src/components/LocalGameBoard.tsx` のヒント部分です。現サーバーイベントはクライアント申告の棋譜を信頼し、画面はブラウザWorkerのヒントが現役です。認証済みのサーバー所有CPU練習セッションと局面リビジョンに結び、合法的な{from,to}を生成後に同一リクエストIDで原子的に券を消費・保存し、応答喪失後も同じヒントを再取得できるようにしてください。ランク・オンライン・キャンペーンや偽造/古い局面では消費ゼロ。共有エンジン一致、並行要求、切断、返金/期限切れ、アカウント削除をテストしてください。制限ONと本番変更はしないでください。

### T3 — 無料ログイン報酬・財布の整合

> Q-Gambit の無料連続ログイン報酬と券財布を検証・仕上げてください。`docs/parallel-work-handoff-20261003.md` を読み、T0基点から専用 worktree で作業してください。主担当は `supabase/migrations/20260930083253_ticket_wallet_daily_login.sql`、`server/src/services/DailyLogin*`、`src/lib/dailyLoginRewards.ts`、`src/components/DailyLogin*` です。UTC日付、同日冪等、欠席リセット、無料券各20枚上限、本人認証/規約同意/退会、複数端末同時請求を開発DBで検証してください。現Webフラグはtrue、サーバーは環境変数OFFなので表示と503が食い違います。Web/サーバーの公開ゲートをそろえ、未有効時も誤請求・エラー表示が出ないようにしてください。ランク・ヒントの消費やStripeには踏み込まず、本番DB・公開サイトは変更しないでください。

### T4 — Stripe Web会員の決済・権利確認

> Q-Gambit Plus のWeb月額決済を**販売OFFのまま**完成・検証してください。`docs/parallel-work-handoff-20261003.md`、`docs/web-ticket-rollout-20260930.md`、`docs/stripe-commerce-disclosure-review.md` を読み、T0基点から専用 worktree で作業してください。主担当は `server/src/services/Stripe*`、Stripe用の `20260930` migration、認証Checkout/Webhook/Portal/退会前キャンセルです。Stripeテスト環境を本番から分離し、公式SDK・署名raw-body検証・イベント冪等性で購入、非同期決済、更新、解約、返金、決済取消、アカウント削除、イベント順序逆転をE2E検証してください。会員券は無料券と別枠で毎日各3枚、終了時失効。初回販売後は新規Checkoutを停止しても既存会員のWebhook照合・状態照会・Portal・退会前のStripe解約を止めず、ライブ購読のある本番プロセスのmodeをliveに固定し、test QAは別deploymentで行う設計にしてください。Stripe Taxの対象地域登録、初回Checkoutと更新invoiceの税込USD $2.99総額、API versionの合ったWebhook destinationは販売前の実測ゲートです。各20枚の会員券上限はユーザー未確定のため、販売可能と判定しないでください。秘密鍵をコードやチャットへ出さず、実カード/ライブ請求/本番Webhook作成/販売ゲートONは行わないでください。

### T5 — Web表示・販売開示・Android境界

> Q-Gambit のチケット/会員UIと販売前の表示を仕上げてください。`docs/parallel-work-handoff-20261003.md`、`docs/stripe-commerce-disclosure-review.md` を読み、T0基点とT1〜T4の確定API契約から専用 worktree で作業してください。Webで残数・無料3試合/UTC日・次のログイン報酬・購入前の月額/更新/解約/券失効を分かりやすく表示し、対象言語を検証してください。現行規約は有料購入なしと書くため、販売前に新しい規約版、同意導線、商取引開示、プライバシー記述を用意してください。正式な販売者名/所在地/電話/責任者、会員券上限、税登録/販売地域は本人決定が必要なので仮情報で公開しないでください。Androidでは既購入特典の利用だけとし、外部決済リンク・購入誘導を出さないテストを追加してください。販売/広告/回数制限をONにせず、本番には公開しないでください。

### T6 — 単独の統合・QA・段階公開

> Q-Gambit のリリース統合担当として、T0〜T5の成果を1つの検証済みブランチに統合してください。`AGENTS.md`、`docs/release.md`、`docs/verification.md`、`docs/parallel-work-handoff-20261003.md` を読み、他のチャットと同じツリーで同時編集しないでください。DB migrationの依存順・RLS・原子性を開発DBで通し、本番には現行適用履歴と依存関係を照合して今回対象のmigrationだけを個別選定してください。広告・事前登録など他のpending migrationを盲目的に適用しないでください。Web/サーバーのテスト・型検査・ビルド、ランクCPU代替戦、ヒント、認証/退会、課金テスト環境、Androidビルド/実機での購入導線なしを確認してください。現行の広告・対局回数制限・販売をOFFで保ちます。DB、Render、Cloudflare Web、Android AAB/Playは別成果物として段階確認し、進行中対局や既存レートに影響する操作、ライブ販売開始、Play公開は実施前にこのチャットのユーザーへ具体的に確認してください。更新が完了した時は `docs/dev-diary-workflow.md` に従いQUBE原稿の正本と公開状態を扱い、外部SNSには投稿しないでください。最終報告は配布先ごとの実際の確認結果と未完了事項を分けてください。

### T7 — 広告・審査（決済とは独立、後続）

> Q-Gambit のWeb AdSense/H5 Games Ads、Android AdMob、app-ads.txt/ads.txt、子供を含む対象者への広告設定を**読み取り監査**してください。`docs/parallel-work-handoff-20261003.md` と公開版の実表示・公式審査状態を照合し、WebとAndroidを混同しないでください。審査未了や広告商品未対応を推測で「承認済み」としないでください。広告・回数制限はOFFのまま、承認後の実装/配置/実機試験/公開に必要な手順と欠けている本人操作を示してください。審査情報の更新や広告ONは別途ユーザーに確認してください。

### T8 — 旧40項目監査の残課題（独立の継続トラック）

> Q-Gambitの旧「商業リリース40項目」を現行コードと公開環境で再監査してください。`docs/parallel-work-handoff-20261003.md`、`docs/commercial-release-audit-20260924.md`、`docs/account-controls-20260925.md`、`docs/security-followup-20260925.md` を読み、古い表の「未公開」記載を最新事実と混同しないでください。特に旧Android互換が残るプロフィール/フレンドの広いDB権限、直接Auth RPC、クラウンサーキットの端末間同期、全端末ログアウト、運用BAN/メンテナンス、最小監査ログ、Play署名OAuthを確認し、対応必須・条件付き・不要を分けて優先順位と検証を提示してください。ユーザーが休眠アカウントの自動削除、端末追跡によるBAN、広告ブロックを理由にしたログイン禁止を選ばなかった方針は維持してください。実ユーザーデータの変更、旧クライアントを壊す権限剥奪、本番公開は別途具体的な承認を得てから行ってください。

## 参照・検証の最小セット

- 共通: `AGENTS.md`、`docs/agent-workflow.md`、`docs/verification.md`、`docs/release.md`。
- 券と会員: `docs/web-ticket-rollout-20260930.md`。ただし状態説明は古いため現ソース優先。
- ランク: `docs/ranked-start-admission-recovery.md`、`scripts/qa/test-ranked-admission-sql.mjs`。既存SQLテストは返還/CPU実ID/競合/クラッシュを未カバー。
- 商取引: `docs/stripe-commerce-disclosure-review.md`。未公開・未承認の案。
- 商用監査の残課題: `docs/commercial-release-audit-20260924.md`、`docs/account-controls-20260925.md`、`docs/security-followup-20260925.md`。初回表より後続報告を優先。
- QUBE: `docs/dev-diary-workflow.md` と `src/data/devDiary.ts`。Xへの自動投稿なし。
- 検証コマンド: `npm test`、`npm run typecheck`、`npm run build`、`npm --prefix server run build`、関連する `scripts/qa/`。前回の通過結果（2026-10-01、139ファイル/1070テスト）は現在の変更後を保証しない。
