# CPU練習ヒント検索の実用性確認（2026-10-03）

基点は `e77e2980c24d593b2e742a43e291aa2117e2305a`、作業ブランチは `codex/t2-hint-usability-20261003`。Rootの `fb5ead6` までの差分は統合資料のみで、この検索・service・エンジン・fixtureの変更はないことを確認した。

## 原因と修正

共有検索は時間予算内に評価した合法手を保持し、より深い探索が完了しない場合もその候補を返す。しかしCPU練習Workerは `depth === 0 && timeMs >= timeLimitMs` を一律 `SEARCH_TIMEOUT` にしていた。通常の全駒未確定の初期局面と合法な序盤で、評価済みの候補があってもヒントを取得できなかった。

`CpuPracticeSearchWorker.ts` は共有検索の評価済み候補を受け取り、ヒントの場合は `applyPracticeMove` で再度合法性を確認して返す。深い探索が未完了なら、保持されている浅い評価の候補を利用する。課金service側でも従来どおり所有権・局面・合法性・中断を検査し、その後にDBトランザクションを呼ぶ。

例外、候補なし、切断、Workerの監視タイマー超過、過負荷は成功へ変換しない。検索の4,000ms予算と同時Worker上限2は維持する。既存のWorker監視期限は起動等の余裕を含む6,000msで、通信を含む応答が必ず4秒以内になるという保証はない。Worker起動失敗時に実行枠が減らない問題も修正した。

共有エンジンの検索アルゴリズム・評価関数、DB/財布SQL、規約、課金条件、公開ゲートは編集していない。無料20／会員60の統合方針を維持する。浅い評価のヒントは合法な推奨候補であり、深い探索の最善手を保証するものではない。

## ローカル測定

`scripts/qa/measure-cpu-practice-search.mjs` はコンパイル済みの実Workerを使い、通常初期盤面から合法手だけで進めた8局面を測定する。合成の確定盤面を測定用に注入しない。保存された手順が改善前後で完全一致することを比較した。

- 局面: 0、2、3、6、12、13、20、30 ply。白・黒手番とcaptureを含む。
- 各局面2並列 × 3回 = 6要求、計48要求。レベル5、検索予算4秒。
- 全返却手を独立した `applyPracticeMove` で検証し、入力局面の非変更も確認。
- ローカル環境: Intel Core i7-1165G7、8 logical processors、Node v25.2.1。

| ply | 改善前の合法ヒント | 改善前TIMEOUT | 改善後の合法ヒント | 改善後TIMEOUT |
| --- | ---: | ---: | ---: | ---: |
| 0 | 0/6 | 6 | 6/6 | 0 |
| 2 | 4/6 | 2 | 6/6 | 0 |
| 3 | 5/6 | 1 | 6/6 | 0 |
| 6 | 0/6 | 6 | 6/6 | 0 |
| 12 | 4/6 | 2 | 6/6 | 0 |
| 13 | 6/6 | 0 | 6/6 | 0 |
| 20 | 6/6 | 0 | 6/6 | 0 |
| 30 | 6/6 | 0 | 6/6 | 0 |
| 合計 | 31/48 | 17 | 48/48 | 0 |

改善前の応答時間は中央値4,133ms／p95 4,856ms／最大4,924ms。改善後は中央値4,083ms／p95 4,427ms／最大4,530ms。別時刻のローカル実行であり、他プロセス負荷は固定していない。速度向上の保証やRenderのCPU・メモリ・同時処理容量の証明には使わない。

再実行:

```powershell
npm --prefix server run build
node scripts/qa/measure-cpu-practice-search.mjs --repeats 3 --require-success --output scratch/cpu-practice-search.json
```

## 回帰検証

対象7ファイル・33テスト成功（追加13テストを含む）。

- 実検索の時計を制御して深さ0の終了を再現し、評価済み合法手を返すことを確認。
- PGliteで実service/SQLを通し、初回の並行要求が1枚だけ消費することを確認。
- 実購入commit後に応答を失わせ、同じreceiptの復旧・別IDでの6並行再取得に追加消費がないことを確認。
- `SEARCH_TIMEOUT`、`SEARCH_FAILED`、`SEARCH_BUSY`、不適法な結果では残高不変・receiptなし。
- Worker上限2、キャンセル、異常終了、6秒監視タイマー、遅延メッセージ、起動失敗後の実行枠回復。
- 既存HTTP切断、認証・所有権・偽装・stale/終局/online/ranked拒否、OFFゲート、client再取得、共有エンジンの戦術・候補伝播、ヒント表示フックの回帰。

```powershell
npm test -- server/src/services/CpuPracticeFallback.test.ts server/src/services/CpuPracticeSearch.test.ts server/src/services/CpuPracticeRoutes.test.ts server/src/services/TicketFeatureGates.test.ts src/lib/cpuPractice.test.ts src/quantum-engine/__tests__/cpuRegression.test.ts src/hooks/useMoveHint.test.ts
npm run typecheck
npm --prefix server run build -- --noEmit
node scripts/qa/test-cpu-hint-sql.mjs
```

すべて成功。最後のSQLスクリプトは既定の実Workerによる初期局面ヒントの購入・合法性、無料/有料/失効/返金、復旧、復元、RLS、削除も確認した。PGliteはメモリ内fixtureであり、本物のSupabase複数接続・本番課金の検証ではない。最初のVitest起動はread-only sandboxのOS一時ディレクトリ権限でテスト実行前に停止したため、このworktreeの `scratch/t2-test-temp` をプロセスのTEMP/TMPに指定して実行した。

## 引き継ぎ

Web/Androidの最終ビルド、実機、有料ONの画面、Render実容量・ネットワーク・複数process、Supabase本番相当の統合確認はRoot担当。各自のNext buildや追加依存installは行っていない。公開・販売・広告ゲートはOFFのまま、本番通信・本番アカウント/DB作成・本番決済・秘密値の取得・デプロイは行っていない。

QUBEは同じCPUヒント作業の既存 `t18-cpu-practice` を維持し、重複投稿は追加しない。ローカル検証済み・公開未反映。容量復旧時に約7.7GBの空きを確認して検証を再開した。以前提示したT2キャッシュ削除は実施していない。
