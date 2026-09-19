# Google Play 事前登録特典 / Founders’ Collection

## 現在の状態（2026-09-19）

ローカル実装・検証用。公開Web、Render、Supabase、Play Consoleには未反映。
本番の受け取り成功・実機検証が完了したという意味ではない。
Google Playの商品登録・権限設定とライセンステストを済ませるまで、事前登録の開始を確定しない。
既存の広告・回数制限はOFF、年齢確認なしを維持。

## 確定した内容

- ファウンダーズ・クラウン（アカウント装飾）
- 黒曜石と金の象嵌（盤）
- 象牙とオニキス・ファウンダーズ（駒）
- 1つのPlay特典で3点を一括獲得。通常の100段階報酬は変更しない。
- 獲得後は設定の外観選択から使用。プレビューは未獲得でも可能。対局中は変更不可。
- 見た目だけの特典。レート、CPU、対局回数・ヒント回数には影響しない。
- 既存ゲームアカウント1つに紐付け。Playの1つの受領証で複数アカウントへ付与しない。
- Androidで受け取り、同じゲームアカウントならWebでも所持状態を復元。
- 装備選択は従来どおり端末保存。所持権だけサーバーに保存する。
- 原材料としての象牙ではなく、ゲーム内の色・仕上げの名称。

## Google Play Console側（ユーザー操作が必要）

1. 対象アプリのパッケージが `com.qgambit.app` であることを確認。
2. 事前登録専用の有効な「1回限りのアイテム」を作成。
   - 商品ID: `qg_founders_preregister`
   - 名前: ファウンダーズ・コレクション
   - 説明: 限定のアカウント装飾・盤・駒の3点セット。対局の強さは変わりません。
   - 事前登録特典として無料付与する。アプリに購入・決済ボタンは実装しない。
   - Consoleが通常商品の価格設定を要求する場合、価格の決定はユーザーが行う。こちらでは課金を設定しない。
   - すでに異なる専用商品IDを作成済みなら、開始前にコードの3定数を一致させる。
3. 「テストとリリース → 事前登録 → 特典」でこの専用商品を選択。
   - **事前登録の開始前に設定する。特典は作成後に編集・削除できない。**
4. Billing権限を含む新しいAAB（versionCode17以降）を内部テスト／事前登録の用途にアップロード。
   事前登録トラックへのAABアップロード自体はユーザーへのアプリ配布ではない。
5. 下記ライセンステストを完了し、対象国・ストアの受け取り案内を確認してから事前登録を開始。

Googleの手順: https://support.google.com/googleplay/android-developer/answer/9859047?hl=ja

## サーバー設定（まだ未実施）

Google Play Developer API用の専用サービスアカウントを用意し、対象アプリだけに権限を限定する。
GoogleのBilling API手順には「財務データ・注文等の閲覧」「注文と定期購入の管理」が必要と記載されている。
この権限付与はセキュリティ上重要な操作なので、ユーザーの明示的な確認またはユーザー操作で実施する。
本コードが呼ぶのは固定された無料特典SKUの検証・消費だけ。返金・購入・注文一覧・定期購入APIは呼ばない。

秘密鍵をチャット、Git、Web用環境変数に貼らない。Renderのサーバー専用秘密環境変数へ安全に設定する。

- `PLAY_REWARDS_SERVICE_ACCOUNT_JSON`: 専用サービスアカウントJSON（サーバーのみ）
- `PLAY_PREREG_REWARDS_ENABLED`: 明示的に `true` の場合のみ新規付与が有効
- `PLAY_REWARDS_ALLOW_TEST`: ライセンステスト用の隔離環境のみ `true`。本番は未設定または `false`

無効時でも、DB適用済みなら既存所持権の復元は可能。資格情報未設定時は購入証明の送信・付与不可。
API準備: https://developers.google.com/android-publisher/getting_started

DB: `supabase/migrations/20260919024638_founders_preregistration.sql`
本人確認済みAPI以外から特典テーブル・RPCを呼べない。service_roleも更新・削除権限を持たない。
profilesの削除時には特典行も削除。消費済みトークンからの新規付与は拒否する。
適用順はDB → 対戦サーバー（配布OFF）→ Web/Android → 隔離テスト → 本番配布ON。
本番DB変更・サービス権限の新設・有効化は未承認のまま進めない。

## 実装の流れ

設定画面 → Play Billing 9.1.0の既存INAPP購入照会 → 本人確認付きPOST →
固定package/productのGoogle検証 → DBへ原子的な所持権保存 → Googleへ消費通知。
購入証明の生トークンはログ・localStorage・DBに残さず、DBにはSHA256のみ保存。
orderId/developerPayloadがない無料特典にも対応。
未決済・取消済み・他商品・重複・他アカウント紐付けを拒否。
保存後の消費通知が失敗しても獲得を取り消さず、復元ボタンで再試行できる。
ログイン後にPlay側の未受領特典を検出すると、対局外に設定への案内を出す。
自動検出だけではアカウントに紐付けず、表示した宛先アカウントへのボタン操作が必要。
Webで未確認の所持権をlocalStorageから復活させない。ログアウト・アカウント切替で解除する。

## 検証

- 195件 / 21ファイルの関連Vitest（特典・既存報酬・対局外観固定・盤面）: PASS。
- フロント型検査、変更コンポーネントlint、サーバーTypeScriptビルド: PASS。
- 公開用設定でNext.js静的ビルド: PASS。
- Android debug Javaコンパイル: PASS。
- Android release AAB 1.12 / versionCode17、bundletool構造検証、署名照合、
  全182 Webファイルの一致、DEX内ネイティブ特典プラグイン、BILLING権限: PASS。
  縦向き・リサイズ可・広告識別子権限なしを維持。既存の自己署名証明書、
  タイムスタンプなし・JarInputStream並び順に関する署名ツール警告は継続。
- `node scripts/test-founders-sql.mjs`: ローカルPGliteで実SQL実行、RLS、権限、
  重複receipt/user、存在しないプロフィール、service_roleの更新削除拒否: PASS。
  開発用依存の導入コマンドはスクリプト先頭に記載。本番には追加していない。
- ローカル表示検証: PC幅・390×844、盤と王冠プレビュー、獲得表示、
  装飾選択、タミル語の折り返し、対局中非表示: PASS。ブラウザエラーなし。
  既存のThree.js Clock/PCFSoftShadowMap非推奨警告は残る。
- UIの獲得操作は模擬状態。Playとの実受け取り、Googleアカウント切替、
  端末再インストール、実機GPU・TalkBackは未検証。
- 特典到着通知の実機表示は未検証。実際のPlay商品がないため配信試験不可。
- 本番にテストアカウント・棋譜・特典行は作成していない。

## 公開前ライセンステスト

本番データを作らない隔離環境と、ユーザーが承認したPlayライセンステスターを使用する。
Googleのプロモーション／ライセンステスト手順で専用無料特典を取得し、以下を確認する。

1. Playインストール → ゲームへログイン → 特典案内 → 設定で宛先確認 → 無料受取。
2. 3点が獲得済みになり、選択・3D表示・対局開始前のアイコン枠へ反映。
3. 再ログイン・再インストール・Web同一アカウントで所持権復元。
4. 別ゲームアカウント／別Playアカウントに誤付与しない。
5. 通信断・二重タップ・受取後の再実行でも1回だけ付与。
6. 未対象者・保留中・取消済みは付与しない。対局中は受取／外観変更しない。
7. 実際に課金画面が一度も出ないことを確認。

本番受け取り・実機QAが完了するまでは、ユーザーへ「配布開始済み」と案内しない。

## 引き継ぎ

作業場所: `scratch/private-replays-release-20260918`。
Antigravityの `work/q-gambit-app` は読取専用、未変更。
serverコード・SQLも必要。Web/AABだけ配布しても本番の受取は有効にならない。
Google商品IDはsrc/config/founders.ts、server/src/services/FoundersRewards.ts、
android/app/src/main/java/com/qgambit/app/PlayRewardsPlugin.javaで固定。
ブランチ/コミットとAABの最終証拠はworkspaceのoutputs/release-1.12-code17/README.mdへ記録する。
