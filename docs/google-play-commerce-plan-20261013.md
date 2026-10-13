# Google Play内購入・復元の実装と設定計画

対象: `com.qgambit.app`。基準は既存1.16 / code21（監督によるConsole upload済み、inactive）。次候補は1.17 / code22。Rootはapp/server source担当、監督はConsoleと外部設定の読取・受入担当。現在は実装・ローカル検証と次AAB uploadの準備段階で、production Web/server/DBの適用、商品設定、配信track、実料金の支払いは未実施。

## 確認できた状態

- PlayRewards native / server verifierは `qg_founders_preregister` の無料特典復元専用。Billing Libraryは既存9.1.0。有料のpurchase、SUBS restore、会員・ヒント台帳との接続はない。
- 監督の2026-10-13 Console読取では、有料定期購入と1回購入の一覧が空。既存有料Play商品ID・base plan・purchase optionを仮定しない。
- RTDNは無効でtopic空。Consoleのサービスアカウント登録なし。既存Google Cloud project、実行サーバーのGoogle identity、Publisher API認証の利用可否は未確認。既存Founders verifierのcredential変数はソースで確認しただけで、値を読んでいない。
- 既存Web販売条件はStandard USD3/月、Plus USD6/月（10ヒント/支払済み月次期間）、6種のヒントパック。旧Web USD2.99会員、無料券、Stripe販売台帳は別のまま。
- Android端末はadbで検出済み。USB許可の人間回答を受領。実機の購入アカウント、Playインストール、テスト決済表示、バックエンド接続は未検証。

## 新規商品案（まだConsoleに存在しない）

|既存SKU|提案Play product ID|種別 / plan・option案|基準USD総額|付与|
|---|---|---|---:|---|
|standard_monthly|qg_standard_monthly|SUBS / monthly、自動更新P1M、割引・trialなし|3.00/月|有効期間の無制限オンライン・ランク対局、広告非表示|
|plus_monthly|qg_plus_monthly|SUBS / monthly、自動更新P1M、割引・trialなし|6.00/月|Standardと同じ＋確認済み支払月次注文ごとに10ヒント|
|hints_1|qg_hints_1|INAPP consumable / buy|1.00|1ヒント|
|hints_13|qg_hints_13|INAPP consumable / buy|10.00|13ヒント|
|hints_27|qg_hints_27|INAPP consumable / buy|20.00|27ヒント|
|hints_44|qg_hints_44|INAPP consumable / buy|30.00|44ヒント|
|hints_77|qg_hints_77|INAPP consumable / buy|50.00|77ヒント|
|hints_166|qg_hints_166|INAPP consumable / buy|100.00|166ヒント|

表の価格は既存条件との照合用。購入画面はGoogleのProductDetailsによる実際の地域・通貨・税込表示価格と購読周期を表示し、WebのUSD価格をPlayの請求価格に流用しない。欠落商品、対象外plan/offer、取得失敗時に仮価格で購入させない。初期版は複数会員契約の重複購入や会員変更を購入ボタンで自動処理しない。別provider契約も確認し、既存の管理先を提示して二重購読を避ける。

商品名・説明案:

- Standard / 「Q-Gambit Standard」「支払済み期間中、オンライン・ランク対局が無制限。広告非表示。月次ヒント付与なし。自動更新、Google Playで解約。」 / “Unlimited online and ranked games and no ads during the paid period. No monthly hint grant. Automatically renews; cancel in Google Play.”
- Plus / 「Q-Gambit Plus」「Standardの特典に加え、支払済み月次期間ごとにヒント券10枚。通常の解約・会員期間終了だけでは付与済みヒントは失効しません。自動更新、Google Playで解約。」 / “Standard benefits plus 10 hints per paid monthly period. Granted hints survive ordinary cancellation or expiry. Automatically renews; cancel in Google Play.”
- 各パック / 「QUBEヒント券 N枚」「ヒント券N枚の1回購入。自動更新なし。対象購入の未使用分は返金・取消時に別枠で失効。練習・チュートリアルでは無料ヒントを使用。」 / “One-time purchase of N hint tickets, no renewal. Refund or reversal affects unused tickets from this purchase. Practice and tutorial hints remain free.”

## 購入から権利反映

1. 認証済み登録者・最新規約・機能設定をサーバーで確認し、SKU許可リストから購入intentとobfuscated account/profile bindingを発行。ゲスト、他アカウント、削除済みidentityは拒否。
2. Nativeは商品を再照会し、選択した購入option / monthly base planとGoogle表示価格を使って正規Play Billing画面を開く。連打は一購入flowに収束。取消は付与なし。pendingは待機のまま付与なし。
3. 購入tokenを認証済みサーバーへ渡す。package/product/数量/order/account binding/test mode/状態をGoogle Publisher APIで確認。クライアントの価格・枚数・success callbackを付与根拠にしない。
4. 購入token hashの一意所有者、注文一意キー、削除tombstone、provider/test区分をDB transactionで確定。会員資格とPlus期間ヒント、パックの出所残高、ack/consume outboxを同時保存。
5. 永続保存後に初回購読acknowledgeまたはパックconsume。失敗はoutbox再試行。ack失敗後のrestoreは付与済み結果を返し、再付与しない。通常更新にackを再実行しない。
6. 財布・共有match entitlement・socketを再取得。native callbackだけでローカルの会員activeや券数を増やさない。

## 復元とライフサイクル

- NativeのINAPP/SUBS queryに加え、認証済みサーバーの既存購入・残高を読む。consume済みパックはqueryPurchasesに戻らないため、アカウント台帳から未使用残高を復元し、新規付与として扱わない。
- Plusの一意付与キーはGoogleが確認するpaid order / period。token、現在のexpiryだけを新規付与キーにしない。猶予・延期でexpiryが延びても同じ注文なら再付与しない。
- ACTIVE、期限内CANCELED、GRACEは所定の資格継続。HOLD、PAUSED、EXPIRED、REVOKEDでは会員アクセス停止。pendingは資格もヒントも付与しない。通常解約と返金/取消は区別し、前者で過去に付与済みヒントを消さない。
- RTDNは認証済みGoogle Pub/Sub通知を検証し、再照合をenqueueするだけ。通知本文を権利の根拠にしない。重複・順不同・遅延・削除後を同じcanonical確認とtransactionに収束させる。
- Voided Purchases / 注文再照合により返金・取消・revoke対象の未使用sourceだけを停止。消費・返還との競合はsource行ロックで解決し、他のStripe/無料/旧会員/test sourceを触らない。

## 外部設定と移行のレビュー対象

実装後、具体的な対象・差分・戻し方を示して別途適用可否を確認する。新しい恒久credentialや権限を先に作らない。

- 実際のGoogle Cloud project / 既存サーバーidentityを読み取り確認し、既存認証が使えるか確認。最小Play権限は対象アプリの購入・注文確認とack/consumeに必要な権限だけ。広い管理者権限を要求しない。
- RTDNのtopic / subscription / push先 / audience / publisher権限を具体化。受信URL案は既存APIの `/api/play/notifications`。OIDC署名・issuer・audience・送信identityを確認し、失敗時は受付拒否。
- token再照合用の暗号化保管が必要。新secretを使う場合は用途・設置先・rotation/復旧を明示し、値は出力しない。秘密をWeb assetsに入れない。
- DB案はPlay所有者・intent・確認済み注文/期間・source台帳・outbox・tombstone。既存hint消費/返還とshared entitlementへつなぐ。実スキーマ互換差分とlocal Postgres検証を作り、productionへは未適用。
- 戻し方: Play販売と新intentをOFF、購入済み残高・返還・再照合を保つ。商品/台帳を削除するrollbackは行わない。ACK期限と既存購入の保全が必要なのでコード単純revertを復旧としない。
- sandboxは独立したserver/DB/test-mode設定で検証。候補URLは未確定。productionのtest残高化や広い権限追加はしない。
- 現規約はAndroidで購入済み特典の利用のみと記載している。Play販売説明・解約先・Google表示価格・データ処理を実装に合わせた新しい規約版としてレビューし、過去の同意済み版を書き換えず、販売時の明示同意と整合させる。

## 受入と未実施

ローカルfixtureで購入成功/取消/pending、別アカウント、同token並行復元、保存失敗/ack失敗、consume後再インストール相当、Plus更新/猶予/延期、失効とhint消費/返還、アカウント削除後の遅延通知を確認する。各ケースでStripe/無料/旧会員/test sourceの保全も見る。

Play実テストは、許可された端末にPlayから入れた候補で、正しいGoogle購入アカウントと「テスト購入」/無料test instrumentを人間が確認してから行う。単なるtest trackを無料決済の根拠にしない。現在は商品、Publisher API接続、RTDN、test endpointが未設定で、実Play購入・復元・特典反映は未検証。code22を課金完了としたUIだけの配信物にはしない。

公式資料: [購入フロー](https://developer.android.com/google/play/billing/integrate)、[サーバー確認・不正対策](https://developer.android.com/google/play/billing/security)、[SubscriptionPurchaseV2](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2)、[ProductPurchaseV2](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.productsv2)、[購読状態](https://developer.android.com/google/play/billing/lifecycle/subscriptions)、[テスト](https://developer.android.com/google/play/billing/test)。Console観測証拠は監督outputsの `play-billing-console-audit-20261013.json` に保存。
