# 3D階級バッジUI & クラウン・サーキット回帰検証レポート (Antigravity QA)

記録日時: 2026-09-18
担当: Gemini 3.8 Flash (High) / Antigravity

## 1. 概要
Q-Gambitのプロフィール画面における3D階級バッジUIの品質確認・改善、およびクラウン・サーキットのログイン必須化の回帰テストを実施。
既存の未コミット変更およびローカルセーブデータを完全に保持した上で、確認されたレイアウト不具合を修正し、全件の検証を通過した。

## 2. 変更内容
- **`src/components/profile-cosmetics.css`**:
  - PC表示（幅1440px）: `.profile-badge-viewer` の `right: -8px` によるステージ外はみ出し（8px）を `right: 0` に修正。ステージ最大幅を340pxに調整し、アバター枠・オーラ（`inset: -12%`）と3Dバッジの重なり（7.26px）を解消（18pxの安全間隔を確保）。
  - スマホ幅（幅360px・320pxのコンテナクエリ `@container(max-width:270px)`）:
    - ステージ高さを318pxから350pxに拡張。
    - アバターおよび3Dバッジを左右中央配置（`left: 50%; transform: translateX(-50%)`）に整流。
    - アバター画像・15種類の装飾フレーム・背面オーラと3Dバッジの垂直方向の重なり（旧実装では最大25.2px重なりが発生）を解消し、バッジがアバター下部に整然と並ぶよう改善。
- **`scripts/qa/profile-cosmetics-smoke.mjs`**:
  - プレビューボタン押下時のモーダル内スクロールに対応し、スクリーンショット撮影前に `.profile-insignia-stage` をビューポート内に表示する処理を追加。

## 3. 検証結果
1. **型検査**: `npm run typecheck` -> **PASS** (0 errors)
2. **単体テスト**: `npx vitest run src/components/profileCosmetics.test.ts src/lib/__tests__/circuitAccess.test.ts` -> **PASS** (52/52 tests passed)
3. **静的解析**: `npx eslint --config eslint.config.mjs ...` -> **PASS** (0 errors, 1 known no-img-element warning)
4. **本番ビルド**: `npm run build` -> **PASS** (11 pages static export to `out/`)
5. **プロフィール3Dバッジ検証**: `node scripts/qa/profile-cosmetics-smoke.mjs http://127.0.0.1:3101` -> **PASS**
   - PC幅1440px、スマホ幅360px・320pxでの画面検証
   - 全6種（ポーン、ナイト、ビショップ、ルーク、クイーン、キング）の3D形状・材質・照明・文字視認性をスクリーンショットにて目視確認
   - 持ち時間別レート（10m / 3m / 10s）に応じた階級判定、プレビュー操作によるセーブ不変の確認
   - WebGL Context Loss時のSVG代替表示への切り替えおよびキャンバス破棄の確認
6. **追加UI検証**: `node scripts/qa/profile-cosmetics-extra.mjs http://127.0.0.1:3101` -> **PASS**
   - WebGL初期化失敗時のフォールバック表示
   - キーボード（Tab / Escape）操作、フォーカスリング表示、動きを減らす（prefers-reduced-motion）設定の連動確認
7. **ログイン制限回帰テスト**: `node scripts/qa/circuit-login-smoke.mjs http://127.0.0.1:3101` -> **PASS**
   - 未ログイン（ゲスト）のクラウン・サーキット遮断およびCPU練習可能の確認
   - ログイン後のステージ開始、遅延RPC/セッション失効時の進行保存阻止
   - 同一アカウント表示名変更時の対局継続確認、既存セーブバイト数の完全保持確認

## 4. 証拠ファイルのパス
- **プロフィール3Dバッジ検証証拠**:
  - 結果JSON: `../../outputs/profile-cosmetics/results.json`
  - PC幅（1440px）: `../../outputs/profile-cosmetics/{pawn,knight,bishop,rook,queen,king}-1440.png`
  - スマホ幅（360px）: `../../outputs/profile-cosmetics/{pawn,knight,bishop,rook,queen,king}-360.png`
  - スマホ幅（320px）: `../../outputs/profile-cosmetics/{pawn,knight,bishop,rook,queen,king}-320.png`
- **クラウン・サーキット回帰検証証拠**:
  - 結果JSON: `../../outputs/circuit-login/results.json`
  - ゲート確認: `../../outputs/circuit-login/guest-gate-1440.png`, `guest-gate-360.png`

## 5. 未確認事項・境界条件
- **実機検証**: 本検証はPlaywrightによるビューポート幅（360px・320px）でのブラウザ検証であり、物理的なAndroid実機端末でのGPUレンダリング検証は含みません。
- **実認証通信**: 認証テストは外部Supabaseへの通信を遮断したローカルモック環境で実施しており、本番アカウントの変更や実OAuth認証の疎通は行っていません。
- **対象外操作**: 公開Webへのデプロイ、AAB作成、データベースマイグレーション等は実施していません。
