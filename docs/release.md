# Q-Gambit release
対象は依頼から選ぶ。資料を読んだことは公開の許可を意味しない。
Web / Android / itch の反映状態を混同しない。

## 共通
npm run release:status -- <web|android|itch> で作業場所、HEAD、変更状態、成果物の有無を確認。
対象差分を検証し、対象コミットと未コミット変更を記録する。
このコマンドは情報表示のみで、ビルド、署名検証、公開や端末確認は行わない。

## Web
npm run build で静的出力 out/ を生成する。
依頼された公開先と .vercel のリンク先を照合してから、利用可能なVercelの手順で公開する。
過去の別コピーのリンク先を流用しない。環境変数の値を資料・ログに転記しない。
公開後は対象デプロイの状態と変更した画面/動作を確認する。AABは別途更新が必要。

## Android
capacitor.config.json の webDir は out。
作業用コピーに本番設定がない場合、`node scripts/release/build-android-web.cjs <本番設定済みプロジェクトのパス>` でWebを作成する。
この処理は必要な公開用接続設定のみをプロセスへ読み込み、秘密キーを拒否し、広告・制限をOFFに固定する。環境ファイルを複写・ログ出力しない。
通常の設定なし `npm run build` の out/ を配布用アプリに使用しない。
対象の設定でWebをビルドし、ローカルに導入済みのCapacitor CLIでAndroidへ同期する。
versionName / versionCodeを配布履歴と照合し、AndroidのGradle wrapperで依頼された成果物を生成。
署名・同梱Web・バージョンを検証し、成果物のSHA256と対象コミットを記録する。
既存の署名情報を変更・表示しない。署名設定に平文資格情報があるため、安全な保管への移行は別途必要。
端末接続と実操作を確認できて初めて実機確認済みとする。
旧作業フォルダーの VerifyBundle.java は移植前に依存関係を確認する。

## itch
既存 deploy:itch は公開操作。引数と対象アカウントを確認して、依頼されたときだけ実行。
itch-build/ が最新の対象差分を含むことを確認する。

## 結果
対象コミット、Web URLまたは成果物、versionCode（Android）、検証結果、未実施事項を短く報告する。
