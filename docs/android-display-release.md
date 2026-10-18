# Android の表示対応（次回リリース）

対象は Q-GAMBIT の Android パッケージ。報告された Play Console の警告はリリース 22（1.17）。作業対象の main は既に versionCode 23 / versionName 1.18、compileSdk / targetSdk 36 だった。2026-10-18 に別の承認済み作業で versionCode 25 / versionName 1.20 が審査提出済みのため、この統合版の次回候補は versionCode 26 / versionName 1.21。署名済み候補の生成・静的確認と、実機受入・Play公開は分けて記録する。

## 変更

- `MainActivity` で AndroidX Core 1.17 の `WindowCompat.enableEdgeToEdge()` を呼び、Android 15 より前でも同じウィンドウ方針を使う。
- アプリ背景をウィンドウ全体に描画し、WebView の親で system bars・display cutout・IME の各辺の最大インセットを適用する。キーボードとナビゲーションバーを二重加算しない。
- Capacitor の `SystemBars.insetsHandling` は `disable` とし、アプリのネイティブ処理を唯一の余白管理箇所にする。WebView へは処理済みインセットをゼロで渡し、CSS の safe-area による二重余白を防ぐ。`CONSUMED` を丸ごと返さず、画面サイズ更新を継続させる。
- Android 9 は切り欠きを消去する Builder を持たないため、そのバージョンだけ互換 API で切り欠き情報を消去する。Android 10 以降は Builder を使う。
- Android の縦画面固定を削除。`resizeableActivity=true`、回転・サイズ変更時に同じ WebView を保持する既存の `configChanges` を維持する。`adjustResize` を明示する。
- 小さい横画面の盤面サイズを、実測した操作バーの高さから計算する。518×272 の WebView 相当サイズで盤面が操作バーに隠れる問題を再現し、修正した。

現在のアプリ自身の Java / manifest には `setStatusBarColor`、`setNavigationBarColor`、`setNavigationBarDividerColor`、旧 cutout モードの明示指定はない。SDK 内部の互換処理まで消したという意味ではない。旧リリース 22 の APK と Play の警告詳細（呼び出し元クラス）がないため、旧版の警告元を断定せず、新しい AAB をアップロードした後に Console の再解析で確認する。

## 自動検証

```powershell
npm run typecheck
npm test -- src/lib/playGameStats.test.ts src/lib/playGameStatsMatch.test.ts src/hooks/usePlayGameStats.test.ts src/components/boardAcceptance.test.ts
npm run test:board
node scripts/check-play-games-config.mjs

$env:NEXT_PUBLIC_APP_TARGET = 'android'
node scripts/release/build-android-web.cjs <公開設定済みプロジェクトのパス> android
npx cap sync android
cd android
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest -PqaBuild
```

ネイティブの余白テストは Robolectric で Android 9 / 10 / 14 / 15 / 16（API 28 / 29 / 34 / 35 / 36）を対象とし、切り欠き・システムバー・IME の重なり、横画面への変更、IME 非表示、余白の非累積、WebView に渡すインセットが全消費状態にならないことを確認する。API 36 のテストには JDK 21 が必要。

ローカルの画面テスト（別ターミナルでプレビューサーバーを起動）:

```powershell
node scripts/qa/serve-export.mjs out 4184
# 別ターミナル。既存 Chrome を使う場合のみ下記を設定する。
$env:QG_BROWSER_CHANNEL = 'chrome'
node scripts/qa/adaptive-smoke.mjs http://127.0.0.1:4184 scratch/adaptive
```

360×800 → 800×360 → 518×272 → 768×1024 → 1024×768 → 1280×800 → 540×720 → 320×640 → 360×800 を連続して検証する。外部通信を遮断し、ローカル CPU 対局で捕獲と CPU の応手を実行してから、横はみ出し・盤面／Canvas 寸法・固定操作バー・棋譜の保持を確認する。518×272 はシステムバーや切り欠きの余白を除いた小さい横画面を想定した寸法で、Android 実機の代用ではない。

## 実機・Play Console で残る確認

今回の環境には接続済み Android 端末／エミュレーターがない。実機でのインストール、OS による回転・マルチウィンドウ・キーボード表示、Google サーバーでのイベント受領、Play の警告解消は未確認。

- 内部テスト配信で Android 14 / 15 / 16、ジェスチャー／3 ボタン、切り欠きあり端末を確認する。最低対応 API 24 を含む古い端末でも表示・IME を確認する。
- スマートフォン縦横、タブレット、折りたたみ、分割画面の拡大縮小で、盤面・設定・対局結果・ログイン入力が隠れないことを確認する。回転で棋譜や対局が初期化されないことを確認する。
- QA ビルドは `com.qgambit.app.qa`。通常版の保存データを消さずに試す。本番配信には既存の本番向け公開環境変数、署名設定、更新したリリース番号を使う。
- 新しい AAB の Play Console 検査で 3 件の表示警告を確認する。非推奨 API の警告が残る場合は、警告に列挙されたクラス／メソッドと実際の SDK バージョンを照合する。
- Game Stats は別途 [導入手順](play-games/README.md) の PGS ID・OAuth クライアント・イベント定義・テスター設定を完了してから有効化する。

公式資料: [edge-to-edge 実装](https://developer.android.com/develop/ui/views/layout/edge-to-edge)、[Android 15 の変更](https://developer.android.com/about/versions/15/behavior-changes-15)、[Robolectric の SDK / Java 対応](https://robolectric.org/compatibility_table/)。
