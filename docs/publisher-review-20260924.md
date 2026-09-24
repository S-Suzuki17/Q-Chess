# Publisher review — 2026-09-24

対象: q-gambit.com / sotas-projects-3b57e80d / q-chess-w8rg。
Vercel画面で本番ドメインとGitHub S-Suzuki17/Q-Chess mainの接続を確認。
別コピーの未完成機能は取り込まず、公開版と共通の作業ツリーを修正。

## 確認した問題と対策

- 公開トップでAdSense SDKと4個の広告要素を確認。これは広告の配信成立やアカウント承認を意味しない。
- 全画面共通SDKを撤去。広告要求をコード上のOFF設定で遮断。実環境変数が残っていても広告を要求しない。
- 昇格選択、日記、タイトル、ルールの広告枠を除去。通常のディスプレイ広告を独自モーダルに入れる機能も無効化。
- H5配信、リワード、対局間広告、回数制限はすべてOFF。架空の視聴完了や広告表示タイマーを追加していない。
- ゲーム説明にあった実装されていない量子もつれ・複数位置・歴史的シナリオ等の説明を修正。候補の絞り込み例、練習・ヒント・100ステージを12言語で案内。
- 開発者の未確認の経歴、返信時間の確約を除去。連絡先は qgambit970@gmail.com に統一。
- プライバシー案内の「子供対象外」「棋譜を無期限保持」「ローカル保存なし」を現在の仕様に合わせて修正。認証・請求設定は変更していない。
- sitemapを実ドメインに修正。ネストしたページの静的アセット参照をWeb用の絶対パスに修正。
- 報酬ID・所持情報・解放条件を保持して素材・形状中心の名称へ変更。報酬BGMの固有曲名は保持。
- 手動X原稿は src/data/devDiary.ts を正本とし、公開用コーナーと同じ文章から scripts/export-qube-drafts.mjs でテキストを書き出す。Xには送信しない。

## Googleの判定・所有者確認が必要な残事項

これは合格保証や法的認証ではない。AdSenseとH5 Games Adsの承認状況は本作業では確認できていない。H5は通常のAdSenseと別途の利用承認が必要。
広告再開前に、認定CMP等を含む対象地域の同意取得、子供を含む利用者のデータ処理・広告設定、プライバシー告知の法令レビュー、利用音源・素材の商用権利を確認する。
H5は正式なAd Placement APIの自然な区切り・明示的なオプトイン・正規の報酬通知を使う。通常バナーをリワードや全画面広告の代用品にしない。
流入、継続的な利用、独自性の評価、審査結果はコードだけでは保証できない。テストデータや架空の閲覧数で補わない。

## 参照した公式資料

- [広告を掲載できない画面](https://support.google.com/publisherpolicies/answer/11112688?hl=en)
- [H5 Games Ads のポリシー](https://support.google.com/adsense/answer/9959170?hl=en)
- [H5 の利用申請](https://developers.google.com/ad-placement/docs/signup?hl=en)
- [Ad Placement API](https://developers.google.com/ad-placement/apis)
- [広告の配置](https://support.google.com/adsense/answer/1346295?hl=en)
- [プライバシーの開示](https://support.google.com/adsense/answer/1348695?hl=en)
- [認定CMP](https://support.google.com/adsense/answer/13866773?hl=en)
- [Google Publisher Policies](https://support.google.com/adsense/answer/10502938?hl=en-GB)

## 検証

公開用Next.jsビルド、型検査、新しい回帰テスト、変更対象のESLintを実施。広告SDKの生成禁止、全画面広告の無効化、日記・昇格画面の広告撤去、12言語の報酬名、公開用メールアドレスを検査。
ブラウザーでPC/390px幅、問い合わせ・プライバシー・トップ・遊び方を確認。実機Android、課金、実広告の配信テスト、実ユーザーの対局・レート変更は行わない。
公開状態と最終結果は作業完了時の引き継ぎ報告を参照。
