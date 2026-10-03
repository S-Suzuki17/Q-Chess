# T0 共通基点（2026-10-03、ローカル検証・公開未反映）

基点ブランチ: `integration/t0-ticket-off-20261003`。親は `1949a6e0f94ec4223fabd5c7eac40ed8f945c0d2`。
この文書を含むコミットがT1〜T6の基点。元checkoutの未コミット差分を丸ごと持ち出さず、基点コミットを指定した別worktreeから始める。

## 実装とゲート

- `server/src/services/TicketFeatureGates.ts` のランク入場、CPUヒント券、ログイン報酬のrelease-readyはすべて `false`。環境変数を `true` にしても解除されない。
- ランクの無料PvP・CPU代替戦は券入場RPCを迂回して既存のゲームを開始する。SupabaseServiceの入場・voidも直接呼び出しではRPC前に拒否する。
- `request_cpu_hint` は履歴再生・探索・サービス作成前に `FEATURE_DISABLED`。ブラウザWorkerによる既存無料CPU練習ヒントは継続。
- Webログイン報酬フラグも `false`。ログイン時の自動claim、残数パネル、APIのデフォルトをOFFに合わせた。
- Stripeサーバー4ゲート・Web3ゲートの既存 `false` は維持。券や課金の販売開始・DB適用・外部公開を意味しない。
- migration全順序のローカル試験で見つけたtest/live返金RPCの `GRANT` 引数数（textが1個多い）だけを定義と一致させた。

## 現物監査と後続で必須の修正

- ランク入場コードは対局エンジン/時計作成後に待つ構造。T0では無効化した。T1で入場確定前の時計、操作、再接続、match_start/sync_stateを一体で制御する。
- 実CPU IDは `ai:`、SQLはjoinerの `cpu-%` だけを片側扱いする。hostがCPUの場合もFK/消費判定が不適合。
- `void_ranked_admission` は記録を消すだけで残高を戻さない。CPU障害経路はvoidを呼ばない。重複UUIDのメタデータ、settle/void競合、曖昧な応答、再起動復旧もT1で未検証。
- CPUヒントはクライアント棋譜の再生とhashを使う。サーバー所有の認証済み練習セッション・局面revisionがないためT2完了までONにできない。
- T3の実DB/同時請求、T4のStripeテストE2E・税/販売地域・運営者情報・会員券上限の確定は未完了。
- 同梱migrationはOFF機能の開発用基礎。PGlite試験は実Supabaseの全権限/環境/同時実行や販売の証明にはならない。本番の適用履歴を照合せずに一括適用しない。

## 所有者と取り込み境界

開始時は `fix/publisher-site-review-20260929`、親HEADは上記、約136件の既存変更があった。既存のユーザー/Antigravity/前セッションの作成者はGit差分だけでは確定できない。T0作成物と既存の関連下書きを区別して扱い、未関連差分を保持する。

基点には券・課金のOFF実装、その直接依存、関連テスト、11本の開発用migration、6本のSQL QA、引き継ぎ資料とQUBE雑談1件を明示選択する。サーバーのコピー済み量子エンジンはCPUサービスが使うTS依存だけ。生成JSや未使用adapter/テスト群は取り込まない。

元checkoutに残すもの: release/terms/Cloudflare/itch資料、itch成果物・公開用画像・作業出力、scratch、replace.js、ルートlockfileの無関係なメタデータ変更、未接続の会員退会UI/翻訳テスト、生成JS、コピーエンジンの未使用ファイル、元のserver/tsconfig adapter除外。

## 検証

コミット対象だけを別ディレクトリへ展開し、未追跡JSや未選択差分を参照しない形で `npm test`、`npm run typecheck`、`npm run build`、`npm --prefix server run build` を実行する。

実行結果: `npm test` は141ファイル/1076テスト成功、型検査・Web静的ビルド・サーバービルド成功。SQL QA 6本すべて成功。対象外539ファイルのSHA-256は選択前後で一致し、ステージ94ファイルは検証用ディレクトリのソースと一致した。

Webビルドの依存junctionはTurbopackのroot制約で不可だったため、依存を実体コピーして正規の `npm run build` を実行。Google Fontsの取得にはネットワーク許可付き実行が必要だった。コード/チェックの回避はしていない。本番環境変数は持ち込んでおらず、ここで作った `out/` はローカル検証用で配布成果物ではない。

回帰対象: 実MatchmakingService/GameEngineによる無料ランクPvP、両側のCPU代替戦、券DB不在、env ONでもRPC不実行、偽造ヒントの処理前拒否、ローカルWorkerの合法ヒント、Web報酬UI/claimの無動作、サーバー報酬GET/POSTのOFF。

SQL QAの準備: `npm install --prefix scratch/ticket-sql --save-exact @electric-sql/pglite@0.5.8 --ignore-scripts`。`scripts/qa/test-ticket-migration-chain.mjs` と既存5本は使い捨てPGliteで実行し、外部DBへ接続しない。

QUBE `t17` を正本 `src/data/devDiary.ts` に追記して原稿を同期。公開未反映。外部SNSへの投稿なし。
