# Q-GAMBIT: Google Play Games Game Stats

2026-10-18 の公式仕様に合わせた Android クライアント実装。Sprints / Leagues の参加資格に必要なシグナルを送るもので、イベント開催や対象ユーザーへの表示を保証する機能ではありません。開催・対象地域・アカウント条件は Google 側で決まります。

## 有効化

既定は `PLAY_GAMES_ENABLED=false`。SDK の自動初期化 Provider と PGS 専用 Activity も同じスイッチで無効になります。PGS の認証・統計設定が未完了でも Android の表示修正を単独でリリースできます。

2026-10-18 に、承認済みの Google Cloud プロジェクト `q-gambit`（数値 ID `644546654984`）へ配信署名に限定した Android OAuth を登録し、2イベント・6統計を公開しました。別の承認済み作業で PGS を明示的に有効化した Android 25 / 1.20 を審査提出し、公開プライバシーポリシーにも12言語の送信内容・Googleでの管理と削除方法を反映済みです。実機の認証・Google側イベント受領は未検証です。今回のUI修正候補26 / 1.21も、25と同じ `-PplayGamesEnabled=true` を使い、公開済み説明と機能を保持します。ソースの既定値は引き続きOFFです。26のPlay提出・公開は別操作として記録します。

1. Play Console で `com.qgambit.app` に対応する作成済みの PGS プロジェクト `644546654984` を使う。Android OAuth クライアント `Q-Gambit Play App Signing` は登録済みで、**Play App Signing のアプリ署名証明書**の SHA-1 `36:96:7F:00:82:F8:DD:DE:E7:C8:00:17:E0:63:C2:95:36:D9:4F:A3` に限定する。PGS のテスターに検証アカウントが含まれていることを確認する。アップロード鍵と配信署名鍵を取り違えない。
2. **Grow users > Play Games Services > Setup and management > Game Stats** のイベント定義は `PlayerGameEvent.csv` をインポート済み。`matchCompleted` と `progressUpdate` は公開済み。
3. 下記の統計 ZIP もインポート済み。デフォルト言語 en-US の 5 反復統計と 1 進行度が公開済みで、Google のインポート検証を通過した。日本語などの翻訳は Console で追加できる。時間あたりの Min/Max は初期案なので、内部テストの正常プレイヤー分布を確認して調整する。
4. PGS **数値プロジェクト ID** の既定値 `644546654984` を使う。別環境を使う場合のみ Gradle プロパティで上書きする。これは OAuth クライアント ID や Firebase プロジェクト名ではない。資格情報／サービスアカウント鍵を Web バンドルに埋め込む必要はない。

```powershell
# 既存の Android 用公開環境変数を設定したリリース環境で実行する。
$env:NEXT_PUBLIC_APP_TARGET = 'android'
npm ci
npm run build
npx cap sync android
cd android
.\gradlew.bat bundleRelease -PplayGamesEnabled=true -PplayGamesProjectId=644546654984
```

`playGamesEnabled=true` のとき、PGS ID に数値以外または `0` を指定するとビルドを停止する。QA は `-PqaBuild` で別パッケージ `com.qgambit.app.qa` になるため、PGS を実機確認する場合はそのパッケージとデバッグ署名に対応する別クライアント設定が必要。テスト値の ID を本番設定として保存しない。

## シグナルと統計

`matchCompleted` は CPU 練習、CIRCUIT、プライベート、ランダム、ランク対局の終了時に送る。観戦・リプレイ・キャンセル・自分の着手がない対局は除外する。オンラインはサーバーが認めた参加者と終了スナップショットから計算する。

| 統計 | 集計 | 元になる値 |
| --- | --- | --- |
| Matches completed | COUNT | 完了した対局 |
| Matches won | COUNT + isWinner | 勝利した対局 |
| Moves played | SUM（競争対象） | 完了対局での自分の合法な着手数 |
| Pieces captured | SUM | 完了対局で自分が取った相手の駒数 |
| Checkmate wins | COUNT + isCheckmateWin | チェックメイトによる勝利 |
| Circuit stars | 進行度 | 100 ステージの星の合計（0〜300） |

進行度は保存データ読込後の起動時、値またはゲーム内アカウントの変更時、フォアグラウンド復帰時に送る。外観の変更は加算しない。課金額・広告の視聴回数・獲得チケットを競争用の数値に使わない。

独自イベントのプロパティは固定の許可リスト。氏名、メール、アプリ内ユーザー ID、対局 ID、認証トークンをイベントのプロパティに含めない。Google の SDK は PGS アカウントに統計を紐づけるため、SDK 自体が扱う認証／識別データを含めてプライバシーポリシー、Data safety、対象年齢・地域の適格性を公開前に確認する。

## 重複・通信失敗

- Web 版・ネイティブでない環境では呼び出さない。PGS 認証失敗／未認証時にもゲーム進行を妨げない。
- 並行する同一対局の送信はまとめる。ネイティブ側は PGS プレイヤー ID とローカル対局キーの SHA-256 を保存し、直近 256 対局の再描画・再接続による二重加算を抑える。生の ID は保存しない。
- `buffered` は Google SDK の **端末内バッファへの保存完了**。サーバー受領や Console への反映を意味しない。その後のアップロード／再送は SDK が扱う。
- 未認証・バッファ保存失敗は記録済みにしない。対局結果を表示したままアプリへ復帰すると再試行する。結果を閉じてしまった失敗分を独自キューで後から再送する実装ではない。
- SDK バッファとアプリの保存領域をまたぐ完全な exactly-once は保証しない。保存中のクラッシュ、アプリデータ削除、256 件を超える過去対局の再読込には限界がある。競技用の不正対策を別途保証する仕組みでもない。

## インポート ZIP の作成

```powershell
node scripts/build-play-games-icons.mjs
Compress-Archive -Path docs/play-games/RepetitiveStatsConfig.csv,docs/play-games/ProgressionStatConfig.csv,docs/play-games/*.png -DestinationPath play-games-stats.zip
```

ZIP のルートには 2 つの統計 CSV と 6 個の 512×512 PNG だけを置く。`PlayerGameEvent.csv` は別途アップロードする。画像生成は既存依存関係の `sharp` を使う。

## 内部テスト・公開前確認

1. PGS テスターでログインし、CPU／CIRCUIT／オンラインで少なくとも 1 手指してから対局を終える。白黒・勝敗・引き分け・チェックメイト・時間切れ・投了を確認する。
2. オンラインの終了スナップショット再受信、画面の再描画、アプリ復帰で同じ対局が二重加算されないことを確認する。観戦／リプレイ／キャンセルではイベントを作らない。
3. CIRCUIT の星を更新し、`progressUpdate.currentProgress` が実際の合計と一致することを確認する。オフライン、未認証、Play アカウント変更でもゲーム自体は続行できることを確認する。
4. 公式ガイドのログと Console でイベント定義の不一致やドロップを確認する。`recordEventImmediate` 成功だけで完了としない。

```powershell
adb shell setprop log.tag.Games INFO
adb logcat -s "PlayGamesServices[GameStatsAgent]:I"
```

5. Level Up の条件、対象アカウント／地域、PGS 設定の公開を確認してから、本番リリースを進める。Sprints / Leagues の開催設定・参加承認・PGS サーバー受領はローカルテストでは検証できない。

## 公式資料

- [Game Stats の概要](https://developer.android.com/games/pgs/gamestats)
- [Android の実装](https://developer.android.com/games/pgs/android/gamestats)
- [Console・CSV の仕様](https://developer.android.com/games/pgs/integrate-gamestats)
- [GameStatsClient の戻り値・バッファ仕様](https://developers.google.com/android/reference/com/google/android/gms/games/GameStatsClient)
- [PGS 認証](https://developer.android.com/games/pgs/android/android-signin)
- [Sprints / Leagues の紹介](https://developer.android.com/blog/posts/google-play-discovery-engagement-growth)
