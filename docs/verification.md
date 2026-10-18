# 変更別の検証
コマンドはリポジトリルートで実行する。必要な対象を選び、同じ検証を理由なく繰り返さない。

- 特定のロジック: npm test -- <対象.test.ts>
- 型: npm run typecheck （incremental無効、型キャッシュを書き換えない）
- 盤面/駒/候補表示: npm run test:board と下記の表示確認
- ビルド設定やリリース: npm run build
- リリース対象の情報: npm run release:status -- web または android

npm test は既存vitest.config.tsの対象のみ。server内の全テストや実機確認を網羅しない。
外部サービスへ接続するテストは接続先・データ影響を確認してから実行する。

## 盤面表示
変更した機能がある画面に限定し、PCとモバイルの縦画面で確認する。
駒の白黒・候補アイコン・選択/移動先・獲得駒が判別でき、盤面が切れず操作できること。
3D変更時は2Dへの切替と3D表示失敗時のフォールバックも確認する。
スクリーンショットやHTTP成功だけを操作確認・実機確認の代わりにしない。
接続端末がない場合は実機未実施と記録する。

## 翻訳・コンパクト画面

`scripts/qa/secondary-screens-server.mjs --build <空の出力先>` は、
`QG_TEST_FONT_EXPORT` に指定した保存済みNext exportの実フォントを必要とする。
`QG_TEST_SECONDARY_STATIC` にその出力先を指定し、
`check-text-wrapping-browser.mjs` で12言語の語境界・操作枠内・横はみ出し・主要画面の高さを確認する。
`--screens=map --viewports=320x568,390x844,1280x800` はマップとコレクション全5カテゴリの限定確認。
フォントの入力hashは fixture の `font-binding.json` に残る。

実配布物は `check-account-data-browser.mjs <記録先> --target=web --secondary-screens
--home-languages=ja,en,zh,de,fr,es,pt,ru,tr,pl,hi,ta` で確認する。
通常の5認証・残高条件に4サイズの設定・マップ・全コレクションを追加し、
実際の言語選択からホームの12言語を切り替える。Android export は `--target=android`。
API・アカウントは合成応答で、実購入や本番の書き込みは行わない。
長い記事と拡大文字の可読性用スクロールは残す。ブラウザーのサイズ検査を実機受入としない。
