# T3 Web公開ビルド用フラグ（2026-10-03）

基点: f85d764。ブランチ: feature/t3-web-release-flags-20261003。
変更範囲はWebクライアント、公開ビルド設定、静的出力検査と対象テスト。サーバー・SQL・規約の実際の発効日・本番設定・デプロイは変更していない。

## 公開フラグ

すべて未設定時はOFF。クライアントでは文字列 `true` のみON。Next.jsがビルド時に埋め込める固定の `process.env.NEXT_PUBLIC_QG_...` 参照を使用する。公開後の環境変数変更だけでは既存JavaScriptは切り替わらず、Web出力の再ビルドが必要。API/SQLの認証・同意・release gateは引き続き独立して必要。

| 公開ビルド環境変数 | 対象 | Androidビルド |
|---|---|---|
| NEXT_PUBLIC_QG_DAILY_LOGIN_REWARDS_ENABLED | 無料券の残高・受取 | 明示ONのみ |
| NEXT_PUBLIC_QG_STRIPE_WEB_MEMBERSHIP_ENABLED | Web会員画面／新規販売の前提 | 強制OFF |
| NEXT_PUBLIC_QG_STRIPE_WEB_CHECKOUT_ENABLED | 新規Checkout | 強制OFF |
| NEXT_PUBLIC_QG_STRIPE_WEB_PORTAL_ENABLED | 既加入者の請求管理 | 強制OFF |
| NEXT_PUBLIC_QG_MEMBER_TICKET_USAGE_ENABLED | 既存会員券の状態・受取・利用表示 | 明示ONのみ |
| NEXT_PUBLIC_QG_CPU_HINT_TICKETS_ENABLED | CPU練習ヒント券 | 明示ONのみ |
| NEXT_PUBLIC_QG_RANKED_REFUND_BALANCE_ENABLED | 返還分の照会・表示 | 明示ONのみ |
| NEXT_PUBLIC_QG_WEB_COMMERCE_SALES_RELEASE_READY | Web販売条件の準備完了 | 強制OFF |

Web Checkoutは会員画面、Checkout、販売準備の3フラグと発効済み新規約が揃って初めて表示／準備可能。公開日はNULLのままなので、全フラグONでも現時点ではCheckout不可。Rootが発効日を揃える。

CheckoutだけfalseにしてもPortalと会員券利用は維持する。会員画面のフラグまでfalseでもPortalがtrueなら既加入者の管理は独立して利用可能。既存券の照会は新同意不要、券の新規受取とCheckoutは従来どおり新同意必須。無料20／会員60を変更していない。

Android商取引ページ、購入・請求管理画面はbuild targetとCapacitor実行時の両境界で遮断。会員券の利用フラグは販売フラグから独立。広告は変更せず、release helperでも常にOFF。

## ビルド用ヘルパー

`node scripts/release/build-android-web.cjs <設定済みプロジェクト> web` は上記8項目のみを読み込む。呼び出し元シェルの明示値を設定元プロジェクトより優先する（falseも優先）。未設定はfalse。true/false以外の指定はビルド開始前に拒否。未知のNEXT_PUBLIC_QG_*は設定元から取り込まず、継承環境からも除外する。

末尾がandroidまたは省略の場合、Web専用4フラグを強制false。券利用4フラグのみ個別の明示ONを許可する。秘密値の設定元からのコピーやログ出力は行わない。未設定の既定OFF試験を維持。

## 商取引出力検査

以前の販売OFF固定検査から、期待する構成の明示指定へ変更した。引数未指定、誤値、AndroidのON指定は失敗する。

```text
node scripts/qa/check-commerce-export.mjs web --sales=off [HTMLパス]
node scripts/qa/check-commerce-export.mjs web --sales=on [HTMLパス]
node scripts/qa/check-commerce-export.mjs android --sales=off [HTMLパス]
```

HTMLパス省略時はout/commerce/index.html。Webでは販売者欄・価格、data-commerce-sales=open/closed、受付停止文言を期待構成と照合する。Checkoutまたは会員画面フラグがOFFなら商取引ページも受付停止表示。ONでも商取引ページそのものに支払リンクは出さない。Androidでは商取引欄・価格・購入／請求管理リンクを禁止。Reactのシリアライズされたスクリプト部分は描画された本文から分けて扱う。

## 検証

- focused Vitest: 8 files / 52 tests PASS。既定OFF、厳密true判定、全ON、未発効と新同意ガード、Checkout/会員募集OFFでもPortalと券利用継続、Android build/runtime両境界、実際にSSR描画したWeb ON/OFFとAndroid非表示を検証。
- node --test scripts/release/build-android-web.test.mjs scripts/qa/check-commerce-export.test.mjs: 11 tests PASS。許可リスト、値の優先順位、不正値拒否、Android強制OFF、秘密値不取り込み、広告OFF、出力の期待構成・禁止リンク検査。
- npm run typecheck: PASS。
- git diff --check: PASS。
- Next最終build、公開URL、実機、実決済は未実施。最終buildと本番適用はRoot担当。課金を伴う購入確認はユーザー担当。

このコミット単体は公開フラグの値を本番へ設定せず、販売開始の表明もしない。
