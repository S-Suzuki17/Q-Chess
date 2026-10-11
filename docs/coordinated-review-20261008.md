# Q-Gambit 分担改善・受入更新（2026-10-08、日本時間）

## 現在の判定

表示6項目＋メール/名前/パスワード登録・名前/パスワードログインの範囲を維持し、3担当のレビューで判明した具体的不具合を修正した。クラウド内で実証できた対象の確認は終了。未公開で、実機・ネイティブ拡大・可聴音の完全受入は保留する。以前の記録 `cloud-acceptance-20261008.md` は前回の時点の履歴であり、この更新と最終manifestを現在の結果として読む。

## 担当と統合

| owner | 担当範囲 | 修正・証拠 | 状態 |
|---|---|---|---|
| /root/presentation_review | 6項目の独立表示レビュー、短画面 | 達成条件を隠すCSS1行を削除。320×568、844×390、320×180相当で説明と開始へ到達。`multi-review-presentation` | 終了 |
| /root/authentication_review | 登録/ログイン、互換性・入力・権限 | 登録名の入力上限で前後空白付き15文字が14文字に切れる問題を修正。入力128文字、trim後3〜15文字の既存検証維持。2viewportの境界登録・再ログイン・16文字拒否。フォーム文字2/4倍も2件成功。`multi-review-auth` / `multi-review-auth-text` | 終了 |
| /root/acceptance_review | 証拠照合、残る通常動作/拡大/遅延/復帰QA | 通常動作15フレーム、画像遅延と閉じる、人工visibility seamを確認。400%文字で横切れ・操作縮小を発見し、折返し/自然高さ/スクロールで修正。`multi-review-qa` | 終了 |
| /root | スコープ・保護仕様・差分/証拠照合、統合・保存 | 公開説明のsource hash更新、最終build、patch/tree再現、ZIP検査、Page保存 | 統合担当 |

レビューを分担し、編集はownerごとに順に引き継いだ。初回の別領域の小変更が並行になった時点でリポジトリの同一tree同時編集禁止を確認し、以後は順次編集へ変更した。旧監督/親はソースを並行実装していない。旧Vercel `q-chess-w8rg` は利用していない。

## 今回の確認結果

- `multi-review-auth/results.json`: 390×844 / 1280×720、15文字＋前後空白の実入力→正確なIDで登録/自動ログイン/再ログイン、16文字拒否。メモリ内架空アカウント、実TitleScreen/router/RankedAuth。
- `multi-review-auth-text/results.json`: 390×844、フォーム文字/line-heightをcomputed値から2倍・4倍。入力・checkbox・決定・validation alert・キャンセル到達、登録後ログイン成功。横幅390内。hero全体・ネイティブ拡大・実機キーボードの検査ではない。
- `multi-review-qa/results.json`: 全15フレームを通常動作で一度光らせ停止、一覧静止を確認。旧検査はreduceのみだったため、本結果で通常動作の不足を補った。画像の遅延中にEscapeで閉じ、返答後も閉じたまま。visibilityはdocument.hidden/visibilityStateを人工的に設定し実visibilitychangeを送った限定検査で、ネイティブ背景タブではない。
- 同JSONの文字400%2件の初期失敗は消さず保持。修正後は `text-400-after.json` で挑戦/コレクション2件成功、横幅390内・開始到達・説明と操作の重なりなし。
- 通常390×844 / 1280×720の4ケースで追加パネルスクロールなし。320×568 / 844×390の短画面では必要な縦スクロールで内容・操作へ到達（`short-layout-after.json`）。横向きは承認済みの部屋と進行の横2列。初期診断の縦順チェックが横配置を誤判定したため、実矩形の横位置も判定して再確認し、横2列デザインは変更していない。
- 名前境界修正後のtypecheck成功。TitleScreen局所lint error0・既存画像warning3、新QA script lint/syntax/diff検査成功。変更に合わせた最終production build結果は納品ログ参照。既存受入suite全体は無理由に再実行していない。

CSS修正は文字折返し、最小幅、メタ情報の自然高さ、grid/cardのmin-content、パネル最小高さに限定した。画像・ピクセル背景・駒・QUBE・演出素材を追加リデザインしていない。ゲームルール、CPU、100ステージ、時計、経済・報酬ID/所有/解放/装備、PR20無料練習/券/入場キャンセル、最新ヒント・解説文は今回の追補で変更していない。

## 残る確認と具体的操作

| 未確認 | 確認する画面・操作 / 限界 |
|---|---|
| ネイティブ文字拡大・ブラウザ200/400% | 未公開fixtureのCrown両タブ、説明・開始・全カテゴリ・ページ・閉じる、登録フォームの各入力/エラー/キャンセルを実設定で拡大。今回のcomputed font-sizeやviewport相当検査とは区別する |
| 実背景タブ | 勝利途中に実際に別タブへ移り、音停止・復帰時の演出完了/中断を確認。今回のvisibility seamはOS/browser schedulingを証明しない |
| 実端末/GPU性能 | 勝利4系統を実機で再生/中断/動作軽減切替、描画・GPU・メモリ・温度とframe時間を測る。SwiftShader測定から実機60fpsは主張しない |
| 可聴音 | 未公開fixtureの効果音を音量0/0.3/1・ミュートで実際に聞き、音量/音質・途中停止を確認。headless再生currentTimeのみは可聴音確認ではない |
| 実機WebGL context loss | 前回クラウド結果はWEBGL_lose_context拡張で人工的にloseContextしCanvas2D fallback成功（元QA sourceとresult contextLoss:trueを照合）。実機driverの喪失・復旧は未確認 |
| 公開環境の登録障害 | 実アカウント/本番DBを使っていないため本番原因は確定していない。新RPC migrationは未適用。公開や本番検証には具体的対象の別承認が必要 |
| ドメイン直接GET | 両URL各1回のクラウドGETはネットワーク政策で遮断。HTTP状態/最終URL/サイト障害は判定できない。`q-gambit-domain-check-20261008.json` |

これら実機確認は、承認された検証環境が用意された後の確認項目であり、手元PCでの実装/検証や現在の本番操作を追加許可したものではない。本改修は未公開なので、現行q-gambit.comを改修後QAの証拠にしない。

最終base/tree/source hashes、全patchと証拠SHA256は更新ZIPのmanifestに記録。以前の原資料とQA履歴は保持し、今回のpackageには新証拠全件と元QAの代表画像/最新録画・JSONを収録する。
