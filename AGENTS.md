<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Q-Gambit — Codex / Gemini Antigravity

- 共通ルールはこのファイル。Antigravityは .agents/rules/project.md から参照する。
- Next.jsのWeb、CapacitorのAndroid、server/の対戦サーバーを含む。
- 検証: `npm test -- <対象>`、`npm run typecheck`。盤面は `npm run test:board`。
- 表示確認は docs/verification.md、配布作業は docs/release.md の対象の節だけ読む。
- 他方との引き継ぎ・並行編集時は docs/agent-workflow.md。移行時は docs/environment-migration.md。
- アプリ改良・アップデートの完了時は docs/dev-diary-workflow.md に従って開発日記を更新する。
- 依頼された変更と関連検証まで進め、検証は影響範囲に合わせる。公開は依頼された配布先に限定する。
- 未コミット変更は保持し、別コピーの変更を無断で上書きしない。
- 単発スクリプトは scratch/、再利用する処理は scripts/。既存fix/patch群は通常作業では読まない。
