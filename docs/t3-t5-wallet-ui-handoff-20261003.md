# T3/T5 ローカル実装引き継ぎ（公開未反映）

基点: `9102ad4a2230bf88379f53550362f70d1fd439c2`（T0）。専用ブランチ: `feature/t3-t5-wallet-ui-20261003`。

## UIを先に取り込める範囲

- 無料報酬のWebフラグとサーバーrelease-readyはOFFのまま。Webは直接status/claim呼び出しでもOFF時にネットワークへ出ない。サーバーの503 `FEATURE_DISABLED` はパネルを隠し、実障害 `REWARD_UNAVAILABLE` は利用不可の表示を維持。
- 無料券残数/各20枚上限、次のUTC受取日・次段階・上限内の予測付与、無料ランク戦3試合/UTC日、待機/開始前取消では消費しないことを12言語で表示。無料ランク残り試合数を取得するAPIはないため、実残回数を推測して表示しない。
- 現行APIとの互換性を維持。新しい任意フィールド `currentUtcDay` があればRenderの日付で予測し、古いAPIの場合は端末UTCで表示する。予測は表示用で、実際の付与はDB時計とRPCだけが決定する。
- 認証済みアカウント・現行規約同意後の無料claimを維持。開いたままのUTC日付切替/画面復帰でも日付ごとに再試行する。アクセスを失った要求はabortし、結果を表示しない。
- `/commerce/` は承認済みの販売者氏名・事業用住所・電話・問い合わせメールだけを表示。新規購入不可と予定価格/条件を明示。出生情報・Stripe内部ID・秘密設定は含めない。Androidの同ルートは空で、外部購入リンクへ置き換えない。
- 月額総額USD 2.99、自動更新、解約後の支払期間末までの利用、通常解約の日割り返金なし、法定権利、終了/返金/取消時の会員券失効を12言語で用意。税登録未確認のため徴税済みとは表示しない。
- 新規CheckoutはStripe受付ゲートに加え、`webCommerceCheckoutReady()` が新規約版・本人確認済み上限・最終release-readyを要求。購入前の明示確認も必要。現状はすべて拒否。準備中のアカウント画面終了では外部URLへの遷移を中止する。
- WebのPortal/既加入者状態表示は新規Checkout受付と独立。Checkoutや新規会員案内を停止してもPortalゲートが有効なら管理表示を維持する。操作の一時失敗でも再試行できる。
- `MEMBER_TICKET_USAGE_ENABLED=false` を新設。将来有効にする場合、既購入特典のstatus/`daily-grant`と券残数だけを共通画面で扱い、Androidに価格/購入/Portal/外部決済リンクを出さない。T4の既存API契約を使用し、無料券のclaimとは分離。
- `salesTermsDraft.ts` は未発効の新規約案 `2026-10-03.1`。現行 `terms.ts`、サーバー要求版、SQLの旧版同意条件は変更しない。適用手順と旧Play互換への影響は `sales-review-20261003.md`。
- QUBE雑談 `t18-t3-t5` と手動X原稿を追記。公開未反映、外部SNS投稿なし。

## サーバー/QAだけの追加

`DailyLoginRoutes.ts` のGET/POSTへ任意の `currentUtcDay` を追加。その他のstatus/claim形式や本人確認・規約・退会のDB契約を変えない。クライアントはこのフィールドなしでも動作するため、UIコミットを先に公開できる。

`test-daily-login-sql.mjs` は既存無料財布migrationを使い捨てPGliteへ適用する。試験DBだけ時計を置換し、1〜7日目配列/7日目継続/欠席/UTC境界/上限/再試行/ACL/規約/削除連鎖/制限/不正状態を確認。16件の重複要求は付与1回。**単一接続のキューであり、別接続の行ロック競合の実測ではない。** Supabase開発環境の複数接続同時請求・実環境権限は統合QAで実施する。

既に本番へ適用された `ticket_wallet_daily_login` migrationのソースは変更していない。source `20260930083253` とproduction `20261003021514` は名前＋checksumで照合し、時刻の違いだけを理由に再適用しない。

## 検証と残る条件

最終結果: 対象18ファイル/91テスト成功、Android build targetでのStripe境界6テスト成功、型検査・サーバービルド・Web/Android Webビルド成功。無料SQL QAとWeb/Android商取引HTML検査も成功。

- 報酬API/UTC再請求/予測/ゲート/12言語/規約不変/Android描画/旧規約/日記の対象Vitest、型検査、サーバービルドを実行。
- Web/Android向け `next build --webpack` を実行。実体依存コピーはディスク容量を消費したため自分のコピーだけを削除し、canonical依存をjunctionで参照した。Webの承認済み表示・販売OFF、Androidの商取引内容不表示は `check-commerce-export.mjs` で確認する。
- 将来フラグONのAndroid描画をテストし、購入/Portal/外部決済リンクがなく、既購入券残数と本人確認/規約後のclaimだけが可能なことを確認。
- 実端末、APK/AAB、Play配布、本番ユーザーclaim、販売/広告のON、main push、外部公開は本担当では未実施。
- 会員券上限/税登録・販売地域/請求総額実測/新規約発効と全RPC同意版/旧Playの移行は統合担当の残る条件。上限が20以外ならSQLだけでなく会員statusのWeb/server検証上限も同じ仕様へ変更する。

## 再実行

```
npm test -- src/lib/dailyLoginRewards.test.ts src/lib/dailyRewardPreview.test.ts src/lib/stripeMembership.test.ts src/components/DailyLoginClaimController.test.ts src/components/DailyLoginRewardsOff.test.ts src/components/CommerceBoundary.test.ts src/locales/dailyLoginText.test.ts src/locales/stripeMembershipText.test.ts src/locales/commerceText.test.ts src/config/webCommerce.test.ts server/src/services/DailyLoginRoutes.test.ts server/src/services/DailyLoginStore.test.ts server/src/services/DailyLoginStreak.test.ts server/src/services/TicketFeatureGates.test.ts src/data/devDiary.test.ts src/components/TermsGate.test.ts src/lib/accountTerms.test.ts src/config/appPlatform.test.ts
npm run typecheck
npm --prefix server run build
node scripts/qa/test-daily-login-sql.mjs
npm run build -- --webpack
node scripts/qa/check-commerce-export.mjs web
```

Android用Webビルドは `NEXT_PUBLIC_APP_TARGET=android` を設定し、出力後に `check-commerce-export.mjs android` を実行する。各出力はローカル検証用。設定なしの出力を配布しない。
